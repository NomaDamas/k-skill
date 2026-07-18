import contextlib
import importlib.util
import io
import json
import os
import pathlib
import unittest
import urllib.error
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "ev-charger-nearby" / "scripts" / "ev_charger.py"
SPEC = importlib.util.spec_from_file_location("ev_charger", MODULE_PATH)
ev_charger = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(ev_charger)


class EvChargerHelperTests(unittest.TestCase):
    def test_proxy_url_has_no_key_and_forces_only_server_side_json(self):
        args = ev_charger.parse_args(["info", "--location", "서울", "--proxy-base-url", "https://example.test"])
        query = ev_charger.build_query(args)
        url = ev_charger.build_url(args, query, api_key=None)
        self.assertTrue(url.startswith("https://example.test/v1/ev-charger/info?"))
        self.assertNotIn("serviceKey", url)
        self.assertNotIn("dataType", url)

    def test_direct_url_uses_preferred_key_and_forces_json(self):
        args = ev_charger.parse_args(["status", "--stat-id", "ME000001", "--direct"])
        query = ev_charger.build_query(args)
        url = ev_charger.build_url(args, query, api_key="secret +/==")
        parsed = __import__("urllib.parse").parse.urlparse(url)
        params = __import__("urllib.parse").parse.parse_qs(parsed.query)
        self.assertEqual(params["serviceKey"], ["secret +/=="])
        self.assertEqual(params["dataType"], ["JSON"])
        self.assertTrue(parsed.path.endswith("/getChargerStatus"))

    def test_direct_location_is_rejected_and_proxy_location_is_preserved(self):
        proxy_args = ev_charger.parse_args(["info", "--location", "서울 강남구"])
        self.assertEqual(ev_charger.build_query(proxy_args)["location"], "서울 강남구")

        direct_args = ev_charger.parse_args(["info", "--location", "서울 강남구", "--direct"])
        with self.assertRaisesRegex(ev_charger.HelperError, "zcode.*zscode"):
            ev_charger.build_query(direct_args)

    def test_pagination_and_period_follow_upstream_bounds(self):
        for value in (10, 9999):
            args = ev_charger.parse_args(["info", "--num-of-rows", str(value)])
            self.assertEqual(ev_charger.build_query(args)["numOfRows"], value)
        for value in (3, 10000):
            args = ev_charger.parse_args(["info", "--num-of-rows", str(value)])
            with self.assertRaisesRegex(ev_charger.HelperError, "numOfRows"):
                ev_charger.build_query(args)

        for value in (1, 10):
            args = ev_charger.parse_args(["status", "--period", str(value)])
            self.assertEqual(ev_charger.build_query(args)["period"], value)
        args = ev_charger.parse_args(["status", "--period", "11"])
        with self.assertRaisesRegex(ev_charger.HelperError, "period"):
            ev_charger.build_query(args)

    def test_direct_missing_key_reports_dataset_specific_action(self):
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stderr(stderr):
            code = ev_charger.run(["info", "--direct", "--secrets-path", "/tmp/missing-ev-secrets"])
        self.assertEqual(code, 1)
        self.assertIn("15076352", stderr.getvalue())
        self.assertIn("KSKILL_EV_CHARGER_API_KEY", stderr.getvalue())

    def test_key_resolution_prefers_skill_key_then_data_go_key(self):
        args = ev_charger.parse_args(["info", "--direct", "--secrets-path", "/tmp/missing-ev-secrets"])
        with mock.patch.dict(os.environ, {
            "KSKILL_EV_CHARGER_API_KEY": "skill-key",
            "DATA_GO_KR_API_KEY": "shared-key",
        }, clear=True):
            self.assertEqual(ev_charger.resolve_api_key(args), "skill-key")
        with mock.patch.dict(os.environ, {"DATA_GO_KR_API_KEY": "shared-key"}, clear=True):
            self.assertEqual(ev_charger.resolve_api_key(args), "shared-key")

    def test_dry_run_redacts_direct_key(self):
        stdout = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_EV_CHARGER_API_KEY": "super-secret"}, clear=True), contextlib.redirect_stdout(stdout):
            code = ev_charger.run(["status", "--stat-id", "ME000001", "--direct", "--dry-run"])
        self.assertEqual(code, 0)
        output = stdout.getvalue()
        self.assertNotIn("super-secret", output)
        self.assertIn("REDACTED", output)

    def test_proxy_down_and_upstream_not_configured_have_explicit_korean_messages(self):
        with mock.patch.object(ev_charger.urllib.request, "urlopen", side_effect=urllib.error.URLError("down")):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = ev_charger.run(["info", "--location", "서울"])
            self.assertEqual(code, 1)
            self.assertIn("프록시 서버가 응답하지 않습니다", stderr.getvalue())

        with mock.patch.object(ev_charger.urllib.request, "urlopen", side_effect=TimeoutError("timed out")):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = ev_charger.run(["info", "--location", "서울"])
            self.assertEqual(code, 1)
            self.assertIn("시간이 초과", stderr.getvalue())
            self.assertNotIn("Traceback", stderr.getvalue())

        body = io.BytesIO(json.dumps({"error": "upstream_not_configured"}).encode("utf-8"))
        error = urllib.error.HTTPError("https://example.test", 503, "Service Unavailable", {}, body)
        with mock.patch.object(ev_charger.urllib.request, "urlopen", side_effect=error):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = ev_charger.run(["status", "--stat-id", "ME000001"])
            self.assertEqual(code, 1)
            self.assertIn("API 키가 설정되어 있지 않습니다", stderr.getvalue())

    def test_default_timeout_covers_slow_upstream(self):
        args = ev_charger.parse_args(["info", "--location", "서울 강남구"])
        self.assertGreaterEqual(args.timeout, 90)

    def test_text_and_json_outputs_are_supported(self):
        payload = {
            "operation": "info",
            "total_count": 1,
            "items": [{"statNm": "시청 충전소", "addr": "서울 중구", "statId": "ME000001", "chgerId": "01", "stat": "2"}],
        }
        with mock.patch.object(ev_charger, "http_get_json", return_value=payload):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(ev_charger.run(["info", "--location", "서울"]), 0)
            self.assertIn("시청 충전소", stdout.getvalue())
            self.assertIn("서울 중구", stdout.getvalue())

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(ev_charger.run(["info", "--location", "서울", "--json"]), 0)
            self.assertEqual(json.loads(stdout.getvalue())["total_count"], 1)

    def test_text_output_accepts_direct_upstream_item_envelope(self):
        payload = {
            "pageNo": 1,
            "numOfRows": 10,
            "totalCount": 1,
            "items": {"item": {"statNm": "직접 호출 충전소", "addr": "서울", "chgerId": "01", "stat": "2"}},
        }
        self.assertIn("직접 호출 충전소", ev_charger.format_text(payload))

        nested = {"response": {"body": payload}}
        text = ev_charger.format_text(nested)
        self.assertIn("직접 호출 충전소", text)
        self.assertIn("1건", text)


if __name__ == "__main__":
    unittest.main()
