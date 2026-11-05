#!/usr/bin/env python3
"""Free flight ticket search helper for the k-skill flight-ticket-search skill.

Uses fast-flights (Google Flights public surface scraper) in an isolated user cache venv.
No API key, login, CAPTCHA bypass, purchase, or booking automation.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import shutil
import subprocess
import sys
import time
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlencode

PINNED_FAST_FLIGHTS = "fast-flights==2.2"
CACHE_ROOT = Path.home() / ".cache" / "k-skill" / "flight-ticket-search"
VENV_DIR = CACHE_ROOT / "venv"


def ensure_runtime() -> None:
    """Install fast-flights into a private cache venv, then re-exec there."""
    if os.environ.get("FLIGHT_TICKET_SEARCH_BOOTSTRAPPED") == "1":
        return

    py = VENV_DIR / "bin" / "python"

    def candidate_python_executables() -> list[str]:
        candidates = [sys.executable]
        candidates.extend(
            found for name in ("python3.13", "python3.12", "python3.11", "python3")
            if (found := shutil.which(name))
        )
        seen: set[str] = set()
        unique: list[str] = []
        for candidate in candidates:
            resolved = str(Path(candidate).resolve())
            if resolved not in seen:
                seen.add(resolved)
                unique.append(candidate)
        return unique

    def create_venv() -> None:
        CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        errors: list[str] = []
        for python in candidate_python_executables():
            shutil.rmtree(VENV_DIR, ignore_errors=True)
            try:
                subprocess.check_call([python, "-m", "venv", str(VENV_DIR)])
                return
            except (OSError, subprocess.CalledProcessError) as exc:
                errors.append(f"{python}: {exc}")
        raise RuntimeError(
            "Unable to create flight-ticket-search venv with available Python interpreters: "
            + "; ".join(errors)
        )

    def venv_has_fast_flights() -> bool:
        if not py.exists():
            return False
        return subprocess.run(
            [str(py), "-c", "import fast_flights"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode == 0

    if not py.exists():
        create_venv()

    if not venv_has_fast_flights():
        try:
            subprocess.check_call([str(py), "-m", "ensurepip", "--upgrade"])
            subprocess.check_call([
                str(py),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "-q",
                PINNED_FAST_FLIGHTS,
            ])
        except (OSError, subprocess.CalledProcessError):
            # Recover from interrupted or pip-less cache venvs before surfacing a hard failure.
            shutil.rmtree(VENV_DIR, ignore_errors=True)
            create_venv()
            subprocess.check_call([str(py), "-m", "ensurepip", "--upgrade"])
            subprocess.check_call([
                str(py),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "-q",
                PINNED_FAST_FLIGHTS,
            ])


    env = os.environ.copy()
    env["FLIGHT_TICKET_SEARCH_BOOTSTRAPPED"] = "1"
    os.execve(str(py), [str(py), __file__, *sys.argv[1:]], env)


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def nonnegative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or a positive integer")
    return parsed


def nonnegative_float(value: str) -> float:
    parsed = float(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or a positive number")
    return parsed



def iter_dates(start: date, end: date, step_days: int) -> Iterable[date]:
    d = start
    while d <= end:
        yield d
        d += timedelta(days=step_days)


def parse_price(price_text: str | None) -> int | None:
    if not price_text or "unavailable" in price_text.lower():
        return None
    digits = re.sub(r"[^0-9]", "", price_text)
    return int(digits) if digits else None


def money_krw(value: int | float | None) -> str:
    if value is None:
        return "확인 불가"
    return f"₩{int(round(value)):,}"


def validate_airport(code: str, field: str) -> str:
    code = code.strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", code):
        raise SystemExit(f"{field} must be a 3-letter IATA airport code, got: {code!r}")
    return code


def build_query_url(flight_data: list[Any], trip: str, adults: int, seat: str) -> str:
    from fast_flights.flights_impl import Passengers, TFSData

    tfs = TFSData.from_interface(
        flight_data=flight_data,
        trip=trip,
        passengers=Passengers(adults=adults),
        seat=seat,
    ).as_b64().decode("utf-8")
    params = {"tfs": tfs, "hl": "en", "tfu": "EgQIABABIgA", "curr": "KRW"}
    return "https://www.google.com/travel/flights?" + urlencode(params)


def make_flight_data(from_airport: str, to_airport: str, outbound: str, return_date: str | None = None) -> tuple[list[Any], str]:
    origin = validate_airport(from_airport, "from")
    dest = validate_airport(to_airport, "to")
    if origin == dest:
        raise SystemExit("from and to airports must be different")
    outbound_date = parse_date(outbound)

    from fast_flights import FlightData

    data = [FlightData(date=outbound_date.isoformat(), from_airport=origin, to_airport=dest)]
    if return_date:
        inbound_date = parse_date(return_date)
        if inbound_date < outbound_date:
            raise SystemExit("return-date must be on or after date")
        data.append(FlightData(date=inbound_date.isoformat(), from_airport=dest, to_airport=origin))
        return data, "round-trip"
    return data, "one-way"


def fetch_flights(flight_data: list[Any], trip: str, adults: int, seat: str) -> Any:
    from fast_flights import Passengers, get_flights

    return get_flights(
        flight_data=flight_data,
        trip=trip,
        passengers=Passengers(adults=adults),
        seat=seat,
        fetch_mode="fallback",
    )


def normalize_flight(f: Any) -> dict[str, Any]:
    raw = asdict(f)
    price_value = parse_price(raw.get("price"))
    raw["price_value"] = price_value
    raw["price_text"] = money_krw(price_value) if price_value is not None else raw.get("price") or "확인 불가"
    raw["quality"] = "complete" if raw.get("name") and raw.get("departure") and raw.get("arrival") else "partial"
    return raw


def summarize_result(res: Any, query_url: str, limit: int) -> dict[str, Any]:
    flights = [normalize_flight(f) for f in res.flights]
    priced = [f for f in flights if f["price_value"] is not None]
    complete = [f for f in priced if f["quality"] == "complete"]
    best_pool = complete or priced
    best_pool = sorted(best_pool, key=lambda x: x["price_value"] if x["price_value"] is not None else 10**18)
    values = [f["price_value"] for f in priced if f["price_value"] is not None]
    return {
        "meta": {
            "provider": "google-flights-fast-flights",
            "source": "Google Flights public search surface via fast-flights",
            "price_band": getattr(res, "current_price", ""),
            "currency": "KRW",
            "queried_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "booking_search_url": query_url,
            "note": "예약 링크는 특정 판매자 결제 deep link가 아니라 Google Flights 검색 결과 링크입니다.",
        },
        "stats": {
            "result_count": len(flights),
            "priced_count": len(priced),
            "complete_count": len(complete),
            "min_price": min(values) if values else None,
            "avg_price": statistics.mean(values) if values else None,
            "max_price": max(values) if values else None,
        },
        "flights": best_pool[:limit],
    }



def validate_date_text(value: str, field: str) -> date:
    try:
        return parse_date(value)
    except ValueError as exc:
        raise SystemExit(f"{field} must be YYYY-MM-DD, got: {value!r}") from exc


def validate_month_text(value: str) -> None:
    try:
        datetime.strptime(value + "-01", "%Y-%m-%d")
    except ValueError as exc:
        raise SystemExit(f"month must be YYYY-MM, got: {value!r}") from exc


def validate_month_day_text(value: str) -> None:
    try:
        datetime.strptime("2000-" + value, "%Y-%m-%d")
    except ValueError as exc:
        raise SystemExit(f"month-day must be MM-DD, got: {value!r}") from exc


def preflight_validate_args(args: argparse.Namespace) -> None:
    validate_airport(args.from_airport, "from")
    validate_airport(args.to_airport, "to")
    if args.from_airport.strip().upper() == args.to_airport.strip().upper():
        raise SystemExit("from and to airports must be different")

    if args.command == "search":
        outbound = validate_date_text(args.date, "date")
        if args.return_date:
            inbound = validate_date_text(args.return_date, "return-date")
            if inbound < outbound:
                raise SystemExit("return-date must be on or after date")
    elif args.command == "compare-month":
        validate_month_text(args.month)
    elif args.command == "compare-range":
        start = validate_date_text(args.start_date, "start-date")
        end = validate_date_text(args.end_date, "end-date")
        if end < start:
            raise SystemExit("end-date must be on or after start-date")
    elif args.command == "compare-years":
        validate_month_day_text(args.month_day)
        try:
            years = [int(x) for x in re.split(r"[, ]+", args.years.strip()) if x]
        except ValueError as exc:
            raise SystemExit("years must be comma-separated numbers, e.g. 2026,2027") from exc
        if not years:
            raise SystemExit("years is required, e.g. 2026,2027")

def command_search(args: argparse.Namespace) -> dict[str, Any]:
    data, trip = make_flight_data(args.from_airport, args.to_airport, args.date, args.return_date)
    res = fetch_flights(data, trip, args.adults, args.seat)
    url = build_query_url(data, trip, args.adults, args.seat)
    out = summarize_result(res, url, args.limit)
    out["query"] = {
        "from": args.from_airport.upper(),
        "to": args.to_airport.upper(),
        "date": args.date,
        "return_date": args.return_date,
        "trip": trip,
        "adults": args.adults,
        "seat": args.seat,
    }
    return out


def scan_dates(args: argparse.Namespace, dates: list[date]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for idx, d in enumerate(dates):
        try:
            data, trip = make_flight_data(args.from_airport, args.to_airport, d.isoformat(), None)
            res = fetch_flights(data, trip, args.adults, args.seat)
            url = build_query_url(data, trip, args.adults, args.seat)
            summary = summarize_result(res, url, args.limit)
            rows.append({
                "date": d.isoformat(),
                "ok": True,
                "min_price": summary["stats"]["min_price"],
                "avg_price": summary["stats"]["avg_price"],
                "priced_count": summary["stats"]["priced_count"],
                "price_band": summary["meta"]["price_band"],
                "top": summary["flights"][: min(3, args.limit)],
                "booking_search_url": url,
            })
        except Exception as e:  # keep scans robust
            rows.append({"date": d.isoformat(), "ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"})
        if idx != len(dates) - 1 and args.sleep > 0:
            time.sleep(args.sleep)
    prices = [r["min_price"] for r in rows if r.get("ok") and r.get("min_price") is not None]
    ok_rows = [r for r in rows if r.get("ok")]
    cheapest = sorted((r for r in ok_rows if r.get("min_price") is not None), key=lambda r: r["min_price"])[: args.limit]
    return {
        "meta": {
            "provider": "google-flights-fast-flights",
            "currency": "KRW",
            "queried_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "sampled_dates": len(rows),
            "successful_dates": len(ok_rows),
            "note": "월/연도 비교는 지정 날짜들을 실제 조회해 산출한 샘플 기반 비교입니다. Google Flights 가격은 수시 변동됩니다.",
        },
        "query": {
            "from": args.from_airport.upper(),
            "to": args.to_airport.upper(),
            "adults": args.adults,
            "seat": args.seat,
        },
        "stats": {
            "min_price": min(prices) if prices else None,
            "avg_of_daily_min": statistics.mean(prices) if prices else None,
            "max_of_daily_min": max(prices) if prices else None,
        },
        "cheapest_dates": cheapest,
        "rows": rows,
    }


def command_compare_month(args: argparse.Namespace) -> dict[str, Any]:
    month_start = datetime.strptime(args.month + "-01", "%Y-%m-%d").date()
    if month_start.month == 12:
        month_end = date(month_start.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(month_start.year, month_start.month + 1, 1) - timedelta(days=1)
    step = 1 if args.sample == "daily" else 7
    dates = list(iter_dates(month_start, month_end, step))
    if args.max_dates:
        dates = dates[: args.max_dates]
    out = scan_dates(args, dates)
    out["query"]["month"] = args.month
    out["query"]["sample"] = args.sample
    return out


def command_compare_range(args: argparse.Namespace) -> dict[str, Any]:
    start = parse_date(args.start_date)
    end = parse_date(args.end_date)
    if end < start:
        raise SystemExit("end-date must be on or after start-date")
    step = args.step_days
    dates = list(iter_dates(start, end, step))
    if args.max_dates:
        dates = dates[: args.max_dates]
    out = scan_dates(args, dates)
    out["query"]["start_date"] = args.start_date
    out["query"]["end_date"] = args.end_date
    out["query"]["step_days"] = step
    return out


def command_compare_years(args: argparse.Namespace) -> dict[str, Any]:
    years = [int(x) for x in re.split(r"[, ]+", args.years.strip()) if x]
    if not years:
        raise SystemExit("years is required, e.g. 2026,2027")
    mmdd = args.month_day
    dates = [datetime.strptime(f"{year}-{mmdd}", "%Y-%m-%d").date() for year in years]
    out = scan_dates(args, dates)
    out["query"]["years"] = years
    out["query"]["month_day"] = mmdd
    return out


def print_markdown(payload: dict[str, Any]) -> None:
    meta = payload.get("meta", {})
    query = payload.get("query", {})
    stats = payload.get("stats", {})
    print(f"provider: {meta.get('provider')}")
    print(f"queried_at: {meta.get('queried_at')}")
    print(f"query: {json.dumps(query, ensure_ascii=False)}")
    print()
    if "flights" in payload:
        print(f"price_band: {meta.get('price_band')}")
        print(f"min/avg/max: {money_krw(stats.get('min_price'))} / {money_krw(stats.get('avg_price'))} / {money_krw(stats.get('max_price'))}")
        print(f"booking_search_url: {meta.get('booking_search_url')}")
        print("\nflights:")
        for i, f in enumerate(payload.get("flights", []), 1):
            print(f"{i}. {f.get('name') or '항공편 상세 확인 불가'} | {f.get('departure') or '시간 확인 불가'} -> {f.get('arrival') or '시간 확인 불가'} | {f.get('duration') or '소요시간 확인 불가'} | stops={f.get('stops')} | {f.get('price_text')}")
    else:
        print(f"sampled/success: {meta.get('sampled_dates')} / {meta.get('successful_dates')}")
        print(f"min / avg(daily min) / max(daily min): {money_krw(stats.get('min_price'))} / {money_krw(stats.get('avg_of_daily_min'))} / {money_krw(stats.get('max_of_daily_min'))}")
        print("\ncheapest_dates:")
        for i, r in enumerate(payload.get("cheapest_dates", []), 1):
            print(f"{i}. {r.get('date')} | min={money_krw(r.get('min_price'))} | avg={money_krw(r.get('avg_price'))} | band={r.get('price_band')} | {r.get('booking_search_url')}")
        failures = [r for r in payload.get("rows", []) if not r.get("ok")]
        if failures:
            print("\nfailures:")
            for r in failures[:5]:
                print(f"- {r.get('date')}: {r.get('error')}")
    if meta.get("note"):
        print(f"\nnote: {meta.get('note')}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Free Google Flights-based flight search and comparison helper")
    sub = p.add_subparsers(dest="command", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--from", dest="from_airport", required=True, help="IATA origin airport, e.g. ICN")
        sp.add_argument("--to", dest="to_airport", required=True, help="IATA destination airport, e.g. NRT")
        sp.add_argument("--adults", type=positive_int, default=1)
        sp.add_argument("--seat", choices=["economy", "premium-economy", "business", "first"], default="economy")
        sp.add_argument("--limit", type=positive_int, default=5)
        sp.add_argument("--sleep", type=nonnegative_float, default=1.5, help="seconds between comparison queries")

        sp.add_argument("--format", choices=["json", "markdown"], default="markdown")

    s = sub.add_parser("search", help="single one-way or round-trip search")
    add_common(s)
    s.add_argument("--date", required=True, help="YYYY-MM-DD outbound date")
    s.add_argument("--return-date", help="YYYY-MM-DD return date for round trip")
    s.set_defaults(func=command_search)

    m = sub.add_parser("compare-month", help="sample a whole month and rank cheapest dates")
    add_common(m)
    m.add_argument("--month", required=True, help="YYYY-MM")
    m.add_argument("--sample", choices=["weekly", "daily"], default="weekly")
    m.add_argument("--max-dates", type=nonnegative_int, default=0, help="cap dates for quick tests; 0 means no cap")

    m.set_defaults(func=command_compare_month)

    r = sub.add_parser("compare-range", help="compare a custom date range")
    add_common(r)
    r.add_argument("--start-date", required=True)
    r.add_argument("--end-date", required=True)
    r.add_argument("--step-days", type=positive_int, default=7)
    r.add_argument("--max-dates", type=nonnegative_int, default=0)

    r.set_defaults(func=command_compare_range)

    y = sub.add_parser("compare-years", help="compare the same month-day across years")
    add_common(y)
    y.add_argument("--years", required=True, help="comma separated years, e.g. 2026,2027")
    y.add_argument("--month-day", required=True, help="MM-DD, e.g. 06-01")
    y.add_argument("--max-dates", type=nonnegative_int, default=0)

    y.set_defaults(func=command_compare_years)
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    preflight_validate_args(args)

    ensure_runtime()
    if getattr(args, "max_dates", 0) == 0:
        args.max_dates = None
    payload = args.func(args)
    if args.format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print_markdown(payload)


if __name__ == "__main__":
    main()
