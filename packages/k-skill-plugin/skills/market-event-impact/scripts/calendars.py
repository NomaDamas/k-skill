#!/usr/bin/env python3
"""Trading-calendar alignment helpers based on actual observations."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone, tzinfo
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


MARKET_CLOSES = {
    "KR": ("Asia/Seoul", time(15, 30)),
    "JP": ("Asia/Tokyo", time(15, 0)),
    "CN": ("Asia/Shanghai", time(15, 0)),
    "EU": ("Europe/Frankfurt", time(17, 30)),
    "UK": ("Europe/London", time(16, 30)),
    "US": ("America/New_York", time(16, 0)),
}
SESSION_ORDER = {"JP": 0, "KR": 0, "CN": 0, "EU": 1, "UK": 1, "US": 2}
FALLBACK_ZONES = {"Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Europe/Frankfurt", "Europe/London", "America/New_York"}
TIMEZONE_CLOSES = {zone: close for zone, close in MARKET_CLOSES.values()}


def _nth_weekday(year: int, month: int, weekday: int, occurrence: int) -> date:
    current = date(year, month, 1)
    shift = (weekday - current.weekday()) % 7
    return date(year, month, 1 + shift + 7 * (occurrence - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    current = next_month - timedelta(days=1)
    return current - timedelta(days=(current.weekday() - weekday) % 7)


def zone_for_date(name: str, day: date) -> tzinfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if name in {"Asia/Seoul", "Asia/Tokyo"}:
            return timezone(timedelta(hours=9), name)
        if name == "Asia/Shanghai":
            return timezone(timedelta(hours=8), name)
        if name == "America/New_York":
            dst = _nth_weekday(day.year, 3, 6, 2) <= day < _nth_weekday(day.year, 11, 6, 1)
            return timezone(timedelta(hours=-4 if dst else -5), name)
        if name == "Europe/Frankfurt":
            dst = _last_weekday(day.year, 3, 6) <= day < _last_weekday(day.year, 10, 6)
            return timezone(timedelta(hours=2 if dst else 1), name)
        if name == "Europe/London":
            dst = _last_weekday(day.year, 3, 6) <= day < _last_weekday(day.year, 10, 6)
            return timezone(timedelta(hours=1 if dst else 0), name)
        raise


def valid_timezone(name: str, day: date) -> bool:
    try:
        zone_for_date(name, day)
        return True
    except ZoneInfoNotFoundError:
        return False


def iso_date(value: str) -> str:
    return date.fromisoformat(value).isoformat()


def sorted_unique_dates(values: Iterable[str]) -> list[str]:
    return sorted({iso_date(value) for value in values})


def align_date(event_date: str, observation_dates: Iterable[str], mode: str = "next") -> tuple[str | None, int | None]:
    target = iso_date(event_date)
    dates = sorted_unique_dates(observation_dates)
    if mode not in {"same", "next", "next_strict", "previous"}:
        raise ValueError("alignment must be same, next, next_strict, or previous")
    if mode == "same":
        return (target, dates.index(target)) if target in dates else (None, None)
    if mode == "next":
        for index, observed in enumerate(dates):
            if observed >= target:
                return observed, index
        return None, None
    if mode == "next_strict":
        for index, observed in enumerate(dates):
            if observed > target:
                return observed, index
        return None, None
    for reverse_index, observed in enumerate(reversed(dates)):
        if observed <= target:
            index = len(dates) - reverse_index - 1
            return observed, index
    return None, None


def window_indices(anchor: int, size: int, offsets: Iterable[int]) -> dict[int, int | None]:
    return {offset: anchor + offset if 0 <= anchor + offset < size else None for offset in offsets}


def market_alignment_for_event(event: dict[str, Any], target_region: str | None) -> str:
    """Choose same-date eligibility from event time versus target market close."""
    event_region = str(event.get("region") or "").upper()
    target = str(target_region or "").upper()
    if target in {"", "GLOBAL"}:
        return "next"
    event_time = event.get("event_time_local")
    event_timezone = event.get("event_timezone")
    if event_time and event_timezone:
        try:
            parsed_time = time.fromisoformat(str(event_time))
            if parsed_time.tzinfo is not None:
                raise ValueError("event_time_local must not contain a timezone offset")
            event_day = date.fromisoformat(str(event["event_date"]))
            event_instant = datetime.combine(event_day, parsed_time, zone_for_date(str(event_timezone), event_day)).astimezone(timezone.utc)
            target_zone, target_close = MARKET_CLOSES[target]
            target_local_date = event_instant.astimezone(zone_for_date(target_zone, event_day)).date()
            target_close_zone = zone_for_date(target_zone, target_local_date)
            close_instant = datetime.combine(target_local_date, target_close, target_close_zone).astimezone(timezone.utc)
            return "next" if event_instant <= close_instant else "next_strict"
        except (KeyError, ValueError, ZoneInfoNotFoundError):
            pass
    if target == event_region:
        return "next"
    if event_region not in MARKET_CLOSES or target not in MARKET_CLOSES:
        return "next_strict"
    return "next" if SESSION_ORDER[event_region] < SESSION_ORDER[target] else "next_strict"


def market_alignment_for_series(event: dict[str, Any], series: dict[str, Any]) -> tuple[str, str, str]:
    """Return alignment mode, basis, and target-local date for a series."""
    event_time = event.get("event_time_local")
    event_timezone = event.get("event_timezone")
    observation_time = series.get("observation_time")
    observation_timezone = series.get("observation_timezone")
    if event_time and event_timezone:
        try:
            event_day = date.fromisoformat(str(event["event_date"]))
            parsed_event_time = time.fromisoformat(str(event_time))
            event_instant = datetime.combine(
                event_day, parsed_event_time, zone_for_date(str(event_timezone), event_day)
            ).astimezone(timezone.utc)
            if observation_time and observation_timezone:
                observation_zone = zone_for_date(str(observation_timezone), event_instant.date())
                local_event = event_instant.astimezone(observation_zone)
                local_date = local_event.date()
                observation_instant = datetime.combine(
                    local_date, time.fromisoformat(str(observation_time)), observation_zone
                ).astimezone(timezone.utc)
                mode = "next" if event_instant < observation_instant else "next_strict"
                return mode, "source_observation_time", local_date.isoformat()

            market_timezone = series.get("market_timezone")
            if market_timezone:
                market_zone = zone_for_date(str(market_timezone), event_instant.date())
                local_event = event_instant.astimezone(market_zone)
                local_date = local_event.date()
                close = TIMEZONE_CLOSES.get(str(market_timezone))
                if close:
                    close_instant = datetime.combine(local_date, close, market_zone).astimezone(timezone.utc)
                    mode = "next" if event_instant <= close_instant else "next_strict"
                    return mode, "market_close_proxy", local_date.isoformat()
        except (KeyError, ValueError, ZoneInfoNotFoundError):
            pass

        target_region = str(series.get("region") or "").upper()
        if target_region in MARKET_CLOSES:
            try:
                market_timezone, close = MARKET_CLOSES[target_region]
                market_zone = zone_for_date(market_timezone, event_instant.date())
                local_event = event_instant.astimezone(market_zone)
                local_date = local_event.date()
                close_instant = datetime.combine(local_date, close, market_zone).astimezone(timezone.utc)
                mode = "next" if event_instant <= close_instant else "next_strict"
                return mode, "region_market_close_proxy", local_date.isoformat()
            except (ValueError, ZoneInfoNotFoundError):
                pass

    alignment = market_alignment_for_event(event, series.get("region"))
    return alignment, "region_calendar_proxy", str(event["event_date"])
