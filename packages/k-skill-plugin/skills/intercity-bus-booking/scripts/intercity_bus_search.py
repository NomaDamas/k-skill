#!/usr/bin/env python3
"""Search and optionally hold Tmoney intercity-bus seats through official flows.

Default mode is read-only timetable parsing. With --hold-seat, the helper performs
Tmoney's temporary seat-hold POST and saves the official card-information page.
It never submits card fields or final payment.
"""
from __future__ import annotations

import argparse
import html
import http.cookiejar
import json
import re
import ssl
import sys
import tempfile
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

BASE_URL = "https://intercitybus.tmoney.co.kr"
ENTRY_PATH = "/otck/trmlInfEnty.do"
TIMETABLE_PATH = "/otck/readAlcnList.do"
SEAT_STAGE_PATH = "/otck/readSatsFee.do"
HOLD_PATH = "/otck/readPcpySats.do"
DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
)

ROW_RE = re.compile(r"<tr>\s*(.*?)readSasFeeInf\((.*?)\).*?</tr>", re.DOTALL | re.IGNORECASE)
TD_WRAP_RE = re.compile(r'<div class="td_wrap1">(.*?)</div>', re.DOTALL | re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")
ARG_RE = re.compile(r"'((?:\\'|[^'])*)'")
FORM_RE = re.compile(r"<form\b([^>]*)>(.*?)</form>", re.DOTALL | re.IGNORECASE)
INPUT_RE = re.compile(r"<input\b([^>]+)>", re.DOTALL | re.IGNORECASE)
ATTR_RE = re.compile(r"([\w:-]+)=[\"']([^\"']*)[\"']")
SEAT_RE = re.compile(r"<li([^>]*)>\s*<a[^>]*>.*?<span>(\d+)</span>", re.DOTALL | re.IGNORECASE)


@dataclass
class Schedule:
    departure_time: str | None
    company: str | None
    duration: str | None
    bus_class: str | None
    adult_fare: str | None
    child_fare: str | None
    student_fare: str | None
    remaining_seats: int | None
    total_seats: int | None
    raw_args: list[str]


@dataclass
class HoldResult:
    success: bool
    hold_id: str | None
    seat: str
    card_page_path: str | None
    cancel_fields_path: str | None
    markers: dict[str, int]
    failure_message: str | None = None


def _ssl_context() -> ssl.SSLContext:
    # Tmoney has historically required curl -k in probes on some machines.
    # Keep this helper resilient while limiting it to the official host.
    return ssl._create_unverified_context()  # noqa: SLF001


def _strip(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.DOTALL)
    value = TAG_RE.sub("", value)
    return html.unescape(value).replace("\xa0", " ").strip()


def _attrs(fragment: str) -> dict[str, str]:
    return {k.lower(): html.unescape(v) for k, v in ATTR_RE.findall(fragment)}


def _open(opener: urllib.request.OpenerDirector, request: urllib.request.Request, timeout: int) -> str:
    with opener.open(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def build_opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=_ssl_context()),
    )


def _request(url: str, data: list[tuple[str, str]] | dict[str, str] | None = None, referer: str | None = None) -> urllib.request.Request:
    headers = {"User-Agent": DEFAULT_UA}
    if referer:
        headers["Referer"] = referer
    if data is None:
        return urllib.request.Request(url, headers=headers, method="GET")
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    return urllib.request.Request(url, data=encoded, headers=headers, method="POST")


def search_timetable(
    depart_code: str,
    arrive_code: str,
    depart_name: str,
    arrive_name: str,
    date: str,
    time: str = "000000",
    adults: int = 1,
    students: int = 0,
    children: int = 0,
    veterans: int = 0,
    timeout: int = 20,
    opener: urllib.request.OpenerDirector | None = None,
) -> tuple[urllib.request.OpenerDirector, str, list[Schedule]]:
    opener = opener or build_opener()
    _open(opener, _request(f"{BASE_URL}{ENTRY_PATH}"), timeout)

    fields = {
        "depr_Trml_Cd": depart_code,
        "arvl_Trml_Cd": arrive_code,
        "depr_Trml_Nm": depart_name,
        "arvl_Trml_Nm": arrive_name,
        "ig": str(adults),
        "im": str(students),
        "ic": str(children),
        "iv": str(veterans),
        "depr_Dt": date,
        "depr_Time": time,
        # Required by the browser JS readAlcnListEntry(). Missing either field
        # returns a generic error page with no schedule rows.
        "bef_Aft_Dvs": "D",
        "req_Rec_Num": "10",
    }
    body = _open(opener, _request(f"{BASE_URL}{TIMETABLE_PATH}", fields, f"{BASE_URL}{ENTRY_PATH}"), timeout)
    return opener, body, parse_schedules(body)


def parse_schedules(body: str) -> list[Schedule]:
    schedules: list[Schedule] = []
    for row_html, arg_text in ROW_RE.findall(body):
        args = [a.replace("\\'", "'") for a in ARG_RE.findall(arg_text)]
        cells = [_strip(x) for x in TD_WRAP_RE.findall(row_html)]
        departure = cells[0] if len(cells) > 0 else (args[8][:2] + ":" + args[8][2:4] if len(args) > 8 else None)
        company_cell = cells[1] if len(cells) > 1 else None
        company = args[11] if len(args) > 11 else None
        duration = None
        if company_cell and company and company_cell.startswith(company):
            duration = company_cell[len(company):].strip() or None
        elif company_cell:
            duration = company_cell
        bus_class = args[12] if len(args) > 12 else (cells[2] if len(cells) > 2 else None)
        remaining = int(args[16]) if len(args) > 16 and args[16].isdigit() else None
        total = int(args[17]) if len(args) > 17 and args[17].isdigit() else None
        schedules.append(
            Schedule(
                departure_time=departure,
                company=company,
                duration=duration,
                bus_class=bus_class,
                adult_fare=cells[3] if len(cells) > 3 else None,
                child_fare=cells[4] if len(cells) > 4 else None,
                student_fare=cells[5] if len(cells) > 5 else None,
                remaining_seats=remaining,
                total_seats=total,
                raw_args=args,
            )
        )
    return schedules


def _seat_stage_fields(schedule: Schedule, search_time: str) -> dict[str, str]:
    a = schedule.raw_args
    if len(a) < 21:
        raise ValueError("schedule raw_args does not contain the expected readSasFeeInf payload")
    return {
        "atl_Depr_Dt_S1": a[2],
        "atl_Depr_Time_S1": search_time,
        "rot_Id": a[0],
        "rot_Sqno": a[1],
        "alcn_Dt": a[2],
        "alcn_Sqno": a[3],
        "depr_Trml_Cd": a[4],
        "arvl_Trml_Cd": a[5],
        "depr_Trml_Nm": a[6],
        "arvl_Trml_Nm": a[7],
        "depr_Time": a[8],
        "bus_Cacm_Cd": a[9],
        "bus_Cls_Cd": a[10],
        "bus_Cacm_Nm": a[11],
        "bus_Cls_Nm": a[12],
        "ig": a[13],
        "im": a[14],
        "ic": a[15],
        "rmn_Scnt": a[16],
        "sats_Num": a[17],
        "atl_Depr_Dt": a[18],
        "atl_Depr_Time": a[19],
        "dc_Psb_Yn": a[20],
    }


def _form_fields(body: str, form_id: str) -> list[tuple[str, str]]:
    for attrs_text, form_body in FORM_RE.findall(body):
        attrs = _attrs(attrs_text)
        if attrs.get("id") == form_id or attrs.get("name") == form_id:
            fields: list[tuple[str, str]] = []
            for input_text in INPUT_RE.findall(form_body):
                input_attrs = _attrs(input_text)
                name = input_attrs.get("name")
                if name:
                    fields.append((name, input_attrs.get("value", "")))
            return fields
    return []


def _available_seats(seat_stage_body: str) -> list[str]:
    seats: list[str] = []
    for li_attrs, seat_no in SEAT_RE.findall(seat_stage_body):
        classes = _attrs(li_attrs).get("class", "")
        if "disabled" not in classes.split():
            seats.append(seat_no)
    return seats


def hold_seat(
    opener: urllib.request.OpenerDirector,
    schedule: Schedule,
    search_time: str,
    seat: str | None,
    output_dir: Path,
    timeout: int = 20,
) -> tuple[str, list[str], HoldResult]:
    seat_stage_body = _open(
        opener,
        _request(f"{BASE_URL}{SEAT_STAGE_PATH}", _seat_stage_fields(schedule, search_time), f"{BASE_URL}{TIMETABLE_PATH}"),
        timeout,
    )
    available = _available_seats(seat_stage_body)
    selected = seat or (available[0] if available else "")
    if not selected:
        return seat_stage_body, available, HoldResult(False, None, "", None, None, {}, "No selectable seat was found")
    if selected not in available:
        return seat_stage_body, available, HoldResult(False, None, selected, None, None, {}, f"Seat {selected} is not selectable")

    fields = _form_fields(seat_stage_body, "readPcpySats")
    if not fields:
        return seat_stage_body, available, HoldResult(False, None, selected, None, None, {}, "No readPcpySats form found")

    # Mirror pcpySats() in /js/tckmrs/readSatsInfo.js for a normal adult-only hold.
    field_map = dict(fields)
    fields.extend(
        [
            ("pcpy_Num", "1"),
            ("sats_No", selected),
            ("rtrp_Depr_Dt", ""),
            ("bus_Tck_Knd_Cd", field_map.get("ig_Knd_Cd", "IG00")),
            ("cty_Bus_Dc_Knd_Cd", "Z"),
            ("dcrt_Dvs_Cd", "0"),
        ]
    )
    hold_body = _open(opener, _request(f"{BASE_URL}{HOLD_PATH}", fields, f"{BASE_URL}{SEAT_STAGE_PATH}"), timeout)
    markers = {k: hold_body.count(k) for k in ["카드정보 입력", "sats_Pcpy_Id", "이미 발매된 좌석", "발행을 실패", "errorCont"]}
    hold_ids = re.findall(r'name=["\']sats_Pcpy_Id["\'][^>]*value=["\']([^"\']+)', hold_body)
    success = bool(hold_ids and markers["카드정보 입력"] and not markers["errorCont"])

    output_dir.mkdir(parents=True, exist_ok=True)
    card_path = output_dir / "tmoney-intercity-card-info.html"
    card_path.write_text(hold_body)
    cancel_fields = _form_fields(hold_body, "alcnInfo") or _form_fields(hold_body, "onwayInfo")
    cancel_path = output_dir / "tmoney-intercity-cancel-fields.txt"
    if cancel_fields:
        cancel_path.write_text("\n".join(f"{k}={v}" for k, v in cancel_fields))
    else:
        cancel_path = None  # type: ignore[assignment]

    failure = None if success else _strip(hold_body[hold_body.find("[처리결과]") : hold_body.find("[처리결과]") + 500]) or "Hold did not reach card-information page"
    return seat_stage_body, available, HoldResult(
        success=success,
        hold_id=hold_ids[0] if hold_ids else None,
        seat=selected,
        card_page_path=str(card_path),
        cancel_fields_path=str(cancel_path) if cancel_path else None,
        markers=markers,
        failure_message=failure,
    )


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Search Tmoney intercity-bus timetable and optionally create a temporary seat hold")
    parser.add_argument("--depart-code", required=True)
    parser.add_argument("--arrive-code", required=True)
    parser.add_argument("--depart-name", required=True)
    parser.add_argument("--arrive-name", required=True)
    parser.add_argument("--date", required=True, help="YYYYMMDD")
    parser.add_argument("--time", default="000000", help="HHMMSS, default 000000")
    parser.add_argument("--adults", type=int, default=1)
    parser.add_argument("--students", type=int, default=0)
    parser.add_argument("--children", type=int, default=0)
    parser.add_argument("--veterans", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--select-index", type=int, default=1, help="1-based schedule index for --hold-seat")
    parser.add_argument("--hold-seat", help="Temporarily hold this seat number and save the official card-info page")
    parser.add_argument("--hold-first-seat", action="store_true", help="Hold the first selectable seat for the selected schedule")
    parser.add_argument("--output-dir", help="Directory for saved hold/card page files; defaults to a temp directory")
    args = parser.parse_args(argv)

    if not re.fullmatch(r"\d{8}", args.date):
        parser.error("--date must be YYYYMMDD")
    if not re.fullmatch(r"\d{6}", args.time):
        parser.error("--time must be HHMMSS")
    if args.students or args.children or args.veterans:
        parser.error("seat holding currently supports adult-only payloads; use search mode for mixed passenger counts")
    if args.select_index < 1:
        parser.error("--select-index must be 1 or greater")

    opener, body, schedules = search_timetable(
        depart_code=args.depart_code,
        arrive_code=args.arrive_code,
        depart_name=args.depart_name,
        arrive_name=args.arrive_name,
        date=args.date,
        time=args.time,
        adults=args.adults,
        students=args.students,
        children=args.children,
        veterans=args.veterans,
        timeout=args.timeout,
    )
    result: dict[str, object] = {
        "route": {
            "depart_code": args.depart_code,
            "arrive_code": args.arrive_code,
            "depart_name": args.depart_name,
            "arrive_name": args.arrive_name,
            "date": args.date,
            "time": args.time,
        },
        "count": len(schedules),
        "items": [asdict(s) for s in schedules[: args.limit]],
        "failure_mode": None,
    }
    if not schedules:
        result["failure_mode"] = (
            "No readSasFeeInf schedule rows found. Check terminal codes/date, sold-out/no-service state, "
            "or whether Tmoney returned its generic error page."
        )
        result["error_page_marker_count"] = body.count("errorCont")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2

    if args.hold_seat or args.hold_first_seat:
        if args.select_index > len(schedules):
            parser.error(f"--select-index {args.select_index} exceeds schedule count {len(schedules)}")
        output_dir = Path(args.output_dir) if args.output_dir else Path(tempfile.mkdtemp(prefix="tmoney-intercity-hold-"))
        _, available, hold = hold_seat(opener, schedules[args.select_index - 1], args.time, args.hold_seat, output_dir, args.timeout)
        result["selected_schedule"] = asdict(schedules[args.select_index - 1])
        result["available_seats"] = available
        result["hold"] = asdict(hold)
        result["payment_window_note"] = (
            "The live card-information page did not expose an exact countdown/expiry text in probes. "
            "Treat the hold as short-lived and complete payment immediately; use the saved cancel fields to release abandoned holds."
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if hold.success else 3

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
