#!/usr/bin/env python3
"""Generic, reproducible market event research and event-study CLI."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, time as dt_time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from adapters import adapter_for_event
from asset_selector import select_assets
from calendars import MARKET_CLOSES, market_alignment_for_series, valid_timezone, zone_for_date
from event_resolver import EventResolutionError, infer_event_type, normalize_event, resolve_from_events
from event_study import analyze_intraday_reaction, analyze_series, classify_curve, threshold_events
from market_data import SeriesError, load_series, series_as_of
from research import ResearchError, load_research_file, select_research

SOURCES = {
    ("US", "FOMC"): ("Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "America/New_York"),
    ("EU", "ECB"): ("European Central Bank", "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", "Europe/Frankfurt"),
    ("KR", "BOK_MPC"): ("Bank of Korea", "https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643", "Asia/Seoul"),
}
MONTHS = {name: index for index, name in enumerate(("", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")) if name}
OUTPUT_FORMAT = "chat"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        payload = {"schema_version": "1.0", "result": "input_failure", "message": message}
        if "--format" in sys.argv and "json" in sys.argv:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"분석 조건을 확인해 주세요.\n\n- {message}")
        raise SystemExit(2)


def show(value: Any) -> str:
    return "미확인" if value is None or value == "" else str(value)


def event_value(value: Any) -> str:
    mapping = {"hold": "동결", "hike": "인상", "cut": "인하"}
    return mapping.get(str(value).casefold(), show(value))


def curve_name(value: Any) -> str:
    return {
        "Bear Flattening": "베어 플래트닝",
        "Bear Steepening": "베어 스티프닝",
        "Bull Flattening": "불 플래트닝",
        "Bull Steepening": "불 스티프닝",
        "Bear Parallel": "베어 평행이동",
        "Bull Parallel": "불 평행이동",
        "Mixed": "혼조",
    }.get(str(value), show(value))


def friendly_timestamp(value: Any) -> str:
    if not value:
        return "미확인"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        return str(value)


def signed(value: Any, unit: str) -> str:
    if value is None:
        return "미확인"
    return f"{float(value):+.2f}{unit}"


def window_change(response: dict[str, Any], key: str) -> str:
    point = response.get("window", {}).get(key, {})
    unit = point.get("change_unit")
    suffix = "bp" if unit == "bp" else "%"
    return signed(point.get("change_from_d_minus_1"), suffix)


def observation_value(response: dict[str, Any], key: str) -> str:
    point = response.get("window", {}).get(key, {})
    value = point.get("value")
    if value is None:
        return "미확인"
    unit = str(response.get("unit") or "").casefold()
    if unit == "pct":
        return f"{float(value):,.2f}%"
    if unit in {"usd", "us_dollar", "dollar"}:
        precision = 4 if response.get("asset_class") == "fx" else 2
        return f"${float(value):,.{precision}f}"
    if unit == "krw_per_usd":
        return f"{float(value):,.2f}원/USD"
    if unit in {"index", "idx", "points", "point"}:
        return f"{float(value):,.2f}pt"
    return f"{float(value):,.4f} {unit}".strip()


def window_observation(response: dict[str, Any], key: str) -> str:
    point = response.get("window", {}).get(key, {})
    observed_date = point.get("date")
    if not observed_date:
        return "미확인"
    if key == "d-1":
        return f"{observed_date} · {observation_value(response, key)}"
    return f"{observed_date} · {observation_value(response, key)} ({window_change(response, key)})"


def source_time_label(response: dict[str, Any]) -> str:
    provenance = response.get("observation_provenance") or {}
    timezone_name = provenance.get("observation_timezone")
    observation_time = provenance.get("observation_time")
    market_timezone = provenance.get("market_timezone")
    price_type = provenance.get("price_type")
    if not timezone_name or not observation_time:
        basis = response.get("alignment_basis")
        return "관측 시각 미제공 · 시장 마감시각 대리정렬" if basis in {"market_close_proxy", "region_market_close_proxy"} else "관측 시각 미제공 · 지역 거래일 기준 대리정렬"
    label = f"{observation_time} {timezone_name}"
    if market_timezone and market_timezone != timezone_name:
        label += f" · 시장 {market_timezone}"
    if price_type:
        label += f" · {price_type}"
    return label.replace("|", "\\|")


def alignment_label(response: dict[str, Any]) -> str:
    mode = response.get("alignment")
    basis = response.get("alignment_basis")
    provenance = response.get("observation_provenance") or {}
    if basis == "source_observation_time":
        prefix = "다음 원천 관측일 · " if mode == "next_strict" else "원천 관측시각 기준 · "
        return f"{prefix}{provenance.get('observation_time')} {provenance.get('observation_timezone')}"
    if basis == "market_close_proxy":
        prefix = "다음 거래일 · " if mode == "next_strict" else "사건 당일 시장 · "
        return prefix + "시장 마감시각 추정"
    if basis == "region_market_close_proxy":
        return "다음 거래일 · 지역 시장 마감시각 추정" if mode == "next_strict" else "지역 시장 마감시각 추정"
    if basis == "region_calendar_proxy":
        if mode == "next_strict":
            return "다음 거래일(교차시장) · 지역 달력 대리정렬"
        return "지역 거래일 기준 대리정렬(원천 시각 미확인)"
    return f"사용자 지정 · {show(mode)}"


def event_time_summary(event: dict[str, Any], responses: list[dict[str, Any]], intraday_responses: list[dict[str, Any]]) -> list[str]:
    quality = event.get("event_timestamp_quality") or ("exact_timestamp" if event.get("event_time_local") else "date_only")
    quality_label = "A · 정확 시각" if quality == "exact_timestamp" else "B · 날짜만 확인"
    structure = event.get("event_structure", "point_event")
    structure_label = {
        "point_event": "단일 시점 사건",
        "scheduled_event": "예정된 이벤트",
        "developing_event": "C · 다일 진행 사건",
    }.get(structure, structure)
    timestamp = event.get("event_time_local")
    zone = event.get("event_timezone")
    when = f"{event.get('event_date')} {timestamp} {zone}" if timestamp and zone else f"{event.get('event_date')} (시각 미확인)"
    lines = ["**사건 시점과 D0 해석**", f"- 기준 사건: {when} · 시간 정밀도 {quality_label} · 구조 {structure_label}"]
    has_intraday = any(item.get("status") == "ok" for item in intraday_responses)
    if has_intraday:
        lines.append("- 장중 자료가 있는 시계열은 이벤트 직전·+1시간·첫 후속 세션의 마지막 제공 바를 별도로 표시합니다. 장중 바가 공식 종가인지 확인되지 않으면 종가로 부르지 않습니다.")
    else:
        lines.append("- 일별 자료만으로 계산한 D0는 기준 관측값부터 첫 적격 이벤트일 관측값까지의 일별 변동입니다. 사건 이후 구간만 분리하지 못하므로 인과효과로 해석하지 않습니다.")
    if structure == "developing_event":
        lines.append("- 다일 진행 사건의 D+1/D+5에는 타임라인의 후속 충격·정책대응이 포함될 수 있으며 최초 사건 하나의 효과로 귀속하지 않습니다.")
    if event.get("event_structure_inferred"):
        lines.append("- 진행 형태는 입력에서 명시되지 않아 기본값으로 추정했습니다. 비정형·다일 사건이면 사건 파일에서 확인해 수정해야 합니다.")
    sequence = event.get("event_sequence") or []
    if sequence:
        lines.append("- 사건 타임라인:")
        for step in sequence:
            step_when = step["date"]
            if step.get("time_local"):
                step_when += f" {step['time_local']} {step['timezone']}"
            source = step["source"]
            lines.append(f"  - {step_when} · {step['event']} ([{source['name']}]({source['url']}))")
    missing_time = [item["symbol"] for item in responses if item.get("alignment_basis") in {"region_calendar_proxy", "region_market_close_proxy", "market_close_proxy"}]
    if missing_time:
        lines.append(f"- 원천의 관측 시각·시간대가 없어 지역 시장 마감시각 또는 거래일 달력으로 대리 정렬한 시계열: {', '.join(missing_time)}. 일별 시점이 다를 수 있습니다.")
    return lines


def intraday_value_text(response: dict[str, Any], point: dict[str, Any] | None) -> str:
    if not point:
        return "미확인"
    unit = str(response.get("unit") or "").casefold()
    value = float(point["value"])
    if unit == "pct":
        return f"{value:,.2f}%"
    if unit in {"usd", "us_dollar", "dollar"}:
        precision = 4 if response.get("asset_class") == "fx" else 2
        return f"${value:,.{precision}f}"
    if unit == "krw_per_usd":
        return f"{value:,.2f}원/USD"
    if unit in {"index", "idx", "points", "point"}:
        return f"{value:,.2f}pt"
    return f"{value:,.4f} {unit}".strip()


def intraday_change_text(point: dict[str, Any] | None) -> str:
    if not point or point.get("change_from_pre_event") is None:
        return "변화 미확인"
    suffix = "bp" if point.get("change_unit") == "bp" else "%"
    return signed(point["change_from_pre_event"], suffix)


def render_events(payload: dict[str, Any]) -> str:
    events = payload.get("events", [])
    if not events:
        return "조건에 맞는 공식 일정을 확인하지 못했습니다.\n\n조회 실패 항목은 원천별로 다시 확인해야 합니다."
    lines = ["## 확인된 공식 일정", "", "| 날짜 | 지역 | 이벤트 | 현지 시각 |", "| --- | --- | --- | --- |"]
    for item in events:
        lines.append(f"| {item['event_date']} | {item['region']} | {show(item.get('event_name') or item.get('event_family'))} | {show(item.get('event_time_local'))} |")
    lines.extend(["", f"확인 시각: {friendly_timestamp(payload.get('observed_at'))}"])
    return "\n".join(lines)


def render_analysis(payload: dict[str, Any]) -> str:
    event = payload.get("event", {})
    responses = payload.get("market_response", [])
    intraday_responses = payload.get("intraday_response", [])
    curves = payload.get("curves", [])
    research = payload.get("research")
    adapter = payload.get("adapter")
    selection = payload.get("asset_selection", [])
    title_suffix = "" if research else " — 이벤트 스터디만 제공"
    lines = [f"## {show(event.get('event_name') or event.get('event_family'))} 시장 영향 분석 — {show(event.get('event_date'))}{title_suffix}", ""]

    lines.extend(["### 1. 무슨 일이 있었나", ""])
    if research:
        overview = research["overview"]
        lines.append(overview["summary"])
        lines.append("")
        lines.append(overview["surprise_assessment"])
        lines.append("")
        lines.append(f"이번 이벤트의 성격은 **{overview['classification']}**입니다.")
        lines.extend(["", "핵심 변화:"])
        for claim in research["what_changed"]:
            lines.append(
                f"- **{claim['channel']}**: {claim['finding']} {claim['significance']} "
                f"([{claim['source']['name']}]({claim['source']['url']}))"
            )
        if adapter:
            lines.extend(["", f"**{adapter['label']} 어댑터 확인 항목**: {', '.join(adapter['channels'])}"])
            for claim in research.get("adapter_details", []):
                lines.append(
                    f"- **{claim['channel']}**: {claim['finding']} {claim['significance']} "
                    f"([{claim['source']['name']}]({claim['source']['url']}))"
                )
    else:
        lines.append("사건을 설명할 직접 발표자료와 시장 맥락 자료가 없어 사건의 배경·변화·서프라이즈를 검증하지 못했습니다.")
        lines.append("아래 가격 계산만으로는 완성된 이벤트 리서치가 아닙니다.")
    lines.extend([""] + event_time_summary(event, responses, intraday_responses))

    lines.extend(["", "### 2. 시장은 왜 반응했나", ""])
    if research:
        for claim in research["market_interpretation"]:
            lines.append(
                f"- **{claim['channel']}**: {claim['finding']} {claim['significance']} "
                f"([{claim['source']['name']}]({claim['source']['url']}))"
            )
    else:
        lines.append("공식발표와 당일 시장 해석을 연결할 근거가 없어 인과관계를 판단하지 않았습니다.")

    lines.extend(["", "### 3. 교차자산 반응", ""])
    if selection:
        lines.append("분석 대상으로 선택한 자산:")
        for item in selection:
            roles = ", ".join(item.get("matched_roles", []))
            lines.append(f"- {item['symbol']}: {item['reason']}" + (f" ({roles})" if roles else ""))
        lines.append("")
    groups = {
        "금리": {"rates", "policy", "spread"}, "신용": {"credit"}, "외환": {"fx"}, "주식": {"equity"},
        "원자재": {"commodity"}, "변동성": {"volatility"}, "기타": {"price"},
    }
    for group_name, classes in groups.items():
        items = [item for item in responses if item.get("asset_class") in classes]
        if not items:
            continue
        lines.append(f"**{group_name}**")
        for item in items:
            lines.append(f"- {item['symbol']}: D0 {window_change(item, 'd0')}, D+1 {window_change(item, 'd+1')} · {alignment_label(item)}")
        lines.append("")
    if curves:
        curve = curves[0]
        lines.append(
            f"금리곡선은 **{curve_name(curve['classification'])}**입니다. "
            f"{curve['short']}/{curve['long']} 스프레드는 {signed(curve.get('spread_change_bp'), 'bp')} 변했습니다."
        )

    lines.extend(["", "### 4. 전달경로", ""])
    if research and research["transmission"]:
        status_names = {
            "CONFIRMED": "확인됨", "CONSISTENT": "가격과 일관", "MIXED": "반응 혼재/제한",
            "CONTRADICTED": "전형적 경로와 반대", "UNVERIFIED": "미검증",
        }
        for step in research["transmission"]:
            lines.append(
                f"- **{step['from']} → {step['to']}** · `{step['status']}` ({status_names[step['status']]}): {step['evidence']} "
                f"([{step['source']['name']}]({step['source']['url']}))"
            )
    else:
        lines.append("전달경로를 판정할 검증 자료가 없습니다. 전형적인 경로를 실제 반응처럼 쓰지 않았습니다.")

    lines.extend(["", "### 5. 이벤트 스터디 — Supporting Evidence", ""])
    if intraday_responses:
        lines.extend(["**장중 반응**", ""])
        market_by_symbol = {item["symbol"]: item for item in responses}
        for item in intraday_responses:
            if item.get("status") != "ok":
                lines.append(f"- {item['symbol']}: 장중 분석 불가 — 사건의 정확 시각이 확인되지 않았습니다.")
                continue
            market = market_by_symbol.get(item["symbol"], {})
            before = item.get("pre_event")
            plus_1h = item.get("plus_1h")
            session_end = item.get("session_end")
            close_label = "거래소 마감 시각 바" if item.get("session_end_label") == "market_close" else "해당 세션 마지막 제공 바(공식 종가 미확인)"
            lines.append(
                f"- **{item['symbol']}**: 직전 {show(before.get('timestamp') if before else None)} {intraday_value_text(market, before)} → "
                f"+1h 이후 {show(plus_1h.get('timestamp') if plus_1h else None)} {intraday_value_text(market, plus_1h)} "
                f"({intraday_change_text(plus_1h)}) → {close_label} {show(session_end.get('timestamp') if session_end else None)} "
                f"{intraday_value_text(market, session_end)} ({intraday_change_text(session_end)})"
            )
            for warning in item.get("warnings", []):
                if warning == "intraday_session_close_unconfirmed":
                    lines.append(f"  - {item['symbol']}: 원천의 해당 세션 마지막 바는 거래소 공식 종가 시각과 일치하지 않습니다.")
        lines.append("")
    lines.extend([
        "일별 자료의 변화는 표에 표시한 D-1 관측값을 기준으로 계산했습니다. 각 자산의 첫 적격 관측일까지의 움직임이며, 장중 반응이나 인과효과와 동일하지 않습니다.", "",
        "| 자산 | D-1 기준값 | D0 관측값 (변화) | D+1 관측값 (변화) | D+5 관측값 (변화) | 정렬 | 관측 기준 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ])
    for item in responses:
        alignment = alignment_label(item)
        lines.append(
            f"| {item['symbol']} | {window_observation(item, 'd-1')} | {window_observation(item, 'd0')} | "
            f"{window_observation(item, 'd+1')} | {window_observation(item, 'd+5')} | {alignment} | {source_time_label(item)} |"
        )

    history = research.get("historical_context") if research else None
    lines.extend(["", "### 6. 과거 유사 사례", ""])
    if history and history.get("include"):
        lines.extend([history["reason"], ""])
        for comparison in history["comparisons"]:
            lines.append(
                f"- **{comparison['date']} · {comparison['event']}**: 매칭 근거는 {comparison['matching_basis']}입니다. 공통점은 {comparison['similarity']} 차이점은 {comparison['difference']} "
                f"([{comparison['source']['name']}]({comparison['source']['url']}))"
            )
    else:
        reason = history.get("reason") if history else None
        lines.append(reason or "검증된 후보 이벤트의 충격 특성과 시장 반응 자료가 없어 유사사례 비교를 생성하지 않았습니다. 이름만 비슷한 사건으로 비교하지 않습니다.")

    catalysts = research.get("catalysts", []) if research else []
    observed_date = None
    observed_instant = None
    try:
        observed_instant = datetime.fromisoformat(str(payload.get("observed_at")).replace("Z", "+00:00"))
        event_zone = event.get("event_timezone") or MARKET_CLOSES.get(event.get("region"), ("UTC",))[0]
        observed_date = observed_instant.astimezone(zone_for_date(event_zone, observed_instant.date())).date()
    except ValueError:
        pass
    catalyst_statuses = []
    for item in catalysts:
        item_date = date.fromisoformat(item["date"])
        if observed_date is None or item_date > observed_date:
            status = "예정"
        elif item_date < observed_date:
            status = "경과"
        elif item.get("time_local") and item.get("timezone") and observed_instant:
            item_instant = datetime.combine(item_date, dt_time.fromisoformat(item["time_local"]),
                                            zone_for_date(item["timezone"], item_date))
            status = "경과" if item_instant <= observed_instant else "예정"
        else:
            status = "당일·시각 미확인"
        catalyst_statuses.append(status)
    if catalysts and all(status == "경과" for status in catalyst_statuses):
        catalyst_heading = "### 7. 사건 당시 후속 촉매 — 모두 경과"
    elif any(status != "예정" for status in catalyst_statuses):
        catalyst_heading = "### 7. 후속 촉매"
    else:
        catalyst_heading = "### 7. 앞으로 볼 것"
    lines.extend(["", catalyst_heading, ""])
    if catalysts and all(status == "경과" for status in catalyst_statuses):
        lines.append(f"아래는 확인 시점({observed_date.isoformat()}) 기준으로 이미 지난 일정이며, 사건 당시 감시 대상의 시간순 기록입니다.")
        lines.append("")
    if catalysts:
        for index, catalyst in enumerate(catalysts):
            status = catalyst_statuses[index]
            when = f"{catalyst['date']} {catalyst['time_local']} {catalyst['timezone']}" if catalyst.get("time_local") else catalyst["date"]
            lines.append(
                f"- **{status} · {when} · {catalyst['event']}**: {catalyst['why_it_matters']} "
                f"([{catalyst['source']['name']}]({catalyst['source']['url']}))"
            )
    else:
        next_events = payload.get("next_events", [])
        if next_events:
            for next_event in next_events:
                lines.append(f"- {next_event['event_date']} · {next_event['event_family']} · {show(next_event.get('event_time_local'))} {show(next_event.get('event_timezone'))}")
        else:
            lines.append("현재 해석을 확인하거나 뒤집을 후속 공식 일정을 확보하지 못했습니다.")

    warnings = [(item["symbol"], warning) for item in responses for warning in item.get("warnings", [])]
    if warnings or payload.get("failures") or not research:
        lines.extend(["", "### 데이터 확인 사항", ""])
        if not research:
            lines.append("- Research layer 미확보: `--research-file`로 검증된 공식발표·시장해석·촉매 자료를 제공해야 합니다.")
        response_by_symbol = {item["symbol"]: item for item in responses}
        for symbol, warning in warnings:
            if warning == "changes_unavailable_without_d_minus_1":
                continue
            if warning == "observation_time_basis_missing":
                basis = response_by_symbol.get(symbol, {}).get("alignment_basis")
                proxy = "시장 마감시각" if basis in {"market_close_proxy", "region_market_close_proxy"} else "지역 거래일 달력"
                lines.append(f"- {symbol}: 원천 관측 시각·시간대가 없어 {proxy}으로 대리 정렬했습니다. 자산 간 장중 기준시각 비교에는 한계가 있습니다.")
                continue
            if warning.startswith("pending_"):
                latest = response_by_symbol.get(symbol, {}).get("latest_observation_date")
                window_name = warning.removeprefix("pending_").upper()
                lines.append(f"- {symbol}: 확인 시각까지 {window_name} 확정 관측값을 확보하지 못했습니다. 미도래인지 원천 범위 부족인지는 별도 확인이 필요합니다. 최신 관측일은 {show(latest)}입니다.")
            elif warning == "missing_d-1":
                lines.append(f"- {symbol}: D-1 기준 관측이 없어 이벤트 변화량을 계산하지 못했습니다.")
            else:
                window_name = warning.removeprefix("missing_").upper()
                lines.append(f"- {symbol}: {window_name} 확정 관측값이 원천에 없습니다.")
        for failure in payload.get("failures", []):
            if failure.get("code") == "research_context_missing":
                continue
            failure_names = {
                "curve_series_missing": "금리곡선 계산에 필요한 시계열 미확보",
                "invalid_curve": "금리곡선 입력 오류",
                "series_missing": "요청한 시계열 미확보",
                "asset_selection_empty": "사건 전달경로와 일치하는 시계열 미확보",
                "series_starts_after_event": "첫 관측일이 사건일 이후라 반응 계산에서 제외",
            }
            message = failure.get("message") or failure_names.get(failure.get("code"), "일부 분석 항목 미확보")
            lines.append(f"- {failure.get('symbol', '분석 항목')}: {message}")

    lines.extend(["", "### 출처 및 재현 기준", ""])
    event_source = event.get("source", {})
    lines.append(f"- 이벤트: [{show(event_source.get('name'))}]({show(event_source.get('url'))})")
    seen: set[tuple[Any, Any]] = set()
    for item in responses:
        source = item.get("source", {})
        key = (source.get("name"), source.get("url"))
        if key not in seen:
            seen.add(key)
            lines.append(f"- {item['symbol']}: [{show(source.get('name'))}]({show(source.get('url'))})")
    lines.append(f"- 분석 확인 시각: {friendly_timestamp(payload.get('observed_at'))}")
    return "\n".join(lines)


def render_threshold(payload: dict[str, Any]) -> str:
    events = payload.get("events", [])
    if not events:
        return f"## {show(payload.get('trigger'))} 임계치 이벤트\n\n조건을 충족한 관측일이 없습니다."
    lines = [f"## {show(payload.get('trigger'))} 임계치 이벤트", "", f"조건을 충족한 관측일은 **{len(events)}개**입니다.", ""]
    for item in events:
        metric = item.get("metric")
        unit = "bp" if metric == "bp_change" else "%"
        lines.append(f"- **{show(item.get('date'))}**: {signed(item.get('value'), unit)} · 기준 {show(item.get('threshold'))}{unit}")
        for response in item.get("responses", []):
            if "changes_unavailable_without_d_minus_1" in response.get("warnings", []):
                lines.append(f"  - {response.get('symbol')}: D-1 기준 관측이 없어 변화율 계산 불가")
            elif response.get("failure"):
                lines.append(f"  - {response.get('symbol')}: 이벤트일과 정렬할 관측값 없음")
            else:
                lines.append(f"  - {response.get('symbol')}: D0 {window_change(response, 'd0')}, D+1 {window_change(response, 'd+1')}")
        for failure in item.get("failures", []):
            lines.append(f"  - {failure.get('symbol')}: 요청한 반응 시계열 미확보")
    source = payload.get("trigger_source", {})
    lines.extend([
        "",
        f"출처: [{show(source.get('name'))}]({show(source.get('url'))})",
        f"확인 시각: {friendly_timestamp(payload.get('observed_at'))}",
    ])
    return "\n".join(lines)


def render_chat(payload: dict[str, Any]) -> str:
    result = payload.get("result")
    if result in {"input_failure", "source_failure", "parse_failure"}:
        return f"분석을 완료하지 못했습니다.\n\n- 사유: {show(payload.get('message'))}"
    if "market_response" in payload:
        return render_analysis(payload)
    if "resolution" in payload or payload.get("result") in {"verification_required", "ambiguous"}:
        if payload.get("result") == "ok":
            event = payload["event"]
            return (
                f"## 사건 식별 결과\n\n- 사건: {event['event_name']}\n- 유형: {event['event_type']}\n"
                f"- 기준일: {event['event_date']}\n- 지역: {event['region']}\n- 확인 방식: {payload['resolution']}"
            )
        candidates = payload.get("candidates", [])
        candidate_text = "\n".join(f"- {item['event_name']} · {item['event_date']}" for item in candidates)
        return f"사건을 확정하지 못했습니다.\n\n- 사유: {show(payload.get('message'))}" + (f"\n\n후보:\n{candidate_text}" if candidate_text else "")
    if "events" in payload and "trigger" in payload:
        return render_threshold(payload)
    if "events" in payload:
        return render_events(payload)
    return f"분석 결과: {show(result)}"


def emit(payload: dict[str, Any], code: int = 0) -> None:
    normalized = {"schema_version": payload.pop("schema_version", "1.0"), **payload}
    if OUTPUT_FORMAT == "json":
        print(json.dumps(normalized, ensure_ascii=False, indent=2))
    else:
        print(render_chat(normalized))
    raise SystemExit(code)


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "k-skill/1.0 (+https://github.com/NomaDamas/k-skill)"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(2_000_000)
            return data.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
    except (OSError, urllib.error.URLError) as exc:
        raise RuntimeError(str(exc)) from exc


def plain_text(raw_html: str) -> str:
    without_scripts = re.sub(r"<(script|style)\b[\s\S]*?</\1>", " ", raw_html, flags=re.I)
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", without_scripts)).split())


def parse_fomc(raw_html: str, year: int) -> list[dict[str, Any]]:
    marker = f">{year} FOMC Meetings<"
    start = raw_html.find(marker)
    if start < 0:
        text = plain_text(raw_html)
        plain_marker = f"{year} FOMC Meetings"
        if plain_marker not in text:
            return []
        section = text.split(plain_marker, 1)[1]
        pattern = re.compile(r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:-(\d{1,2}))?\*?")
    else:
        next_heading = raw_html.find("FOMC Meetings<", start + len(marker))
        section = raw_html[start:next_heading if next_heading >= 0 else len(raw_html)]
        pattern = re.compile(
            r'fomc-meeting__month[^>]*>\s*<strong>(' + "|".join(MONTHS) +
            r')</strong>[\s\S]{0,500}?fomc-meeting__date[^>]*>\s*(\d{1,2})(?:-(\d{1,2}))?\*?\s*</div>',
            re.I,
        )
    if not section:
        return []
    matches = list(pattern.finditer(section))
    if not matches and "fomc-meeting__month" not in section:
        pattern = re.compile(r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:-(\d{1,2}))?\*?", re.I)
        matches = list(pattern.finditer(plain_text(section)))
    found = []
    seen: set[str] = set()
    for match in matches:
        month = MONTHS[match.group(1).title()]
        day = int(match.group(3) or match.group(2))
        try:
            event_date = date(year, month, day).isoformat()
        except ValueError:
            continue
        if event_date in seen:
            continue
        seen.add(event_date)
        found.append(event_object("US", "FOMC", event_date))
    return found[:8]


def parse_ecb(raw_html: str, year: int) -> list[dict[str, Any]]:
    entry_pattern = re.compile(r"<dt>\s*(\d{2})/(\d{2})/(%d)\s*</dt>\s*<dd>([\s\S]*?)</dd>" % year, re.I)
    events = []
    for day, month, found_year, body in entry_pattern.findall(raw_html):
        description = plain_text(body)
        if "Governing Council of the ECB: monetary policy meeting" not in description or "(Day 2)" not in description:
            continue
        events.append(event_object("EU", "ECB", date(int(found_year), int(month), int(day)).isoformat()))
    return events


def event_object(region: str, family: str, event_date: str, **extra: Any) -> dict[str, Any]:
    source_name, source_url, event_timezone = SOURCES.get((region, family), (None, None, None))
    item = {
        "event_id": extra.pop("event_id", f"{family.casefold().replace('_', '-')}-{event_date}"),
        "event_name": extra.pop("event_name", family.replace("_", " ")),
        "event_type": extra.pop("event_type", "monetary_policy"),
        "region": region,
        "event_family": family,
        "event_date": event_date,
        "event_time_local": extra.pop("event_time_local", None),
        "event_timezone": extra.pop("event_timezone", event_timezone),
        "actual": extra.pop("actual", None),
        "consensus": extra.pop("consensus", None),
        "previous": extra.pop("previous", None),
        "policy_before": extra.pop("policy_before", None),
        "policy_after": extra.pop("policy_after", None),
        "source": extra.pop("source", {"name": source_name, "url": source_url}),
    }
    item.update(extra)
    return item


def load_events_file(path_text: str) -> list[dict[str, Any]]:
    path = Path(path_text).expanduser()
    if not path.is_file():
        raise ValueError(f"events file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    items = payload.get("events") if isinstance(payload, dict) else payload
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ValueError("events file must be an array or contain an events array")
    items = [normalize_event(item) for item in items]
    keys = [(item["event_id"], item["event_date"]) for item in items]
    if len(keys) != len(set(keys)):
        raise ValueError("events file contains duplicate event keys")
    return items


def discover_events(region: str, family: str, year: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    key = (region, family)
    if key not in SOURCES:
        return [], [{"region": region, "event_family": family, "code": "unsupported_live_schedule"}]
    name, url, _ = SOURCES[key]
    if key == ("KR", "BOK_MPC"):
        return [], [{"region": region, "event_family": family, "code": "browser_required", "source": {"name": name, "url": url}}]
    try:
        raw = fetch_text(url)
        items = parse_fomc(raw, year) if key == ("US", "FOMC") else parse_ecb(raw, year)
    except RuntimeError as exc:
        return [], [{"region": region, "event_family": family, "code": "source_failure", "message": str(exc), "source": {"name": name, "url": url}}]
    if not items:
        return [], [{"region": region, "event_family": family, "code": "parse_failure", "source": {"name": name, "url": url}}]
    return items, []


def numeric_surprise(actual: Any, consensus: Any) -> float | None:
    try:
        result = float(actual) - float(consensus)
        return round(result, 10) if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def event_from_args(args: argparse.Namespace) -> dict[str, Any]:
    family = str(args.event or "").upper().replace(" ", "_") or None
    if args.event_file:
        if args.event_time_local or args.event_timezone:
            raise ValueError("event time overrides cannot be combined with --event-file")
        events = load_events_file(args.event_file)
        if args.query:
            resolved = resolve_from_events(args.query, events)
            if resolved["result"] != "ok":
                raise ValueError(resolved["message"])
            event = dict(resolved["event"])
        else:
            if not args.date:
                raise ValueError("--date is required when --query is omitted")
            candidates = [item for item in events if item["event_date"] == args.date]
            if args.event_id:
                candidates = [item for item in candidates if item["event_id"] == args.event_id]
            if args.region:
                candidates = [item for item in candidates if item["region"] == args.region.upper()]
            if family:
                candidates = [item for item in candidates if item.get("event_family") == family]
            if len(candidates) != 1:
                raise ValueError(f"event-file must contain exactly one matching event; found {len(candidates)}")
            event = dict(candidates[0])
    else:
        if args.query:
            raise ValueError("free-form --query requires --event-file with a verified event date and source")
        if bool(args.event_time_local) != bool(args.event_timezone):
            raise ValueError("event-time-local and event-timezone must be provided together")
        if not args.date or not args.region or not (args.event_name or args.event) or not args.event_type:
            raise ValueError("direct input requires --event-name (or --event), --event-type, --region, and --date")
        source = None
        if args.event_source_name or args.event_source_url:
            if not args.event_source_name or not args.event_source_url:
                raise ValueError("event-source-name and event-source-url must be provided together")
            source = {"name": args.event_source_name, "url": args.event_source_url}
        if source is None:
            raise ValueError("event source is required; use --event-file or event-source-name/event-source-url")
        event = normalize_event({
            "event_id": args.event_id,
            "event_name": args.event_name or args.event,
            "event_family": family,
            "event_type": args.event_type,
            "region": args.region,
            "event_date": args.date,
            "actual": args.actual,
            "consensus": args.consensus,
            "previous": args.previous,
            "event_time_local": args.event_time_local,
            "event_timezone": args.event_timezone,
            "source": source,
        })
    return event


def cmd_resolve(args: argparse.Namespace) -> None:
    if not args.events_file:
        event_type, _ = infer_event_type(args.query)
        emit({
            "result": "verification_required",
            "query": args.query,
            "inferred_event_type": event_type,
            "message": "사건 날짜와 직접 출처를 확인한 events 파일이 필요합니다.",
            "resolution": "unverified_query",
        }, 1)
    result = resolve_from_events(args.query, load_events_file(args.events_file))
    result["resolution"] = result.get("resolution", "unresolved")
    emit(result, 0 if result["result"] == "ok" else 1)


def cmd_events(args: argparse.Namespace) -> None:
    if args.events_file:
        items = load_events_file(args.events_file)
        family = args.event.upper().replace(" ", "_")
        items = [item for item in items if item["region"] == args.region and str(item.get("event_family") or "").upper().replace(" ", "_") == family and item["event_date"].startswith(str(args.year))]
        emit({"result": "ok" if items else "empty", "events": items, "failures": [], "observed_at": args.observed_at})
    family = args.event.upper().replace(" ", "_")
    items, failures = discover_events(args.region, family, args.year)
    emit({"result": "ok" if items else "partial_failure", "events": items, "failures": failures, "observed_at": args.observed_at}, 0 if items else 1)


def cmd_upcoming(args: argparse.Namespace) -> None:
    start = date.fromisoformat(args.as_of)
    end = start + timedelta(days=args.days)
    regions = list(args.region)
    items: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if args.events_file:
        items = load_events_file(args.events_file)
    else:
        families = {"KR": "BOK_MPC", "US": "FOMC", "EU": "ECB"}
        for region in regions:
            for year in sorted({start.year, end.year}):
                found, failed = discover_events(region, families.get(region, ""), year)
                items.extend(found)
                failures.extend(failed)
        failures = list({(item.get("region"), item.get("event_family"), item.get("code")): item for item in failures}.values())
    items = list({(item["event_id"], item["event_date"]): item for item in items}.values())
    selected = [item for item in items if item["region"] in regions and start <= date.fromisoformat(item["event_date"]) <= end]
    selected.sort(key=lambda item: item["event_date"])
    emit({"result": "ok" if selected and not failures else ("partial_failure" if failures else "empty"), "as_of": start.isoformat(), "through": end.isoformat(), "events": selected, "failures": failures, "observed_at": args.observed_at})


def cmd_analyze(args: argparse.Namespace) -> None:
    try:
        series = load_series(args.series_file)
    except (OSError, ValueError, json.JSONDecodeError, SeriesError) as exc:
        emit({"result": "input_failure", "message": str(exc)}, 1)
    event = event_from_args(args)
    cutoff = datetime.fromisoformat(args.observed_at).astimezone(timezone.utc)
    event_zone_name = event.get("event_timezone") or MARKET_CLOSES.get(event["region"], ("UTC",))[0]
    event_local_cutoff = cutoff.astimezone(zone_for_date(event_zone_name, cutoff.date())).date()
    if date.fromisoformat(event["event_date"]) > event_local_cutoff:
        raise ValueError("event date is after --observed-at")
    if event.get("event_time_local") and event.get("event_timezone"):
        event_day = date.fromisoformat(event["event_date"])
        event_instant = datetime.combine(event_day, dt_time.fromisoformat(event["event_time_local"]),
                                         zone_for_date(event["event_timezone"], event_day)).astimezone(timezone.utc)
        if event_instant > cutoff:
            raise ValueError("event timestamp is after --observed-at")
    event["surprise"] = numeric_surprise(event.get("actual"), event.get("consensus"))
    research = None
    if args.research_file:
        research = select_research(load_research_file(args.research_file), event)
        research_cutoff = research.get("observed_at")
        if research_cutoff and datetime.fromisoformat(research_cutoff).astimezone(timezone.utc) > cutoff:
            raise ValueError("research observed_at is after analysis --observed-at")
    next_events: list[dict[str, Any]] = []
    if args.event_file:
        recurrence_key = event.get("recurrence_key") or event.get("event_family")
        next_events = [
            item for item in load_events_file(args.event_file)
            if recurrence_key
            and (item.get("recurrence_key") or item.get("event_family")) == recurrence_key
            and item["event_date"] > event["event_date"]
        ]
        next_events.sort(key=lambda item: item["event_date"])
    cutoff_series = [series_as_of(item, args.observed_at) for item in series]
    for item in cutoff_series:
        if not item["observations"]:
            item["selection_usable"] = False
            continue
        selection_alignment = args.alignment
        selection_date = event["event_date"]
        if args.alignment == "next":
            selection_alignment, _, selection_date = market_alignment_for_series(event, item)
        candidate = analyze_series(item, event["event_date"], selection_alignment, (-1, 0), selection_date)
        window = candidate.get("window", {})
        item["selection_usable"] = (
            candidate.get("failure") is None
            and window.get("d-1", {}).get("value") is not None
            and window.get("d0", {}).get("value") is not None
        )
    selected_series, asset_selection, missing_symbols = select_assets(cutoff_series, event, args.symbols, args.max_assets)
    responses = []
    intraday_responses = []
    failures = []
    if not selected_series:
        failures.append({"code": "asset_selection_empty", "message": "no available series matched the event transmission profile"})
    if research is None and not args.study_only:
        failures.append({"code": "research_context_missing", "message": "full event research requires --research-file"})
    failures.extend({"symbol": symbol, "code": "series_missing"} for symbol in missing_symbols)
    for item in selected_series:
        if item["original_first_observation_date"] > event["event_date"]:
            failures.append({
                "symbol": item["symbol"],
                "code": "series_starts_after_event",
                "message": f"first observation {item['original_first_observation_date']} is after event date {event['event_date']}",
            })
            continue
        if not item["observations"]:
            failures.append({"symbol": item["symbol"], "code": "series_no_observation_asof",
                             "message": "확인 시각 이전의 확정 관측값이 없습니다"})
            continue
        series_alignment = args.alignment
        alignment_basis = "user_requested_alignment"
        alignment_date = event["event_date"]
        if args.alignment == "next":
            series_alignment, alignment_basis, alignment_date = market_alignment_for_series(event, item)
        analysis_item = {**item, "alignment_basis": alignment_basis}
        response = analyze_series(
            analysis_item, event["event_date"], series_alignment, (-1, 0, 1, args.window), alignment_date
        )
        if "failure" in response:
            failures.append({"symbol": item["symbol"], "code": response.pop("failure")})
        responses.append(response)
        if item.get("intraday_observations"):
            intraday_responses.append(analyze_intraday_reaction(item, event))
    curves = []
    by_symbol = {item["symbol"]: item for item in responses}
    if args.curve:
        short_symbol, long_symbol = args.curve
        try:
            short_response = by_symbol[short_symbol]
            long_response = by_symbol[long_symbol]
            if short_response["asset_class"] not in {"rates", "policy", "spread"} or long_response["asset_class"] not in {"rates", "policy", "spread"}:
                raise ValueError("curve requires rates, policy, or spread series")
            if short_response.get("region") != long_response.get("region"):
                raise ValueError("curve series must belong to the same region")
            if short_response["window"]["d0"]["date"] != long_response["window"]["d0"]["date"]:
                raise ValueError("curve series must share the same D0 observation date")
            short_clock = short_response.get("observation_provenance") or {}
            long_clock = long_response.get("observation_provenance") or {}
            if (short_clock.get("observation_timezone"), short_clock.get("observation_time")) != (
                long_clock.get("observation_timezone"), long_clock.get("observation_time")
            ):
                raise ValueError("curve series must share the same observation clock")
            short = short_response.get("window", {}).get("d0", {}).get("change_from_d_minus_1")
            long = long_response.get("window", {}).get("d0", {}).get("change_from_d_minus_1")
            if short is None or long is None:
                raise ValueError("curve D0 response or D-1 anchor is unavailable")
            curves.append({"short": short_symbol, "long": long_symbol, **classify_curve(short, long)})
        except KeyError:
            failures.append({"code": "curve_series_missing", "symbols": [short_symbol, long_symbol]})
        except ValueError as exc:
            failures.append({"code": "invalid_curve", "symbols": [short_symbol, long_symbol], "message": str(exc)})
    emit({
        "result": "partial_failure" if failures else ("ok" if responses else "empty"),
        "event": event,
        "analysis_contract": {
            "research_first": True,
            "anchor": "D-1",
            "offsets": [-1, 0, 1, args.window],
            "event_timestamp_quality": event.get("event_timestamp_quality"),
            "event_structure": event.get("event_structure"),
            "daily_d0_is_causal_effect": False,
            "cross_market_alignment": "source_observation_time_then_market_close_proxy_then_region_market_close_proxy_then_region_calendar_proxy",
        },
        "research": research,
        "adapter": adapter_for_event(event),
        "asset_selection": asset_selection,
        "market_response": responses,
        "intraday_response": intraday_responses,
        "curves": curves,
        "next_events": next_events[:3],
        "failures": failures,
        "observed_at": args.observed_at,
    })


def cmd_threshold(args: argparse.Namespace) -> None:
    try:
        series = load_series(args.series_file)
    except (OSError, ValueError, json.JSONDecodeError, SeriesError) as exc:
        emit({"result": "input_failure", "message": str(exc)}, 1)
    by_symbol = {item["symbol"]: item for item in series}
    if args.trigger not in by_symbol:
        emit({"result": "empty", "message": f"trigger series not found: {args.trigger}"}, 1)
    try:
        matches = threshold_events(by_symbol[args.trigger], args.metric, args.direction, args.threshold)
    except ValueError as exc:
        emit({"result": "input_failure", "message": str(exc)}, 1)
    responses = [value.strip() for value in (args.response or "").split(",") if value.strip()]
    for item in matches:
        item["responses"] = [analyze_series(by_symbol[symbol], item["date"], args.alignment) for symbol in responses if symbol in by_symbol]
        missing = [symbol for symbol in responses if symbol not in by_symbol]
        if missing:
            item["failures"] = [{"symbol": symbol, "code": "series_missing"} for symbol in missing]
    emit({"result": "ok" if matches else "empty", "trigger": args.trigger, "trigger_source": by_symbol[args.trigger]["source"], "events": matches, "observed_at": args.observed_at})


def parse_iso_arg(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise argparse.ArgumentTypeError("date must be YYYY-MM-DD") from exc


def parse_year(value: str) -> int:
    year = int(value)
    if not 2000 <= year <= 2100:
        raise argparse.ArgumentTypeError("year must be between 2000 and 2100")
    return year


def parse_days(value: str) -> int:
    days = int(value)
    if not 0 <= days <= 366:
        raise argparse.ArgumentTypeError("days must be between 0 and 366")
    return days


def parse_window(value: str) -> int:
    window = int(value)
    if not 2 <= window <= 30:
        raise argparse.ArgumentTypeError("window must be between 2 and 30")
    return window


def parse_asset_limit(value: str) -> int:
    limit = int(value)
    if not 1 <= limit <= 20:
        raise argparse.ArgumentTypeError("max-assets must be between 1 and 20")
    return limit


def parse_curve(value: str) -> tuple[str, str]:
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if len(parts) != 2 or parts[0] == parts[1]:
        raise argparse.ArgumentTypeError("curve must contain two distinct symbols: short,long")
    return parts[0], parts[1]


def parse_regions(value: str) -> tuple[str, ...]:
    regions = tuple(dict.fromkeys(part.strip().upper() for part in value.split(",") if part.strip()))
    invalid = [region for region in regions if not re.fullmatch(r"[A-Z]{2,6}", region)]
    if not regions or invalid:
        raise argparse.ArgumentTypeError("region must contain 2-6 letter market codes")
    return regions


def parse_symbols(value: str) -> tuple[str, ...]:
    symbols = tuple(dict.fromkeys(part.strip() for part in value.split(",") if part.strip()))
    if not symbols:
        raise argparse.ArgumentTypeError("symbols must contain at least one symbol")
    return symbols


def parse_timestamp(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("observed-at must be ISO 8601") from exc
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("observed-at must include a timezone")
    return parsed.isoformat()


def parse_local_time(value: str) -> str:
    try:
        parsed = dt_time.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("event time must be HH:MM or HH:MM:SS") from exc
    if parsed.tzinfo is not None:
        raise argparse.ArgumentTypeError("event time must not include a timezone offset")
    return parsed.isoformat(timespec="minutes" if parsed.second == 0 and parsed.microsecond == 0 else "seconds")


def build_parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    resolve = sub.add_parser("resolve")
    resolve.add_argument("--query", required=True)
    resolve.add_argument("--events-file")
    resolve.add_argument("--format", choices=("chat", "json"), default="chat")
    resolve.set_defaults(func=cmd_resolve)
    events = sub.add_parser("events")
    events.add_argument("--region", required=True, choices=("KR", "US", "EU"))
    events.add_argument("--event", required=True)
    events.add_argument("--year", required=True, type=parse_year)
    events.add_argument("--events-file")
    events.add_argument("--observed-at", type=parse_timestamp, default=datetime.now(timezone.utc).isoformat())
    events.add_argument("--format", choices=("chat", "json"), default="chat")
    events.set_defaults(func=cmd_events)
    upcoming = sub.add_parser("upcoming")
    upcoming.add_argument("--region", type=parse_regions, default=("KR", "US", "EU"))
    upcoming.add_argument("--days", type=parse_days, default=30)
    upcoming.add_argument("--as-of", type=parse_iso_arg, default=date.today().isoformat())
    upcoming.add_argument("--events-file")
    upcoming.add_argument("--observed-at", type=parse_timestamp, default=datetime.now(timezone.utc).isoformat())
    upcoming.add_argument("--format", choices=("chat", "json"), default="chat")
    upcoming.set_defaults(func=cmd_upcoming)
    analyze = sub.add_parser("analyze")
    analyze.add_argument("--query", help="free-form event name; requires a verified --event-file")
    analyze.add_argument("--event-id")
    analyze.add_argument("--event-name")
    analyze.add_argument("--event-type")
    analyze.add_argument("--region")
    analyze.add_argument("--event", help="legacy event family or event-name alias")
    analyze.add_argument("--date", type=parse_iso_arg)
    analyze.add_argument("--window", type=parse_window, default=5)
    analyze.add_argument("--alignment", choices=("same", "next", "previous"), default="next")
    analyze.add_argument("--series-file", required=True)
    analyze.add_argument("--symbols", type=parse_symbols)
    analyze.add_argument("--max-assets", type=parse_asset_limit, default=8)
    analyze.add_argument("--curve", type=parse_curve, help="short,long symbols")
    analyze.add_argument("--event-file")
    analyze.add_argument("--research-file", help="verified decision, communication, interpretation, transmission, and catalyst research JSON")
    analyze.add_argument("--study-only", action="store_true", help="allow event-window output without a research layer")
    analyze.add_argument("--actual")
    analyze.add_argument("--consensus")
    analyze.add_argument("--previous")
    analyze.add_argument("--event-source-name")
    analyze.add_argument("--event-source-url")
    analyze.add_argument("--event-time-local", type=parse_local_time)
    analyze.add_argument("--event-timezone")
    analyze.add_argument("--observed-at", type=parse_timestamp, default=datetime.now(timezone.utc).isoformat())
    analyze.add_argument("--format", choices=("chat", "json"), default="chat")
    analyze.set_defaults(func=cmd_analyze)
    threshold = sub.add_parser("threshold")
    threshold.add_argument("--series-file", required=True)
    threshold.add_argument("--trigger", required=True)
    threshold.add_argument("--metric", choices=("bp_change", "pct_change"), required=True)
    threshold.add_argument("--direction", choices=("above", "below"), required=True)
    threshold.add_argument("--threshold", type=float, required=True)
    threshold.add_argument("--response")
    threshold.add_argument("--alignment", choices=("same", "next", "previous"), default="next")
    threshold.add_argument("--observed-at", type=parse_timestamp, default=datetime.now(timezone.utc).isoformat())
    threshold.add_argument("--format", choices=("chat", "json"), default="chat")
    threshold.set_defaults(func=cmd_threshold)
    return parser


def main(argv: Iterable[str] | None = None) -> None:
    global OUTPUT_FORMAT
    args = build_parser().parse_args(argv)
    OUTPUT_FORMAT = args.format
    try:
        args.func(args)
    except (OSError, ValueError, json.JSONDecodeError, SeriesError, ResearchError, EventResolutionError) as exc:
        emit({"result": "input_failure", "message": str(exc)}, 1)


if __name__ == "__main__":
    main()
