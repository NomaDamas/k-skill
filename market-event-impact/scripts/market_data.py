#!/usr/bin/env python3
"""Strict JSON/CSV market-series loader with source metadata."""

from __future__ import annotations

import csv
import json
import math
import re
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from calendars import valid_timezone, zone_for_date


class SeriesError(ValueError):
    pass


def _finite(value: Any) -> float:
    if isinstance(value, bool):
        raise SeriesError(f"not a number: {value!r}")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise SeriesError(f"not a number: {value!r}") from exc
    if not math.isfinite(number):
        raise SeriesError(f"not finite: {value!r}")
    return number


def _normalize_series(item: dict[str, Any]) -> dict[str, Any]:
    symbol = str(item.get("symbol") or "").strip()
    if not symbol:
        raise SeriesError("series symbol is required")
    region = str(item.get("region") or "").strip().upper() or None
    if region is not None and not re.fullmatch(r"[A-Z]{2,6}", region):
        raise SeriesError(f"{symbol}: region must be a 2-6 letter market code")
    asset_class = str(item.get("asset_class") or "").strip().casefold()
    if asset_class not in {"rates", "policy", "spread", "credit", "fx", "equity", "commodity", "volatility", "price"}:
        raise SeriesError(f"{symbol}: unsupported asset_class {asset_class!r}")
    unit = str(item.get("unit") or "").strip()
    if not unit:
        raise SeriesError(f"{symbol}: unit is required")
    unit = unit.casefold()
    if asset_class in {"rates", "policy", "spread", "credit"} and unit not in {"pct", "bp"}:
        raise SeriesError(f"{symbol}: rates, policy, spread, and credit unit must be pct or bp")
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    if not str(source.get("name") or "").strip() or not str(source.get("url") or "").strip():
        raise SeriesError(f"{symbol}: source.name and source.url are required")
    parsed_url = urlparse(str(source["url"]))
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise SeriesError(f"{symbol}: source.url must be an http(s) URL")
    observations = item.get("observations")
    if not isinstance(observations, list) or not observations:
        raise SeriesError(f"{symbol}: observations must be a non-empty array")
    seen: set[str] = set()
    clean = []
    for row in observations:
        if not isinstance(row, dict) or "date" not in row or "value" not in row:
            raise SeriesError(f"{symbol}: each observation needs date and value")
        try:
            observed = date.fromisoformat(str(row["date"])).isoformat()
        except ValueError as exc:
            raise SeriesError(f"{symbol}: invalid ISO date {row['date']!r}") from exc
        if observed in seen:
            raise SeriesError(f"{symbol}: duplicate date {observed}")
        seen.add(observed)
        clean.append({"date": observed, "value": _finite(row["value"])})
    clean.sort(key=lambda row: row["date"])
    observation_timezone = str(item.get("observation_timezone") or "").strip() or None
    observation_time = str(item.get("observation_time") or "").strip() or None
    market_timezone = str(item.get("market_timezone") or "").strip() or None
    if bool(observation_timezone) != bool(observation_time):
        raise SeriesError(f"{symbol}: observation_timezone and observation_time must be provided together")
    for field, timezone_name in (("observation_timezone", observation_timezone), ("market_timezone", market_timezone)):
        if timezone_name and not valid_timezone(timezone_name, date.fromisoformat(clean[0]["date"])):
            raise SeriesError(f"{symbol}: {field} must be a valid IANA timezone")
    if observation_time:
        try:
            parsed_observation_time = time.fromisoformat(observation_time)
            if parsed_observation_time.tzinfo is not None:
                raise ValueError
            observation_time = parsed_observation_time.isoformat(timespec="minutes" if parsed_observation_time.second == 0 else "seconds")
        except ValueError as exc:
            raise SeriesError(f"{symbol}: observation_time must be local HH:MM[:SS] without an offset") from exc
    price_type = str(item.get("price_type") or "").strip() or None
    if price_type and len(price_type) > 64:
        raise SeriesError(f"{symbol}: price_type must be 64 characters or fewer")
    raw_intraday = item.get("intraday_observations") or []
    if not isinstance(raw_intraday, list):
        raise SeriesError(f"{symbol}: intraday_observations must be an array")
    intraday = []
    intraday_seen: set[str] = set()
    for index, row in enumerate(raw_intraday):
        if not isinstance(row, dict) or "timestamp" not in row or "value" not in row:
            raise SeriesError(f"{symbol}: intraday_observations[{index}] needs timestamp and value")
        try:
            timestamp = datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00"))
        except ValueError as exc:
            raise SeriesError(f"{symbol}: invalid intraday timestamp {row.get('timestamp')!r}") from exc
        if timestamp.tzinfo is None:
            raise SeriesError(f"{symbol}: intraday timestamps must include a timezone offset")
        utc_key = timestamp.astimezone(timezone.utc).isoformat()
        if utc_key in intraday_seen:
            raise SeriesError(f"{symbol}: duplicate intraday timestamp {timestamp.isoformat()}")
        intraday_seen.add(utc_key)
        intraday.append({"timestamp": timestamp.isoformat(), "value": _finite(row["value"]), "_utc": utc_key})
    intraday.sort(key=lambda row: row["_utc"])
    for row in intraday:
        row.pop("_utc")
    roles = item.get("roles") or []
    if not isinstance(roles, list) or not all(isinstance(role, str) and role.strip() for role in roles):
        raise SeriesError(f"{symbol}: roles must be non-empty strings")
    priority = item.get("selection_priority", 0)
    if isinstance(priority, bool) or not isinstance(priority, int) or not -100 <= priority <= 100:
        raise SeriesError(f"{symbol}: selection_priority must be an integer from -100 to 100")
    return {
        "symbol": symbol,
        "region": region,
        "asset_class": asset_class,
        "unit": unit,
        "source": {"name": str(source.get("name")).strip(), "url": str(source.get("url")).strip()},
        "observation_timezone": observation_timezone,
        "observation_time": observation_time,
        "market_timezone": market_timezone,
        "price_type": price_type,
        "intraday_observations": intraday,
        "roles": list(dict.fromkeys(role.strip().casefold() for role in roles)),
        "selection_priority": priority,
        "observations": clean,
    }


def _unique_symbols(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not items:
        raise SeriesError("series input must contain at least one series")
    symbols = [item["symbol"].casefold() for item in items]
    duplicates = sorted({symbol for symbol in symbols if symbols.count(symbol) > 1})
    if duplicates:
        raise SeriesError(f"duplicate symbols: {', '.join(duplicates)}")
    return items


def load_series(path_text: str) -> list[dict[str, Any]]:
    path = Path(path_text).expanduser()
    if not path.is_file():
        raise SeriesError(f"series file not found: {path}")
    if path.suffix.casefold() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        items = payload.get("series") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            raise SeriesError("JSON must be an array or contain a series array")
        return _unique_symbols([_normalize_series(item) for item in items])
    if path.suffix.casefold() == ".csv":
        groups: dict[str, dict[str, Any]] = {}
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                symbol = (row.get("symbol") or "").strip()
                item = groups.setdefault(symbol, {
                    "symbol": symbol,
                    "region": row.get("region") or None,
                    "asset_class": row.get("asset_class") or "price",
                    "unit": row.get("unit") or "index",
                    "source": {"name": row.get("source_name"), "url": row.get("source_url")},
                    "observation_timezone": row.get("observation_timezone") or None,
                    "observation_time": row.get("observation_time") or None,
                    "market_timezone": row.get("market_timezone") or None,
                    "price_type": row.get("price_type") or None,
                    "observations": [],
                })
                item["observations"].append({"date": row.get("date"), "value": row.get("value")})
        return _unique_symbols([_normalize_series(item) for item in groups.values()])
    raise SeriesError("series input must be .json or .csv")


def series_as_of(item: dict[str, Any], observed_at: str) -> dict[str, Any]:
    """Exclude observations that were not yet observable at the analysis cutoff."""
    cutoff = datetime.fromisoformat(observed_at.replace("Z", "+00:00")).astimezone(timezone.utc)
    zone_name = item.get("observation_timezone") or item.get("market_timezone")
    zone = zone_for_date(zone_name, cutoff.date()) if zone_name else timezone.utc
    local_cutoff_date = cutoff.astimezone(zone).date()
    observation_time = item.get("observation_time")
    retained = []
    for row in item["observations"]:
        row_date = date.fromisoformat(row["date"])
        if observation_time and item.get("observation_timezone"):
            observed = datetime.combine(
                row_date, time.fromisoformat(observation_time),
                zone_for_date(item["observation_timezone"], row_date),
            ).astimezone(timezone.utc)
            available = observed <= cutoff
        else:
            # A daily date without a verified clock cannot establish same-day availability.
            available = row_date < local_cutoff_date
        if available:
            retained.append(row)
    intraday = [row for row in item.get("intraday_observations", [])
                if datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")).astimezone(timezone.utc) <= cutoff]
    return {**item, "observations": retained, "intraday_observations": intraday,
            "asof_excluded_observations": len(item["observations"]) - len(retained),
            "original_first_observation_date": item["observations"][0]["date"]}
