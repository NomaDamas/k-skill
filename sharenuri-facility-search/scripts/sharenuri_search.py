"""공유누리(eshare.go.kr) 공공개방자원 검색 helper.

행정안전부 공유누리 포털의 로그인 없이 열려 있는 통합검색 표면을 호출해
전국 공공개방자원(회의실·체육시설·숙소·교육·물품 등)을 조회한다.
API 인증키가 필요 없는 공개 read-only 경로만 사용하며, 예약 신청·로그인·
결제 같은 쓰기 흐름은 자동화하지 않는다.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://www.eshare.go.kr"
BOOTSTRAP_URL = BASE_URL + "/UserPortal/adv/unifdSearch/UnifiedSearchMainView.do"
SEARCH_URL = BASE_URL + "/UserPortal/adv/unifdSearch/ConditionsSearch.do"
SIGUNGU_URL = BASE_URL + "/UserPortal/comm/zip/selectsigunguList.do"
CATEGORY_URL = BASE_URL + "/UserPortal/Upm/searchUserPortalRsrcCls.do"
USER_AGENT = "k-skill-sharenuri-facility-search/0.1 (+https://github.com/NomaDamas/k-skill)"
REQUEST_TIMEOUT = 20
PAGE_SIZE = 10
MAX_PAGES = 5

# 통합검색 상세조건의 시·도 선택 코드 (2026-09-12 공유누리 통합검색 화면 실측)
SIDO_CODES = {
    "서울특별시": "11", "부산광역시": "26", "인천광역시": "28", "대전광역시": "30",
    "전남광주통합특별시": "12", "대구광역시": "27", "울산광역시": "31",
    "세종특별자치시": "36", "경기도": "41", "충청북도": "43", "충청남도": "44",
    "전북특별자치도": "52", "경상북도": "47", "경상남도": "48",
    "강원특별자치도": "51", "제주특별자치도": "50",
}

# 검색결과의 rsrcDcd 7~9번째 자리 → 상세페이지 경로 (통합검색 JS fnNewPageResourceDetail 기준)
DETAIL_PATH_BY_DCD = {
    "001": "Upv/UprResrcGym", "002": "Upv/UprResrcFacl", "098": "Upv/UprResrcFacl",
    "003": "Upv/UprResrcCamp", "004": "Upv/UprResrcEqp", "005": "Upv/UprResrcGds",
    "006": "Upv/UprResrcEdu", "007": "Upv/UprResrcExpr", "008": "Upv/UprResrcPfm",
    "009": "Upv/UprResrcEvnt",
}

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_TOTAL_RE = re.compile(r"총\s*<span>([\d,]+)</span>\s*건")
_ITEM_SPLIT_RE = re.compile(r'<li>\s*<!--\s*이미지영역', re.S)
_RSRC_RE = re.compile(r"fnNewPageResourceDetail\('([^']+)',\s*'([^']+)'\)")
_SR_ONLY_RE = re.compile(r'<span class="sr-only">.*?</span>', re.S)
_DETAIL_ROW_RE = re.compile(
    r'<th[^>]*scope="row"[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>', re.S
)


class SharenuriError(RuntimeError):
    pass


def _strip_html(fragment: str) -> str:
    text = _TAG_RE.sub(" ", fragment)
    text = text.replace("&nbsp;", " ").replace("&middot;", "·").replace("&amp;", "&")
    return _WS_RE.sub(" ", text).strip()


def _open_session():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", USER_AGENT)]
    return opener


def _request(opener, url: str, data: dict | None = None, referer: str | None = None) -> str:
    body = None
    headers = {}
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers["X-Requested-With"] = "XMLHttpRequest"
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with opener.open(req, timeout=REQUEST_TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        raise SharenuriError(f"공유누리 서버에 연결하지 못했습니다: {exc}") from exc


def _bootstrap(opener) -> None:
    # 통합검색 화면을 한 번 열어 세션 쿠키를 받는다 (검색 POST의 선행 조건)
    _request(opener, BOOTSTRAP_URL)


def detail_path_for(rsrc_dcd: str) -> str:
    dcd = rsrc_dcd[7:10]
    path = DETAIL_PATH_BY_DCD.get(dcd)
    if path is None:
        raise SharenuriError(f"알 수 없는 자원 분류 코드입니다: {rsrc_dcd}")
    return path


def detail_url(rsrc_dcd: str, rsrc_no: str) -> str:
    return (
        f"{BASE_URL}/UserPortal/{detail_path_for(rsrc_dcd)}/index.do"
        f"?rsrc_no={urllib.parse.quote(rsrc_no)}&rsrc_dcd={urllib.parse.quote(rsrc_dcd)}"
    )


def parse_search_fragment(html: str) -> dict:
    # 검색어 하이라이트 마커가 title 속성 안에까지 들어 있어 태그 파싱을 깨뜨리므로 먼저 제거
    html = html.replace("<!HS>", "").replace("<!HE>", "")
    total_match = _TOTAL_RE.search(html)
    total = int(total_match.group(1).replace(",", "")) if total_match else 0
    items = []
    for block in _ITEM_SPLIT_RE.split(html)[1:]:
        block = "<li>" + block
        block = _SR_ONLY_RE.sub("", block)  # 접근성 숨김 텍스트(시설명 반복) 제거
        id_match = _RSRC_RE.search(block)
        if not id_match:
            continue
        rsrc_dcd, rsrc_no = id_match.group(1), id_match.group(2)
        text = _strip_html(block)
        item = {
            "rsrc_dcd": rsrc_dcd,
            "rsrc_no": rsrc_no,
            "detail_url": detail_url(rsrc_dcd, rsrc_no),
        }
        title_match = re.search(r'<a class="sbj_txt"[^>]*>(.*?)</a>', block, re.S)
        if title_match:
            item["title"] = _strip_html(title_match.group(1))
        for label, key in (("자원 분류", "category"), ("위치 정보", "location"), ("이용 요금", "fee")):
            seg = re.search(label + r"\s+(.*?)(?:자원 분류|위치 정보|이용 요금|지도 보기|예약·문의하기|$)", text)
            if seg and seg.group(1):
                item[key] = seg.group(1).strip()
        items.append(item)
    return {"total_count": total, "items": items}


def parse_detail_page(html: str) -> dict:
    html = html.replace("<!HS>", "").replace("<!HE>", "")
    fields = {}
    for label, value in _DETAIL_ROW_RE.findall(html):
        label_text = _strip_html(label)
        value_text = _strip_html(value)
        value_text = re.sub(r"\s*지도보기$", "", value_text)
        value_text = value_text.replace("-->", "").strip()
        if label_text:
            fields[label_text] = value_text
    return fields


def cmd_search(opener, args) -> dict:
    sido_code = args.ctrd
    if args.sido:
        if args.sido not in SIDO_CODES:
            raise SharenuriError(
                "알 수 없는 시·도 이름입니다. 사용 가능: " + ", ".join(SIDO_CODES)
            )
        sido_code = SIDO_CODES[args.sido]
    limit = max(1, min(args.limit, PAGE_SIZE * MAX_PAGES))
    pages = min(MAX_PAGES, (limit + PAGE_SIZE - 1) // PAGE_SIZE)
    collected: list[dict] = []
    total = 0
    _bootstrap(opener)
    for offset in range(pages):
        payload = {
            "searchWrd": args.query,
            "sort": "RANK",
            "order": "DESC",
            "pageIndex": str(args.page + offset),
            "collection": "resource_cate1",
            "viewType": "UnitPage",
        }
        if sido_code:
            payload["ctrd"] = sido_code
        if args.sigg:
            payload["sigg"] = args.sigg
        if args.major_code:
            payload["mj_rsrc_cls_cd"] = args.major_code
        if args.free:
            payload["free_yn"] = "Y"
        if args.reservable:
            payload["intnet_rsrv_psbl_yn"] = "Y"
        html = _request(opener, SEARCH_URL, data=payload, referer=BOOTSTRAP_URL)
        parsed = parse_search_fragment(html)
        total = parsed["total_count"]
        collected.extend(parsed["items"])
        if len(parsed["items"]) < PAGE_SIZE:
            break
    return {
        "query": {
            "searchWrd": args.query,
            "ctrd": sido_code,
            "sigg": args.sigg,
            "mj_rsrc_cls_cd": args.major_code,
            "free_yn": "Y" if args.free else None,
            "intnet_rsrv_psbl_yn": "Y" if args.reservable else None,
            "page": args.page,
        },
        "total_count": total,
        "items": collected[:limit],
    }


def cmd_detail(opener, args) -> dict:
    url = detail_url(args.rsrc_dcd, args.rsrc_no) if args.rsrc_dcd else None
    if url is None:
        raise SharenuriError("--rsrc-dcd 가 필요합니다 (검색 결과의 rsrc_dcd 값)")
    html = _request(opener, url)
    fields = parse_detail_page(html)
    if not fields:
        raise SharenuriError(
            "상세 페이지에서 기본정보를 찾지 못했습니다. rsrc_no/rsrc_dcd 확인 또는 공유누리 화면 구조 변경 가능성이 있습니다."
        )
    return {"detail_url": url, "fields": fields}


def cmd_sigungu(opener, args) -> dict:
    body = _request(opener, SIGUNGU_URL, data={"addr": args.ctrd})
    try:
        rows = json.loads(body).get("signguNmList", [])
    except json.JSONDecodeError as exc:
        raise SharenuriError("시군구 목록 응답이 JSON이 아닙니다.") from exc
    return {
        "ctrd": args.ctrd,
        "sigungu": [
            {"sigunguCd": row.get("sigunguCd"), "name": row.get("gunguNm")}
            for row in rows
            if row.get("openAt") == "Y"
        ],
    }


def cmd_categories(opener, args) -> dict:
    body = _request(opener, CATEGORY_URL, data={"rsrcClsCd": "1"})
    try:
        rows = json.loads(body).get("rsrcClsList", [])
    except json.JSONDecodeError as exc:
        raise SharenuriError("자원 대분류 응답이 JSON이 아닙니다.") from exc
    return {
        "major_categories": [
            {"code": row.get("rsrc_cls_cd"), "name": row.get("rsrc_cls_nm")} for row in rows
        ]
    }


def _print(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    if "items" in result:
        q = result["query"]
        print(f"검색어: {q['searchWrd']} / 총 {result['total_count']:,}건 (표시 {len(result['items'])}건)")
        for idx, item in enumerate(result["items"], 1):
            print(f"\n[{idx}] {item.get('title', '(제목 없음)')}")
            if item.get("category"):
                print(f"    분류: {item['category']}")
            if item.get("location"):
                print(f"    위치: {item['location']}")
            if item.get("fee"):
                print(f"    요금: {item['fee']}")
            print(f"    상세: {item['detail_url']}")
    elif "fields" in result:
        print(f"상세 페이지: {result['detail_url']}")
        for label, value in result["fields"].items():
            print(f"  {label}: {value}")
    elif "sigungu" in result:
        for row in result["sigungu"]:
            print(f"{row['sigunguCd']}\t{row['name']}")
    elif "major_categories" in result:
        for row in result["major_categories"]:
            print(f"{row['code']}\t{row['name']}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="공유누리 공공개방자원 검색 (로그인·API 키 불필요, 조회 전용)"
    )
    parser.add_argument("--json", action="store_true", help="JSON 출력")
    sub = parser.add_subparsers(dest="command", required=True)

    p_search = sub.add_parser("search", help="자원 통합검색")
    p_search.add_argument("--query", "-q", required=True, help="검색어 (예: 회의실)")
    p_search.add_argument("--sido", help="시·도 이름 (예: 서울특별시)")
    p_search.add_argument("--ctrd", help="시·도 코드 (예: 11)")
    p_search.add_argument("--sigg", help="시군구 코드 (sigungu 하위명령으로 조회)")
    p_search.add_argument("--major-code", help="자원 대분류 코드 (categories 하위명령으로 조회)")
    p_search.add_argument("--free", action="store_true", help="무료 자원만")
    p_search.add_argument("--reservable", action="store_true", help="인터넷 예약 가능 자원만")
    p_search.add_argument("--page", type=int, default=1, help="시작 페이지 (기본 1)")
    p_search.add_argument("--limit", type=int, default=10, help="최대 건수 (기본 10, 최대 50)")

    p_detail = sub.add_parser("detail", help="자원 상세정보 조회")
    p_detail.add_argument("--rsrc-no", required=True, help="자원번호 (검색 결과의 rsrc_no)")
    p_detail.add_argument("--rsrc-dcd", required=True, help="자원분류코드 (검색 결과의 rsrc_dcd)")

    p_sigungu = sub.add_parser("sigungu", help="시·도 코드의 시군구 목록")
    p_sigungu.add_argument("--ctrd", required=True, help="시·도 코드 (예: 11)")

    sub.add_parser("categories", help="자원 대분류 코드 목록")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "page", 1) < 1:
        print("오류: --page 는 1 이상이어야 합니다.", file=sys.stderr)
        return 2
    opener = _open_session()
    handlers = {
        "search": cmd_search,
        "detail": cmd_detail,
        "sigungu": cmd_sigungu,
        "categories": cmd_categories,
    }
    try:
        result = handlers[args.command](opener, args)
    except SharenuriError as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1
    _print(result, args.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
