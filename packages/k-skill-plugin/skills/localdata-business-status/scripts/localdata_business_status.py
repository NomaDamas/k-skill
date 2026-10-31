"""LOCALDATA (지방행정 인허가) business operating-status lookup (unauthenticated).

행정안전부 지방행정 인허가데이터를 file.localdata.go.kr 지역별 CSV로 직접 받아
동네 사업장(식당·카페·숙박·약국 등 인허가 업종 208종)의 영업/휴업/폐업 상태를
조회한다. 인증키가 필요 없는 공개 파일 서버이므로 프록시를 거치지 않는다.

The data does NOT contain business registration numbers, so this is a trade-name
(사업장명) string match only — it cannot assert identity against a given number.
전국 통파일이 업종당 수백 MB라 시군구 단위 파일을 받으려면 --region 이 필요하다.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

BASE = "https://file.localdata.go.kr"
LANDING = f"{BASE}/file/general_restaurants/info"
SOURCE = ("지방행정 인허가데이터(LOCALDATA) 업종별 영업상태 — 행정안전부 "
          "(file.localdata.go.kr 지역별 CSV, 매일 갱신·2일 전 기준 현행화)")
USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
KST = dt.timezone(dt.timedelta(hours=9))

_DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
INDUSTRIES: dict = json.loads((_DATA_DIR / "localdata_industries.json").read_text(encoding="utf-8"))
DEFAULT_INDUSTRIES = ("general_restaurants", "rest_cafes", "lodgings")

RESULT_COLUMNS = ("사업장명", "영업상태명", "상세영업상태명", "인허가일자", "폐업일자",
                  "업태구분명", "도로명주소", "지번주소", "데이터갱신시점")

CACHE_DIR = pathlib.Path.home() / ".cache" / "k-skill" / "localdata-business-status"
CACHE_TTL_SECONDS = 24 * 3600  # 원천이 일 단위 갱신이므로 1일 캐시

IDENTITY_NOTE = ("인허가 자료에는 사업자등록번호가 수록되지 않아 입력 사업자번호와의 "
                 "동일성은 확인할 수 없다 — 상호(사업장명) 문자열 일치 후보의 사실만 "
                 "나열하며, 동명 상호 가능성은 사용자가 판단한다. 자료는 매일 갱신되며 "
                 "2일 전 기준으로 현행화된다.")


def _now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="seconds")


def _envelope(status: str, *, result: dict | None = None, note: str | None = None) -> dict:
    return {
        "source": SOURCE,
        "looked_up_at": _now_iso(),
        "status": status,
        "result": result,
        "origin": "unauthenticated-public",
        "note": note,
    }


def org_codes() -> dict:
    return json.loads((_DATA_DIR / "localdata_orgcodes.json").read_text(encoding="utf-8"))


def resolve_industry(token: str) -> tuple[str | None, list[str]]:
    """업종 지정 해석 — slug 정확 일치 또는 한글명 일치. (slug, 후보들)."""
    token = token.strip()
    if token in INDUSTRIES:
        return token, [INDUSTRIES[token]]
    squeezed = token.replace(" ", "")
    exact = [(slug, nm) for slug, nm in INDUSTRIES.items()
             if nm.replace(" ", "") == squeezed
             or nm.split("_", 1)[-1].replace(" ", "") == squeezed]
    if len(exact) == 1:
        return exact[0][0], [exact[0][1]]
    hits = exact or [(slug, nm) for slug, nm in INDUSTRIES.items()
                     if squeezed in nm.replace(" ", "")]
    if len(hits) == 1:
        return hits[0][0], [hits[0][1]]
    return None, [nm for _, nm in hits]


def _resolve_region(region: str) -> tuple[str | None, list[str]]:
    table = org_codes()
    region = region.strip()
    if region in table:
        return table[region], [region]
    squeezed = region.replace(" ", "")
    hits = [nm for nm in table if squeezed in nm.replace(" ", "")]
    if len(hits) == 1:
        return table[hits[0]], hits
    return None, hits


def _fetch_csv(slug: str, org_code: str, *, opener: Any = None) -> str:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{slug}_{org_code}.csv"
    if cache.exists() and time.time() - cache.stat().st_mtime < CACHE_TTL_SECONDS:
        return cache.read_text(encoding="utf-8")
    params = urllib.parse.urlencode({"orgCode": org_code})
    request = urllib.request.Request(
        f"{BASE}/file/download/{slug}/info?{params}",
        headers={"User-Agent": USER_AGENT, "Referer": LANDING},
        method="GET",
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(request, timeout=120) as response:
        status = getattr(response, "status", 200)
        content_type = response.headers.get("Content-Type", "") if hasattr(response, "headers") else ""
        if status != 200 or "csv" not in (content_type or ""):
            raise RuntimeError(f"HTTP {status} ({content_type or '?'})")
        text = response.read().decode("cp949", errors="replace")
    cache.write_text(text, encoding="utf-8")
    return text


def _search_rows(csv_text: str, name: str) -> list[dict]:
    needle = name.replace(" ", "")
    out = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        biz_name = (row.get("사업장명") or "").strip()
        if needle and needle in biz_name.replace(" ", ""):
            out.append({col: (row.get(col) or "").strip() for col in RESULT_COLUMNS})
    return out


def lookup(name: str, region: str, industries: list[str] | None = None, *, opener: Any = None) -> dict:
    """인허가 영업상태 조회 — 상호+지역 필수 (자료에 사업자번호 없음)."""
    if not (name or "").strip():
        return _envelope("unavailable",
                         note="인허가 자료에 사업자등록번호가 수록되지 않아 상호 없이 검색할 수 "
                              "없습니다. --name 으로 상호를 지정하세요.")
    if not (region or "").strip():
        return _envelope("unavailable",
                         note="전국 통파일이 업종당 수백 MB라 시군구 지역 지정이 필요합니다. "
                              "--region 으로 지정하세요 (예: 제주제주시, 서울종로구, 경기수원시).")
    name = name.strip()

    code, hits = _resolve_region(region)
    if code is None:
        return _envelope("unavailable",
                         note=(f"지역 '{region}' 특정 실패 — "
                               + (f"후보 {len(hits)}곳: {', '.join(hits[:8])}. 하나로 지정하세요."
                                  if hits else "등록 지자체명과 일치하지 않습니다 (예: 서울종로구).")))

    selected, bad = [], []
    for token in (industries or DEFAULT_INDUSTRIES):
        slug, cand = resolve_industry(token)
        if slug:
            selected.append(slug)
        else:
            bad.append(f"'{token}'" + (f" (후보 {len(cand)}종: {', '.join(cand[:6])})" if cand
                                       else " (일치 업종 없음)"))
    if bad:
        return _envelope("unavailable",
                         note=(f"업종 특정 실패: {'; '.join(bad)}. slug 또는 한글명(예: 약국, "
                               "일반음식점, 숙박업)으로 하나씩 지정하세요. 총 208종 지원."))

    searched, failures = {}, []
    try:
        for slug in selected:
            try:
                rows = _search_rows(_fetch_csv(slug, code, opener=opener), name)
                searched[slug] = {"industry": INDUSTRIES[slug], "match_count": len(rows), "matches": rows}
            except (urllib.error.URLError, RuntimeError) as err:
                failures.append(f"{INDUSTRIES[slug]}({type(err).__name__})")
    except Exception as err:  # 경계 계약: 어떤 오류든 강등
        return _envelope("unavailable", note=f"예상 외 오류({type(err).__name__}).")

    if not searched:
        return _envelope("unavailable",
                         note=f"전 업종 다운로드 실패: {', '.join(failures)}. "
                              f"수동 확인: https://www.localdata.go.kr")

    result = {
        "query": {"name": name, "region": hits[0], "org_code": code},
        "industries_searched": searched,
        "total_match_count": sum(v["match_count"] for v in searched.values()),
        "identity_note": IDENTITY_NOTE,
    }
    note = (f"일부 업종 다운로드 실패: {', '.join(failures)}" if failures else None)
    return _envelope("ok", result=result, note=note)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="지방행정 인허가 영업상태 조회 (무인증)")
    parser.add_argument("--name", required=True, help="상호(사업장명) — 필수")
    parser.add_argument("--region", required=True, help="시군구 (예: 제주제주시, 서울종로구)")
    parser.add_argument("--industry", action="append", dest="industries",
                        help="업종 slug 또는 한글명(예: 약국, 숙박업). 여러 번 지정 가능. 생략 시 음식점·카페·숙박")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(json.dumps(lookup(args.name, args.region, args.industries), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
