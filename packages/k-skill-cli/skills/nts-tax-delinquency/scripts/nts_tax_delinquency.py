"""NTS high-amount/habitual tax-delinquent disclosure search (unauthenticated).

국세청 고액·상습체납자 명단공개를 nts.go.kr 공개 검색으로 직접 조회한다.
인증키가 필요 없는 공개 read-only endpoint이므로 프록시를 거치지 않는다.

The disclosure list does NOT contain business registration numbers, so this is a
trade-name / corporate-name string match only — it cannot assert that a hit is
the same entity as a given business number.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

URL = "https://www.nts.go.kr/nts/ad/openInfo/selectList.do"
SOURCE = ("국세청 고액·상습체납자 명단공개 검색 — nts.go.kr 누리집 공개 검색 "
          "(무인증, www.nts.go.kr/nts/ad/openInfo/selectList.do)")
MANUAL_NOTE = f"수동 확인: 브라우저에서 {URL} 접속 후 명단공개 검색"
USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
KST = dt.timezone(dt.timedelta(hours=9))

CORP_COLUMNS = ("no", "공개년도", "법인명", "대표자", "업종", "법인소재지",
                "대표자주소", "총체납액", "세목", "납기", "체납건수", "체납요지")
INDIV_COLUMNS = ("no", "공개년도", "성명", "연령", "상호", "직업(업종)", "체납자주소",
                 "총체납액", "세목", "납기", "체납건수", "체납요지")

IDENTITY_NOTE = ("명단공개 자료에는 사업자등록번호가 수록되지 않아 입력 사업자번호와의 "
                 "동일성은 확인할 수 없다 — 상호·법인명 문자열 일치 후보의 공개 사실만 "
                 "나열하며, 동명 상호일 가능성은 사용자가 판단한다.")

_HEADING_MARKER = "고액상습체납자"
_ZERO_MARKER = "조회된 데이터가 없습니다"


class StructureChanged(RuntimeError):
    """페이지 구조가 기대 마커와 다름 — 우아한 강등 트리거."""


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


def _strip_tags(fragment: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fragment)).strip()


def parse_rows(html: str, columns: tuple) -> list[dict]:
    if _HEADING_MARKER not in html.replace(" ", ""):
        raise StructureChanged("명단공개 페이지 마커(고액상습체납자) 미발견")
    if _ZERO_MARKER in html:
        return []
    cells = [_strip_tags(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", html, re.S)]
    if not cells or len(cells) % len(columns) != 0:
        raise StructureChanged(f"표 셀 수({len(cells)})가 컬럼 수({len(columns)})의 배수가 아님")
    return [dict(zip(columns, cells[i:i + len(columns)]))
            for i in range(0, len(cells), len(columns))]


def _post(data: dict[str, str], *, opener: Any = None) -> str:
    request = urllib.request.Request(
        URL,
        data=urllib.parse.urlencode(data).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    open_fn = opener or urllib.request.urlopen
    with open_fn(request, timeout=20) as response:
        status = getattr(response, "status", 200)
        if status != 200:
            raise StructureChanged(f"HTTP {status}")
        return response.read().decode("utf-8", errors="replace")


def _search(tcd: str, search_type: str, value: str, columns: tuple, *, opener: Any = None) -> list[dict]:
    html = _post({
        "tcd": tcd,
        "searchType": search_type,
        "searchValue": value,
        "searchYear": "",
        "currPage": "1",
        "pageIndex": "100",
        "search_order": "1",
    }, opener=opener)
    return parse_rows(html, columns)


def lookup(name: str, *, opener: Any = None) -> dict:
    """고액·상습체납자 명단공개 대조 — 법인 명단(법인명)·개인 명단(상호) 각 1회."""
    if not (name or "").strip():
        return _envelope("unavailable",
                         note=("명단공개 자료에 사업자등록번호가 수록되지 않아 상호·법인명 없이 "
                               f"검색할 수 없습니다. --name 으로 상호를 지정하세요. {MANUAL_NOTE}"))
    name = name.strip()
    try:
        corp_rows = _search("1", "1", name, CORP_COLUMNS, opener=opener)
        indiv_rows = _search("2", "3", name, INDIV_COLUMNS, opener=opener)
    except urllib.error.URLError as err:
        return _envelope("unavailable", note=f"네트워크 오류: {err.reason}. {MANUAL_NOTE}")
    except StructureChanged as err:
        return _envelope("unavailable", note=f"페이지 구조 변경 추정({err}). {MANUAL_NOTE}")
    except Exception as err:  # 경계 계약: 어떤 오류든 강등, 크래시 금지
        return _envelope("unavailable", note=f"예상 외 오류({type(err).__name__}). {MANUAL_NOTE}")

    result = {
        "query_name": name,
        "list_basis": "국세청 고액·상습체납자 명단공개 (국세기본법 제85조의5)",
        "corporate_list": {"searched_by": "법인명", "match_count": len(corp_rows), "matches": corp_rows},
        "individual_list": {"searched_by": "상호", "match_count": len(indiv_rows), "matches": indiv_rows},
        "identity_note": IDENTITY_NOTE,
    }
    return _envelope("ok", result=result)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="국세청 고액·상습체납자 명단공개 검색 (무인증)")
    parser.add_argument("--name", required=True, help="상호·법인명 — 필수 (명단에 사업자번호 없음)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(json.dumps(lookup(args.name), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
