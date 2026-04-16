import importlib.util
import json
import subprocess
import sys
from argparse import Namespace
from datetime import date, datetime, timezone
from pathlib import Path
import unittest
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
FILTER_PATH = SCRIPT_DIR / "scholarship_filter.py"
PLANNER_PATH = SCRIPT_DIR / "university_search_plan.py"


def load_module(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


scholarship_filter = load_module("scholarship_filter", FILTER_PATH)
university_search_plan = load_module("university_search_plan", PLANNER_PATH)


class DeadlineStatusTest(unittest.TestCase):
    def test_current_kst_date_uses_korea_calendar_day(self):
        now = datetime(2026, 4, 15, 16, 30, tzinfo=timezone.utc)

        today = scholarship_filter.current_kst_date(now)

        self.assertEqual(today, date(2026, 4, 16))

    def test_resolve_today_falls_back_to_kst_when_missing_or_invalid(self):
        with mock.patch.object(scholarship_filter, "current_kst_date", return_value=date(2026, 4, 16)):
            self.assertEqual(scholarship_filter.resolve_today(None), date(2026, 4, 16))
            self.assertEqual(scholarship_filter.resolve_today("not-a-date"), date(2026, 4, 16))

    def test_infer_deadline_status_overrides_stale_cached_status_with_dates(self):
        record = {
            "deadline": {
                "status": "open",
                "start": "2026-04-01",
                "end": "2026-04-14",
            }
        }

        status = scholarship_filter.infer_deadline_status(record, date(2026, 4, 15))

        self.assertEqual(status, "closed")

    def test_infer_deadline_status_returns_unknown_for_noncanonical_cached_value_without_dates(self):
        record = {"deadline": {"status": "d-3"}}

        status = scholarship_filter.infer_deadline_status(record, date(2026, 4, 15))

        self.assertEqual(status, "unknown")

    def test_infer_deadline_status_treats_end_date_equal_to_today_as_open(self):
        record = {"deadline": {"end": "2026-04-15"}}

        status = scholarship_filter.infer_deadline_status(record, date(2026, 4, 15))

        self.assertEqual(status, "open")

    def test_report_does_not_crash_on_noncanonical_status_and_counts_unknown(self):
        payload = json.dumps([{"name": "x", "deadline": {"status": "d-3"}}], ensure_ascii=False)

        result = subprocess.run(
            [sys.executable, str(FILTER_PATH), "report", "--today", "2026-04-15"],
            input=payload,
            text=True,
            capture_output=True,
            check=True,
        )

        self.assertIn("- 기준일: 2026-04-15 (Asia/Seoul (KST))", result.stdout)
        self.assertIn("- 상태 미확인: 1", result.stdout)
        self.assertIn("## 상태 미확인", result.stdout)


class AmountHandlingTest(unittest.TestCase):
    def test_extract_amount_value_uses_amount_fields_and_ignores_irrelevant_notes(self):
        from_text = scholarship_filter.extract_amount_value({"amount": {"text": "생활비 250만원 지급"}})
        ignored_notes = scholarship_filter.extract_amount_value(
            {
                "amount": {"text": "등록금 전액"},
                "notes": ["작년에는 500만원 특별지원"],
            }
        )

        self.assertEqual(from_text, 2500000)
        self.assertIsNone(ignored_notes)

    def test_match_filter_keeps_text_only_amount_by_default_and_marks_it_unknown(self):
        args = Namespace(
            q=None,
            org_type=None,
            school_kind=None,
            school_name=None,
            student_level=None,
            major=None,
            department_name=None,
            grade_year=None,
            gpa=None,
            income_band=None,
            min_amount=2000000,
            max_amount=None,
            strict_amount=False,
            deadline_status=None,
            today="2026-04-15",
            only_open_now=False,
            upcoming_within_days=None,
            deadline_within_days=None,
        )

        matched, reasons = scholarship_filter.match_filter({"amount": {"text": "등록금 전액"}}, args)

        self.assertTrue(matched)
        self.assertIn("amount>=2000000?", reasons)

    def test_match_filter_can_drop_text_only_amount_in_strict_mode(self):
        args = Namespace(
            q=None,
            org_type=None,
            school_kind=None,
            school_name=None,
            student_level=None,
            major=None,
            department_name=None,
            grade_year=None,
            gpa=None,
            income_band=None,
            min_amount=2000000,
            max_amount=None,
            strict_amount=True,
            deadline_status=None,
            today="2026-04-15",
            only_open_now=False,
            upcoming_within_days=None,
            deadline_within_days=None,
        )

        matched, reasons = scholarship_filter.match_filter({"amount": {"text": "등록금 전액"}}, args)

        self.assertFalse(matched)
        self.assertEqual(reasons, [])


class SparseFieldPolicyTest(unittest.TestCase):
    def test_eligibility_returns_indeterminate_when_profile_fields_are_missing(self):
        args = Namespace(
            org_type=None,
            school_kind="university",
            school_name="서울대학교",
            student_level="undergraduate",
            major=None,
            department_name=None,
            grade_year=None,
            gpa=None,
            income_band=5,
        )

        result = scholarship_filter.eligibility_result({"name": "테스트 장학금"}, args)

        self.assertEqual(result["status"], "indeterminate")
        self.assertEqual(result["failed"], [])
        self.assertEqual(
            result["unknown"],
            ["school_kind=?", "school_name=?", "student_level=?", "income_band=?"],
        )

    def test_school_name_filter_does_not_match_urls_any_more(self):
        args = Namespace(
            q=None,
            org_type=None,
            school_kind=None,
            school_name="SNU",
            student_level=None,
            major=None,
            department_name=None,
            grade_year=None,
            gpa=None,
            income_band=None,
            min_amount=None,
            max_amount=None,
            strict_amount=False,
            deadline_status=None,
            today="2026-04-15",
            only_open_now=False,
            upcoming_within_days=None,
            deadline_within_days=None,
        )
        record = {
            "organization": {"name": "한국장학재단"},
            "source_url": "https://www.kosaf.go.kr/snu-notice",
        }

        matched, reasons = scholarship_filter.match_filter(record, args)

        self.assertFalse(matched)
        self.assertEqual(reasons, [])


class UniversitySearchPlanTest(unittest.TestCase):
    def test_school_domain_suppresses_broad_ac_kr_fallback_queries(self):
        payload = university_search_plan.build_school_queries(
            school_name="서울대학교",
            school_domain="snu.ac.kr",
            departments=["컴퓨터공학부"],
            colleges=[],
            year=2026,
        )

        queries = payload["search_queries"]
        self.assertTrue(any(query.startswith("site:snu.ac.kr ") for query in queries))
        self.assertFalse(any('site:*.ac.kr "서울대학교"' in query for query in queries))


if __name__ == "__main__":
    unittest.main()
