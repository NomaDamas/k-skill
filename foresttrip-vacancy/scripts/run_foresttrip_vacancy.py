#!/usr/bin/env python3
"""Read-only foresttrip.go.kr vacancy lookup helper.

The script logs in with Playwright to obtain a CSRF token and session cookies,
extracts forest IDs from the official monthly reservation status page, then
queries the read-only monthly availability JSON endpoint.

It intentionally does not click booking buttons, submit reservation forms,
handle payment, solve captcha, or bypass queues.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

LOGIN_URL = "https://www.foresttrip.go.kr/com/login.do"
RSRVT_PAGE = "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtSmplStatus.do"
POST_URL = "https://www.foresttrip.go.kr/rep/or/selectRsrvtAvailInfoListForMonthRsrvtSmpl.do"


@dataclass
class Session:
    cookies: dict[str, str]
    csrf: str
    user_agent: str
    forests: dict[str, str]
    expires_at: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only foresttrip.go.kr vacancy lookup.",
    )
    target = parser.add_argument_group("target selection")
    target.add_argument("--all", action="store_true", help="Scan all extracted forest IDs.")
    target.add_argument(
        "--forest-id",
        action="append",
        help="ForestTrip insttId. Can be passed multiple times or comma-separated.",
    )
    target.add_argument(
        "--forest-name",
        action="append",
        help="Substring to match against official forest names.",
    )

    parser.add_argument("--json", action="store_true", help="Print JSON output.")
    parser.add_argument("--text", action="store_true", help="Print human-readable output.")
    parser.add_argument("--dates", help="Comma-separated YYYYMMDD dates.")
    parser.add_argument("--categories", default="01,02", help="Comma-separated category codes.")
    parser.add_argument("--concurrency", type=int, default=20, help="Parallel POST workers.")
    parser.add_argument("--week-range", type=int, default=1, help="Weeks ahead to scan.")
    parser.add_argument("--refresh-session", action="store_true", help="Ignore session cache.")
    parser.add_argument("--check-deps", action="store_true", help="Check Python and Playwright runtime dependencies.")
    parser.add_argument(
        "--session-cache",
        default="~/.cache/k-skill/foresttrip-vacancy/session.json",
        help="Session cache path.",
    )
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"missing required environment variable: {name}")
    return value


def check_dependencies(*, launch_browser: bool = True) -> None:
    if sys.version_info < (3, 9):
        raise SystemExit("python 3.9+ is required")
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "playwright is required. Install with: python3 -m pip install playwright"
        ) from exc

    if not launch_browser:
        return

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser.close()
    except PlaywrightError as exc:
        raise SystemExit(
            "playwright chromium browser is required. Install with: "
            "python3 -m playwright install chromium"
        ) from exc


def load_session_cache(path: Path) -> Session | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() > float(data.get("expires_at", 0)):
            return None
        return Session(
            cookies=dict(data["cookies"]),
            csrf=str(data["csrf"]),
            user_agent=str(data["user_agent"]),
            forests=dict(data["forests"]),
            expires_at=float(data["expires_at"]),
        )
    except Exception:
        return None


def save_session_cache(path: Path, session: Session) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(session), ensure_ascii=False), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def bootstrap_session(*, forest_id: str, forest_pw: str, ttl_sec: int = 600) -> Session:
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "playwright is required. Install with: python3 -m pip install playwright "
            "&& python3 -m playwright install chromium"
        ) from exc

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except PlaywrightError as exc:
            raise SystemExit(
                "playwright chromium browser is required. Install with: "
                "python3 -m playwright install chromium"
            ) from exc
        page = browser.new_page()
        page.goto(LOGIN_URL)
        page.fill("#mmberId", forest_id)
        page.fill("#gnrlMmberPssrd", forest_pw)
        page.click("input.loginBtn")
        page.wait_for_load_state("networkidle")
        page.goto(RSRVT_PAGE)
        page.wait_for_load_state("networkidle")

        csrf_locator = page.locator('input[name="_csrf"]')
        if csrf_locator.count() == 0:
            browser.close()
            raise SystemExit("login succeeded page did not expose a CSRF token")
        csrf = csrf_locator.first.get_attribute("value") or ""

        forests: dict[str, str] = {}
        regions = page.evaluate(
            """
            () => Array.from(document.querySelector('#srchSido').options)
              .slice(1)
              .map(o => ({ value: o.value, text: o.textContent.trim() }))
            """
        )
        for region in regions:
            value = region.get("value")
            if not value:
                continue
            page.select_option("#srchSido", value=value)
            page.wait_for_timeout(500)
            options = page.evaluate(
                """
                () => Array.from(document.querySelector('#srchInstt').options)
                  .slice(1)
                  .map(o => ({ value: o.value, text: o.textContent.trim() }))
                """
            )
            for opt in options:
                fid = str(opt.get("value") or "").strip()
                name = str(opt.get("text") or "").strip()
                if fid and name:
                    forests[fid] = name

        cookies = {cookie["name"]: cookie["value"] for cookie in page.context.cookies()}
        user_agent = page.evaluate("() => navigator.userAgent")
        browser.close()

    if not csrf or not cookies:
        raise SystemExit("failed to bootstrap foresttrip session")
    if not forests:
        raise SystemExit("failed to extract forest list from reservation page")
    return Session(
        cookies=cookies,
        csrf=csrf,
        user_agent=user_agent,
        forests=forests,
        expires_at=time.time() + ttl_sec,
    )


def get_session(args: argparse.Namespace) -> Session:
    cache_path = Path(args.session_cache).expanduser()
    if not args.refresh_session:
        cached = load_session_cache(cache_path)
        if cached is not None:
            return cached
    session = bootstrap_session(
        forest_id=require_env("KSKILL_FORESTTRIP_ID"),
        forest_pw=require_env("KSKILL_FORESTTRIP_PASSWORD"),
    )
    save_session_cache(cache_path, session)
    return session


def split_csv(values: list[str] | None) -> list[str]:
    out: list[str] = []
    for value in values or []:
        out.extend(part.strip() for part in value.split(",") if part.strip())
    return out


def resolve_targets(args: argparse.Namespace, forests: dict[str, str]) -> dict[str, str]:
    if args.all:
        return dict(sorted(forests.items(), key=lambda item: item[1]))

    requested_ids = split_csv(args.forest_id)
    requested_names = split_csv(args.forest_name)
    targets: dict[str, str] = {}
    for fid in requested_ids:
        targets[fid] = forests.get(fid, fid)
    for needle in requested_names:
        matches = {
            fid: name
            for fid, name in forests.items()
            if needle.replace(" ", "") in name.replace(" ", "")
        }
        targets.update(matches)

    if not targets:
        raise SystemExit("choose a target with --all, --forest-id, or --forest-name")
    return dict(sorted(targets.items(), key=lambda item: item[1]))


def build_headers(session: Session) -> dict[str, str]:
    cookie_header = "; ".join(f"{k}={v}" for k, v in session.cookies.items())
    return {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Content-Type": "application/json; charset=UTF-8",
        "Cookie": cookie_header,
        "Origin": "https://www.foresttrip.go.kr",
        "Referer": RSRVT_PAGE,
        "User-Agent": session.user_agent,
        "X-CSRF-Token": session.csrf,
        "X-Requested-With": "XMLHttpRequest",
    }


def fetch_one(
    *,
    session: Session,
    forest_id: str,
    category: str,
    today: str,
    last_day: str,
) -> tuple[str, str, list[dict[str, Any]] | None, str | None]:
    payload = {
        "insttId": forest_id,
        "upperGoodsClsscCd": category,
        "srchDate": today,
        "lastDay": last_day,
        "inqurSctin": "02",
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        POST_URL,
        data=body,
        headers=build_headers(session),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                return forest_id, category, None, f"http_{response.status}"
            data = json.loads(response.read().decode("utf-8"))
            if isinstance(data, list):
                return forest_id, category, data, None
            return forest_id, category, None, "unexpected_payload"
    except urllib.error.HTTPError as exc:
        return forest_id, category, None, f"http_{exc.code}"
    except Exception as exc:
        return forest_id, category, None, str(exc)


def is_available(row: dict[str, Any]) -> bool:
    return row.get("rsrvtAvail") == "Y" and row.get("rsrvtCnt") == 0


def normalize_row(row: dict[str, Any], forests: dict[str, str]) -> dict[str, Any]:
    instt_id = str(row.get("insttId") or "")
    return {
        "forest_id": instt_id,
        "forest": forests.get(instt_id, row.get("insttNm") or instt_id),
        "use_dt": row.get("useDt") or "",
        "day": row.get("dywkDtTpcd"),
        "name": row.get("goodsNm") or "",
        "area": row.get("insttArea"),
        "capacity": row.get("mxmmAccptCnt"),
        "category": row.get("goodsClsscNm"),
        "region": row.get("insttAreaNm"),
        "waiting_possible": row.get("wtngPssblYn"),
    }


def collect_results(
    *,
    session: Session,
    targets: dict[str, str],
    categories: tuple[str, ...],
    dates: set[str] | None,
    week_range: int,
    concurrency: int,
) -> dict[str, Any]:
    today = datetime.now().strftime("%Y%m%d")
    last_day = (datetime.now() + timedelta(weeks=week_range)).strftime("%Y%m%d")
    failures: list[dict[str, str]] = []
    rows: list[dict[str, Any]] = []

    jobs = [
        (forest_id, category)
        for forest_id in targets
        for category in categories
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = [
            pool.submit(
                fetch_one,
                session=session,
                forest_id=forest_id,
                category=category,
                today=today,
                last_day=last_day,
            )
            for forest_id, category in jobs
        ]
        for future in concurrent.futures.as_completed(futures):
            forest_id, category, data, error = future.result()
            if error is not None or data is None:
                failures.append({"forest_id": forest_id, "category": category, "error": error or "unknown"})
                continue
            for row in data:
                if not is_available(row):
                    continue
                normalized = normalize_row(row, session.forests)
                if dates is not None and normalized["use_dt"] not in dates:
                    continue
                rows.append(normalized)

    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for row in sorted(rows, key=lambda item: (item["forest"], item["use_dt"], item["name"])):
        grouped.setdefault(row["forest"], {}).setdefault(row["use_dt"], []).append(row)

    return {
        "forests_scanned": len(targets),
        "filter_hits": len(rows),
        "fetch_failures": len(failures),
        "failures": failures[:20],
        "concurrency": concurrency,
        "date_range": {"from": today, "to": last_day},
        "results": [
            {
                "forest": forest_name,
                "dates": [
                    {"use_dt": use_dt, "rooms": rooms}
                    for use_dt, rooms in sorted(rows_by_date.items())
                ],
            }
            for forest_name, rows_by_date in sorted(grouped.items())
        ],
    }


def print_text(payload: dict[str, Any]) -> None:
    print("=== ForestTrip Vacancy Lookup ===")
    print(
        f"filter_hits: {payload['filter_hits']}   "
        f"fetch_failures: {payload['fetch_failures']}   "
        f"forests_scanned: {payload['forests_scanned']}"
    )
    if not payload["results"]:
        print("(no available rooms at lookup time)")
        return
    for forest in payload["results"]:
        print(f"\n{forest['forest']}")
        for date_group in forest["dates"]:
            rooms = date_group["rooms"]
            print(f"  {date_group['use_dt']} - {len(rooms)} slot(s)")
            for room in rooms[:8]:
                capacity = room["capacity"] if room["capacity"] is not None else "?"
                area = room["area"] if room["area"] is not None else "?"
                print(f"    - {room['name']} / {room['category']} / {area}sqm / max {capacity}")


def main() -> int:
    args = parse_args()
    if args.check_deps:
        check_dependencies()
        print("foresttrip-vacancy dependencies look ready")
        return 0
    session = get_session(args)
    targets = resolve_targets(args, session.forests)
    categories = tuple(part.strip() for part in args.categories.split(",") if part.strip())
    dates = {part.strip() for part in args.dates.split(",") if part.strip()} if args.dates else None
    payload = collect_results(
        session=session,
        targets=targets,
        categories=categories,
        dates=dates,
        week_range=args.week_range,
        concurrency=args.concurrency,
    )

    if args.text and not args.json:
        print_text(payload)
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["fetch_failures"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
