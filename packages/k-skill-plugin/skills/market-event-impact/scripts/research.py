#!/usr/bin/env python3
"""Validate reproducible narrative research inputs for arbitrary market events."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, time as dt_time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from calendars import valid_timezone
from event_resolver import EVENT_TYPES, infer_event_type, stable_event_id


class ResearchError(ValueError):
    pass


def _source(value: Any, context: str) -> dict[str, str]:
    if not isinstance(value, dict) or not str(value.get("name") or "").strip() or not str(value.get("url") or "").strip():
        raise ResearchError(f"{context} needs source.name and source.url")
    url = str(value["url"]).strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ResearchError(f"{context}.source.url must be an http(s) URL")
    return {"name": str(value["name"]).strip(), "url": url}


def _text(value: Any, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ResearchError(f"{context} must be a non-empty string")
    return value.strip()


def _claim_list(value: Any, field: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ResearchError(f"{field} must be an object array")
    result = []
    for index, item in enumerate(value):
        context = f"{field}[{index}]"
        result.append({
            "channel": _text(item.get("channel"), f"{context}.channel"),
            "finding": _text(item.get("finding"), f"{context}.finding"),
            "significance": _text(item.get("significance"), f"{context}.significance"),
            "source": _source(item.get("source"), context),
        })
    return result


def _catalysts(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ResearchError("catalysts must be an object array")
    result = []
    for index, item in enumerate(value):
        context = f"catalysts[{index}]"
        try:
            event_date = date.fromisoformat(str(item.get("date"))).isoformat()
        except ValueError as exc:
            raise ResearchError(f"{context}.date must be YYYY-MM-DD") from exc
        time_local = item.get("time_local")
        timezone_name = item.get("timezone")
        if bool(time_local) != bool(timezone_name):
            raise ResearchError(f"{context}.time_local and timezone must be provided together")
        if time_local:
            try:
                parsed_time = dt_time.fromisoformat(str(time_local))
                if parsed_time.tzinfo is not None or not valid_timezone(str(timezone_name), date.fromisoformat(event_date)):
                    raise ValueError
            except ValueError as exc:
                raise ResearchError(f"{context}.time_local requires local time and valid IANA timezone") from exc
            time_local = parsed_time.isoformat(timespec="minutes" if parsed_time.second == 0 else "seconds")
        result.append({
            "date": event_date,
            "time_local": time_local,
            "timezone": timezone_name,
            "event": _text(item.get("event"), f"{context}.event"),
            "why_it_matters": _text(item.get("why_it_matters"), f"{context}.why_it_matters"),
            "source": _source(item.get("source"), context),
        })
    result.sort(key=lambda item: (item["date"], item["time_local"] or ""))
    return result


def _transmission(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ResearchError("transmission must be an object array")
    allowed = {"CONFIRMED", "CONSISTENT", "MIXED", "CONTRADICTED", "UNVERIFIED"}
    result = []
    for index, item in enumerate(value):
        context = f"transmission[{index}]"
        raw_status = str(item.get("status", "")).strip().casefold()
        status = {"confirmed": "CONFIRMED", "consistent": "CONSISTENT", "limited": "MIXED", "mixed": "MIXED", "contradicted": "CONTRADICTED", "unverified": "UNVERIFIED"}.get(raw_status, "")
        if status not in allowed:
            raise ResearchError(f"{context}.status must be one of {sorted(allowed)}")
        origin = _text(item.get("from"), f"{context}.from")
        destination = _text(item.get("to"), f"{context}.to")
        if origin.casefold() == destination.casefold():
            raise ResearchError(f"{context}.from and .to must differ")
        result.append({
            "from": origin,
            "to": destination,
            "status": status,
            "evidence": _text(item.get("evidence"), f"{context}.evidence"),
            "source": _source(item.get("source"), context),
        })
    keys = [(item["from"].casefold(), item["to"].casefold()) for item in result]
    if len(keys) != len(set(keys)):
        raise ResearchError("transmission contains duplicate steps")
    return result


def _history(value: Any) -> dict[str, Any]:
    if value is None:
        return {"include": False, "reason": None, "comparisons": []}
    if not isinstance(value, dict):
        raise ResearchError("historical_context must be an object")
    include_raw = value.get("include", False)
    if not isinstance(include_raw, bool):
        raise ResearchError("historical_context.include must be true or false")
    include = include_raw
    comparisons = value.get("comparisons", [])
    if not isinstance(comparisons, list) or not all(isinstance(item, dict) for item in comparisons):
        raise ResearchError("historical_context.comparisons must be an object array")
    normalized = []
    for index, item in enumerate(comparisons):
        context = f"historical_context.comparisons[{index}]"
        try:
            event_date = date.fromisoformat(str(item.get("date"))).isoformat()
        except ValueError as exc:
            raise ResearchError(f"{context}.date must be YYYY-MM-DD") from exc
        normalized.append({
            "date": event_date,
            "event": _text(item.get("event"), f"{context}.event"),
            "matching_basis": _text(item.get("matching_basis") or item.get("similarity"), f"{context}.matching_basis"),
            "similarity": _text(item.get("similarity"), f"{context}.similarity"),
            "difference": _text(item.get("difference"), f"{context}.difference"),
            "source": _source(item.get("source"), context),
        })
    if include and not 3 <= len(normalized) <= 5:
        raise ResearchError("historical_context.include=true needs 3 to 5 comparisons")
    if not include and normalized:
        raise ResearchError("historical_context comparisons require include=true")
    return {
        "include": include,
        "reason": _text(value.get("reason"), "historical_context.reason") if include else None,
        "comparisons": sorted(normalized, key=lambda item: item["date"]),
    }


def _tokens(value: Any, context: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
        raise ResearchError(f"{context} must be a non-empty-string array")
    return list(dict.fromkeys(item.strip().casefold() for item in value))


def _shock_pattern(value: Any, context: str) -> dict[str, str]:
    allowed = {"up", "down", "mixed", "flat", "wider", "tighter"}
    if not isinstance(value, dict) or not value:
        raise ResearchError(f"{context} must be a non-empty object")
    result = {}
    for raw_key, raw_direction in value.items():
        key = _text(raw_key, f"{context} key").casefold()
        direction = _text(raw_direction, f"{context}.{key}").casefold()
        if direction not in allowed:
            raise ResearchError(f"{context}.{key} must be one of {sorted(allowed)}")
        result[key] = direction
    return result


def _event_features(value: Any, context: str = "event_features") -> dict[str, Any]:
    if value is None:
        return {"shock_mechanisms": [], "affected_channels": [], "market_shock_pattern": {}}
    if not isinstance(value, dict):
        raise ResearchError(f"{context} must be an object")
    mechanisms = _tokens(value.get("shock_mechanisms", []), f"{context}.shock_mechanisms") if value.get("shock_mechanisms") else []
    channels = _tokens(value.get("affected_channels", []), f"{context}.affected_channels") if value.get("affected_channels") else []
    pattern = _shock_pattern(value["market_shock_pattern"], f"{context}.market_shock_pattern") if value.get("market_shock_pattern") else {}
    return {"shock_mechanisms": mechanisms, "affected_channels": channels, "market_shock_pattern": pattern}


def _analogue_pool(value: Any, event_date: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ResearchError("historical_analogue_pool must be an object array")
    if len(value) > 50:
        raise ResearchError("historical_analogue_pool supports at most 50 candidates")
    result = []
    keys = set()
    for index, item in enumerate(value):
        context = f"historical_analogue_pool[{index}]"
        try:
            candidate_date = date.fromisoformat(str(item.get("date"))).isoformat()
        except ValueError as exc:
            raise ResearchError(f"{context}.date must be YYYY-MM-DD") from exc
        if candidate_date >= event_date:
            raise ResearchError(f"{context}.date must be before the research event_date")
        event_type = _text(item.get("event_type"), f"{context}.event_type").casefold().replace(" ", "_")
        if event_type not in EVENT_TYPES:
            raise ResearchError(f"{context}.event_type is unsupported")
        features = _event_features(item, context)
        if not features["shock_mechanisms"] or not features["affected_channels"] or not features["market_shock_pattern"]:
            raise ResearchError(f"{context} needs shock_mechanisms, affected_channels, and market_shock_pattern")
        candidate = {
            "date": candidate_date,
            "event": _text(item.get("event"), f"{context}.event"),
            "event_type": event_type,
            **features,
            "similarity": _text(item.get("similarity"), f"{context}.similarity"),
            "difference": _text(item.get("difference"), f"{context}.difference"),
            "source": _source(item.get("source"), context),
        }
        key = (candidate_date, candidate["event"].casefold())
        if key in keys:
            raise ResearchError("historical_analogue_pool contains duplicate events")
        keys.add(key)
        result.append(candidate)
    return result


def _overlap(left: set[str], right: set[str]) -> float:
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def _rank_analogues(current: dict[str, Any], candidates: list[dict[str, Any]], event_type: str) -> dict[str, Any]:
    ranked = []
    for candidate in candidates:
        mechanism_overlap = _overlap(set(current["shock_mechanisms"]), set(candidate["shock_mechanisms"]))
        channel_overlap = _overlap(set(current["affected_channels"]), set(candidate["affected_channels"]))
        current_pattern = current["market_shock_pattern"]
        candidate_pattern = candidate["market_shock_pattern"]
        shared_keys = set(current_pattern) & set(candidate_pattern)
        pattern_union = set(current_pattern) | set(candidate_pattern)
        pattern_overlap = (
            sum(current_pattern[key] == candidate_pattern[key] for key in shared_keys) / len(pattern_union)
            if pattern_union else 0.0
        )
        if mechanism_overlap == 0 or pattern_overlap == 0:
            continue
        type_match = event_type == candidate["event_type"]
        score = round(2.0 * type_match + 3.0 * mechanism_overlap + 2.0 * channel_overlap + 4.0 * pattern_overlap, 6)
        matching_basis = (
            f"사건유형 {'일치' if type_match else '불일치'}, 충격 메커니즘 중복률 {mechanism_overlap:.0%}, "
            f"영향 채널 중복률 {channel_overlap:.0%}, 관측된 시장충격 방향 일치율 {pattern_overlap:.0%}"
        )
        ranked.append((score, candidate["date"], candidate, matching_basis))
    ranked.sort(key=lambda item: (-item[0], item[1], item[2]["event"].casefold()))
    if len(ranked) < 3:
        return {
            "include": False,
            "reason": "특성과 시장충격 방향을 함께 대조할 검증된 과거 후보가 3개 미만입니다.",
            "comparisons": [],
        }
    comparisons = []
    for score, _, candidate, matching_basis in ranked[:5]:
        comparisons.append({
            "date": candidate["date"],
            "event": candidate["event"],
            "matching_basis": matching_basis,
            "similarity": candidate["similarity"],
            "difference": candidate["difference"],
            "score": score,
            "source": candidate["source"],
        })
    return {
        "include": True,
        "reason": "사건 특성과 실제 시장충격 방향을 함께 점수화해 과거 사례를 정렬했습니다.",
        "comparisons": comparisons,
    }


def normalize_research(item: dict[str, Any]) -> dict[str, Any]:
    try:
        event_date = date.fromisoformat(str(item.get("event_date"))).isoformat()
    except ValueError as exc:
        raise ResearchError("research event_date must be YYYY-MM-DD") from exc
    region = str(item.get("region", "")).upper()
    if not re.fullmatch(r"[A-Z]{2,6}", region):
        raise ResearchError("research region must be a 2-6 letter market code")
    overview = item.get("overview") or item.get("decision")
    if not isinstance(overview, dict):
        raise ResearchError("research overview must be an object")
    if overview.get("expected") is not None and not isinstance(overview.get("expected"), bool):
        raise ResearchError("overview.expected must be true, false, or null")
    event_name = _text(item.get("event_name") or item.get("event_family"), "research.event_name")
    event_id = str(item.get("event_id") or "").strip().casefold() or stable_event_id(event_name)
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,95}", event_id):
        raise ResearchError("research.event_id must use 1-96 lowercase letters, numbers, dots, underscores, or hyphens")
    raw_event_type = item.get("event_type")
    event_type = (_text(raw_event_type, "research.event_type").casefold().replace(" ", "_")
                  if raw_event_type is not None else infer_event_type(f"{event_name} {item.get('event_family') or ''}")[0])
    if not event_id:
        raise ResearchError("research.event_id is required when it cannot be derived from event_name")
    if event_type not in EVENT_TYPES:
        raise ResearchError(f"unsupported research event_type: {event_type}")
    research_observed_at = item.get("observed_at")
    if research_observed_at is not None:
        try:
            parsed_research_observed_at = datetime.fromisoformat(str(research_observed_at).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ResearchError("research observed_at must be ISO 8601 with a timezone") from exc
        if parsed_research_observed_at.tzinfo is None:
            raise ResearchError("research observed_at must be ISO 8601 with a timezone")
        research_observed_at = parsed_research_observed_at.isoformat()
    normalized = {
        "region": region,
        "event_id": event_id,
        "event_name": event_name,
        "event_family": str(item.get("event_family") or "").strip().upper().replace(" ", "_") or None,
        "event_type": event_type,
        "event_date": event_date,
        "observed_at": research_observed_at,
        "event_features": _event_features(item.get("event_features")),
        "historical_analogue_pool": _analogue_pool(item.get("historical_analogue_pool"), event_date),
        "overview": {
            "summary": _text(overview.get("summary"), "overview.summary"),
            "expected": overview.get("expected") if isinstance(overview.get("expected"), bool) else None,
            "surprise_assessment": _text(overview.get("surprise_assessment"), "overview.surprise_assessment"),
            "classification": _text(overview.get("classification") or overview.get("event_type"), "overview.classification"),
            "source": _source(overview.get("source"), "overview"),
        },
        "what_changed": _claim_list(item.get("what_changed"), "what_changed"),
        "adapter_details": _claim_list(item.get("adapter_details"), "adapter_details"),
        "market_interpretation": _claim_list(item.get("market_interpretation"), "market_interpretation"),
        "transmission": _transmission(item.get("transmission")),
        "catalysts": _catalysts(item.get("catalysts")),
        "historical_context": _history(item.get("historical_context")),
    }
    if not normalized["historical_context"]["include"] and normalized["historical_analogue_pool"]:
        normalized["historical_context"] = _rank_analogues(
            normalized["event_features"], normalized["historical_analogue_pool"], event_type
        )
    if not normalized["what_changed"]:
        raise ResearchError("research needs at least one what_changed claim")
    if not normalized["market_interpretation"]:
        raise ResearchError("research needs at least one market_interpretation claim")
    if not normalized["transmission"]:
        raise ResearchError("research needs at least one transmission step; use unverified when evidence is unavailable")
    if len(normalized["catalysts"]) < 2:
        raise ResearchError("research needs at least two relevant catalysts")
    if len(normalized["catalysts"]) > 8:
        raise ResearchError("research supports at most eight relevant catalysts")
    catalyst_keys = [(item["date"], item["event"].casefold()) for item in normalized["catalysts"]]
    if len(catalyst_keys) != len(set(catalyst_keys)):
        raise ResearchError("research contains duplicate catalysts")
    if any(item["date"] <= event_date for item in normalized["catalysts"]):
        raise ResearchError("catalysts must be after the research event_date")
    history = normalized["historical_context"]
    if any(item["date"] >= event_date for item in history["comparisons"]):
        raise ResearchError("historical comparisons must be before the research event_date")
    return normalized


def load_research_file(path_text: str) -> list[dict[str, Any]]:
    path = Path(path_text).expanduser()
    if not path.is_file():
        raise ResearchError(f"research file not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise ResearchError(f"invalid research JSON: {exc}") from exc
    items = payload.get("research") if isinstance(payload, dict) else payload
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ResearchError("research file must be an array or contain a research array")
    normalized = [normalize_research(item) for item in items]
    keys = [(item["event_id"], item["event_date"]) for item in normalized]
    if len(keys) != len(set(keys)):
        raise ResearchError("research file contains duplicate event keys")
    return normalized


def select_research(items: list[dict[str, Any]], event: dict[str, Any]) -> dict[str, Any]:
    matches = [item for item in items if item["event_id"] == event["event_id"] and item["event_date"] == event["event_date"]]
    if not matches:
        matches = [item for item in items if item["event_name"].casefold() == event["event_name"].casefold() and item["event_date"] == event["event_date"]]
    if not matches and event.get("event_family"):
        matches = [item for item in items if item.get("event_family") == event.get("event_family") and item["region"] == event["region"] and item["event_date"] == event["event_date"]]
    if len(matches) != 1:
        raise ResearchError(f"research file must contain exactly one matching event; found {len(matches)}")
    return matches[0]
