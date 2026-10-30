import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).parents[1] / "kamis-food-price" / "scripts" / "run_kamis.py"
SPEC = importlib.util.spec_from_file_location("run_kamis", SCRIPT)
assert SPEC is not None
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def run_main(payload, argv, env=None):
    stdout = io.StringIO()
    stderr = io.StringIO()
    with mock.patch.dict(os.environ, env or {"KSKILL_KAMIS_API_KEY": "test-key"}, clear=True):
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse(payload)):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                exit_code = MODULE.main(argv)
    return exit_code, stdout.getvalue(), stderr.getvalue()


class RunKamisTests(unittest.TestCase):
    def test_direct_dry_run_redacts_secret_from_url_and_query(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = "live-kamis-secret"
            secrets_path = Path(directory) / "secrets.env"
            secrets_path.write_text(f"KSKILL_KAMIS_API_KEY={secret}\n", encoding="utf-8")
            stdout = io.StringIO()

            with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(stdout):
                exit_code = MODULE.main([
                    "--direct",
                    "--dry-run",
                    "--secrets-path",
                    str(secrets_path),
                ])

            self.assertEqual(exit_code, 0)
            output = stdout.getvalue()
            self.assertNotIn(secret, output)
            payload = json.loads(output)
            self.assertEqual(payload["url"].count("<redacted>"), 1)
            self.assertEqual(payload["query"]["p_cert_key"], "<redacted>")

    def test_direct_no_data_array_is_empty_and_succeeds(self):
        payload = {
            "condition": [{"p_category_code": "200", "p_product_cls_code": "01"}],
            "data": ["001"],
        }
        exit_code, stdout, stderr = run_main(payload, ["--direct", "--category", "200"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(MODULE._response_items(payload), [])
        self.assertEqual(json.loads(stdout)["data"], ["001"])

    def test_direct_valid_exceptional_item_codes_succeed(self):
        payload = {
            "condition": [{"p_category_code": "200", "p_product_cls_code": "01"}],
            "data": {"error_code": "000", "item": [{"item_code": "422", "item_name": "양파"}]},
        }
        exit_code, stdout, stderr = run_main(payload, ["--direct", "--category", "200"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(json.loads(stdout)["data"]["item"][0]["item_code"], "422")

        livestock = {
            "condition": [{"p_category_code": "500", "p_product_cls_code": "01"}],
            "data": {
                "error_code": "000",
                "item": [
                    {"item_code": "4301"},
                    {"item_code": "4401"},
                    {"item_code": "9901"},
                ],
            },
        }
        exit_code, stdout, stderr = run_main(livestock, ["--direct", "--category", "500"])
        self.assertEqual(exit_code, 0, stderr)
        codes = [item["item_code"] for item in json.loads(stdout)["data"]["item"]]
        self.assertEqual(codes, ["4301", "4401", "9901"])

    def test_direct_echoed_category_mismatch_fails_closed(self):
        payload = {
            "condition": [{"p_category_code": "100", "p_product_cls_code": "01"}],
            "data": {"error_code": "000", "item": [{"item_code": "111"}]},
        }
        exit_code, _stdout, stderr = run_main(payload, ["--direct", "--category", "200"])
        self.assertEqual(exit_code, 5)
        self.assertIn("p_item_category_code", stderr)

    def test_direct_no_data_error_code_is_empty(self):
        payload = {
            "condition": [{"p_category_code": "200", "p_product_cls_code": "01"}],
            "data": {"error_code": "001"},
        }
        exit_code, stdout, stderr = run_main(payload, ["--direct", "--category", "200"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(MODULE._response_items(payload), [])
        self.assertEqual(json.loads(stdout)["data"]["error_code"], "001")

    def test_proxy_response_is_validated_against_normalized_query(self):
        payload = {
            "query": {"p_item_category_code": "200", "p_product_cls_code": "01"},
            "items": [{"item_code": "422"}],
            "upstream": {"error_code": "000"},
        }
        exit_code, stdout, stderr = run_main(payload, ["--category", "200"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(json.loads(stdout)["items"][0]["item_code"], "422")

    def test_proxy_query_mismatch_fails_closed(self):
        payload = {
            "query": {"p_item_category_code": "100", "p_product_cls_code": "01"},
            "items": [{"item_code": "111"}],
            "upstream": {"error_code": "000"},
        }
        exit_code, _stdout, stderr = run_main(payload, ["--category", "200"])
        self.assertEqual(exit_code, 5)
        self.assertIn("p_item_category_code", stderr)

    def test_proxy_no_data_response_is_empty(self):
        payload = {
            "query": {"p_item_category_code": "200", "p_product_cls_code": "01"},
            "items": [],
            "upstream": {"error_code": "001"},
        }
        exit_code, stdout, stderr = run_main(payload, ["--category", "200"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(json.loads(stdout)["items"], [])

    def test_unexpected_upstream_error_code_is_reported(self):
        payload = {
            "condition": [{"p_category_code": "200", "p_product_cls_code": "01"}],
            "data": ["200"],
        }
        exit_code, _stdout, stderr = run_main(payload, ["--direct", "--category", "200"])
        self.assertEqual(exit_code, 5)
        self.assertIn("200", stderr)


if __name__ == "__main__":
    unittest.main()
