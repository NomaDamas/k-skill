#!/usr/bin/env -S uv run --locked --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl==3.1.5"]
# ///
"""Read-only Korail integrated railway timetable lookup."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import ktx_backend


def source_info() -> dict[str, Any]:
    return {
        "mode": "plan",
        "transport": "Korail integrated timetable",
        "operator": "한국철도공사",
        "endpoint": ktx_backend.BOARD_URL,
        "authentication": "none",
        "mutation": "none; timetable lookup only",
        "booking_url": ktx_backend.BOOKING_URL,
    }


def search(
    *,
    dep: str,
    arr: str,
    date: str,
    earliest: str,
    latest: str,
    limit: int,
) -> dict[str, Any]:
    result = ktx_backend.search_public_timetable(
        dep=dep,
        arr=arr,
        date=date,
        earliest=earliest,
        latest=latest,
        limit=limit,
    )
    return {
        **result,
        "schedule_note": "코레일 통합 공개 운행계획 기준이며 실시간 운휴·지연·잔여석 정보가 아닙니다.",
        "source": {**result["source"], "transport": "Korail integrated timetable"},
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Korail integrated read-only railway timetable lookup",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    search_parser = commands.add_parser("search", help="search railway timetables")
    search_parser.add_argument("--dep", required=True)
    search_parser.add_argument("--arr", required=True)
    search_parser.add_argument("--date", required=True, help="YYYYMMDD")
    search_parser.add_argument("--time", default="0000", help="earliest departure, HHMM")
    search_parser.add_argument("--time-limit", default="2359", help="latest departure, HHMM")
    search_parser.add_argument("--limit", type=int, default=10)
    commands.add_parser("source", help="show read-only timetable sources")
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
        result = search(
            dep=args.dep,
            arr=args.arr,
            date=args.date,
            earliest=args.time,
            latest=args.time_limit,
            limit=args.limit,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (RuntimeError, ValueError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    sys.exit(main())
