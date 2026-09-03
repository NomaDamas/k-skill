#!/usr/bin/env -S uv run --locked --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl==3.1.5", "SRTrain==2.6.7"]
# ///
"""Unified read-only KTX and SRT timetable lookup."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Callable

import ktx_backend
import srt_backend

OPERATORS = ("ktx", "srt", "both")
Backend = Any


def load_backend(operator: str) -> Backend:
    if operator == "ktx":
        return ktx_backend
    if operator == "srt":
        return srt_backend
    raise ValueError(f"unsupported operator: {operator}")


def source_for_operator(operator: str) -> dict[str, Any]:
    if operator == "srt":
        return srt_backend.source_info()
    if operator == "ktx":
        return {
            "mode": "plan",
            "transport": "Korail public XLSX",
            "operator": "한국철도공사",
            "endpoint": ktx_backend.BOARD_URL,
            "authentication": "none",
            "mutation": "none; timetable lookup only",
            "booking_url": ktx_backend.BOOKING_URL,
        }
    raise ValueError(f"unsupported operator: {operator}")


def source_info(operator: str) -> dict[str, Any]:
    selected = ("ktx", "srt") if operator == "both" else (operator,)
    sources = [source_for_operator(name) for name in selected]
    return {"operators": list(selected), "sources": sources}


def search_operator(
    *,
    operator: str,
    dep: str,
    arr: str,
    date: str,
    earliest: str,
    latest: str,
    limit: int,
) -> dict[str, Any]:
    backend = load_backend(operator)
    function: Callable[..., dict[str, Any]]
    function = (
        backend.search_public_timetable
        if operator == "ktx"
        else backend.search_live_timetable
    )
    return function(
        dep=dep,
        arr=arr,
        date=date,
        earliest=earliest,
        latest=latest,
        limit=limit,
    )


def search(
    *,
    operator: str,
    dep: str,
    arr: str,
    date: str,
    earliest: str,
    latest: str,
    limit: int,
) -> dict[str, Any]:
    selected = ("ktx", "srt") if operator == "both" else (operator,)
    results = [
        search_operator(
            operator=name,
            dep=dep,
            arr=arr,
            date=date,
            earliest=earliest,
            latest=latest,
            limit=limit,
        )
        for name in selected
    ]
    trains = [
        {**train, "operator": name}
        for name, result in zip(selected, results)
        for train in result["trains"]
    ]
    trains.sort(key=lambda train: (train["dep_time"], train["operator"], train["train_no"]))
    source = {
        "operators": list(selected),
        "sources": [result["source"] for result in results],
    }
    return {
        "count": len(trains[:limit]),
        "trains": trains[:limit],
        "date": date,
        "schedule_note": (
            "KTX는 코레일 공개 계획 시간표, SRT는 익명 라이브 조회입니다. "
            "실시간 운휴·지연과 예약·좌석 선점 결과가 아닙니다."
        ),
        "source": source,
        "booking_urls": [result["booking_url"] for result in results],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Unified read-only KTX and SRT timetable lookup",
    )
    parser.add_argument("--operator", choices=OPERATORS, default="both")
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
            print(json.dumps(source_info(args.operator), ensure_ascii=False, indent=2))
            return 0
        if args.limit < 1 or args.limit > 50:
            raise ValueError("--limit must be between 1 and 50")
        result = search(
            operator=args.operator,
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
