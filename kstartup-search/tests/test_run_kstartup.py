"""Unit tests for kstartup-search helper.

stdlib unittest only; runs without DATA_GO_KR_API_KEY or network access.
"""
import argparse
import json
import os
import sys
import unittest
from io import StringIO
from unittest import mock

SCRIPT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")
sys.path.insert(0, SCRIPT_DIR)

import run_kstartup  # noqa: E402


def make_args(operation: str, **overrides):
    defaults = {
        "operation": operation,
        "page": 1,
        "per_page": 10,
        "text": False,
        "json": False,
        "dry_run": True,
        "timeout": 30,
        "proxy_base_url": "https://example.test",
        "direct": False,
        "secrets_path": "/tmp/__nonexistent__.env",
    }
    for field in run_kstartup.OPERATIONS[operation]["allowed"]:
        defaults[field.lower()] = None
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


class BuildQueryTests(unittest.TestCase):
    def test_announcements_normalizes_dates_and_yn(self):
        args = make_args(
            "announcements",
            pbanc_rcpt_bgng_dt="2024-01-01",
            pbanc_rcpt_end_dt="2024-12-31",
            rcrt_prgs_yn="y",
            supt_regin="서울특별시",
        )
        query = run_kstartup.build_query(args, "announcements")
        self.assertEqual(query["pbanc_rcpt_bgng_dt"], "20240101")
        self.assertEqual(query["pbanc_rcpt_end_dt"], "20241231")
        self.assertEqual(query["rcrt_prgs_yn"], "Y")
        self.assertEqual(query["supt_regin"], "서울특별시")
        self.assertEqual(query["returnType"], "json")
        self.assertEqual(query["page"], 1)
        self.assertEqual(query["perPage"], 10)

    def test_business_info_requires_4digit_year(self):
        args = make_args("business-info", biz_yr="24")
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_query(args, "business-info")

    def test_announcements_rejects_inverted_date_range(self):
        args = make_args(
            "announcements",
            pbanc_rcpt_bgng_dt="20240601",
            pbanc_rcpt_end_dt="20240101",
        )
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_query(args, "announcements")

    def test_announcements_rejects_impossible_calendar_date(self):
        # Calendar-impossible dates (Feb 30, Apr 31, month 13, day 0) must be
        # rejected by the Python helper so `--direct` mode does not drift from
        # the proxy-side Date.UTC() validation in kstartup.js.
        impossible_values = ["20240230", "20240431", "20241301", "20240100"]
        for value in impossible_values:
            args = make_args("announcements", pbanc_rcpt_bgng_dt=value)
            with self.assertRaises(run_kstartup.HelperError):
                run_kstartup.build_query(args, "announcements")

        # Leap-day boundary: 2024-02-29 is valid (leap), 2023-02-29 is not.
        args_leap_ok = make_args("announcements", pbanc_rcpt_bgng_dt="20240229")
        query = run_kstartup.build_query(args_leap_ok, "announcements")
        self.assertEqual(query["pbanc_rcpt_bgng_dt"], "20240229")

        args_leap_bad = make_args("announcements", pbanc_rcpt_bgng_dt="20230229")
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_query(args_leap_bad, "announcements")

    def test_invalid_yn_raises(self):
        args = make_args("announcements", rcrt_prgs_yn="maybe")
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_query(args, "announcements")

    def test_per_page_bounds(self):
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_query(make_args("announcements", per_page=0), "announcements")
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_query(make_args("announcements", per_page=101), "announcements")

    def test_contents_filter_passthrough(self):
        args = make_args("contents", clss_cd="notice_matr", titl_nm="공모전")
        query = run_kstartup.build_query(args, "contents")
        self.assertEqual(query["clss_cd"], "notice_matr")
        self.assertEqual(query["titl_nm"], "공모전")


class BuildUrlTests(unittest.TestCase):
    def test_proxy_url(self):
        args = make_args("announcements", supt_regin="서울특별시", rcrt_prgs_yn="Y")
        query = run_kstartup.build_query(args, "announcements")
        url = run_kstartup.build_url("announcements", query, direct=False, api_key=None, proxy_base_url=args.proxy_base_url)
        self.assertTrue(url.startswith("https://example.test/v1/kstartup/announcements?"))
        self.assertIn("rcrt_prgs_yn=Y", url)
        self.assertNotIn("ServiceKey", url, "proxy URL must never carry ServiceKey client-side")

    def test_direct_url_includes_service_key(self):
        args = make_args("statistics", direct=True, titl_nm="창업기업 실태조사")
        query = run_kstartup.build_query(args, "statistics")
        url = run_kstartup.build_url("statistics", query, direct=True, api_key="dummy-key", proxy_base_url=args.proxy_base_url)
        self.assertIn("apis.data.go.kr/B552735/kisedKstartupService01/getStatisticalInformation01", url)
        self.assertIn("ServiceKey=dummy-key", url)

    def test_direct_without_key_raises(self):
        args = make_args("contents", direct=True)
        query = run_kstartup.build_query(args, "contents")
        with self.assertRaises(run_kstartup.HelperError):
            run_kstartup.build_url("contents", query, direct=True, api_key=None, proxy_base_url=args.proxy_base_url)


class SecretsLoaderTests(unittest.TestCase):
    def test_returns_empty_when_missing(self):
        self.assertEqual(run_kstartup.load_secrets("/tmp/__nonexistent_kstartup__.env"), {})

    def test_parses_dotenv(self):
        path = "/tmp/__kstartup_test_secrets__.env"
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("# comment\nKSKILL_KSTARTUP_API_KEY=abc\nDATA_GO_KR_API_KEY=\"xyz\"\nEMPTY=\n")
        try:
            data = run_kstartup.load_secrets(path)
            self.assertEqual(data["KSKILL_KSTARTUP_API_KEY"], "abc")
            self.assertEqual(data["DATA_GO_KR_API_KEY"], "xyz")
            self.assertEqual(data["EMPTY"], "")
        finally:
            os.unlink(path)


class DryRunIntegrationTests(unittest.TestCase):
    def test_dry_run_outputs_proxy_url(self):
        buf = StringIO()
        with mock.patch.object(sys, "stdout", buf):
            rc = run_kstartup.run([
                "announcements",
                "--supt-regin", "서울특별시",
                "--rcrt-prgs-yn", "Y",
                "--per-page", "5",
                "--dry-run",
                "--proxy-base-url", "https://example.test",
            ])
        self.assertEqual(rc, 0)
        out = buf.getvalue()
        payload = json.loads(out)
        self.assertEqual(payload["operation"], "announcements")
        self.assertTrue(payload["url"].startswith("https://example.test/v1/kstartup/announcements?"))
        self.assertEqual(payload["query"]["rcrt_prgs_yn"], "Y")
        self.assertNotIn("ServiceKey", payload["url"])

    def test_dry_run_direct_redacts_key(self):
        buf = StringIO()
        env = dict(os.environ)
        env["KSKILL_KSTARTUP_API_KEY"] = "super-secret"
        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch.object(sys, "stdout", buf):
                rc = run_kstartup.run([
                    "contents",
                    "--clss-cd", "notice_matr",
                    "--direct",
                    "--dry-run",
                ])
        self.assertEqual(rc, 0)
        payload = json.loads(buf.getvalue())
        self.assertTrue(
            "ServiceKey=<DRY-RUN>" in payload["url"]
            or "ServiceKey=%3CDRY-RUN%3E" in payload["url"],
            f"redacted ServiceKey not found in {payload['url']!r}",
        )
        self.assertNotIn("super-secret", payload["url"])


if __name__ == "__main__":
    unittest.main()
