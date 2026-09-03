#!/usr/bin/env -S uv run --locked --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["SRTrain==2.6.7"]
# ///
"""Live, anonymous, read-only SRT timetable lookup through SRTrain."""

from __future__ import annotations

import argparse
import json
import re
import sys
from contextlib import redirect_stdout
from datetime import date as calendar_date
from datetime import time
from typing import Any

from requests import RequestException
from SRT import SRT
from SRT.constants import API_ENDPOINTS, STATION_CODE
from SRT.errors import SRTError, SRTNetFunnelError
from SRT.netfunnel import NetFunnelHelper

BOOKING_URL = "https://etk.srail.kr/hpg/hra/01/selectScheduleList.do?pageId=TK0101010000"
NETFUNNEL_URL = "https://nf.letskorail.com/ts.wseq"


def build_client() -> SRT:
    NetFunnelHelper.NETFUNNEL_URL = NETFUNNEL_URL
    return SRT("", "", auto_login=False)


def source_info() -> dict[str, str]:
    return {
        "mode": "live",
        "transport": "SRTrain",
        "operator": "주식회사 에스알",
        "endpoint": API_ENDPOINTS["search_schedule"],
        "queue_endpoint": NETFUNNEL_URL,
        "authentication": "anonymous",
        "mutation": "none; timetable search only",
        "booking_url": BOOKING_URL,
    }


def format_time(value: str) -> str:
    return f"{value[:2]}:{value[2:4]}"


def normalize_station(value: str) -> str:
    """Accept common "...역" input for a canonical SRT station name."""
    name = value.strip()
    if name in STATION_CODE:
        return name
    if name.endswith("역") and name[:-1] in STATION_CODE:
        return name[:-1]
    return name


def normalize_train(train: Any) -> dict[str, Any]:
    return {
        "train_no": str(train.train_number),
        "train_type": str(train.train_name),
        "dep": str(train.dep_station_name),
        "arr": str(train.arr_station_name),
        "dep_date": str(train.dep_date),
        "dep_time": format_time(str(train.dep_time)),
        "arr_time": format_time(str(train.arr_time)),
        "general_seat_available": bool(train.general_seat_available()),
        "special_seat_available": bool(train.special_seat_available()),
    }


def search_live_timetable(
    *,
    dep: str,
    arr: str,
    date: str,
    earliest: str,
    latest: str,
    limit: int,
) -> dict[str, Any]:
    validate_date(date)
    start = validate_time(earliest)
    end = validate_time(latest)
    if start > end:
        raise ValueError("--time must not be later than --time-limit")
    client = build_client()
    with redirect_stdout(sys.stderr):
        trains = client.search_train(
            dep=normalize_station(dep),
            arr=normalize_station(arr),
            date=date,
            time=start,
            time_limit=end,
            available_only=False,
        )
    return {
        "count": min(len(trains), limit),
        "trains": [normalize_train(train) for train in trains[:limit]],
        "date": date,
        "source": source_info(),
        "schedule_note": "실시간 시간표·좌석 가능 여부 조회이며 예약·좌석 선점은 실행하지 않습니다.",
        "booking_url": BOOKING_URL,
    }


def validate_date(value: str) -> str:
    if not re.fullmatch(r"\d{8}", value):
        raise ValueError("date must use YYYYMMDD")
    try:
        calendar_date(int(value[:4]), int(value[4:6]), int(value[6:]))
    except ValueError as exc:
        raise ValueError("date must use a valid YYYYMMDD value") from exc
    return value


def validate_time(value: str) -> str:
    if not re.fullmatch(r"\d{4}", value):
        raise ValueError("time must use HHMM")
    try:
        time.fromisoformat(f"{value[:2]}:{value[2:]}")
    except ValueError as exc:
        raise ValueError("time must use a valid HHMM value") from exc
    return value + "00"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SRT live timetable lookup through SRTrain (read-only)")
    commands = parser.add_subparsers(dest="command", required=True)
    search = commands.add_parser("search", help="query the current SRT timetable")
    search.add_argument("--dep", required=True)
    search.add_argument("--arr", required=True)
    search.add_argument("--date", required=True, help="YYYYMMDD")
    search.add_argument("--time", default="0000", help="earliest departure, HHMM")
    search.add_argument("--time-limit", default="2359", help="latest departure, HHMM")
    search.add_argument("--limit", type=int, default=10)
    commands.add_parser("source", help="show the read-only live query endpoint")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "source":
            print(json.dumps(source_info(), ensure_ascii=False, indent=2))
            return 0
        if args.limit < 1 or args.limit > 50:
            raise ValueError("--limit must be between 1 and 50")
        result = search_live_timetable(
            dep=args.dep,
            arr=args.arr,
            date=args.date,
            earliest=args.time,
            latest=args.time_limit,
            limit=args.limit,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (SRTNetFunnelError, RequestException):
        parser.error(f"SRT timetable lookup unavailable; use the official page: {BOOKING_URL}")
        return 2
    except (SRTError, ValueError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    sys.exit(main())
