#!/usr/bin/env python3
"""Single-entrypoint CLI for the seoul-bike skill.

Subcommands:
  nearby --lat LAT --lon LON   — find realtime Seoul Bike stations near coordinates
  search KEYWORD               — search station names in realtime availability page(s)
  realtime                     — fetch raw realtime station availability
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

for _stream in (sys.stdout, sys.stderr):
    reconfigure = getattr(_stream, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass

TIMEOUT_SEC = 15
PROXY_BASE_URL_NAME = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"


def get_proxy_base_url() -> str:
    value = os.environ.get(PROXY_BASE_URL_NAME)
    if value and value.strip() and value.strip() != "replace-me":
        return value.strip().rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def fetch_json(path: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    url = f"{get_proxy_base_url()}{path}?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "k-skill/seoul-bike"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def _to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def normalize_realtime_row(row: dict[str, Any]) -> dict[str, Any]:
    rack_total = _to_int(row.get("rackTotCnt") or row.get("rack_total_count"))
    available = _to_int(row.get("parkingBikeTotCnt") or row.get("available_bikes"))
    empty_docks = None if rack_total is None or available is None else max(0, rack_total - available)
    return {
        "station_id": row.get("stationId") or row.get("station_id"),
        "station_name": row.get("stationName") or row.get("station_name"),
        "rack_total_count": rack_total,
        "available_bikes": available,
        "empty_docks": empty_docks,
        "shared_percent": _to_int(row.get("shared") or row.get("shared_percent")),
        "latitude": row.get("stationLatitude") or row.get("latitude"),
        "longitude": row.get("stationLongitude") or row.get("longitude"),
    }


def realtime_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    status = payload.get("rentBikeStatus") or {}
    rows = status.get("row") or []
    return rows if isinstance(rows, list) else []


def filter_realtime_rows(payload: dict[str, Any], keyword: str, limit: int) -> list[dict[str, Any]]:
    normalized_keyword = keyword.strip().lower()
    matches: list[dict[str, Any]] = []
    for row in realtime_rows(payload):
        station_name = str(row.get("stationName") or row.get("station_name") or "")
        if normalized_keyword in station_name.lower():
            matches.append(normalize_realtime_row(row))
            if len(matches) >= limit:
                break
    return matches


def format_station(item: dict[str, Any]) -> str:
    distance = item.get("distance_m")
    distance_text = f", 거리 {distance}m" if distance is not None else ""
    bikes = item.get("available_bikes")
    docks = item.get("empty_docks")
    bikes_text = "알 수 없음" if bikes is None else f"{bikes}대"
    docks_text = "알 수 없음" if docks is None else f"{docks}개"
    return f"- {item.get('station_name')}: 대여 가능 {bikes_text}, 빈 거치대 {docks_text}{distance_text}"


def format_nearby(payload: dict[str, Any]) -> list[str]:
    query = payload.get("query") or {}
    lines = [
        f"따릉이 주변 대여소 {payload.get('count', 0)}곳",
        f"기준 좌표: {query.get('latitude')}, {query.get('longitude')} / 반경 {query.get('radius_m')}m",
    ]
    for item in payload.get("items") or []:
        lines.append(format_station(item))
    requested_at = (payload.get("proxy") or {}).get("requested_at")
    if requested_at:
        lines.append(f"조회 시각: {requested_at}")
    return lines


def cmd_nearby(args: argparse.Namespace) -> int:
    payload = fetch_json(
        "/v1/seoul-bike/nearby",
        {"lat": args.lat, "lon": args.lon, "radius_m": args.radius_m, "limit": args.limit},
    )
    if args.json:
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    else:
        print("\n".join(format_nearby(payload)))
    return 0


def fetch_realtime_payload(start_index: int = 1, end_index: int = 1000) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    current_start = start_index
    page_size = max(1, end_index - start_index + 1)
    requested_at = None

    while True:
        current_end = current_start + page_size - 1
        payload = fetch_json(
            "/v1/seoul-bike/realtime",
            {"startIndex": current_start, "endIndex": current_end},
        )
        if requested_at is None:
            requested_at = (payload.get("proxy") or {}).get("requested_at")
        page_rows = realtime_rows(payload)
        rows.extend(page_rows)

        total_count = _to_int((payload.get("rentBikeStatus") or {}).get("list_total_count"))
        if total_count is None or current_end >= total_count or not page_rows:
            break
        current_start = current_end + 1

    return {
        "rentBikeStatus": {"row": rows},
        "proxy": {"requested_at": requested_at},
    }


def fetch_realtime_pages(start_index: int = 1, end_index: int = 1000) -> list[dict[str, Any]]:
    return realtime_rows(fetch_realtime_payload(start_index, end_index))


def cmd_search(args: argparse.Namespace) -> int:
    payload = fetch_realtime_payload(args.start_index, args.end_index)
    matches = filter_realtime_rows(payload, args.keyword, args.limit)
    if args.json:
        json.dump({"keyword": args.keyword, "count": len(matches), "items": matches, "proxy": payload.get("proxy")}, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    else:
        if not matches:
            print(f"'{args.keyword}'와 일치하는 따릉이 대여소가 없습니다.", file=sys.stderr)
            return 1
        print(f"따릉이 대여소 검색: {args.keyword}")
        for item in matches:
            print(format_station(item))
        requested_at = (payload.get("proxy") or {}).get("requested_at")
        if requested_at:
            print(f"조회 시각: {requested_at}")
    return 0


def cmd_realtime(args: argparse.Namespace) -> int:
    payload = fetch_json(
        "/v1/seoul-bike/realtime",
        {"startIndex": args.start_index, "endIndex": args.end_index},
    )
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="서울 따릉이 실시간 대여소 조회")
    sub = parser.add_subparsers(dest="command", required=True)

    nearby = sub.add_parser("nearby", help="좌표 주변 대여소 조회")
    nearby.add_argument("--lat", required=True, type=float)
    nearby.add_argument("--lon", required=True, type=float)
    nearby.add_argument("--radius-m", type=int, default=500)
    nearby.add_argument("--limit", type=int, default=10)
    nearby.add_argument("--json", action="store_true")
    nearby.set_defaults(func=cmd_nearby)

    search = sub.add_parser("search", help="실시간 대여소 이름 검색")
    search.add_argument("keyword")
    search.add_argument("--start-index", type=int, default=1)
    search.add_argument("--end-index", type=int, default=1000, help="page size end index for the first realtime page; search continues through all pages")
    search.add_argument("--limit", type=int, default=10)
    search.add_argument("--json", action="store_true")
    search.set_defaults(func=cmd_search)

    realtime = sub.add_parser("realtime", help="실시간 대여소 원문 JSON 조회")
    realtime.add_argument("--start-index", type=int, default=1)
    realtime.add_argument("--end-index", type=int, default=1000)
    realtime.set_defaults(func=cmd_realtime)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except urllib.error.HTTPError as exc:
        print(f"API HTTP 오류: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"API 연결 실패: {exc.reason}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"API 응답 JSON 파싱 실패: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
