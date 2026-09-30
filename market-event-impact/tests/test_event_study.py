import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfoNotFoundError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from calendars import align_date, market_alignment_for_event, market_alignment_for_series, zone_for_date
from event_study import analyze_intraday_reaction, analyze_series, classify_curve, threshold_events
from market_data import SeriesError, load_series


class EventStudyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.series = load_series(str(ROOT / "tests" / "fixtures" / "market-series.json"))
        cls.by_symbol = {item["symbol"]: item for item in cls.series}

    def test_bp_and_percent_change(self):
        rates = analyze_series(self.by_symbol["UST2Y"], "2026-09-16")
        self.assertAlmostEqual(rates["window"]["d0"]["change_from_d_minus_1"], 6.0)
        equity = analyze_series(self.by_symbol["KOSPI"], "2026-09-16")
        self.assertAlmostEqual(equity["window"]["d0"]["change_from_d_minus_1"], 1 / 3)

    def test_rate_series_already_in_bp_is_not_multiplied_again(self):
        spread = {
            "symbol": "2s10s",
            "region": "US",
            "asset_class": "spread",
            "unit": "bp",
            "source": {"name": "fixture", "url": "https://example.test/spread"},
            "observations": [{"date": "2026-09-15", "value": -42}, {"date": "2026-09-16", "value": -47}],
        }
        result = analyze_series(spread, "2026-09-16")
        self.assertEqual(result["window"]["d0"]["change_from_d_minus_1"], -5)
        triggered = threshold_events(spread, "bp_change", "below", -5)
        self.assertEqual(triggered[0]["value"], -5)

    def test_independent_next_alignment(self):
        aligned, index = align_date("2026-09-19", [row["date"] for row in self.by_symbol["KOSPI"]["observations"]], "next")
        self.assertEqual(aligned, "2026-09-21")
        self.assertIsNotNone(index)
        strict, _ = align_date("2026-09-16", [row["date"] for row in self.by_symbol["KOSPI"]["observations"]], "next_strict")
        self.assertEqual(strict, "2026-09-17")

    def test_cross_market_alignment_uses_event_time_and_dst(self):
        fomc = {"region": "US", "event_date": "2026-09-16", "event_time_local": "14:00", "event_timezone": "America/New_York"}
        self.assertEqual(market_alignment_for_event(fomc, "KR"), "next")
        self.assertEqual(market_alignment_for_event(fomc, "EU"), "next_strict")
        self.assertEqual(market_alignment_for_event(fomc, "US"), "next")
        late_ny_event = {"region": "US", "event_date": "2026-09-16", "event_time_local": "18:00", "event_timezone": "America/New_York"}
        self.assertEqual(market_alignment_for_event(late_ny_event, "KR"), "next")
        self.assertEqual(market_alignment_for_event(late_ny_event, "US"), "next_strict")
        nfp = {"region": "US", "event_date": "2026-09-04", "event_time_local": "08:30", "event_timezone": "America/New_York"}
        self.assertEqual(market_alignment_for_event(nfp, "EU"), "next")
        bok = {"region": "KR", "event_date": "2026-09-17", "event_time_local": "10:00", "event_timezone": "Asia/Seoul"}
        self.assertEqual(market_alignment_for_event(bok, "US"), "next_strict")

    def test_source_observation_clock_prevents_fx_session_misalignment(self):
        event = {"region": "US", "event_date": "2023-03-10", "event_time_local": "11:15", "event_timezone": "America/New_York"}
        fred_usdkrw = {
            "region": "KR", "observation_timezone": "America/New_York", "observation_time": "12:00",
            "market_timezone": "Asia/Seoul", "observations": [],
        }
        self.assertEqual(market_alignment_for_series(event, fred_usdkrw), ("next", "source_observation_time", "2023-03-10"))
        fred_usdkrw["observation_time"] = "10:00"
        self.assertEqual(market_alignment_for_series(event, fred_usdkrw), ("next_strict", "source_observation_time", "2023-03-10"))
        seoul_close = {"region": "KR", "market_timezone": "Asia/Seoul", "observations": []}
        self.assertEqual(market_alignment_for_series(event, seoul_close), ("next", "market_close_proxy", "2023-03-11"))

    def test_intraday_reaction_uses_event_time_and_actual_bar_timestamps(self):
        event = {"event_date": "2023-03-10", "event_time_local": "11:15", "event_timezone": "America/New_York"}
        series = {
            "symbol": "SPX", "asset_class": "equity", "unit": "index", "market_timezone": "America/New_York",
            "source": {"name": "fixture", "url": "https://example.test/spx"},
            "intraday_observations": [
                {"timestamp": "2023-03-10T11:00:00-05:00", "value": 100},
                {"timestamp": "2023-03-10T12:30:00-05:00", "value": 99},
                {"timestamp": "2023-03-10T16:00:00-05:00", "value": 98},
            ],
        }
        result = analyze_intraday_reaction(series, event)
        self.assertEqual(result["pre_event"]["timestamp"], "2023-03-10T11:00:00-05:00")
        self.assertEqual(result["plus_1h"]["timestamp"], "2023-03-10T12:30:00-05:00")
        self.assertEqual(result["plus_1h"]["change_from_pre_event"], -1.0)
        self.assertEqual(result["session_end"]["change_from_pre_event"], -2.0)
        self.assertEqual(result["session_end_label"], "market_close")

    def test_dst_fallback_is_deterministic_without_system_tzdata(self):
        with patch("calendars.ZoneInfo", side_effect=ZoneInfoNotFoundError("tzdata unavailable")):
            ny_before = zone_for_date("America/New_York", date(2026, 3, 7))
            ny_after = zone_for_date("America/New_York", date(2026, 3, 8))
            london_after = zone_for_date("Europe/London", date(2026, 3, 29))
            tokyo = zone_for_date("Asia/Tokyo", date(2026, 6, 1))
        self.assertEqual(datetime(2026, 3, 7, 12, tzinfo=ny_before).utcoffset().total_seconds(), -5 * 3600)
        self.assertEqual(datetime(2026, 3, 8, 12, tzinfo=ny_after).utcoffset().total_seconds(), -4 * 3600)
        self.assertEqual(datetime(2026, 3, 29, 12, tzinfo=london_after).utcoffset().total_seconds(), 3600)
        self.assertEqual(datetime(2026, 6, 1, 12, tzinfo=tokyo).utcoffset().total_seconds(), 9 * 3600)

    def test_future_window_is_pending_not_false_missing(self):
        truncated = dict(self.by_symbol["KOSPI"])
        truncated["observations"] = truncated["observations"][:-1]
        result = analyze_series(truncated, "2026-09-16", "next_strict", (-1, 0, 1, 5))
        self.assertIn("pending_d+5", result["warnings"])
        self.assertEqual(result["latest_observation_date"], "2026-09-23")

    def test_curve_classification_and_mixed(self):
        self.assertEqual(classify_curve(7, 1)["classification"], "Bear Flattening")
        self.assertEqual(classify_curve(-5, -1)["classification"], "Bull Steepening")
        self.assertEqual(classify_curve(2, -1)["classification"], "Mixed")

    def test_threshold_is_inclusive(self):
        events = threshold_events(self.by_symbol["UST2Y"], "bp_change", "above", 6)
        self.assertIn("2026-09-15", {item["date"] for item in events})
        self.assertTrue(any(abs(item["value"] - 6.0) < 1e-8 for item in events))

    def test_bp_threshold_rejects_non_rate_series(self):
        with self.assertRaisesRegex(ValueError, "bp_change requires"):
            threshold_events(self.by_symbol["KOSPI"], "bp_change", "above", 10)

    def test_duplicate_date_rejected(self):
        bad = dict(self.by_symbol["UST2Y"])
        bad["observations"] = bad["observations"] + [bad["observations"][0]]
        from market_data import _normalize_series
        with self.assertRaises(SeriesError):
            _normalize_series(bad)

    def test_invalid_date_and_missing_source_rejected(self):
        from market_data import _normalize_series
        base = {
            "symbol": "BAD",
            "region": "US",
            "asset_class": "rates",
            "unit": "pct",
            "source": {"name": "source", "url": "https://example.test"},
            "observations": [{"date": "2026-02-30", "value": 1}],
        }
        with self.assertRaisesRegex(SeriesError, "invalid ISO date"):
            _normalize_series(base)
        base["observations"] = [{"date": "2026-02-28", "value": 1}]
        base["source"] = {}
        with self.assertRaisesRegex(SeriesError, "source.name"):
            _normalize_series(base)

    def test_invalid_units_boolean_values_and_urls_rejected(self):
        from market_data import _normalize_series
        base = {
            "symbol": "BAD",
            "region": "US",
            "asset_class": "rates",
            "unit": "index",
            "source": {"name": "source", "url": "https://example.test"},
            "observations": [{"date": "2026-09-16", "value": 1}],
        }
        with self.assertRaisesRegex(SeriesError, "unit must be pct or bp"):
            _normalize_series(base)
        base["unit"] = "pct"
        base["observations"][0]["value"] = True
        with self.assertRaisesRegex(SeriesError, "not a number"):
            _normalize_series(base)
        base["observations"][0]["value"] = 1
        base["source"]["url"] = "not-a-url"
        with self.assertRaisesRegex(SeriesError, "http"):
            _normalize_series(base)

    def test_series_provenance_and_intraday_edge_cases_are_validated(self):
        from market_data import _normalize_series
        base = {
            "symbol": "USDKRW", "region": "KR", "asset_class": "fx", "unit": "krw_per_usd",
            "source": {"name": "FRED", "url": "https://example.test/fred"},
            "observations": [{"date": "2023-03-10", "value": 1324.51}],
            "observation_timezone": "America/New_York", "observation_time": "12:00",
            "market_timezone": "Asia/Seoul", "price_type": "noon_buying_rate",
        }
        normalized = _normalize_series(base)
        self.assertEqual(normalized["observation_timezone"], "America/New_York")
        self.assertEqual(normalized["price_type"], "noon_buying_rate")
        broken = dict(base, observation_time=None)
        with self.assertRaisesRegex(SeriesError, "must be provided together"):
            _normalize_series(broken)
        broken = dict(base, observation_timezone="Mars/Olympus")
        with self.assertRaisesRegex(SeriesError, "valid IANA timezone"):
            _normalize_series(broken)
        broken = dict(base, intraday_observations=[{"timestamp": "2023-03-10T11:00:00", "value": 1}])
        with self.assertRaisesRegex(SeriesError, "include a timezone offset"):
            _normalize_series(broken)

    def test_duplicate_symbols_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "series.json"
            item = self.by_symbol["UST2Y"]
            path.write_text(json.dumps({"series": [item, item]}), encoding="utf-8")
            with self.assertRaisesRegex(SeriesError, "duplicate symbols"):
                load_series(str(path))

    def test_empty_and_case_insensitive_duplicate_symbols_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            empty = Path(temp) / "empty.json"
            empty.write_text('{"series": []}', encoding="utf-8")
            with self.assertRaisesRegex(SeriesError, "at least one"):
                load_series(str(empty))
            path = Path(temp) / "series.json"
            first = self.by_symbol["DXY"]
            second = dict(first)
            second["symbol"] = "dxy"
            path.write_text(json.dumps({"series": [first, second]}), encoding="utf-8")
            with self.assertRaisesRegex(SeriesError, "duplicate symbols"):
                load_series(str(path))


if __name__ == "__main__":
    unittest.main()
