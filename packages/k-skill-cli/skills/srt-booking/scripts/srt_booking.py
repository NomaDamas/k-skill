#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import contextlib
import io
import importlib
import json
import os
import sys
from types import ModuleType
from typing import Protocol

from srt_seats import parse_cars, parse_seats, sort_cars_for_booking, sort_seats_for_booking

SRT_SEAT_ENDPOINT = "https://etk.srail.kr/hpg/hra/01/selectPassengerResearchList.do"
TRAIN_ID_PREFIX = "srt:v1:"
TRAIN_ID_FIELDS = (
    "train_number",
    "dep_date",
    "dep_time",
    "arr_date",
    "arr_time",
    "train_code",
    "dep_station_code",
    "arr_station_code",
    "dep_station_run_order",
    "arr_station_run_order",
)
ROOM_CODE = {"general": "1", "special": "2"}
ROOM_NAME = {"general": "일반실", "special": "특실"}


class SrtTrainLike(Protocol):
    train_number: str
    dep_date: str
    dep_time: str
    arr_date: str
    arr_time: str
    train_code: str
    train_name: str
    dep_station_code: str
    dep_station_name: str
    arr_station_code: str
    arr_station_name: str
    dep_station_run_order: str
    arr_station_run_order: str
    general_seat_state: str
    special_seat_state: str
    reserve_wait_possible_code: str

    def general_seat_available(self) -> bool: ...

    def special_seat_available(self) -> bool: ...

    def reserve_standby_available(self) -> bool: ...


class ResponseLike(Protocol):
    text: str


class SessionLike(Protocol):
    def get(self, url: str, params: dict[str, str]) -> ResponseLike: ...


class SrtClientLike(Protocol):
    _session: SessionLike

    def search_train(
        self,
        dep: str,
        arr: str,
        date: str,
        time: str,
        time_limit: str | None = None,
        available_only: bool = True,
    ) -> list[SrtTrainLike]: ...


def load_srt_module() -> ModuleType:
    try:
        return importlib.import_module("SRT")
    except ModuleNotFoundError as exc:
        raise SystemExit("scripts/srt_booking.py requires SRTrain: python3 -m pip install SRTrain")


def build_client(auto_login: bool = False) -> SrtClientLike:
    srt_module = load_srt_module()
    srt_id = os.environ.get("KSKILL_SRT_ID", "")
    srt_pw = os.environ.get("KSKILL_SRT_PASSWORD", "")
    return srt_module.SRT(srt_id, srt_pw, auto_login=auto_login)


def train_id_payload(train: SrtTrainLike) -> dict[str, str]:
    return {field: getattr(train, field) for field in TRAIN_ID_FIELDS}


def build_train_id(train: SrtTrainLike) -> str:
    raw = json.dumps(train_id_payload(train), ensure_ascii=False, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return f"{TRAIN_ID_PREFIX}{encoded}"


def parse_train_id(train_id: str) -> dict[str, str]:
    if not train_id.startswith(TRAIN_ID_PREFIX):
        raise SystemExit("train_id must start with srt:v1:")
    encoded = train_id.removeprefix(TRAIN_ID_PREFIX)
    padded = encoded + ("=" * ((4 - len(encoded) % 4) % 4))
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SystemExit("train_id is invalid; rerun search and copy a fresh train_id") from exc
    if not isinstance(payload, dict):
        raise SystemExit("train_id is invalid; rerun search and copy a fresh train_id")
    if any(not isinstance(payload.get(field), str) or not payload[field] for field in TRAIN_ID_FIELDS):
        raise SystemExit("train_id is invalid; rerun search and copy a fresh train_id")
    return {field: payload[field] for field in TRAIN_ID_FIELDS}


def find_train_by_id(trains: list[SrtTrainLike], train_id: str) -> SrtTrainLike | None:
    expected = parse_train_id(train_id)
    return next((train for train in trains if train_id_payload(train) == expected), None)


def normalize_train(train: SrtTrainLike, index: int) -> dict[str, str | bool | int]:
    return {
        "index": index,
        "train_id": build_train_id(train),
        "train_no": train.train_number,
        "train_type": train.train_name,
        "dep_name": train.dep_station_name,
        "dep_date": train.dep_date,
        "dep_time": train.dep_time,
        "arr_name": train.arr_station_name,
        "arr_date": train.arr_date,
        "arr_time": train.arr_time,
        "has_general_seat": train.general_seat_available(),
        "has_special_seat": train.special_seat_available(),
        "has_waiting_list": train.reserve_standby_available(),
    }


def seat_page_params(train: SrtTrainLike, room: str, car_no: int | None) -> dict[str, str]:
    return {
        "runDt1": train.dep_date,
        "dptDt1": train.dep_date,
        "dptTm1": train.dep_time,
        "trnNo1": f"{int(train.train_number):05d}",
        "trnGpCd1": "300",
        "dptRsStnCd1": train.dep_station_code,
        "arvRsStnCd1": train.arr_station_code,
        "dptStnRunOrdr1": train.dep_station_run_order,
        "arvStnRunOrdr1": train.arr_station_run_order,
        "seatAttCd1": "015",
        "psrmClCd1": ROOM_CODE[room],
        "index1": "0",
        "scarNo1": "" if car_no is None else f"{car_no:04d}",
        "chtnDvCd": "1",
        "jrnySqno": "001",
        "mode": "1",
        "psgNum": "1",
        "pageId": "",
    }


def fetch_seat_page(client: SrtClientLike, train: SrtTrainLike, room: str, car_no: int | None) -> str:
    with contextlib.redirect_stdout(io.StringIO()):
        response = client._session.get(SRT_SEAT_ENDPOINT, params=seat_page_params(train, room, car_no))
    return response.text


def command_search(args: argparse.Namespace) -> None:
    client = build_client(auto_login=False)
    with contextlib.redirect_stdout(io.StringIO()):
        trains = client.search_train(args.dep, args.arr, args.date, args.time, args.time_limit, args.available_only)
    print_json({"count": len(trains[: args.limit]), "trains": [normalize_train(train, index) for index, train in enumerate(trains[: args.limit], 1)]})


def command_seats(args: argparse.Namespace) -> None:
    client = build_client(auto_login=False)
    with contextlib.redirect_stdout(io.StringIO()):
        trains = client.search_train(args.dep, args.arr, args.date, args.time, args.time_limit, available_only=False)
    train = find_train_by_id(trains, args.train_id)
    if train is None:
        raise SystemExit("train_id no longer matches any current search result; rerun search and choose a fresh train_id")

    initial_html = fetch_seat_page(client, train, args.room, args.car_no)
    cars = [car for car in parse_cars(initial_html) if car["room_class"] == ROOM_NAME[args.room]]
    if args.car_no is not None:
        cars = [car for car in cars if car["car_no"] == args.car_no]
    else:
        cars = [car for car in cars if car["available"]]
    if not cars:
        raise SystemExit(f"seat car data is unavailable for {args.room}; retry search or choose another train")

    car_payloads: list[dict[str, object]] = []
    for car in sort_cars_for_booking(cars, args.car_priority):
        html = initial_html if args.car_no == car["car_no"] else fetch_seat_page(client, train, args.room, car["car_no"])
        seats = parse_seats(html)
        if args.seat:
            seats = [seat for seat in seats if seat["seat"] == args.seat]
        seats = sort_seats_for_booking(seats, args.seat_priority)
        if args.available_only:
            seats = [seat for seat in seats if seat["available"]]
        available_seats = [seat for seat in seats if seat["available"]]
        limited = seats[: args.limit]
        payload = dict(car)
        payload["available_seat_count"] = len(available_seats)
        payload["available_seats"] = [seat["seat"] for seat in available_seats]
        payload["shown_seat_count"] = len(limited)
        payload["seats"] = limited
        if args.seat:
            payload["requested_seat"] = args.seat
            payload["requested_seat_available"] = any(seat["available"] for seat in seats)
        car_payloads.append(payload)

    print_json({
        "train": normalize_train(train, 1),
        "room": args.room,
        "available_only": args.available_only,
        "car_priority": args.car_priority,
        "seat_priority": args.seat_priority,
        "cars": car_payloads,
    })


def print_json(payload: dict[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SRT search and seat lookup helper for k-skill")
    subparsers = parser.add_subparsers(dest="command", required=True)
    search = subparsers.add_parser("search", help="SRT 열차를 조회합니다")
    add_trip_args(search)
    search.add_argument("--time-limit", default=None, help="조회 종료 시각 HHMMSS")
    search.add_argument("--available-only", action="store_true", default=False, help="예약 가능한 열차만 출력")
    search.add_argument("--limit", type=int, default=5, help="출력할 최대 열차 수")
    search.set_defaults(func=command_search)

    seats = subparsers.add_parser("seats", help="SRT 호차별 좌석번호를 조회합니다")
    add_trip_args(seats)
    seats.add_argument("--train-id", required=True, help="search 결과에서 복사한 stable train_id")
    seats.add_argument("--time-limit", default=None, help="조회 종료 시각 HHMMSS")
    seats.add_argument("--room", choices=sorted(ROOM_CODE), default="general")
    seats.add_argument("--car-no", type=int, default=None, help="특정 호차만 조회")
    seats.add_argument("--seat", default=None, help="특정 좌석번호만 조회, 예: 6C")
    seats.add_argument("--available-only", action="store_true", help="빈 좌석만 출력")
    seats.add_argument("--car-priority", choices=("center", "low", "high"), default="center")
    seats.add_argument("--seat-priority", choices=("forward-window", "window-forward", "row-low"), default="forward-window")
    seats.add_argument("--limit", type=int, default=100, help="호차별 출력할 최대 좌석 수")
    seats.set_defaults(func=command_seats)
    return parser


def add_trip_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("dep", help="출발역")
    parser.add_argument("arr", help="도착역")
    parser.add_argument("date", help="출발일 YYYYMMDD")
    parser.add_argument("time", help="희망 시작 시각 HHMMSS")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
