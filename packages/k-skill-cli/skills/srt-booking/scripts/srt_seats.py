#!/usr/bin/env python3
from __future__ import annotations

import re
from typing import TypedDict


class SrtCar(TypedDict):
    car_no: int
    car_no_raw: str
    room_class: str
    available: bool
    current: bool


class SrtSeat(TypedDict):
    seat: str
    seat_no: str
    available: bool
    direction: str
    position: str
    notes: list[str]


CAR_RE = re.compile(
    r'<li class="scar-(?P<car>\d+)(?P<class>[^"]*)">(?P<body>.*?)</li>',
    re.DOTALL,
)
SEAT_LINK_RE = re.compile(
    r"<a[^>]+selectSeatInfo\(this,\s*'(?P<seat_no>[^']+)',\s*'(?P<seat>[^']+)'\)[^>]*>"
    r".*?<em>\((?P<detail>[^)]*)\)</em>",
    re.DOTALL,
)
SEAT_SPAN_RE = re.compile(
    r"<span>\s*(?P<seat>\d+[A-Z])\s*<strong><em>\((?P<detail>[^)]*)\)</em></strong></span>",
    re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def strip_tags(value: str) -> str:
    return TAG_RE.sub(" ", value).replace("\xa0", " ").strip()


def parse_detail(detail: str) -> tuple[str, str, list[str]]:
    parts = [part.strip() for part in detail.split(",")]
    direction = next((part for part in parts if part in {"정방향", "역방향"}), "unknown")
    position = next((part for part in parts if part in {"창측", "내측", "1인석"}), "unknown")
    notes = [part for part in parts if part not in {direction, position} and part]
    return direction, position, notes


def parse_cars(html: str) -> list[SrtCar]:
    cars: list[SrtCar] = []
    for match in CAR_RE.finditer(html):
        body = match.group("body")
        text = strip_tags(body)
        room_class = "특실" if "특실" in text else "일반실"
        css_class = match.group("class")
        has_link = "selectScarInfo" in body
        cars.append(
            {
                "car_no": int(match.group("car")),
                "car_no_raw": f"{int(match.group('car')):04d}",
                "room_class": room_class,
                "available": has_link and "off" not in css_class.split(),
                "current": "on" in css_class.split(),
            }
        )
    return cars


def parse_seats(html: str) -> list[SrtSeat]:
    seats: list[SrtSeat] = []
    seen: set[str] = set()
    for match in SEAT_LINK_RE.finditer(html):
        direction, position, notes = parse_detail(match.group("detail"))
        seat = match.group("seat")
        seen.add(seat)
        seats.append(
            {
                "seat": seat,
                "seat_no": match.group("seat_no"),
                "available": True,
                "direction": direction,
                "position": position,
                "notes": notes,
            }
        )
    for match in SEAT_SPAN_RE.finditer(html):
        seat = match.group("seat")
        if seat in seen:
            continue
        direction, position, notes = parse_detail(match.group("detail"))
        seats.append(
            {
                "seat": seat,
                "seat_no": "",
                "available": False,
                "direction": direction,
                "position": position,
                "notes": notes,
            }
        )
    return seats


def parse_seat_label(seat_label: str) -> tuple[int | None, str]:
    match = re.match(r"^(\d+)([A-Z])$", seat_label)
    if match is None:
        return None, ""
    return int(match.group(1)), match.group(2)


def car_center_priority(car: SrtCar, car_numbers: list[int]) -> tuple[float, int]:
    if not car_numbers:
        return (0.0, car["car_no"])
    center = (min(car_numbers) + max(car_numbers)) / 2
    return (abs(car["car_no"] - center), car["car_no"])


def sort_cars_for_booking(cars: list[SrtCar], priority: str = "center") -> list[SrtCar]:
    match priority:
        case "center":
            car_numbers = [car["car_no"] for car in cars]
            return sorted(cars, key=lambda car: car_center_priority(car, car_numbers))
        case "low":
            return sorted(cars, key=lambda car: car["car_no"])
        case "high":
            return sorted(cars, key=lambda car: car["car_no"], reverse=True)
        case _:
            raise ValueError(f"unsupported car priority: {priority}")


def seat_preference_key(seat: SrtSeat, priority: str = "forward-window") -> tuple[int, int, int, str]:
    row, column = parse_seat_label(seat["seat"])
    forward_rank = 0 if seat["direction"] == "정방향" else 1
    window_rank = 0 if seat["position"] in {"창측", "1인석"} else 1
    row_rank = 999 if row is None else row
    match priority:
        case "forward-window":
            return (forward_rank, window_rank, row_rank, column)
        case "window-forward":
            return (window_rank, forward_rank, row_rank, column)
        case "row-low":
            return (row_rank, forward_rank, window_rank, column)
        case _:
            raise ValueError(f"unsupported seat priority: {priority}")


def sort_seats_for_booking(seats: list[SrtSeat], priority: str = "forward-window") -> list[SrtSeat]:
    return sorted(seats, key=lambda seat: seat_preference_key(seat, priority))


sort_cars = sort_cars_for_booking
sort_seats = sort_seats_for_booking
