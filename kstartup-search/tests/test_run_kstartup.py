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


class ClientFilterTests(unittest.TestCase):
    @staticmethod
    def _payload(rows):
        return {
            "currentCount": len(rows),
            "data": list(rows),
            "totalCount": 999,
            "page": 1,
            "perPage": len(rows),
        }

    def test_supt_regin_drops_other_regions(self):
        payload = self._payload([
            {"biz_pbanc_nm": "서울 청년창업", "supt_regin": "서울"},
            {"biz_pbanc_nm": "경북 모집", "supt_regin": "경북"},
            {"biz_pbanc_nm": "충북 K-바이오", "supt_regin": "충북"},
        ])
        args = make_args("announcements", supt_regin="서울특별시")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual(result["currentCount"], 1)
        self.assertEqual(result["data"][0]["biz_pbanc_nm"], "서울 청년창업")
        self.assertEqual(result["client_filter"]["upstream_returned"], 3)
        self.assertEqual(result["client_filter"]["after_filter"], 1)
        self.assertEqual(result["client_filter"]["fields"]["supt_regin"], "서울특별시")

    def test_supt_regin_normalises_long_official_names(self):
        rows = [
            ("서울특별시", "서울"),
            ("부산광역시", "부산"),
            ("경기도", "경기"),
            ("강원특별자치도", "강원"),
            ("전북특별자치도", "전북"),
            ("제주특별자치도", "제주"),
            ("세종특별자치시", "세종"),
        ]
        for long_name, short_name in rows:
            payload = self._payload([
                {"biz_pbanc_nm": "match", "supt_regin": short_name},
                {"biz_pbanc_nm": "other", "supt_regin": "전국"},
            ])
            args = make_args("announcements", supt_regin=long_name)
            result = run_kstartup.apply_client_filters(payload, args, "announcements")
            self.assertEqual(
                [row["biz_pbanc_nm"] for row in result["data"]],
                ["match"],
                f"long name {long_name!r} should match upstream short form {short_name!r}",
            )

    def test_supt_regin_short_form_also_works(self):
        payload = self._payload([
            {"biz_pbanc_nm": "match", "supt_regin": "서울"},
            {"biz_pbanc_nm": "other", "supt_regin": "경기"},
        ])
        args = make_args("announcements", supt_regin="서울")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual([row["biz_pbanc_nm"] for row in result["data"]], ["match"])

    def test_supt_regin_handles_nationwide_rows_explicitly(self):
        payload = self._payload([
            {"biz_pbanc_nm": "전국 공모", "supt_regin": "전국"},
            {"biz_pbanc_nm": "서울 공모", "supt_regin": "서울특별시"},
        ])
        args = make_args("announcements", supt_regin="서울특별시")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual([row["biz_pbanc_nm"] for row in result["data"]], ["서울 공모"])

    def test_aply_trgt_substring_match_in_comma_list(self):
        payload = self._payload([
            {"biz_pbanc_nm": "예비창업자 대상", "aply_trgt": "일반인,일반기업,예비창업자"},
            {"biz_pbanc_nm": "일반 대상", "aply_trgt": "일반인,일반기업"},
        ])
        args = make_args("announcements", aply_trgt="예비창업자")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["biz_pbanc_nm"], "예비창업자 대상")

    def test_multiple_filters_are_anded(self):
        payload = self._payload([
            {"biz_pbanc_nm": "ok",     "supt_regin": "서울특별시", "aply_trgt": "예비창업자"},
            {"biz_pbanc_nm": "wrong-region", "supt_regin": "경기도",   "aply_trgt": "예비창업자"},
            {"biz_pbanc_nm": "wrong-target", "supt_regin": "서울특별시", "aply_trgt": "일반인"},
        ])
        args = make_args(
            "announcements",
            supt_regin="서울특별시",
            aply_trgt="예비창업자",
        )
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual([row["biz_pbanc_nm"] for row in result["data"]], ["ok"])

    def test_comma_separated_request_requires_all_tokens(self):
        payload = self._payload([
            {"biz_pbanc_nm": "match-all",   "biz_enyy": "예비창업자,1년미만,2년미만"},
            {"biz_pbanc_nm": "missing-one", "biz_enyy": "예비창업자"},
        ])
        args = make_args("announcements", biz_enyy="예비창업자,1년미만")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual([row["biz_pbanc_nm"] for row in result["data"]], ["match-all"])

    def test_no_client_filter_args_is_passthrough(self):
        payload = self._payload([{"biz_pbanc_nm": "x", "supt_regin": "전국"}])
        args = make_args("announcements")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual(result["currentCount"], 1)
        self.assertNotIn("client_filter", result)

    def test_non_announcements_operations_are_passthrough(self):
        payload = self._payload([{"titl_nm": "공모전 공지"}])
        args = make_args("contents")
        result = run_kstartup.apply_client_filters(payload, args, "contents")
        self.assertEqual(result["currentCount"], 1)
        self.assertNotIn("client_filter", result)

    def test_empty_filter_value_is_treated_as_unset(self):
        payload = self._payload([{"supt_regin": "경기도"}])
        args = make_args("announcements", supt_regin="   ")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertNotIn("client_filter", result)

    def test_missing_field_in_row_is_not_matched(self):
        payload = self._payload([
            {"biz_pbanc_nm": "has-field", "supt_regin": "서울특별시"},
            {"biz_pbanc_nm": "no-field"},
        ])
        args = make_args("announcements", supt_regin="서울특별시")
        result = run_kstartup.apply_client_filters(payload, args, "announcements")
        self.assertEqual([row["biz_pbanc_nm"] for row in result["data"]], ["has-field"])


if __name__ == "__main__":
    unittest.main()
