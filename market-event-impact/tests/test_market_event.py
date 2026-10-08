import sys
import json
import tempfile
import unittest
from calendars import market_alignment_for_series
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from event_study import analyze_series, classify_curve
from event_resolver import EventResolutionError, infer_event_type, normalize_event, resolve_from_events
from market_event import curve_name, load_events_file, main, numeric_surprise, parse_curve, parse_days, parse_ecb, parse_fomc, parse_local_time, parse_regions, parse_symbols, parse_window, render_chat
from market_data import load_series, series_as_of
from research import ResearchError, load_research_file, normalize_research


class MarketEventTests(unittest.TestCase):
    def test_event_fixture_and_surprise(self):
        events = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))
        self.assertEqual(events[0]["event_family"], "FOMC")
        svb = events[-1]
        self.assertEqual(svb["event_time_local"], "11:15")
        self.assertEqual(svb["event_structure"], "developing_event")
        self.assertEqual(len(svb["event_sequence"]), 4)
        self.assertEqual(numeric_surprise("3.2", "3.0"), 0.2)
        self.assertIsNone(numeric_surprise("hold", "hold"))
        self.assertIsNone(numeric_surprise("NaN", "0"))
        self.assertEqual(curve_name("Bear Parallel"), "베어 평행이동")

    def test_fomc_parser_uses_meeting_end_date(self):
        html = "<h3>2026 FOMC Meetings</h3><div>January 27-28 Statement</div><div>March 17-18*</div>"
        events = parse_fomc(html, 2026)
        self.assertEqual([item["event_date"] for item in events], ["2026-01-28", "2026-03-18"])
        lowercase = "<h3>2026 FOMC Meetings</h3><div>january 27-28 Statement</div>"
        self.assertEqual(parse_fomc(lowercase, 2026)[0]["event_date"], "2026-01-28")

    def test_ecb_parser_uses_day_two(self):
        html = "<dt>28/10/2026</dt><dd>Governing Council of the ECB: monetary policy meeting (Day 1)</dd><dt>29/10/2026</dt><dd>Governing Council of the ECB: monetary policy meeting (Day 2), followed by press conference</dd>"
        events = parse_ecb(html, 2026)
        self.assertEqual([item["event_date"] for item in events], ["2026-10-29"])

    def test_cli_range_validators(self):
        self.assertEqual(parse_days("0"), 0)
        self.assertEqual(parse_window("5"), 5)
        self.assertEqual(parse_curve("UST2Y,UST10Y"), ("UST2Y", "UST10Y"))
        self.assertEqual(parse_regions("kr,US,KR"), ("KR", "US"))
        self.assertEqual(parse_symbols("UST2Y, UST10Y,UST2Y"), ("UST2Y", "UST10Y"))
        self.assertEqual(parse_local_time("08:30"), "08:30")
        with self.assertRaises(Exception):
            parse_days("-1")
        with self.assertRaises(Exception):
            parse_window("1")
        with self.assertRaises(Exception):
            parse_curve("UST2Y")
        self.assertEqual(parse_regions("US,JP"), ("US", "JP"))
        with self.assertRaises(Exception):
            parse_regions("US,1")
        with self.assertRaises(Exception):
            parse_symbols(" , ")
        with self.assertRaises(Exception):
            parse_local_time("08:30+09:00")

    def test_event_file_requires_source_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "events.json"
            path.write_text(json.dumps({"events": [{"region": "US", "event_family": "FOMC", "event_date": "2026-09-16"}]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "source.name"):
                load_events_file(str(path))

    def test_event_file_rejects_invalid_url_and_unpaired_time(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "events.json"
            base = {"region": "US", "event_family": "FOMC", "event_date": "2026-09-16", "source": {"name": "Fed", "url": "bad"}}
            path.write_text(json.dumps({"events": [base]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "http"):
                load_events_file(str(path))
            base["source"]["url"] = "https://example.test"
            base["event_time_local"] = "14:00"
            path.write_text(json.dumps({"events": [base]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "provided together"):
                load_events_file(str(path))
            base.pop("event_time_local")
            base["event_family"] = " "
            path.write_text(json.dumps({"events": [base]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "event_name"):
                load_events_file(str(path))

    def test_event_file_rejects_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "events.json"
            item = {"region": "US", "event_family": "FOMC", "event_date": "2026-09-16", "source": {"name": "Fed", "url": "https://example.test"}}
            path.write_text(json.dumps({"events": [item, dict(item)]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate event"):
                load_events_file(str(path))

    def test_chat_renderer_produces_research_brief_not_json(self):
        event = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))[0]
        series = load_series(str(ROOT / "tests" / "fixtures" / "market-series.json"))
        responses = []
        for item in series:
            alignment, basis, alignment_date = market_alignment_for_series(event, item)
            responses.append(analyze_series({**item, "alignment_basis": basis}, event["event_date"], alignment, (-1, 0, 1, 5), alignment_date))
        research = load_research_file(str(ROOT / "tests" / "fixtures" / "research.json"))[0]
        payload = {
            "result": "ok",
            "event": event,
            "market_response": responses,
            "curves": [{"short": "UST2Y", "long": "UST10Y", **classify_curve(6.0, 1.0)}],
            "research": research,
            "failures": [],
            "observed_at": "2026-09-24T09:00:00+09:00",
        }
        rendered = render_chat(payload)
        self.assertIn("### 1. 무슨 일이 있었나", rendered)
        self.assertIn("### 2. 시장은 왜 반응했나", rendered)
        self.assertIn("### 3. 교차자산 반응", rendered)
        self.assertIn("### 4. 전달경로", rendered)
        self.assertIn("### 5. 이벤트 스터디 — Supporting Evidence", rendered)
        self.assertIn("### 6. 과거 유사 사례", rendered)
        self.assertIn("### 7. 앞으로 볼 것", rendered)
        self.assertLess(rendered.index("### 1."), rendered.index("### 5."))
        self.assertIn("향후 정책경로 재가격", rendered)
        self.assertIn("FOMC 의사록", rendered)
        self.assertIn("다음 원천 관측일", rendered)
        self.assertIn("2026-09-17", rendered)
        self.assertIn("D-1 기준값", rendered)
        self.assertIn("2026-09-16 · 4.73%", rendered)
        self.assertIn("A · 정확 시각", rendered)
        self.assertIn("인과효과로 해석하지 않습니다", rendered)
        self.assertIn("`CONSISTENT`", rendered)
        self.assertIn("12:00 America/New_York", rendered)
        self.assertNotIn('"market_response"', rendered)

    def test_historical_catalysts_are_marked_elapsed(self):
        event = load_events_file(str(ROOT / "tests" / "fixtures" / "tariff-event.json"))[0]
        research = load_research_file(str(ROOT / "tests" / "fixtures" / "tariff-research.json"))[0]
        rendered = render_chat({
            "result": "ok",
            "event": event,
            "market_response": [],
            "curves": [],
            "research": research,
            "failures": [],
            "observed_at": "2025-04-11T17:00:00-04:00",
        })
        self.assertIn("### 7. 사건 당시 후속 촉매 — 모두 경과", rendered)
        self.assertIn("**경과 · 2025-04-04 · 미국 3월 고용보고서**", rendered)

    def test_asof_cutoff_removes_future_daily_and_intraday_observations(self):
        source = {
            "symbol": "SPX", "observation_timezone": "America/New_York", "observation_time": "16:00",
            "observations": [{"date": "2023-08-01", "value": 100}, {"date": "2023-08-02", "value": 95}],
            "intraday_observations": [
                {"timestamp": "2023-08-02T12:00:00-04:00", "value": 98},
                {"timestamp": "2023-08-02T16:00:00-04:00", "value": 95},
            ],
        }
        before_close = series_as_of(source, "2023-08-02T13:00:00-04:00")
        self.assertEqual([row["date"] for row in before_close["observations"]], ["2023-08-01"])
        self.assertEqual(len(before_close["intraday_observations"]), 1)
        after_close = series_as_of(source, "2023-08-02T17:00:00-04:00")
        self.assertEqual(len(after_close["observations"]), 2)

    def test_date_only_same_day_price_waits_for_confirmed_clock(self):
        source = {"symbol": "VIX", "market_timezone": "America/New_York", "observation_time": None,
                  "observations": [{"date": "2023-08-01", "value": 14}, {"date": "2023-08-02", "value": 16}]}
        result = series_as_of(source, "2023-08-02T23:00:00-04:00")
        self.assertEqual([row["date"] for row in result["observations"]], ["2023-08-01"])

    def test_research_asof_is_validated(self):
        raw = json.loads((ROOT / "tests" / "fixtures" / "tariff-research.json").read_text(encoding="utf-8"))["research"][0]
        raw["observed_at"] = "2025-04-11T17:00:00-04:00"
        self.assertEqual(normalize_research(raw)["observed_at"], raw["observed_at"])
        raw["observed_at"] = "2025-04-11"
        with self.assertRaisesRegex(ResearchError, "timezone"):
            normalize_research(raw)

    def test_cli_does_not_report_prices_after_analysis_cutoff(self):
        output = StringIO()
        args = [
            "analyze", "--query", "미국 상호관세 발표",
            "--event-file", str(ROOT / "tests" / "fixtures" / "tariff-event.json"),
            "--series-file", str(ROOT / "tests" / "fixtures" / "tariff-market-series.json"),
            "--study-only", "--observed-at", "2025-04-03T12:00:00-04:00", "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        by_symbol = {item["symbol"]: item for item in payload["market_response"]}
        self.assertIsNone(by_symbol["SP500"]["window"].get("d0", {}).get("date"))
        self.assertEqual(by_symbol["DEXKOUS"]["window"]["d0"]["date"], "2025-04-03")
        self.assertIsNone(by_symbol["VIXCLS"]["window"].get("d0", {}).get("date"))

    def test_fx_daily_output_keeps_four_decimal_precision(self):
        from market_event import observation_value
        response = {"asset_class": "fx", "unit": "usd", "window": {"d0": {"value": 1.0939}}}
        self.assertEqual(observation_value(response, "d0"), "$1.0939")

    def test_exact_event_cannot_precede_analysis_cutoff(self):
        output = StringIO()
        args = [
            "analyze", "--query", "피치 미국 신용등급 강등",
            "--event-file", str(ROOT / "tests" / "fixtures" / "fitch-event.json"),
            "--series-file", str(ROOT / "tests" / "fixtures" / "fitch-market-series.json"),
            "--study-only", "--observed-at", "2023-08-01T16:00:00-04:00", "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        self.assertEqual(payload["result"], "input_failure")
        self.assertIn("timestamp is after", payload["message"])

    def test_same_day_catalyst_uses_verified_release_time(self):
        event = load_events_file(str(ROOT / "tests" / "fixtures" / "fitch-event.json"))[0]
        research = load_research_file(str(ROOT / "tests" / "fixtures" / "fitch-research.json"))[0]
        rendered = render_chat({
            "result": "ok", "event": event, "market_response": [], "curves": [],
            "research": research, "failures": [], "observed_at": "2023-08-10T17:00:00-04:00",
        })
        self.assertIn("경과 · 2023-08-10 08:30 America/New_York · 미국 7월 CPI", rendered)
        self.assertIn("예정 · 2023-08-16 14:00 America/New_York · 7월 FOMC 회의록", rendered)

    def test_missing_research_is_explicitly_downgraded(self):
        event = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))[0]
        rendered = render_chat({"result": "partial_failure", "event": event, "market_response": [], "curves": [], "failures": [], "research": None})
        self.assertIn("이벤트 스터디만 제공", rendered)
        self.assertIn("완성된 이벤트 리서치가 아닙니다", rendered)
        self.assertIn("### 6. 과거 유사 사례", rendered)
        self.assertIn("### 7. 앞으로 볼 것", rendered)
        self.assertNotIn("research_context_missing", rendered)

    def test_generic_missing_research_copy_is_not_fomc_specific(self):
        event = {
            "event_name": "SVB 파산", "event_date": "2023-03-10", "event_type": "financial_stress",
            "source": {"name": "fixture", "url": "https://example.test/svb"},
        }
        rendered = render_chat({"result": "partial_failure", "event": event, "market_response": [], "curves": [], "failures": [], "research": None})
        self.assertIn("사건을 설명할 직접 발표자료", rendered)
        self.assertNotIn("SEP", rendered)
        self.assertNotIn("기자회견", rendered)

    def test_research_claims_require_sources(self):
        research = load_research_file(str(ROOT / "tests" / "fixtures" / "research.json"))[0]
        self.assertEqual(research["overview"]["classification"], "동결보다 향후 정책경로 재가격이 중심인 이벤트")
        broken = json.loads((ROOT / "tests" / "fixtures" / "research.json").read_text(encoding="utf-8"))["research"][0]
        broken["what_changed"][0]["source"] = {}
        with self.assertRaisesRegex(ResearchError, "source.name"):
            normalize_research(broken)

    def test_full_research_requires_transmission_and_multiple_catalysts(self):
        raw = json.loads((ROOT / "tests" / "fixtures" / "research.json").read_text(encoding="utf-8"))["research"][0]
        raw["transmission"] = []
        with self.assertRaisesRegex(ResearchError, "transmission"):
            normalize_research(raw)
        raw = json.loads((ROOT / "tests" / "fixtures" / "research.json").read_text(encoding="utf-8"))["research"][0]
        raw["catalysts"] = raw["catalysts"][:1]
        with self.assertRaisesRegex(ResearchError, "at least two"):
            normalize_research(raw)

    def test_research_rejects_bad_chronology_duplicates_and_self_loops(self):
        fixture = json.loads((ROOT / "tests" / "fixtures" / "research.json").read_text(encoding="utf-8"))["research"][0]
        raw = json.loads(json.dumps(fixture))
        raw["catalysts"][0]["date"] = raw["event_date"]
        with self.assertRaisesRegex(ResearchError, "after"):
            normalize_research(raw)
        raw = json.loads(json.dumps(fixture))
        raw["catalysts"][1] = dict(raw["catalysts"][0])
        with self.assertRaisesRegex(ResearchError, "duplicate catalysts"):
            normalize_research(raw)
        raw = json.loads(json.dumps(fixture))
        raw["transmission"][0]["to"] = raw["transmission"][0]["from"]
        with self.assertRaisesRegex(ResearchError, "must differ"):
            normalize_research(raw)
        raw = json.loads(json.dumps(fixture))
        raw["historical_context"]["comparisons"][0]["date"] = raw["event_date"]
        with self.assertRaisesRegex(ResearchError, "before"):
            normalize_research(raw)
        raw = json.loads(json.dumps(fixture))
        raw["decision"]["expected"] = "true"
        with self.assertRaisesRegex(ResearchError, "true, false, or null"):
            normalize_research(raw)

    def test_historical_include_rejects_string_false(self):
        raw = json.loads((ROOT / "tests" / "fixtures" / "research.json").read_text(encoding="utf-8"))["research"][0]
        raw["historical_context"] = {"include": "false", "comparisons": []}
        with self.assertRaisesRegex(ResearchError, "must be true or false"):
            normalize_research(raw)

    def test_historical_analogues_rank_attributes_and_observed_shock_pattern(self):
        raw = json.loads((ROOT / "tests" / "fixtures" / "research.json").read_text(encoding="utf-8"))["research"][0]
        raw["historical_context"] = {"include": False, "comparisons": []}
        raw["event_features"] = {
            "shock_mechanisms": ["policy_path_repricing", "inflation_surprise"],
            "affected_channels": ["short_rates", "fx", "equity"],
            "market_shock_pattern": {"short_rates": "up", "fx": "up", "equity": "down"},
        }
        candidates = []
        for day, name in (("2023-06-14", "사례 A"), ("2024-03-20", "사례 B"), ("2025-01-29", "사례 C")):
            candidates.append({
                "date": day, "event": name, "event_type": "monetary_policy",
                "shock_mechanisms": ["policy_path_repricing", "inflation_surprise"],
                "affected_channels": ["short_rates", "fx"],
                "market_shock_pattern": {"short_rates": "up", "fx": "up", "equity": "down"},
                "similarity": "단기금리·달러 동반 상승", "difference": "충격의 배경은 달랐다.",
                "source": {"name": "검증 자료", "url": f"https://example.test/{day}"},
            })
        candidates.append({
            "date": "2025-02-01", "event": "방향이 다른 후보", "event_type": "monetary_policy",
            "shock_mechanisms": ["policy_path_repricing"], "affected_channels": ["short_rates"],
            "market_shock_pattern": {"short_rates": "down", "fx": "down"},
            "similarity": "가격방향 불일치", "difference": "핵심 시장 충격 방향이 반대다.",
            "source": {"name": "검증 자료", "url": "https://example.test/low-match"},
        })
        raw["historical_analogue_pool"] = candidates
        result = normalize_research(raw)
        history = result["historical_context"]
        self.assertTrue(history["include"])
        self.assertEqual(len(history["comparisons"]), 3)
        self.assertNotIn("방향이 다른 후보", {item["event"] for item in history["comparisons"]})
        self.assertIn("시장충격 방향 일치율", history["comparisons"][0]["matching_basis"])

    def test_event_structure_and_sequence_require_verified_chronology(self):
        base = {
            "event_name": "SVB failure", "event_type": "financial_stress", "region": "US",
            "event_date": "2023-03-10", "event_time_local": "11:15", "event_timezone": "America/New_York",
            "source": {"name": "regulator", "url": "https://example.test/event"},
        }
        base["event_structure"] = "developing_event"
        base["event_sequence"] = [
            {"date": "2023-03-09", "event": "자금조달 이슈 공개", "stage": "prelude", "source": {"name": "News", "url": "https://example.test/prelude"}},
            {"date": "2023-03-10", "time_local": "11:15", "timezone": "America/New_York", "event": "규제당국의 폐쇄", "stage": "trigger", "source": {"name": "FDIC", "url": "https://example.test/closure"}},
            {"date": "2023-03-12", "event": "예금자 보호 조치", "stage": "response", "source": {"name": "Fed", "url": "https://example.test/response"}},
        ]
        event = normalize_event(base)
        self.assertEqual(event["event_structure"], "developing_event")
        self.assertEqual(event["event_timestamp_quality"], "exact_timestamp")
        self.assertEqual(len(event["event_sequence"]), 3)
        broken = dict(base, event_sequence=list(reversed(base["event_sequence"])))
        with self.assertRaisesRegex(EventResolutionError, "chronological"):
            normalize_event(broken)
        broken = dict(base, event_sequence=base["event_sequence"][:1])
        with self.assertRaisesRegex(EventResolutionError, "at least two"):
            normalize_event(broken)

    def test_intraday_chat_discloses_last_bar_when_close_not_confirmed(self):
        event = {
            "event_name": "SVB failure", "event_date": "2023-03-10", "event_time_local": "11:15",
            "event_timezone": "America/New_York", "event_timestamp_quality": "exact_timestamp",
            "event_structure": "developing_event", "source": {"name": "FDIC", "url": "https://example.test/event"},
        }
        market = {"symbol": "SPX", "unit": "index", "alignment_basis": "source_observation_time", "observation_provenance": {"observation_timezone": "America/New_York", "observation_time": "16:00"}, "window": {}}
        text = render_chat({
            "result": "ok", "event": event, "market_response": [market], "intraday_response": [{
                "symbol": "SPX", "status": "ok", "pre_event": {"timestamp": "2023-03-10T11:00:00-05:00", "value": 100},
                "plus_1h": {"timestamp": "2023-03-10T12:30:00-05:00", "value": 99, "change_from_pre_event": -1, "change_unit": "pct"},
                "session_end": {"timestamp": "2023-03-10T15:55:00-05:00", "value": 98, "change_from_pre_event": -2, "change_unit": "pct"},
                "session_end_label": "last_supplied_bar_not_confirmed_close", "warnings": ["intraday_session_close_unconfirmed"],
            }], "curves": [], "failures": [], "research": None,
        })
        self.assertIn("+1h 이후 2023-03-10T12:30:00-05:00", text)
        self.assertIn("공식 종가 미확인", text)
        self.assertIn("후속 충격·정책대응", text)

    def test_free_form_resolver_handles_unregistered_event(self):
        events = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))
        resolved = resolve_from_events("SVB 사태 분석", events)
        self.assertEqual(resolved["result"], "ok")
        self.assertEqual(resolved["event"]["event_type"], "financial_stress")
        self.assertEqual(infer_event_type("중동 군사충돌과 유가")[0], "geopolitics")

    def test_korean_event_name_gets_a_stable_identifier(self):
        from event_resolver import normalize_event
        raw = {
            "event_name": "중동 군사충돌",
            "region": "글로벌",
            "event_date": "2024-01-01",
            "source": {"name": "fixture", "url": "https://example.test/event"},
        }
        first = normalize_event(raw)["event_id"]
        second = normalize_event(raw)["event_id"]
        self.assertTrue(first.startswith("event-"))
        self.assertEqual(first, second)

    def test_vague_single_word_does_not_resolve(self):
        events = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))
        result = resolve_from_events("decision", events)
        self.assertIn(result["result"], {"verification_required", "ambiguous"})

    def test_fomc_query_with_multiple_dates_is_ambiguous(self):
        events = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))
        result = resolve_from_events("FOMC", events)
        self.assertEqual(result["result"], "ambiguous")

    def test_unknown_query_requires_verification_instead_of_inventing_date(self):
        events = load_events_file(str(ROOT / "tests" / "fixtures" / "events.json"))
        resolved = resolve_from_events("알 수 없는 신규 사건", events)
        self.assertEqual(resolved["result"], "verification_required")
        self.assertNotIn("event", resolved)

    def test_svb_generic_engine_selects_transmission_assets_without_adapter(self):
        output = StringIO()
        args = [
            "analyze", "--query", "SVB 파산",
            "--series-file", str(ROOT / "tests" / "fixtures" / "market-series.json"),
            "--event-file", str(ROOT / "tests" / "fixtures" / "events.json"),
            "--research-file", str(ROOT / "tests" / "fixtures" / "research.json"),
            "--observed-at", "2023-03-20T09:00:00+09:00", "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        self.assertIsNone(payload["adapter"])
        symbols = {item["symbol"] for item in payload["market_response"]}
        self.assertTrue({"UST2Y", "KRE", "CDX_IG", "VIX"}.issubset(symbols))
        self.assertEqual(payload["event"]["event_type"], "financial_stress")
        self.assertEqual(payload["event"]["event_structure"], "developing_event")
        self.assertFalse(payload["analysis_contract"]["daily_d0_is_causal_effect"])
        self.assertEqual(
            payload["analysis_contract"]["cross_market_alignment"],
            "source_observation_time_then_market_close_proxy_then_region_market_close_proxy_then_region_calendar_proxy",
        )
        fx_failure = next(item for item in payload["failures"] if item.get("symbol") == "USDKRW")
        self.assertEqual(fx_failure["code"], "series_starts_after_event")

    def test_user_selected_series_starting_after_event_is_not_mislabeled_d0(self):
        output = StringIO()
        args = [
            "analyze", "--query", "SVB 파산",
            "--series-file", str(ROOT / "tests" / "fixtures" / "market-series.json"),
            "--event-file", str(ROOT / "tests" / "fixtures" / "events.json"),
            "--symbols", "DXY", "--study-only", "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        self.assertEqual(payload["market_response"], [])
        self.assertTrue(any(failure.get("code") == "series_starts_after_event" for failure in payload["failures"]))

    def test_automatic_selection_prefers_complete_event_window_over_pre_event_only(self):
        event = {
            "event_id": "test-cpi-2022", "event_name": "Test CPI", "event_type": "inflation",
            "region": "US", "event_date": "2022-11-10", "event_time_local": "08:30",
            "event_timezone": "America/New_York",
            "source": {"name": "BLS", "url": "https://example.test/event"},
        }
        base = {
            "region": "US", "market_timezone": "America/New_York",
            "selection_priority": 0, "source": {"name": "fixture", "url": "https://example.test/series"},
        }
        market = {"series": [
            {**base, "symbol": "PRE_ONLY", "asset_class": "rates", "unit": "pct",
             "roles": ["short_rates"], "observations": [{"date": "2022-11-09", "value": 4.0}]},
            {**base, "symbol": "VIX", "asset_class": "volatility", "unit": "index",
             "roles": ["volatility"], "observations": [
                 {"date": "2022-11-09", "value": 25.0}, {"date": "2022-11-10", "value": 22.0}
             ]},
        ]}
        with tempfile.TemporaryDirectory() as temp:
            event_path = Path(temp) / "event.json"
            market_path = Path(temp) / "series.json"
            event_path.write_text(json.dumps({"events": [event]}), encoding="utf-8")
            market_path.write_text(json.dumps(market), encoding="utf-8")
            output = StringIO()
            with self.assertRaises(SystemExit), redirect_stdout(output):
                main(["analyze", "--query", "Test CPI", "--event-file", str(event_path),
                      "--series-file", str(market_path), "--study-only", "--max-assets", "1",
                      "--observed-at", "2022-11-11T17:00:00-05:00", "--format", "json"])
            payload = json.loads(output.getvalue())
            self.assertEqual([item["symbol"] for item in payload["market_response"]], ["VIX"])

    def test_fomc_remains_an_optional_adapter(self):
        output = StringIO()
        args = [
            "analyze", "--query", "2026년 9월 FOMC",
            "--series-file", str(ROOT / "tests" / "fixtures" / "market-series.json"),
            "--event-file", str(ROOT / "tests" / "fixtures" / "events.json"),
            "--research-file", str(ROOT / "tests" / "fixtures" / "research.json"),
            "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        self.assertEqual(payload["adapter"]["key"], "FOMC")
        symbols = {item["symbol"] for item in payload["market_response"]}
        self.assertNotIn("KRE", symbols)
        self.assertNotIn("CDX_IG", symbols)

    def test_requested_missing_symbol_is_reported(self):
        output = StringIO()
        args = [
            "analyze", "--region", "US", "--event", "FOMC", "--date", "2026-09-16",
            "--series-file", str(ROOT / "tests" / "fixtures" / "market-series.json"),
            "--event-file", str(ROOT / "tests" / "fixtures" / "events.json"),
            "--symbols", "NOT_REAL", "--study-only", "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        self.assertEqual(payload["result"], "partial_failure")
        self.assertIn({"symbol": "NOT_REAL", "code": "series_missing"}, payload["failures"])

    def test_direct_event_time_requires_timezone(self):
        output = StringIO()
        args = [
            "analyze", "--region", "US", "--event", "FOMC", "--date", "2026-09-16",
            "--series-file", str(ROOT / "tests" / "fixtures" / "market-series.json"),
            "--event-time-local", "14:00", "--study-only", "--format", "json",
        ]
        with self.assertRaises(SystemExit), redirect_stdout(output):
            main(args)
        payload = json.loads(output.getvalue())
        self.assertEqual(payload["result"], "input_failure")
        self.assertIn("provided together", payload["message"])

    def test_threshold_chat_uses_event_value_and_source(self):
        rendered = render_chat({
            "result": "ok",
            "trigger": "UST2Y",
            "trigger_source": {"name": "Treasury", "url": "https://example.test/ust2y"},
            "events": [{"date": "2026-09-16", "metric": "bp_change", "value": 6.0, "threshold": 6.0, "responses": []}],
            "observed_at": "2026-09-24T09:00:00+09:00",
        })
        self.assertIn("+6.00bp", rendered)
        self.assertIn("[Treasury](https://example.test/ust2y)", rendered)
        self.assertNotIn("미확인", rendered)

    def test_threshold_chat_explains_missing_anchor(self):
        response = {"symbol": "KOSPI", "warnings": ["missing_d-1", "changes_unavailable_without_d_minus_1"], "window": {}}
        rendered = render_chat({
            "result": "ok", "trigger": "UST2Y",
            "trigger_source": {"name": "Treasury", "url": "https://example.test/ust2y"},
            "events": [{"date": "2026-09-15", "metric": "bp_change", "value": 7.0, "threshold": 6.0, "responses": [response]}],
        })
        self.assertIn("D-1 기준 관측이 없어 변화율 계산 불가", rendered)

    def test_d_minus_one_missing_warning_is_not_misreported_as_midseries_gap(self):
        response = {
            "symbol": "NEW_ASSET", "warnings": ["missing_d-1", "changes_unavailable_without_d_minus_1"],
            "window": {}, "latest_observation_date": "2024-01-01",
        }
        event = {
            "event_name": "테스트 사건", "event_date": "2024-01-02",
            "source": {"name": "fixture", "url": "https://example.test/event"},
        }
        rendered = render_chat({"result": "partial_failure", "event": event, "market_response": [response], "research": None, "failures": []})
        self.assertIn("D-1 기준 관측이 없어 이벤트 변화량을 계산하지 못했습니다", rendered)
        self.assertNotIn("UNAVAILABLE_WITHOUT_D_MINUS_1", rendered)


if __name__ == "__main__":
    unittest.main()
