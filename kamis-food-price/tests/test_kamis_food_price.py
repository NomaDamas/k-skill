"""Offline tests for the KAMIS food-price helper.

These tests never touch the network: ``http_get_json`` is patched and every
payload comes from a committed fixture under ``tests/fixtures``.
"""
import contextlib
import importlib.util
import io
import json
import os
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "kamis-food-price" / "scripts" / "kamis_food_price.py"
SPEC = importlib.util.spec_from_file_location("kamis_food_price", MODULE_PATH)
kamis = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(kamis)

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"


def fixture(name):
    with open(FIXTURES / name, encoding="utf-8") as stream:
        return json.load(stream)


class QueryTests(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(
            kamis.build_query(),
            {
                "p_productclscode": "01",
                "p_itemcategorycode": "100",
                "p_convert_kg_yn": "N",
            },
        )

    def test_full_query(self):
        query = kamis.build_query(
            product_class="02", category="500", county="1101", date="2026/09/01", convert_kg="Y"
        )
        self.assertEqual(query["p_productclscode"], "02")
        self.assertEqual(query["p_itemcategorycode"], "500")
        self.assertEqual(query["p_countycode"], "1101")
        self.assertEqual(query["p_regday"], "2026-09-01")
        self.assertEqual(query["p_convert_kg_yn"], "Y")

    def test_omits_optional_fields_when_absent(self):
        query = kamis.build_query()
        self.assertNotIn("p_countycode", query)
        self.assertNotIn("p_regday", query)

    def test_rejects_bad_enums(self):
        for kwargs in (
            {"product_class": "99"},
            {"category": "999"},
            {"convert_kg": "X"},
        ):
            with self.assertRaises(kamis.UsageError):
                kamis.build_query(**kwargs)

    def test_rejects_bad_county_and_date(self):
        with self.assertRaisesRegex(kamis.UsageError, "countycode"):
            kamis.build_query(county="110")
        with self.assertRaisesRegex(kamis.UsageError, "countycode"):
            kamis.build_query(county="ABCD")
        with self.assertRaisesRegex(kamis.UsageError, "regday"):
            kamis.build_query(date="2026-9-1")
        with self.assertRaisesRegex(kamis.UsageError, "valid calendar"):
            kamis.build_query(date="2026-02-30")

    def test_alias_names_are_normalized(self):
        query = kamis.build_query_from_params(
            {
                "p_product_cls_code": "02",
                "p_item_category_code": "400",
                "p_country_code": "2100",
                "p_regday": "2026-09-01",
            }
        )
        self.assertEqual(query["p_productclscode"], "02")
        self.assertEqual(query["p_itemcategorycode"], "400")
        self.assertEqual(query["p_countycode"], "2100")
        self.assertEqual(query["p_regday"], "2026-09-01")


class ParsePriceTests(unittest.TestCase):
    def test_strips_commas_and_whitespace(self):
        self.assertEqual(kamis.parse_price(" 3,500 "), 3500)
        self.assertEqual(kamis.parse_price("52,000"), 52000)

    def test_empty_and_dash_become_none(self):
        for value in ("", "  ", "-", None, "N/A"):
            self.assertIsNone(kamis.parse_price(value), value)

    def test_non_numeric_becomes_none(self):
        self.assertIsNone(kamis.parse_price("품절"))

    def test_float_is_preserved(self):
        self.assertEqual(kamis.parse_price("3.5"), 3.5)


class NormalizeTests(unittest.TestCase):
    def test_proxy_shape(self):
        items = kamis.normalize_items(fixture("proxy_success.json"))
        self.assertEqual(len(items), 2)
        first = items[0]
        self.assertEqual(first["item_name"], "배추")
        self.assertEqual(first["unit"], "1kg")
        self.assertEqual(first["price"], 3500)
        self.assertEqual(first["day_before"], 3200)
        self.assertEqual(first["month_before"], 3100)
        self.assertEqual(first["year_average"], 3000)
        self.assertEqual(first["change"]["day_before"], "up")

    def test_empty_values_are_preserved(self):
        items = kamis.normalize_items(fixture("proxy_success.json"))
        second = items[1]
        self.assertIsNone(second["price"])
        self.assertIsNone(second["week_before"])
        self.assertIsNone(second["two_weeks_before"])
        self.assertEqual(second["raw_prices"]["dpr1"], "-")
        self.assertEqual(second["raw_prices"]["dpr3"], "")
        self.assertEqual(second["change"]["day_before"], "unknown")

    def test_upstream_shape(self):
        items = kamis.normalize_items(fixture("upstream_success.json"))
        self.assertEqual(items[0]["item_name"], "쌀")
        self.assertEqual(items[0]["price"], 52000)
        self.assertEqual(items[0]["change"]["day_before"], "flat")
        self.assertEqual(items[0]["change"]["year_before"], "up")

    def test_upstream_single_item_object(self):
        items = kamis.normalize_items(fixture("upstream_single_item.json"))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["item_name"], "계란")

    def test_empty_payload(self):
        self.assertEqual(kamis.normalize_items(fixture("upstream_empty.json")), [])

    def test_unexpected_shape_raises(self):
        with self.assertRaises(kamis.RequestError):
            kamis.normalize_items({"weird": True})

    def test_error_code_extraction(self):
        self.assertEqual(kamis.upstream_error_code(fixture("upstream_success.json")), "000")
        self.assertIsNone(kamis.upstream_error_code({"items": []}))


class SummarizeTests(unittest.TestCase):
    def test_counts_and_units(self):
        items = kamis.normalize_items(fixture("proxy_success.json"))
        summary = kamis.summarize(items)
        self.assertEqual(summary["count"], 2)
        self.assertEqual(summary["units"], ["1kg"])
        self.assertEqual(summary["day_over_day"]["up"], 1)
        self.assertEqual(summary["day_over_day"]["unknown"], 1)
        self.assertEqual(summary["year_over_year"]["up"], 1)
        self.assertEqual(summary["year_over_year"]["unknown"], 1)

    def test_format_table_marks_missing_price(self):
        items = kamis.normalize_items(fixture("proxy_success.json"))
        lines = kamis.format_table(items).splitlines()
        self.assertEqual(lines[0], "배추 봄배추 상 3,5001kg (전일 ▲)")
        self.assertTrue(lines[1].startswith("무 봄무 상 -1kg"))


class RunnerTests(unittest.TestCase):
    def _run(self, argv, payload=None, error=None):
        stdout = io.StringIO()
        stderr = io.StringIO()
        patcher = mock.patch.object(kamis, "http_get_json", side_effect=error) if error else mock.patch.object(
            kamis, "http_get_json", return_value=payload
        )
        with patcher, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = kamis.run(argv, stdout=stdout, stderr=stderr)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_proxy_success_json(self):
        code, out, err = self._run(["--category", "200", "--county", "1101"], fixture("proxy_success.json"))
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        payload = json.loads(out)
        self.assertEqual(payload["result"], "ok")
        self.assertEqual(payload["source"], "k-skill-proxy")
        self.assertEqual(payload["items"][0]["item_name"], "배추")
        self.assertEqual(payload["summary"]["count"], 2)
        self.assertNotIn("p_cert_key", payload["url"])

    def test_upstream_payload_is_normalized(self):
        code, out, _ = self._run([], fixture("upstream_success.json"))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["items"][0]["price"], 52000)

    def test_empty_result_is_explicit(self):
        code, out, _ = self._run([], fixture("upstream_empty.json"))
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "empty")
        self.assertEqual(payload["items"], [])

    def test_text_mode(self):
        code, out, _ = self._run(["--text"], fixture("proxy_success.json"))
        self.assertEqual(code, 0)
        self.assertIn("배추", out)
        self.assertIn("3,5001kg", out)

    def test_text_mode_empty(self):
        code, out, _ = self._run(["--text"], fixture("upstream_empty.json"))
        self.assertEqual(code, 0)
        self.assertIn("[empty]", out)

    def test_validation_error_exit_code(self):
        code, _, err = self._run(["--category", "999"], fixture("proxy_success.json"))
        self.assertEqual(code, 2)
        self.assertIn("p_itemcategorycode", err)

    def test_proxy_bad_request_maps_to_usage_exit(self):
        code, _, err = self._run([], fixture("proxy_error_bad_request.json"))
        self.assertEqual(code, 2)
        self.assertIn("bad_request", err)

    def test_proxy_not_configured_is_request_failure(self):
        code, _, err = self._run([], fixture("proxy_error_not_configured.json"))
        self.assertEqual(code, 4)
        self.assertIn("upstream_not_configured", err)

    def test_upstream_error_code_is_request_failure(self):
        payload = {"data": {"error_code": "900", "item": []}}
        code, _, err = self._run([], payload)
        self.assertEqual(code, 4)
        self.assertIn("900", err)

    def test_request_exception_is_request_failure(self):
        code, _, err = self._run([], error=kamis.RequestError("boom"))
        self.assertEqual(code, 4)
        self.assertIn("boom", err)

    def test_dry_run_proxy_url_has_no_request(self):
        code, out, _ = self._run(["--dry-run", "--county", "1101"])
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["source"], "k-skill-proxy")
        self.assertIn("/v1/kamis/food-price/daily-category", payload["url"])
        self.assertIn("p_countycode=1101", payload["url"])

    def test_direct_requires_key(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            code, _, err = self._run(
                ["--direct", "--secrets-path", "/nonexistent/kamis-secrets.env"],
                fixture("upstream_success.json"),
            )
        self.assertEqual(code, 3)
        self.assertIn("KSKILL_KAMIS_API_KEY", err)

    def test_direct_dry_run_redacts_key(self):
        with mock.patch.dict(os.environ, {"KSKILL_KAMIS_API_KEY": "SECRET-KEY"}, clear=True):
            code, out, _ = self._run(["--direct", "--dry-run"])
        self.assertEqual(code, 0)
        self.assertNotIn("SECRET-KEY", out)
        self.assertIn("<redacted>", out)
        self.assertIn("p_cert_id=TEST", out)

    def test_direct_uses_env_key(self):
        with mock.patch.dict(os.environ, {"KSKILL_KAMIS_API_KEY": "SECRET-KEY"}, clear=True):
            code, out, _ = self._run(["--direct"], fixture("upstream_success.json"))
        self.assertEqual(code, 0)
        self.assertNotIn("SECRET-KEY", out)
        self.assertEqual(json.loads(out)["source"], "kamis-upstream")


class SecretsTests(unittest.TestCase):
    def test_read_secrets_parses_dotenv(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "secrets.env"
            path.write_text('# comment\nKSKILL_KAMIS_API_KEY="abc123"\n\nOTHER=x\n', encoding="utf-8")
            values = kamis.read_secrets(str(path))
        self.assertEqual(values["KSKILL_KAMIS_API_KEY"], "abc123")
        self.assertEqual(values["OTHER"], "x")

    def test_read_secrets_missing_file_is_empty(self):
        self.assertEqual(kamis.read_secrets("/nonexistent/kamis-secrets.env"), {})

    def test_resolve_precedence_explicit_over_env_over_file(self):
        explicit = kamis.resolve_api_key("EXPLICIT", env={"KSKILL_KAMIS_API_KEY": "ENV"}, secrets_path="/nonexistent")
        self.assertEqual(explicit, "EXPLICIT")
        from_env = kamis.resolve_api_key(None, env={"KSKILL_KAMIS_API_KEY": "ENV"}, secrets_path="/nonexistent")
        self.assertEqual(from_env, "ENV")
        self.assertIsNone(kamis.resolve_api_key(None, env={}, secrets_path="/nonexistent"))


if __name__ == "__main__":
    unittest.main()
