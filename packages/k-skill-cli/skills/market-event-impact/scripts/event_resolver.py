#!/usr/bin/env python3
"""Resolve free-form market events into a verified, generic event contract."""

from __future__ import annotations

import re
import hashlib
from datetime import date, time as dt_time
from typing import Any
from urllib.parse import urlparse

from calendars import valid_timezone


EVENT_TYPES = {
    "monetary_policy",
    "inflation",
    "employment",
    "growth",
    "financial_stress",
    "sovereign_credit",
    "geopolitics",
    "commodity_supply",
    "corporate_earnings",
    "fiscal_policy",
    "trade_policy",
    "regulation",
    "market_shock",
    "other",
}
EVENT_STRUCTURES = {"point_event", "scheduled_event", "developing_event"}

GENERIC_QUERY_TERMS = {"decision", "meeting", "event", "release", "announcement", "analysis", "update", "발표", "회의", "사건", "분석", "시장"}
KNOWN_ACRONYMS = {"svb", "fomc", "ecb", "boj", "bok", "cpi", "ppi", "hicp", "nfp", "gdp", "pmi", "opec", "s&p", "vix", "kre"}

TYPE_KEYWORDS = (
    ("financial_stress", ("svb", "bank run", "bank failure", "banking crisis", "은행위기", "은행 파산", "예금유출", "금융불안")),
    ("sovereign_credit", ("downgrade", "default", "credit rating", "신용등급", "국가부도", "디폴트")),
    ("geopolitics", ("war", "invasion", "missile", "conflict", "전쟁", "침공", "군사충돌", "지정학")),
    ("commodity_supply", ("opec", "production cut", "supply disruption", "감산", "공급차질")),
    ("trade_policy", ("tariff", "trade war", "관세", "무역분쟁")),
    ("corporate_earnings", ("earnings", "guidance", "실적", "가이던스")),
    ("monetary_policy", ("fomc", "ecb", "boj", "bok", "금통위", "기준금리", "금리 결정")),
    ("inflation", ("cpi", "ppi", "hicp", "inflation", "물가")),
    ("employment", ("nfp", "payroll", "unemployment", "고용", "실업률")),
    ("growth", ("gdp", "pmi", "growth", "성장률")),
    ("fiscal_policy", ("budget", "stimulus", "fiscal", "예산", "재정", "부양책")),
    ("regulation", ("regulation", "antitrust", "ban", "규제", "금지")),
    ("market_shock", ("flash crash", "selloff", "short squeeze", "폭락", "급등", "쇼트스퀴즈")),
)

REGION_ALIASES = {
    "KOREA": "KR", "SOUTH KOREA": "KR", "한국": "KR",
    "UNITED STATES": "US", "USA": "US", "미국": "US",
    "EURO AREA": "EU", "EUROZONE": "EU", "유로존": "EU",
    "JAPAN": "JP", "일본": "JP", "CHINA": "CN", "중국": "CN",
    "UNITED KINGDOM": "UK", "영국": "UK", "GLOBAL": "GLOBAL", "글로벌": "GLOBAL",
}


class EventResolutionError(ValueError):
    pass


def normalize_token(value: Any) -> str:
    return " ".join(re.sub(r"[^\w]+", " ", str(value or "").casefold(), flags=re.UNICODE).split())


def stable_event_id(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", normalize_token(name)).strip("-")
    if slug:
        return slug[:80].rstrip("-")
    digest = hashlib.sha256(normalize_token(name).encode("utf-8")).hexdigest()[:16]
    return f"event-{digest}"


def infer_event_type(query: str) -> tuple[str, list[str]]:
    normalized = normalize_token(query)
    matches = [event_type for event_type, words in TYPE_KEYWORDS if any(normalize_token(word) in normalized for word in words)]
    unique = list(dict.fromkeys(matches))
    return (unique[0] if unique else "other", unique)


def _source(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise EventResolutionError("event needs source.name and source.url")
    name = str(value.get("name") or "").strip()
    url = str(value.get("url") or "").strip()
    parsed = urlparse(url)
    if not name or parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise EventResolutionError("event needs a valid source.name and http(s) source.url")
    return {"name": name, "url": url}


def normalize_region(value: Any) -> str:
    raw = str(value or "").strip().upper()
    resolved = REGION_ALIASES.get(raw, raw)
    if not resolved or not re.fullmatch(r"[A-Z]{2,6}", resolved):
        raise EventResolutionError("event region must be a 2-6 letter market code such as US, KR, EU, JP, or GLOBAL")
    return resolved


def normalize_event(item: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise EventResolutionError("event must be an object")
    name = str(item.get("event_name") or item.get("event_family") or "").strip()
    if not name:
        raise EventResolutionError("event_name is required")
    event_id = str(item.get("event_id") or "").strip().casefold() or stable_event_id(name)
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,95}", event_id):
        raise EventResolutionError("event_id must use 1-96 lowercase letters, numbers, dots, underscores, or hyphens")
    try:
        event_date = date.fromisoformat(str(item.get("event_date"))).isoformat()
    except ValueError as exc:
        raise EventResolutionError("event_date must be YYYY-MM-DD") from exc
    explicit_type = str(item.get("event_type") or "").strip().casefold()
    inferred_type, matches = infer_event_type(" ".join([name, str(item.get("event_family") or ""), " ".join(map(str, item.get("aliases") or []))]))
    event_type = explicit_type or inferred_type
    if event_type not in EVENT_TYPES:
        raise EventResolutionError(f"unsupported event_type: {event_type}")
    if not explicit_type and len(matches) > 1:
        raise EventResolutionError("event_type is ambiguous; provide an explicit event_type")
    aliases = item.get("aliases") or []
    if not isinstance(aliases, list) or not all(isinstance(alias, str) and alias.strip() for alias in aliases):
        raise EventResolutionError("event aliases must be non-empty strings")
    event_time = item.get("event_time_local")
    event_timezone = item.get("event_timezone")
    if bool(event_time) != bool(event_timezone):
        raise EventResolutionError("event_time_local and event_timezone must be provided together")
    if event_time:
        try:
            parsed_time = dt_time.fromisoformat(str(event_time))
            if parsed_time.tzinfo is not None or not valid_timezone(str(event_timezone), date.fromisoformat(event_date)):
                raise ValueError
        except ValueError as exc:
            raise EventResolutionError("event time must be local HH:MM with a valid IANA timezone") from exc
    family = str(item.get("event_family") or "").strip().upper().replace(" ", "_") or None
    raw_sequence = item.get("event_sequence") or []
    if not isinstance(raw_sequence, list) or any(not isinstance(step, dict) for step in raw_sequence):
        raise EventResolutionError("event_sequence must be an object array")
    if len(raw_sequence) > 20:
        raise EventResolutionError("event_sequence supports at most 20 timeline steps")
    sequence = []
    sequence_keys = set()
    previous_date = None
    for index, step in enumerate(raw_sequence):
        try:
            step_date = date.fromisoformat(str(step.get("date"))).isoformat()
        except ValueError as exc:
            raise EventResolutionError(f"event_sequence[{index}].date must be YYYY-MM-DD") from exc
        step_time = step.get("time_local")
        step_timezone = step.get("timezone")
        if bool(step_time) != bool(step_timezone):
            raise EventResolutionError(f"event_sequence[{index}].time_local and timezone must be provided together")
        if step_time:
            try:
                parsed_step_time = dt_time.fromisoformat(str(step_time))
                if parsed_step_time.tzinfo is not None or not valid_timezone(str(step_timezone), date.fromisoformat(step_date)):
                    raise ValueError
                step_time = parsed_step_time.isoformat(timespec="minutes" if parsed_step_time.second == 0 else "seconds")
            except ValueError as exc:
                raise EventResolutionError(f"event_sequence[{index}] needs a local time and valid IANA timezone") from exc
        step_name = str(step.get("event") or "").strip()
        if not step_name:
            raise EventResolutionError(f"event_sequence[{index}].event is required")
        stage = str(step.get("stage") or "milestone").strip().casefold()
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", stage):
            raise EventResolutionError(f"event_sequence[{index}].stage must be a short identifier")
        source = _source(step.get("source"))
        if previous_date and step_date < previous_date:
            raise EventResolutionError("event_sequence must be in chronological date order")
        previous_date = step_date
        key = (step_date, str(step_time or ""), step_name.casefold())
        if key in sequence_keys:
            raise EventResolutionError("event_sequence contains duplicate milestones")
        sequence_keys.add(key)
        sequence.append({
            "date": step_date,
            "time_local": step_time,
            "timezone": str(step_timezone) if step_timezone else None,
            "stage": stage,
            "event": step_name,
            "source": source,
        })
    raw_structure = str(item.get("event_structure") or "").strip().casefold()
    if raw_structure:
        if raw_structure not in EVENT_STRUCTURES:
            raise EventResolutionError(f"event_structure must be one of {sorted(EVENT_STRUCTURES)}")
        event_structure = raw_structure
        structure_inferred = False
    elif len(sequence) > 1:
        event_structure = "developing_event"
        structure_inferred = True
    elif item.get("adapter") or family:
        event_structure = "scheduled_event"
        structure_inferred = True
    else:
        event_structure = "point_event"
        structure_inferred = True
    if event_structure == "developing_event":
        if len(sequence) < 2:
            raise EventResolutionError("developing_event needs at least two verified event_sequence milestones")
        if not any(step["date"] == event_date for step in sequence):
            raise EventResolutionError("developing_event sequence must include the primary event_date")
    return {
        **item,
        "event_id": event_id,
        "event_name": name,
        "event_family": family,
        "event_type": event_type,
        "event_date": event_date,
        "event_structure": event_structure,
        "event_structure_inferred": structure_inferred,
        "event_timestamp_quality": "exact_timestamp" if event_time else "date_only",
        "event_sequence": sequence,
        "region": normalize_region(item.get("region")),
        "aliases": list(dict.fromkeys(alias.strip() for alias in aliases)),
        "source": _source(item.get("source")),
    }


def resolve_from_events(query: str, events: list[dict[str, Any]]) -> dict[str, Any]:
    needle = normalize_token(query)
    if not needle:
        raise EventResolutionError("event query must be a non-empty string")
    scored: list[tuple[int, dict[str, Any]]] = []
    for raw in events:
        item = normalize_event(raw)
        candidates = [item["event_name"], item["event_id"], item.get("event_family") or "", *item["aliases"]]
        normalized = [normalize_token(value) for value in candidates if value]
        exact = any(needle == value for value in normalized)
        contains = any(needle in value or value in needle for value in normalized)
        needle_tokens = set(needle.split())
        meaningful_tokens = needle_tokens - GENERIC_QUERY_TERMS
        token_overlap = max((len(meaningful_tokens & (set(value.split()) - GENERIC_QUERY_TERMS)) for value in normalized), default=0)
        acronym_match = bool(meaningful_tokens & KNOWN_ACRONYMS & set(" ".join(normalized).split()))
        safe_contains = contains and not (len(needle_tokens) == 1 and needle in GENERIC_QUERY_TERMS)
        score = 100 if exact else (50 if safe_contains else (10 if token_overlap >= 2 or acronym_match else 0))
        if score:
            scored.append((score, item))
    if not scored:
        inferred, matches = infer_event_type(query)
        return {
            "result": "verification_required",
            "query": query,
            "inferred_event_type": inferred,
            "ambiguous_types": matches if len(matches) > 1 else [],
            "message": "사건 날짜와 직접 출처를 확인한 뒤 events 파일에 추가해야 합니다.",
        }
    top_score = max(score for score, _ in scored)
    top = [item for score, item in scored if score == top_score]
    identities = {(item["event_id"], item["event_date"]) for item in top}
    if len(identities) != 1:
        return {
            "result": "ambiguous",
            "query": query,
            "candidates": top,
            "message": "동일하게 일치하는 사건이 여러 개입니다. 날짜나 지역을 추가해 주세요.",
        }
    return {"result": "ok", "query": query, "event": top[0], "resolution": "verified_event_file"}
