#!/usr/bin/env python3
"""ticket-availability — YES24 / 인터파크 공연 일정 + 잔여석 조회 CLI.

조회 전용. 예매·결제·로그인 자동화 없음.
공연법 §4조의2 (매크로 입장권 부정구매·판매 금지) 비적용.

Usage:
    ticket-availability schedule <url>
    ticket-availability seats <url> [--all-dates]
    ticket-availability health

Supported URLs:
    YES24:    https://ticket.yes24.com/Perf/<perf_id>
              https://ticket.yes24.com/New/Perf/Detail/View/<perf_id>
              yes24:<perf_id>
    인터파크: https://tickets.interpark.com/goods/<goods_code>
              interpark:<goods_code>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from typing import Any

try:
    import httpx
except ModuleNotFoundError:  # pragma: no cover - depends on user environment
    httpx = None


class MissingHttpxError(RuntimeError):
    """Raised when the optional httpx runtime dependency is unavailable."""


def _require_httpx():
    if httpx is None:
        raise MissingHttpxError(
            "Python package 'httpx' is required. Install it with: python3 -m pip install httpx"
        )
    return httpx


HTTPX_HTTP_ERROR = (
    getattr(httpx, "HTTPError", MissingHttpxError) if httpx else MissingHttpxError
)

# ── URL Parsing ───────────────────────────────────────────────────────────────


def parse_url(url: str) -> tuple[str, str]:
    """Return (platform, id). Accepts full URL or `platform:id` shorthand."""
    if url.startswith("yes24:"):
        return "yes24", url[6:]
    if url.startswith("interpark:"):
        return "interpark", url[10:]

    m = re.search(
        r"yes24\.com/(?:[Nn]ew/)?[Pp]erf/(?:[Dd]etail/)?(?:[Vv]iew/)?(\d+)", url
    )
    if m:
        return "yes24", m.group(1)

    m = re.search(r"interpark\.com/goods/(\d+)", url, re.IGNORECASE)
    if m:
        return "interpark", m.group(1)

    if re.fullmatch(r"\d+", url):
        raise ValueError(
            f"플랫폼을 명시하세요: yes24:{url} 또는 interpark:{url}"
        )

    raise ValueError(f"URL을 인식할 수 없습니다: {url}")


def _fmt_date(d: str) -> str:
    if d and len(d) == 8 and d.isdigit():
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return d


def _fmt_time(t: str) -> str:
    if t and len(t) == 4 and t.isdigit():
        return f"{t[:2]}:{t[2:]}"
    return t


# ── HTTP Setup ────────────────────────────────────────────────────────────────

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "Chrome/124.0.0.0 Safari/537.36"
)

HEADERS_YES24 = {
    "User-Agent": UA,
    "Referer": "https://ticket.yes24.com/",
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "*/*",
    "X-Requested-With": "XMLHttpRequest",
}

HEADERS_INTERPARK = {
    "User-Agent": UA,
    "Referer": "https://tickets.interpark.com/",
    "Accept": "application/json",
}

YES24_BASE = "https://ticket.yes24.com"
INTERPARK_BASE = "https://api-ticketfront.interpark.com"


# ── YES24 Client ──────────────────────────────────────────────────────────────


class Yes24Client:
    def __init__(self) -> None:
        http = _require_httpx()
        self.http = http.Client(
            headers=HEADERS_YES24, timeout=20, follow_redirects=True
        )

    def _dates(self, perf_id: str, month_count: int) -> list[str]:
        now = datetime.now()
        months: list[str] = []
        for delta in range(month_count):
            month = now.month + delta
            year = now.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            months.append(f"{year:04d}-{month:02d}")

        dates: list[str] = []
        cutoff = now.strftime("%Y%m%d")
        for month_str in months:
            r = self.http.post(
                f"{YES24_BASE}/New/Perf/Sale/Ajax/axPerfDay.aspx",
                data={
                    "pGetMode": "days",
                    "pIdPerf": perf_id,
                    "pPerfMonth": month_str,
                    "pIdCode": "",
                    "pIsMania": "0",
                },
            )
            r.raise_for_status()
            text = r.text.strip().strip(",")
            if not text:
                continue
            for raw in text.split(","):
                d = raw.strip()
                if not d:
                    continue
                normalized = d.replace("-", "")
                if normalized >= cutoff:
                    dates.append(normalized)
        return sorted(set(dates))

    def get_dates(self, perf_id: str) -> list[str]:
        """Available dates within ~3 weeks (fast)."""
        return self._dates(perf_id, month_count=3)

    def get_all_dates(self, perf_id: str) -> list[str]:
        """Available dates across 6 months (full schedule)."""
        return self._dates(perf_id, month_count=6)

    def get_slots(self, perf_id: str, perf_day: str) -> list[dict]:
        r = self.http.post(
            f"{YES24_BASE}/NEw/Perf/Detail/Ajax/axPerfPlayTime.aspx",
            data={"IdPerf": perf_id, "PerfDay": perf_day},
        )
        r.raise_for_status()
        html = r.text
        slots: list[dict] = []
        seen: set[str] = set()
        for m in re.finditer(r"idTime='(\d+)'", html):
            id_time = m.group(1)
            if id_time in seen:
                continue
            seen.add(id_time)
            ctx_start = max(0, m.start() - 200)
            ctx = html[ctx_start : m.end() + 200]
            time_m = re.search(r"(\d{1,2}:\d{2}|\d[회]|[12]\d{3}회)", ctx)
            label = time_m.group(0) if time_m else id_time
            slots.append({"idTime": id_time, "label": label})
        return slots

    def get_seats(self, id_time: str) -> list[dict]:
        r = self.http.post(
            f"{YES24_BASE}/New/Perf/Detail/Ajax/axPerfRemainSeat.aspx",
            data={"Type": "calendar", "IdTime": id_time, "IdLock": "0"},
        )
        r.raise_for_status()
        html = r.text
        seats: list[dict] = []
        for m in re.finditer(
            r"<dt>([^<]+)</dt>\s*<dd>([^<]*)<span[^>]*>\(잔여:(\d+)석\)</span>",
            html,
        ):
            seats.append(
                {
                    "grade": m.group(1).strip(),
                    "price": m.group(2).strip().rstrip(",").strip(),
                    "remain": int(m.group(3)),
                }
            )
        if not seats:
            for i, m in enumerate(re.finditer(r"\(잔여:(\d+)석\)", html)):
                seats.append({"grade": f"좌석{i+1}", "price": "", "remain": int(m.group(1))})
        return seats

    def schedule(self, perf_id: str, all_dates: bool) -> list[dict]:
        """Schedule = dates × slots flattened. No seat lookup."""
        dates = self.get_all_dates(perf_id) if all_dates else self.get_dates(perf_id)
        out: list[dict] = []
        for d in dates:
            for slot in self.get_slots(perf_id, d):
                out.append(
                    {
                        "date": _fmt_date(d),
                        "time_label": slot["label"],
                        "id_time": slot["idTime"],
                    }
                )
        return out

    def all_seats(self, perf_id: str, all_dates: bool) -> dict:
        result: dict = {}
        dates = self.get_all_dates(perf_id) if all_dates else self.get_dates(perf_id)
        for d in dates:
            for slot in self.get_slots(perf_id, d):
                seats = self.get_seats(slot["idTime"])
                key = f"{_fmt_date(d)}|{slot['label']}"
                result[key] = {
                    "date": _fmt_date(d),
                    "time_label": slot["label"],
                    "id_time": slot["idTime"],
                    "seats": seats,
                }
                time.sleep(0.4)
        return result


# ── Interpark Client ──────────────────────────────────────────────────────────


class InterparkClient:
    def __init__(self) -> None:
        http = _require_httpx()
        self.http = http.Client(
            headers=HEADERS_INTERPARK, timeout=20, follow_redirects=True
        )

    def get_schedule(self, goods_code: str) -> list[dict]:
        now = datetime.now()
        r = self.http.get(
            f"{INTERPARK_BASE}/v1/goods/{goods_code}/playSeq",
            params={
                "goodsCode": goods_code,
                "isBookableDate": "true",
                "page": "1",
                "pageSize": "200",
                "startDate": now.strftime("%Y%m%d"),
                "endDate": f"{now.year + 1}{now.month:02d}{now.day:02d}",
            },
        )
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return data.get("response", {}).get("data") or data.get("data") or []

    def get_seats(self, goods_code: str, play_seq: str) -> list[dict]:
        r = self.http.get(
            f"{INTERPARK_BASE}/v1/goods/{goods_code}/playSeq/PlaySeq/{play_seq}/REMAINSEAT"
        )
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict):
            return (
                data.get("remainSeat")
                or (data.get("data") or {}).get("remainSeat")
                or data.get("response", {}).get("remainSeat")
                or []
            )
        return []

    def schedule(self, goods_code: str) -> list[dict]:
        out: list[dict] = []
        for item in self.get_schedule(goods_code):
            out.append(
                {
                    "date": _fmt_date(item.get("playDate", "")),
                    "time": _fmt_time(item.get("playTime", "")),
                    "play_seq": item.get("playSeq", ""),
                }
            )
        return out

    def all_seats(self, goods_code: str) -> dict:
        result: dict = {}
        for item in self.get_schedule(goods_code):
            seq = item.get("playSeq", "")
            if not seq:
                continue
            seats_raw = self.get_seats(goods_code, seq)
            normalized = [
                {
                    "grade": s.get("seatGradeName", s.get("seatGrade", "")),
                    "remain": int(s.get("remainCnt", 0)),
                }
                for s in seats_raw
            ]
            key = f"{_fmt_date(item.get('playDate', ''))}|{_fmt_time(item.get('playTime', ''))}|{seq}"
            result[key] = {
                "date": _fmt_date(item.get("playDate", "")),
                "time": _fmt_time(item.get("playTime", "")),
                "play_seq": seq,
                "seats": normalized,
            }
            time.sleep(0.3)
        return result


# ── CLI ───────────────────────────────────────────────────────────────────────


def _dump(obj: Any, compact: bool) -> str:
    if compact:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(obj, ensure_ascii=False, indent=2)


def cmd_schedule(args: argparse.Namespace) -> int:
    platform, pid = parse_url(args.url)
    if platform == "yes24":
        out = Yes24Client().schedule(pid, all_dates=args.all_dates)
    else:
        out = InterparkClient().schedule(pid)
    print(_dump({"platform": platform, "id": pid, "schedule": out}, args.compact))
    return 0


def cmd_seats(args: argparse.Namespace) -> int:
    platform, pid = parse_url(args.url)
    if platform == "yes24":
        out = Yes24Client().all_seats(pid, all_dates=args.all_dates)
    else:
        out = InterparkClient().all_seats(pid)
    print(_dump({"platform": platform, "id": pid, "seats": out}, args.compact))
    return 0


def cmd_health(args: argparse.Namespace) -> int:
    http = _require_httpx()
    results: dict = {}
    for name, url in [
        ("yes24",
         f"{YES24_BASE}/New/Perf/Sale/Ajax/axPerfDay.aspx"),
        ("interpark",
         f"{INTERPARK_BASE}/v1/goods/00000000/playSeq"),
    ]:
        try:
            if name == "yes24":
                r = http.post(url, headers=HEADERS_YES24,
                               data={"pGetMode": "days", "pIdPerf": "0",
                                     "pPerfMonth": "2000-01", "pIdCode": "",
                                     "pIsMania": "0"}, timeout=10)
            else:
                r = http.get(url, headers=HEADERS_INTERPARK,
                              params={"goodsCode": "00000000",
                                      "isBookableDate": "true",
                                      "page": "1", "pageSize": "1",
                                      "startDate": "20000101",
                                      "endDate": "20000102"},
                              timeout=10)
            results[name] = {"status": r.status_code, "ok": r.status_code < 500}
        except Exception as e:
            results[name] = {"status": 0, "ok": False, "error": str(e)}
    print(_dump(results, args.compact))
    return 0 if all(v.get("ok") for v in results.values()) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ticket-availability",
        description="YES24 / 인터파크 공연 일정 + 잔여석 조회 (조회 전용)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    def _common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--compact", action="store_true",
                       help="One-line JSON (기본: 들여쓰기 출력)")

    p_sch = sub.add_parser("schedule", help="공연 일정 조회")
    p_sch.add_argument("url", help="공연 URL 또는 platform:id")
    p_sch.add_argument("--all-dates", action="store_true",
                       help="YES24 — 6개월 전체 (기본: 3주)")
    _common(p_sch)
    p_sch.set_defaults(func=cmd_schedule)

    p_st = sub.add_parser("seats", help="등급별 잔여석 조회 (전 일정)")
    p_st.add_argument("url", help="공연 URL 또는 platform:id")
    p_st.add_argument("--all-dates", action="store_true",
                      help="YES24 — 6개월 전체 (기본: 3주)")
    _common(p_st)
    p_st.set_defaults(func=cmd_seats)

    p_h = sub.add_parser("health", help="API endpoint reachability check")
    _common(p_h)
    p_h.set_defaults(func=cmd_health)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    except MissingHttpxError as e:
        print(f"dependency error: {e}", file=sys.stderr)
        return 4
    except HTTPX_HTTP_ERROR as e:
        print(f"http error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
