#!/usr/bin/env python3
"""Deterministic event-window, curve, and threshold calculations."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable

from calendars import TIMEZONE_CLOSES, align_date, window_indices, zone_for_date


DEFAULT_OFFSETS = (-1, 0, 1, 5)


def _change(value: float | None, anchor: float | None, rates: bool, unit: str = "pct") -> float | None:
    if value is None or anchor is None:
        return None
    if rates:
        scale = 1.0 if unit.casefold() == "bp" else 100.0
        return round((value - anchor) * scale, 10)
    if anchor == 0:
        return None
    return round((value / anchor - 1.0) * 100.0, 10)


def analyze_series(series: dict[str, Any], event_date: str, alignment: str = "next",
                   offsets: Iterable[int] = DEFAULT_OFFSETS, alignment_date: str | None = None) -> dict[str, Any]:
    observations = series["observations"]
    dates = [row["date"] for row in observations]
    target_date = alignment_date or event_date
    aligned, anchor_index = align_date(target_date, dates, alignment)
    result = {
        "symbol": series["symbol"],
        "region": series.get("region"),
        "asset_class": series["asset_class"],
        "unit": series["unit"],
        "event_date": event_date,
        "alignment_anchor_date": target_date,
        "aligned_event_date": aligned,
        "alignment": alignment,
        "alignment_basis": series.get("alignment_basis", "region_calendar_proxy"),
        "observation_provenance": {
            "observation_timezone": series.get("observation_timezone"),
            "observation_time": series.get("observation_time"),
            "market_timezone": series.get("market_timezone"),
            "price_type": series.get("price_type"),
        },
        "source": series["source"],
        "latest_observation_date": dates[-1] if dates else None,
        "window": {},
        "warnings": [],
    }
    if anchor_index is None:
        result["failure"] = "no_observation_for_alignment"
        return result
    positions = window_indices(anchor_index, len(observations), offsets)
    rates = series["asset_class"].casefold() in {"rates", "policy", "spread", "credit"}
    base_index = positions.get(-1)
    base = observations[base_index]["value"] if base_index is not None else None
    for offset, index in positions.items():
        key = "d0" if offset == 0 else f"d{offset:+d}"
        row = observations[index] if index is not None else None
        result["window"][key] = {
            "date": row["date"] if row else None,
            "value": row["value"] if row else None,
            "change_from_d_minus_1": _change(row["value"] if row else None, base, rates, series["unit"]),
            "change_unit": "bp" if rates else "pct",
        }
        if row is None:
            warning = f"pending_{key}" if offset > 0 and anchor_index + offset >= len(observations) else f"missing_{key}"
            result["warnings"].append(warning)
    if base is None:
        result["warnings"].append("changes_unavailable_without_d_minus_1")
    if not series.get("observation_timezone") or not series.get("observation_time"):
        result["warnings"].append("observation_time_basis_missing")
    return result


def analyze_intraday_reaction(series: dict[str, Any], event: dict[str, Any]) -> dict[str, Any] | None:
    """Measure source-stamped pre-event, +1h, and first-session end observations."""
    rows = series.get("intraday_observations") or []
    if not rows:
        return None
    if not event.get("event_time_local") or not event.get("event_timezone"):
        return {"symbol": series["symbol"], "status": "unavailable", "reason": "exact_event_timestamp_required"}
    event_day = date.fromisoformat(event["event_date"])
    event_local_time = time.fromisoformat(event["event_time_local"])
    event_instant = datetime.combine(
        event_day, event_local_time, zone_for_date(event["event_timezone"], event_day)
    ).astimezone(timezone.utc)
    normalized = []
    for row in rows:
        instant = datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00"))
        normalized.append((instant.astimezone(timezone.utc), instant, float(row["value"])))
    normalized.sort(key=lambda item: item[0])
    before = [row for row in normalized if row[0] < event_instant]
    after = [row for row in normalized if row[0] >= event_instant]
    one_hour_after = [row for row in normalized if row[0] >= event_instant + timedelta(hours=1)]
    market_timezone = series.get("market_timezone") or event["event_timezone"]
    session_end = None
    close_confirmed = False
    if after:
        first_market_date = after[0][1].astimezone(zone_for_date(market_timezone, after[0][1].date())).date()
        session_rows = [row for row in after if row[1].astimezone(zone_for_date(market_timezone, row[1].date())).date() == first_market_date]
        if session_rows:
            session_end = session_rows[-1]
            close_time = TIMEZONE_CLOSES.get(market_timezone)
            close_confirmed = bool(close_time and session_end[1].astimezone(zone_for_date(market_timezone, first_market_date)).time().replace(tzinfo=None) == close_time)
    rates = series["asset_class"].casefold() in {"rates", "policy", "spread", "credit"}
    unit = series["unit"]
    anchor = before[-1] if before else None

    def pack(row: tuple[datetime, datetime, float] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            "timestamp": row[1].isoformat(),
            "value": row[2],
            "change_from_pre_event": _change(row[2], anchor[2] if anchor else None, rates, unit),
            "change_unit": "bp" if rates else "pct",
        }

    return {
        "symbol": series["symbol"],
        "status": "ok",
        "pre_event": pack(anchor),
        "plus_1h": pack(one_hour_after[0] if one_hour_after else None),
        "session_end": pack(session_end),
        "session_end_label": "market_close" if close_confirmed else "last_supplied_bar_not_confirmed_close",
        "warnings": [name for name, missing in (
            ("intraday_missing_pre_event", anchor is None),
            ("intraday_missing_plus_1h", not one_hour_after),
            ("intraday_session_close_unconfirmed", session_end is not None and not close_confirmed),
        ) if missing],
        "source": series["source"],
    }


def classify_curve(short_change_bp: float | None, long_change_bp: float | None) -> dict[str, Any]:
    if short_change_bp is None or long_change_bp is None:
        return {"classification": None, "spread_change_bp": None}
    spread = round(long_change_bp - short_change_bp, 10)
    if short_change_bp > 0 and long_change_bp > 0:
        direction = "Bear"
    elif short_change_bp < 0 and long_change_bp < 0:
        direction = "Bull"
    else:
        return {"classification": "Mixed", "spread_change_bp": spread}
    shape = "Steepening" if spread > 0 else "Flattening" if spread < 0 else "Parallel"
    return {"classification": f"{direction} {shape}", "spread_change_bp": spread}


def threshold_events(series: dict[str, Any], metric: str, direction: str, threshold: float) -> list[dict[str, Any]]:
    if direction not in {"above", "below"}:
        raise ValueError("direction must be above or below")
    rates = metric == "bp_change"
    if metric not in {"bp_change", "pct_change"}:
        raise ValueError("metric must be bp_change or pct_change")
    is_rates = series["asset_class"].casefold() in {"rates", "policy", "spread", "credit"}
    if rates and not is_rates:
        raise ValueError("bp_change requires a rates, policy, spread, or credit series")
    rows = series["observations"]
    matches = []
    for previous, current in zip(rows, rows[1:]):
        value = _change(current["value"], previous["value"], rates, series["unit"])
        if value is None:
            continue
        matched = value >= threshold if direction == "above" else value <= threshold
        if matched:
            matches.append({"date": current["date"], "metric": metric, "value": value, "threshold": threshold})
    return matches
