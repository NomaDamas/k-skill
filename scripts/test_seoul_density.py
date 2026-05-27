"""Tests for seoul_density CLI helpers (no network access)."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

import seoul_density as sd


class FuzzyMatchTests(unittest.TestCase):
    def test_exact_substring_wins(self) -> None:
        result = sd.fuzzy_match("강남역")
        self.assertIn("강남역", result)

    def test_keyword_contained_in_area(self) -> None:
        result = sd.fuzzy_match("홍대")
        self.assertTrue(any("홍대" in name for name in result))

    def test_close_match_fallback(self) -> None:
        result = sd.fuzzy_match("여의도공원")
        self.assertTrue(result, "close match should return at least one candidate")

    def test_loose_match_strips_역_suffix(self) -> None:
        result = sd.fuzzy_match("강남")
        self.assertIn("강남역", result)


class SummarizeTests(unittest.TestCase):
    def test_ok_payload(self) -> None:
        payload = {
            "RESULT": {"RESULT.CODE": "INFO-000", "RESULT.MESSAGE": "OK"},
            "SeoulRtd.citydata_ppltn": [
                {
                    "AREA_NM": "강남역",
                    "AREA_CONGEST_LVL": "붐빔",
                    "AREA_PPLTN_MIN": "30000",
                    "AREA_PPLTN_MAX": "32000",
                    "PPLTN_TIME": "2026-05-14 09:30",
                    "AREA_CONGEST_MSG": "평소보다 매우 많은 인파",
                }
            ],
        }
        summary = sd.summarize(payload)
        self.assertEqual(summary["area"], "강남역")
        self.assertEqual(summary["congestion_level"], "붐빔")

    def test_api_error_code_raises(self) -> None:
        payload = {"RESULT": {"RESULT.CODE": "ERROR-300", "RESULT.MESSAGE": "bad key"}}
        with self.assertRaises(RuntimeError):
            sd.summarize(payload)

    def test_empty_rows_raises(self) -> None:
        payload = {"RESULT": {"RESULT.CODE": "INFO-000"}, "SeoulRtd.citydata_ppltn": []}
        with self.assertRaises(RuntimeError):
            sd.summarize(payload)


class CLITests(unittest.TestCase):
    def test_list_json(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = sd.main(["list", "--json"])
        self.assertEqual(rc, 0)
        data = json.loads(buf.getvalue())
        self.assertIn("관광특구", data)

    def test_match_unknown_keyword(self) -> None:
        err = io.StringIO()
        with redirect_stderr(err):
            rc = sd.main(["match", "절대로_존재하지_않는_장소_xyzzy"])
        self.assertEqual(rc, 1)

    def test_query_unsupported_area(self) -> None:
        err = io.StringIO()
        with redirect_stderr(err):
            rc = sd.main(["query", "존재하지않는장소xyzzy"])
        self.assertEqual(rc, 1)

    def test_query_auto_matches_single_candidate(self) -> None:
        payload = {
            "RESULT": {"RESULT.CODE": "INFO-000"},
            "SeoulRtd.citydata_ppltn": [
                {
                    "AREA_NM": "서울 암사동 유적",
                    "AREA_CONGEST_LVL": "보통",
                    "AREA_PPLTN_MIN": "1000",
                    "AREA_PPLTN_MAX": "1200",
                    "PPLTN_TIME": "2026-05-14 10:00",
                    "AREA_CONGEST_MSG": "평소와 비슷",
                }
            ],
        }
        captured: dict[str, str] = {}

        def fake_proxy(area: str) -> dict:
            captured["area"] = area
            return payload

        buf = io.StringIO()
        err = io.StringIO()
        with mock.patch.object(sd, "fetch_density_via_proxy", side_effect=fake_proxy), \
             redirect_stdout(buf), redirect_stderr(err):
            rc = sd.main(["query", "암사동"])
        self.assertEqual(rc, 0)
        self.assertEqual(captured.get("area"), "서울 암사동 유적")
        self.assertIn("자동 매칭", err.getvalue())

    def test_no_auto_disables_single_match(self) -> None:
        err = io.StringIO()
        with redirect_stderr(err):
            rc = sd.main(["query", "암사동", "--no-auto"])
        self.assertEqual(rc, 1)

    def test_query_happy_path(self) -> None:
        payload = {
            "RESULT": {"RESULT.CODE": "INFO-000"},
            "SeoulRtd.citydata_ppltn": [
                {
                    "AREA_NM": "강남역",
                    "AREA_CONGEST_LVL": "보통",
                    "AREA_PPLTN_MIN": "10000",
                    "AREA_PPLTN_MAX": "12000",
                    "PPLTN_TIME": "2026-05-14 09:00",
                    "AREA_CONGEST_MSG": "평소와 비슷",
                }
            ],
        }
        buf = io.StringIO()
        with mock.patch.object(sd, "fetch_density_via_proxy", return_value=payload), \
             redirect_stdout(buf):
            rc = sd.main(["query", "강남역", "--json"])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertEqual(out["congestion_level"], "보통")


class ProxyHelpersTests(unittest.TestCase):
    def test_proxy_base_url_default(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(sd.get_proxy_base_url(), sd.DEFAULT_PROXY_BASE_URL)

    def test_proxy_base_url_custom_strips_trailing_slash(self) -> None:
        with mock.patch.dict("os.environ", {"KSKILL_PROXY_BASE_URL": "https://example.com/"}, clear=True):
            self.assertEqual(sd.get_proxy_base_url(), "https://example.com")


if __name__ == "__main__":
    unittest.main()
