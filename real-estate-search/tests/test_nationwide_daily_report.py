import importlib.util
import pathlib
import sys
import unittest
from datetime import date
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "real-estate-search" / "scripts" / "nationwide_daily_report.py"
SPEC = importlib.util.spec_from_file_location("nationwide_daily_report", MODULE_PATH)
assert SPEC is not None
report = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = report
SPEC.loader.exec_module(report)


class NationwideDailyReportTests(unittest.TestCase):
    def setUp(self):
        self.regions = [
            report.Region("경기도", "수원시 장안구", "41111"),
            report.Region("세종특별자치시", "세종특별자치시", "36110"),
        ]

    def test_month_windows_cover_current_and_previous_month(self):
        self.assertEqual(
            report.month_windows(date(2026, 8, 31)),
            [(date(2026, 8, 1), date(2026, 8, 31)), (date(2026, 7, 1), date(2026, 7, 31))],
        )

    def test_fetch_regions_accepts_official_rtms_list_contract(self):
        responses = [
            b"<html></html>",
            '[{"signguCode":"11000","ctprvnNm":"서울특별시"}]'.encode(),
            '[{"signguCode":"11680","signguNm":"강남구"}]'.encode(),
        ]

        with mock.patch.object(report, "_request_bytes", side_effect=responses):
            regions = report.fetch_regions(object())

        self.assertEqual(regions, [report.Region("서울특별시", "강남구", "11680")])

    def test_trade_csv_maps_composite_region_and_excludes_cancelled_prices(self):
        raw = (
            '"국토교통부 실거래가 자료"\r\n'
            '"NO","시군구","계약년월","계약일","거래금액(만원)","해제사유발생일"\r\n'
            '"1","경기도 수원시 장안구 정자동","202608","7","12,000","-"\r\n'
            '"2","경기도 수원시 장안구 영화동","202608","9","14,000","20260820"\r\n'
        ).encode("cp949")

        parsed = report.parse_csv(raw, 2, report.COMBINATIONS[0], self.regions)

        self.assertEqual(parsed.region_counts, {"41111": 2})
        self.assertEqual(parsed.prices, [12000])
        self.assertEqual(parsed.cancelled, 1)
        self.assertEqual(parsed.latest_month, "202608")

    def test_rent_csv_maps_single_level_sejong_region(self):
        raw = (
            '"NO","시군구","계약년월","계약일","보증금(만원)","월세금(만원)"\r\n'
            '"1","세종특별자치시 조치원읍","202608","10","8,000","35"\r\n'
        ).encode("cp949")

        parsed = report.parse_csv(raw, 1, report.COMBINATIONS[1], self.regions)

        self.assertEqual(parsed.region_counts, {"36110": 1})
        self.assertEqual(parsed.deposits, [8000])
        self.assertEqual(parsed.monthly_rents, [35])

    def test_csv_count_mismatch_is_a_contract_failure(self):
        raw = (
            '"NO","시군구","계약년월","계약일","거래금액(만원)","해제사유발생일"\r\n'
            '"1","경기도 수원시 장안구 정자동","202608","7","12,000",""\r\n'
        ).encode("cp949")

        with self.assertRaisesRegex(report.ReportError, "count_mismatch"):
            report.parse_csv(raw, 2, report.COMBINATIONS[0], self.regions)

    def test_cell_summary_keeps_success_empty_failure_and_unexecuted_distinct(self):
        first = report.ComboResult(report.COMBINATIONS[0], "success", date(2026, 8, 1), date(2026, 8, 31), 1)
        first.region_counts = {"41111": 1}
        second = report.ComboResult(report.COMBINATIONS[1], "empty", date(2026, 7, 1), date(2026, 7, 31), 0)
        third = report.ComboResult(report.COMBINATIONS[2], "failure", date(2026, 8, 1), date(2026, 8, 31), 0, error="network_error")

        summary = report.summarize_cells(self.regions, [first, second, third])

        self.assertEqual(summary, {"total": 16, "success": 1, "empty": 3, "failure": 2, "unexecuted": 10})

    def test_report_is_slack_readable_and_links_only_the_observed_landing_url(self):
        results = [
            report.ComboResult(combo, "empty", date(2026, 7, 1), date(2026, 7, 31), 0)
            for combo in report.COMBINATIONS
        ]

        rendered = report.render_report(date(2026, 8, 31), self.regions, results, 1.2)

        self.assertIn("성공 조합: 0 · 빈 결과: 16 · 실패: 0 · 미실행: 0", rendered)
        self.assertIn("<https://rt.molit.go.kr/pt/xls/xls.do|국토교통부 실거래가 자료제공>", rendered)
        self.assertNotIn("| ---", rendered)
        self.assertNotIn("내부 경로", rendered)


if __name__ == "__main__":
    unittest.main()
