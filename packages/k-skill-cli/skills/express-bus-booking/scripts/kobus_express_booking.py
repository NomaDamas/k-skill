#!/usr/bin/env python3
"""KOBUS timetable lookup and temporary hold helper.

Default mode searches timetables. With --hold-first-seat or --hold-seat it creates
a temporary seat hold through /mrs/setPcpy.ajax and saves a local auto-submit
HTML helper for the official KOBUS payment-information page. It never submits
card fields or final payment.
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

BASE_URL = "https://www.kobus.co.kr"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36"
FN_SATS_RE = re.compile(r"fnSatsChc\((.*?)\)", re.DOTALL)
ARG_RE = re.compile(r"'([^']*)'")
FORM_RE = re.compile(r"<form\b([^>]*)>(.*?)</form>", re.DOTALL | re.IGNORECASE)
INPUT_RE = re.compile(r"<input\b([^>]+)>", re.DOTALL | re.IGNORECASE)
ATTR_RE = re.compile(r"([\w:-]+)=[\"']([^\"']*)[\"']")
SEAT_RE = re.compile(r'<input\b([^>]*name=["\']seatBoxDtl["\'][^>]*)>', re.DOTALL | re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class Schedule:
    index: int
    departure_time: str | None
    company: str | None
    bus_class: str | None
    remaining_text: str | None
    raw_args: list[str]


@dataclass
class Hold:
    success: bool
    pcpy_no_all: str | None
    sats_no_all: str | None
    seat: str | None
    estm_amt: str | None
    dc_amt: str | None
    tissu_amt: str | None
    checkout_helper_path: str | None
    checkout_response_path: str | None
    cancel_fields_path: str | None
    raw_response: dict[str, object]


def opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    ctx = ssl._create_unverified_context()
    try:
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
    except ssl.SSLError:
        pass
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ctx),
    )


def request(url: str, data: dict[str, str] | list[tuple[str, str]] | None = None, referer: str | None = None) -> urllib.request.Request:
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    if data is None:
        return urllib.request.Request(url, headers=headers, method="GET")
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    return urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), headers=headers, method="POST")


def open_text(op: urllib.request.OpenerDirector, req: urllib.request.Request, timeout: int) -> str:
    with op.open(req, timeout=timeout) as resp:
        return resp.read().decode(resp.headers.get_content_charset() or "utf-8", errors="replace")


def attrs(fragment: str) -> dict[str, str]:
    return {k.lower(): html.unescape(v) for k, v in ATTR_RE.findall(fragment)}


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", s))).strip()


def parse_form(body: str, form_id: str) -> list[tuple[str, str]]:
    for attr_text, form_body in FORM_RE.findall(body):
        a = attrs(attr_text)
        if a.get("id") == form_id or a.get("name") == form_id:
            fields = []
            for input_text in INPUT_RE.findall(form_body):
                ia = attrs(input_text)
                if ia.get("name"):
                    fields.append((ia["name"], ia.get("value", "")))
            return fields
    return []


def search(op: urllib.request.OpenerDirector, depart: str, arrive: str, date: str, timeout: int) -> tuple[str, list[Schedule]]:
    open_text(op, request(f"{BASE_URL}/main.do"), timeout)
    body = open_text(
        op,
        request(
            f"{BASE_URL}/mrs/alcnSrch.do",
            {
                "deprCd": depart,
                "arvlCd": arrive,
                "pathDvs": "sngl",
                "pathStep": "1",
                "deprDtm": date,
                "busClsCd": "0",
                "rtrpChc": "1",
                "timeLinkMin": "00",
                "timeLinkMax": "23",
            },
            f"{BASE_URL}/main.do",
        ),
        timeout,
    )
    schedules: list[Schedule] = []
    for idx, m in enumerate(FN_SATS_RE.finditer(body), 1):
        args = ARG_RE.findall(m.group(1))
        context = strip_tags(body[max(0, m.start() - 900) : m.start() + 900])
        departure = args[1][:2] + ":" + args[1][2:4] if len(args) > 1 and len(args[1]) >= 4 else None
        schedules.append(
            Schedule(
                index=idx,
                departure_time=departure,
                company=(re.search(r"\((?:주|유)\)[^\s]+|[가-힣]+고속", context) or [None])[0],
                bus_class=(re.search(r"심야우등|우등|프리미엄|고속", context) or [None])[0],
                remaining_text=(re.search(r"잔여\s*\d+석|\d+\s*/\s*\d+", context) or [None])[0],
                raw_args=args,
            )
        )
    return body, schedules


def seat_stage_fields(search_form: list[tuple[str, str]], schedule: Schedule) -> list[tuple[str, str]]:
    a = schedule.raw_args
    values = dict(search_form)
    updates = {
        "deprTime": a[1],
        "alcnDeprTime": a[2],
        "alcnDeprTrmlNo": a[3],
        "alcnArvlTrmlNo": a[4],
        "indVBusClsCd": a[5],
        "cacmCd": a[6],
        "dcDvsCd": a[7],
        "prvtBbizEmpAcmtRt": a[8],
        "chldSftySatsYn": a[12],
        "dsprSatsYn": a[13],
    }
    return [(k, updates.get(k, v)) for k, v in search_form]


def hold(op: urllib.request.OpenerDirector, alcn_body: str, schedule: Schedule, seat: str | None, out: Path, timeout: int) -> Hold:
    search_form = parse_form(alcn_body, "alcnSrchFrm")
    seat_body = open_text(op, request(f"{BASE_URL}/mrs/satschc.do", seat_stage_fields(search_form, schedule), f"{BASE_URL}/mrs/alcnSrch.do"), timeout)
    fields = parse_form(seat_body, "satsChcFrm")
    field_map = dict(fields)
    seats = []
    for input_text in SEAT_RE.findall(seat_body):
        a = attrs(input_text)
        if "disabled" not in input_text and a.get("value"):
            seats.append(a["value"])
    selected = seat or (seats[0] if seats else None)
    if not selected:
        raise RuntimeError("No selectable KOBUS seat found")

    def set_field(items: list[tuple[str, str]], key: str, val: str) -> list[tuple[str, str]]:
        return [(k, val if k == key else v) for k, v in items]

    for key, val in {
        "selSeatNum": selected,
        "selSeatCnt": "1",
        "selAdltCnt": "1",
        "selAdltDcCnt": "0",
        "prmmDcDvsCd": field_map.get("prmmDcDvsCd") or "0",
    }.items():
        fields = set_field(fields, key, val)
    raw = json.loads(open_text(op, request(f"{BASE_URL}/mrs/setPcpy.ajax", fields, f"{BASE_URL}/mrs/satschc.do"), timeout))
    success = raw.get("MSG_CD") == "S0000"
    if not success:
        return Hold(False, None, None, selected, None, None, None, None, None, None, raw)

    for key, val in {
        "satsNoAll": str(raw.get("satsNoAll", "")),
        "pcpyNoAll": str(raw.get("pcpyNoAll", "")),
        "estmAmt": str(raw.get("ESTM_AMT", "")),
        "dcAmt": str(raw.get("DC_AMT", "")),
        "tissuAmt": str(raw.get("TISSU_AMT", "")),
        "nonMbrsYn": "Y",
    }.items():
        fields = set_field(fields, key, val)

    out.mkdir(parents=True, exist_ok=True)
    checkout = open_text(op, request(f"{BASE_URL}/mrs/stplcfmpym.do?keep=/mrs/pay", fields, f"{BASE_URL}/mrs/satschc.do"), timeout)
    checkout_path = out / "kobus-checkout-response.html"
    checkout_path.write_text(checkout)
    helper_path = out / "kobus-payment-autosubmit.html"
    inputs = "\n".join(f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v, quote=True)}">' for k, v in fields)
    helper_path.write_text(f'<!doctype html><meta charset="utf-8"><p>공식 KOBUS 결제정보 입력 페이지로 이동합니다. 결제는 직접 진행하세요.</p><form id="f" method="post" action="{BASE_URL}/mrs/stplcfmpym.do?keep=/mrs/pay">{inputs}</form><script>document.getElementById("f").submit();</script>')
    cancel_path = out / "kobus-cancel-fields.txt"
    cancel_path.write_text("\n".join(f"{k}={v}" for k, v in fields))
    return Hold(True, str(raw.get("pcpyNoAll")), str(raw.get("satsNoAll")), selected, str(raw.get("ESTM_AMT")), str(raw.get("DC_AMT")), str(raw.get("TISSU_AMT")), str(helper_path), str(checkout_path), str(cancel_path), raw)


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--depart-code", required=True)
    p.add_argument("--arrive-code", required=True)
    p.add_argument("--date", required=True)
    p.add_argument("--select-index", type=int, default=1)
    p.add_argument("--hold-first-seat", action="store_true")
    p.add_argument("--hold-seat")
    p.add_argument("--output-dir")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--timeout", type=int, default=20)
    args = p.parse_args(argv)
    op = opener()
    body, schedules = search(op, args.depart_code, args.arrive_code, args.date, args.timeout)
    result: dict[str, object] = {"route": {"depart_code": args.depart_code, "arrive_code": args.arrive_code, "date": args.date}, "count": len(schedules), "items": [asdict(s) for s in schedules[: args.limit]]}
    if (args.hold_first_seat or args.hold_seat) and schedules:
        out = Path(args.output_dir) if args.output_dir else Path(tempfile.mkdtemp(prefix="kobus-hold-"))
        result["hold"] = asdict(hold(op, body, schedules[args.select_index - 1], args.hold_seat, out, args.timeout))
        result["payment_note"] = "Opened/saved the official KOBUS payment-information page; final card entry/payment remains manual."
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
