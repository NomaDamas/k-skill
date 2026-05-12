import importlib.util
import json
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
HELPER_PATH = SCRIPT_DIR.parent / "scripts" / "run_foresttrip_vacancy.py"
FIXTURES_DIR = SCRIPT_DIR / "fixtures"


def load_helper():
    spec = importlib.util.spec_from_file_location("run_foresttrip_vacancy", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["run_foresttrip_vacancy"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()


def load_fixture(name):
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


GEOJE_ROWS = load_fixture("geoje_window.json")
GUJAEBONG_ROWS = load_fixture("gujaebong_window.json")

GEOJE_FOREST_ID = "ID02030059"
GEOJE_FOREST_NAME = "[공립](거제시)거제자연휴양림"
GUJAEBONG_FOREST_ID = "ID02030072"
GUJAEBONG_FOREST_NAME = "[공립](하동군)구재봉자연휴양림"

FIXED_NOW = datetime(2026, 5, 12, 0, 0, 0)


def make_session(forests):
    return helper.Session(
        cookies={},
        csrf="dummy-csrf",
        user_agent="test-ua",
        forests=forests,
        expires_at=FIXED_NOW.timestamp() + 3600,
    )


def stub_fetch(rows):
    def _stub(*, session, forest_id, category, today, last_day):
        matched = [r for r in rows if r.get("insttId") == forest_id]
        return forest_id, category, matched, None
    return _stub


def run_collect(session, targets, rows, *, dates=None, week_range=None, categories=("01",)):
    with mock.patch.object(helper, "fetch_one", side_effect=stub_fetch(rows)):
        with mock.patch.object(helper, "datetime", wraps=datetime) as mock_dt:
            mock_dt.now.return_value = FIXED_NOW
            return helper.collect_results(
                session=session,
                targets=targets,
                categories=categories,
                dates=tuple(dates) if dates else None,
                week_range=week_range,
                concurrency=1,
            )


class IsReserveRoomTest(unittest.TestCase):
    def test_parens_with_suffix(self):
        self.assertTrue(helper.is_reserve_room({"goodsNm": "201호 배꽃방(예비용)"}))

    def test_parens_prefix(self):
        self.assertTrue(helper.is_reserve_room({"goodsNm": "(예비) 201호"}))

    def test_predicate_with_simple_suffix(self):
        self.assertTrue(helper.is_reserve_room({"goodsNm": "편백나무2호(예비용)"}))

    def test_normal_room_passes(self):
        self.assertFalse(helper.is_reserve_room({"goodsNm": "동백1"}))

    def test_empty_name(self):
        self.assertFalse(helper.is_reserve_room({"goodsNm": ""}))

    def test_missing_name_key(self):
        self.assertFalse(helper.is_reserve_room({}))


class IsAvailableTest(unittest.TestCase):
    def test_y_and_zero_count(self):
        self.assertTrue(helper.is_available({"rsrvtAvail": "Y", "rsrvtCnt": 0}))

    def test_y_but_already_booked(self):
        self.assertFalse(helper.is_available({"rsrvtAvail": "Y", "rsrvtCnt": 1}))

    def test_not_available(self):
        self.assertFalse(helper.is_available({"rsrvtAvail": "N", "rsrvtCnt": 0}))


class CollectResultsFilterTest(unittest.TestCase):
    def setUp(self):
        self.session = make_session({GEOJE_FOREST_ID: GEOJE_FOREST_NAME})
        self.targets = {GEOJE_FOREST_ID: GEOJE_FOREST_NAME}

    def test_geoje_5_13_three_unique_rooms_after_dedup_and_reserve_filter(self):
        payload = run_collect(self.session, self.targets, GEOJE_ROWS, dates=["20260513"])
        self.assertEqual(payload["filter_hits"], 3)
        names = {
            room["name"]
            for forest in payload["results"]
            for date in forest["dates"]
            for room in date["rooms"]
        }
        self.assertEqual(names, {"동백1", "해송2", "고로쇠1"})

    def test_geoje_5_16_returns_zero_when_only_reserved_or_booked(self):
        payload = run_collect(self.session, self.targets, GEOJE_ROWS, dates=["20260516"])
        self.assertEqual(payload["filter_hits"], 0)
        self.assertEqual(payload["results"], [])

    def test_geoje_5_17_two_rooms(self):
        payload = run_collect(self.session, self.targets, GEOJE_ROWS, dates=["20260517"])
        self.assertEqual(payload["filter_hits"], 2)
        names = {
            room["name"]
            for forest in payload["results"]
            for date in forest["dates"]
            for room in date["rooms"]
        }
        self.assertEqual(names, {"중산막2", "동백3"})

    def test_dates_outside_request_filtered_out(self):
        payload = run_collect(self.session, self.targets, GEOJE_ROWS, dates=["20260513"])
        observed_dates = {
            room["use_dt"]
            for forest in payload["results"]
            for date in forest["dates"]
            for room in date["rooms"]
        }
        self.assertEqual(observed_dates, {"20260513"})

    def test_reserve_rooms_excluded_across_all_dates(self):
        payload = run_collect(
            self.session, self.targets, GEOJE_ROWS,
            dates=["20260513", "20260516", "20260517"],
        )
        for forest in payload["results"]:
            for date in forest["dates"]:
                for room in date["rooms"]:
                    self.assertNotIn("예비", room["name"])

    def test_dedup_collapses_duplicate_room_with_different_goods_id(self):
        payload = run_collect(self.session, self.targets, GEOJE_ROWS, dates=["20260513"])
        donbaek_count = sum(
            1
            for forest in payload["results"]
            for date in forest["dates"]
            for room in date["rooms"]
            if room["name"] == "동백1"
        )
        self.assertEqual(donbaek_count, 1)


class StrictUseDtGateTest(unittest.TestCase):
    """Bug 1 regression: API returns 5-day window even when single-day requested."""

    def test_useDt_before_today_blocked_even_if_available(self):
        past_row = dict(GEOJE_ROWS[0])
        past_row["useDt"] = "20260101"
        rows = [past_row]
        session = make_session({GEOJE_FOREST_ID: GEOJE_FOREST_NAME})
        payload = run_collect(
            session, {GEOJE_FOREST_ID: GEOJE_FOREST_NAME}, rows,
            week_range=1,
        )
        self.assertEqual(payload["filter_hits"], 0)

    def test_useDt_after_last_day_blocked(self):
        far_future = dict(GEOJE_ROWS[0])
        far_future["useDt"] = "20300101"
        rows = [far_future]
        session = make_session({GEOJE_FOREST_ID: GEOJE_FOREST_NAME})
        payload = run_collect(
            session, {GEOJE_FOREST_ID: GEOJE_FOREST_NAME}, rows,
            week_range=1,
        )
        self.assertEqual(payload["filter_hits"], 0)


class GroundTruthTest(unittest.TestCase):
    """Anchored to user-verified counts from foresttrip.go.kr on 2026-05-12.
    Fixtures are simplified; tests assert the per-(forest, date) shape matches."""

    def test_gujaebong_5_16_one_room_named_쑥부쟁이방(self):
        session = make_session({GUJAEBONG_FOREST_ID: GUJAEBONG_FOREST_NAME})
        payload = run_collect(
            session, {GUJAEBONG_FOREST_ID: GUJAEBONG_FOREST_NAME}, GUJAEBONG_ROWS,
            dates=["20260516"],
        )
        self.assertEqual(payload["filter_hits"], 1)
        names = [
            room["name"]
            for forest in payload["results"]
            for date in forest["dates"]
            for room in date["rooms"]
        ]
        self.assertEqual(names, ["206호 쑥부쟁이방"])


if __name__ == "__main__":
    unittest.main()
