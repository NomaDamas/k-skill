"""Parse direction-aware KTX timetable sections from official workbooks."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date as calendar_date
from datetime import datetime, time

TIME_VALUE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
TRAIN_NUMBER = re.compile(r"^\d{1,4}$")
WEEKDAY_NAMES = "월화수목금토일"


@dataclass(frozen=True, slots=True)
class TimetableSection:
    train_index: int
    type_index: int
    dep_index: int
    arr_index: int
    note_index: int


def normalize_station(value: object) -> str:
    return re.sub(r"\s+", "", str(value or "")).replace("역", "")


def normalize_time(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    if isinstance(value, time):
        return None if value == time.min else value.strftime("%H:%M")
    text = str(value).strip()
    if TIME_VALUE.fullmatch(text):
        return text
    if re.fullmatch(r"\d{3,4}", text):
        return f"{int(text) // 100:02d}:{int(text) % 100:02d}"
    return None


def header_sections(values: list[str], dep: str, arr: str) -> list[TimetableSection]:
    starts = [index for index, value in enumerate(values) if value == "열차번호"]
    sections: list[TimetableSection] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(values)
        dep_indices = [index for index in range(start, end) if values[index] == dep]
        arr_indices = [index for index in range(start, end) if values[index] == arr]
        if not dep_indices or not arr_indices:
            continue
        dep_index = dep_indices[0]
        arr_index = arr_indices[0]
        if dep_index >= arr_index:
            continue
        type_indices = [index for index in range(start, end) if values[index] == "편성"]
        note_indices = [index for index in range(start, end) if values[index] == "비고"]
        sections.append(
            TimetableSection(
                train_index=start,
                type_index=type_indices[0] if type_indices else -1,
                dep_index=dep_index,
                arr_index=arr_index,
                note_index=note_indices[0] if note_indices else -1,
            )
        )
    return sections


def runs_on_date(value: object, requested_date: calendar_date) -> bool:
    text = re.sub(r"\s+", "", str(value or ""))
    if not text or "매일" in text:
        return True
    if text == "평일":
        return requested_date.weekday() < 5
    compact = re.sub(r"[,./·~\-]", "", text)
    if re.fullmatch(r"[월화수목금토일]+", compact):
        return WEEKDAY_NAMES[requested_date.weekday()] in compact
    return True


def parse_timetable_rows(
    rows: Iterable[Iterable[object]],
    *,
    dep: str,
    arr: str,
    requested_date: calendar_date,
    earliest: str,
    latest: str,
) -> tuple[list[dict[str, str]], bool]:
    dep_name = normalize_station(dep)
    arr_name = normalize_station(arr)
    sections: list[TimetableSection] = []
    route_found = False
    results: list[dict[str, str]] = []

    for raw_row in rows:
        row = list(raw_row)
        normalized = [normalize_station(value) for value in row]
        if "열차번호" in normalized:
            sections = header_sections(normalized, dep_name, arr_name)
            route_found = route_found or bool(sections)
            continue
        for section in sections:
            indices = (
                section.train_index,
                section.type_index,
                section.dep_index,
                section.arr_index,
                section.note_index,
            )
            if max(indices) >= len(row):
                continue
            train_no = str(row[section.train_index] or "").strip()
            if not TRAIN_NUMBER.fullmatch(train_no):
                continue
            train_type = (
                str(row[section.type_index] or "").strip().upper()
                if section.type_index >= 0
                else "KTX"
            )
            if section.note_index >= 0 and not runs_on_date(row[section.note_index], requested_date):
                continue
            dep_time = normalize_time(row[section.dep_index])
            arr_time = normalize_time(row[section.arr_index])
            if dep_time is None or arr_time is None or not earliest <= dep_time <= latest:
                continue
            results.append(
                {
                    "train_no": train_no,
                    "train_type": train_type,
                    "dep": dep,
                    "arr": arr,
                    "dep_time": dep_time,
                    "arr_time": arr_time,
                }
            )
    return results, route_found
