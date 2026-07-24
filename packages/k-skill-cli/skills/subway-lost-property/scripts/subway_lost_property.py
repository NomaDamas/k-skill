#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Callable

LOST112_LIST_URL = "https://www.lost112.go.kr/find/findList.do"
LOST112_REFERER_URL = "https://www.lost112.go.kr/"
LOST112_OUTPUT_FILE = "lost112-search-result.html"
LOST112_CURL_MAX_TIME = 60
SEOUL_METRO_LOST_CENTER_URL = "https://www.seoulmetro.co.kr/kr/page.do?menuIdx=541"
CURL_USER_AGENT = "Mozilla/5.0"

Runner = Callable[..., subprocess.CompletedProcess[str]]


@dataclass(frozen=True)
class SearchQuery:
    station: str
    item: str | None = None
    line: str | None = None
    start_date: date | None = None
    end_date: date | None = None


@dataclass(frozen=True)
class SearchPlan:
    query: SearchQuery
    payload: dict[str, str]
    suggested_keywords: list[str]
    official_sources: list[dict[str, str]]
    guidance: list[str]
    cautions: list[str]
    curl_example: str

    def to_dict(self) -> dict[str, object]:
        return {
            "query": {
                **asdict(self.query),
                "start_date": self.query.start_date.isoformat() if self.query.start_date else None,
                "end_date": self.query.end_date.isoformat() if self.query.end_date else None,
            },
            "payload": self.payload,
            "suggested_keywords": self.suggested_keywords,
            "official_sources": self.official_sources,
            "guidance": self.guidance,
            "cautions": self.cautions,
            "curl_example": self.curl_example,
        }


def normalize_station(station: str) -> str:
    normalized = " ".join(station.split())
    if not normalized:
        raise ValueError("station is required")
    return normalized


def expand_station_keywords(station: str) -> list[str]:
    normalized = normalize_station(station)
    keywords = [normalized]
    if normalized.endswith("역") and len(normalized) > 1:
        keywords.append(normalized[:-1])
    return list(dict.fromkeys(keyword for keyword in keywords if keyword))


def build_search_payload(query: SearchQuery) -> dict[str, str]:
    station = normalize_station(query.station)
    if not query.start_date or not query.end_date:
        raise ValueError("start_date and end_date are required")

    payload = {
        "pageIndex": "1",
        "START_YMD": query.start_date.strftime("%Y%m%d"),
        "END_YMD": query.end_date.strftime("%Y%m%d"),
        "PRDT_NM": (query.item or "").strip(),
        "DEP_PLACE": station,
        "SITE": "V",
        "PLACE_SE_CD": "",
        "FD_LCT_CD": "",
        "FD_SIGUNGU": "",
        "IN_NM": "",
        "ATC_ID": "",
        "F_ATC_ID": "",
        "PRDT_CL_CD01": "",
        "PRDT_CL_CD02": "",
        "PRDT_CL_NM": "",
        "MENU_NO": "",
    }
    return payload


def _base_curl_command(url: str | None, max_time: int, *, follow_redirects: bool = True) -> list[str]:
    command = [
        "curl",
        "-fsS",
        "--http1.1",
        "--tls-max",
        "1.2",
        "--retry",
        "1",
        "--max-time",
        str(max_time),
        "-A",
        CURL_USER_AGENT,
    ]
    if follow_redirects:
        command.insert(2, "-L")
    if url:
        command.append(url)
    return command


def build_curl_command(payload: dict[str, str]) -> str:
    command = _base_curl_command("", LOST112_CURL_MAX_TIME, follow_redirects=False)
    command.extend(["--referer", LOST112_REFERER_URL])
    for key, value in payload.items():
        if value:
            command.extend(["--data-urlencode", f"{key}={value}"])
    command.extend(["--output", LOST112_OUTPUT_FILE])
    command.append(LOST112_LIST_URL)
    return " ".join(shlex.quote(part) for part in command)


def probe_source(name: str, url: str, runner: Runner = subprocess.run) -> dict[str, str]:
    command = _base_curl_command(url, 15)
    try:
        completed = runner(command, capture_output=True, text=True, check=True)
        return {
            "name": name,
            "url": url,
            "status": "reachable",
            "detail": f"fetched {len(completed.stdout)} bytes",
        }
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip() or "unknown error"
        status = "timeout" if error.returncode == 28 or "timed out" in detail.lower() else "error"
        return {"name": name, "url": url, "status": status, "detail": detail}


def build_search_plan(
    station: str,
    item: str | None = None,
    line: str | None = None,
    days: int = 30,
    today: date | None = None,
    verify_live: bool = False,
    probe: Callable[[str, str], dict[str, str]] | None = None,
) -> SearchPlan:
    normalized_station = normalize_station(station)
    if days <= 0:
        raise ValueError("days must be positive")

    today = today or date.today()
    end_date = today
    start_date = today - timedelta(days=days)
    query = SearchQuery(
        station=normalized_station,
        item=(item or "").strip() or None,
        line=(line or "").strip() or None,
        start_date=start_date,
        end_date=end_date,
    )
    payload = build_search_payload(query)
    suggested_keywords = expand_station_keywords(normalized_station)
    if query.line:
        suggested_keywords.append(query.line)
    suggested_keywords = list(dict.fromkeys(suggested_keywords))

    default_sources = [
        {
            "name": "LOST112 습득물 목록",
            "url": LOST112_LIST_URL,
            "purpose": "경찰 이외 기관(지하철·공항 등) 습득물 검색",
            "status": "not_checked",
        },
        {
            "name": "서울교통공사 유실물센터",
            "url": SEOUL_METRO_LOST_CENTER_URL,
            "purpose": "서울 지하철 공식 유실물 진입점/추가 안내",
            "status": "not_checked",
        },
    ]
    if verify_live:
        probe = probe or probe_source
        default_sources = [
            {**probe(source["name"], source["url"]), "purpose": source["purpose"]}
            for source in default_sources
        ]

    item_hint = query.item or "분실물"
    guidance = [
        f"먼저 LOST112에서 보관장소를 '{normalized_station}' 로, 물품명은 '{item_hint}' 로 검색합니다.",
        "검색 폼에서는 SITE=V(경찰이외의기관) 기준으로 지하철/공항 등 기관 습득물을 우선 좁힙니다.",
        "결과가 없으면 역명에서 '역'을 뺀 키워드나 호선명을 추가로 검색합니다.",
        "서울교통공사 안내 페이지를 함께 열어 운영사 유실물센터/후속 절차를 확인합니다.",
    ]
    cautions = [
        "v1은 공식 웹 조회 경로를 구조화하는 안내형/하이브리드 스킬이다.",
        "공개 API가 확인되지 않아 자동 결과 수집은 보장하지 않는다.",
        "공식 사이트 응답 속도가 느리면 manual open으로 전환한다.",
    ]

    return SearchPlan(
        query=query,
        payload=payload,
        suggested_keywords=suggested_keywords,
        official_sources=default_sources,
        guidance=guidance,
        cautions=cautions,
        curl_example=build_curl_command(payload),
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate official subway lost-property search guidance.")
    parser.add_argument("--station", required=True, help="역명 또는 보관장소 키워드")
    parser.add_argument("--item", help="예: 지갑, 이어폰")
    parser.add_argument("--line", help="예: 2호선")
    parser.add_argument("--days", type=int, default=30, help="검색 기간(일), 기본값 30")
    parser.add_argument("--verify-live", action="store_true", help="공식 페이지 reachability를 curl로 확인")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    plan = build_search_plan(
        station=args.station,
        item=args.item,
        line=args.line,
        days=args.days,
        verify_live=args.verify_live,
    )
    print(json.dumps(plan.to_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
