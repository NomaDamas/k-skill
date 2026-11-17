#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""당근부동산(realty.daangn.com) 읽기 전용 매물 검색/상세.

2026-11 realty.daangn.com TanStack Router SSR 전환 대응:
- realty.daangn.com/map/{name1}/{name2}/{name3}[/{용도}][/{거래}][/{직거래|중개}] 페이지의
  `<script class="$tsr">` seroval 스트림에서 loaderData.articles 를 파싱한다 (daangn_tsr_stream).
- 스트림이 없고 구버전 window.RELAY_STORE 가 있으면 그것을 파싱한다 (daangn_relay_store).
- 쿼리스트링(?salesTypes=)은 SSR 목록을 바꾸지 않는다. 경로 slug(/원룸/월세)만 서버 필터로 동작한다.
- SSR 목록은 URL 당 최대 20건이며 인접 동(regionName3) 매물이 섞인다.

가격 단위: 만원 (deposit 2000 = 2천만원, monthlyPay 100 = 100만원, price 28700 = 2억8700만).
층수: 상세 페이지 JSON-LD additionalProperty 의 floor/topFloor.
"""
import argparse
import itertools
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from daangn_detail_ld import parse_detail as _parse_detail
from daangn_relay_store import extract_articles, extract_relay_store
from daangn_tsr_stream import extract_feeds, extract_relay_records, stream_items

reconfigure_stdout = getattr(sys.stdout, "reconfigure", None)
if callable(reconfigure_stdout):
    try:
        reconfigure_stdout(encoding="utf-8")
    except (OSError, ValueError):
        pass

HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"}
REGION_API = "https://www.daangn.com/kr/api/v1/regions/keyword?keyword="
MAP_BASE = "https://realty.daangn.com/map/"
SEOUL = "서울특별시"

# 지도 경로 slug ↔ 서버 필터 enum (2026-11 실측). 순서는 /{용도}/{거래}/{거래방식}.
SALES_TYPE_SLUGS = {
    "APART": "아파트", "OFFICETEL": "오피스텔", "ONE_ROOM": "원룸", "TWO_ROOM": "빌라",
    "HOUSE": "주택", "STORE": "상가", "OFFICE": "사무실", "BUILDING": "건물",
    "FACTORY": "공장창고", "LAND": "토지",
}
# 원룸 slug 는 서버에서 OPEN_ONE_ROOM·SPLIT_ONE_ROOM 둘 다 돌려준다.
SALES_TYPE_GROUPS = {"ONE_ROOM": {"ONE_ROOM", "OPEN_ONE_ROOM", "SPLIT_ONE_ROOM"}}
SALES_TYPE_ALIASES = {"OPEN_ONE_ROOM": "ONE_ROOM", "SPLIT_ONE_ROOM": "ONE_ROOM"}
TRADE_TYPE_SLUGS = {"MONTH": "월세", "BORROW": "전세", "BUY": "매매", "SHORT": "단기", "YEAR": "연세"}
DEAL_TYPE_SLUGS = {"DIRECT": "직거래", "BROKER": "중개"}

# 행정동 → 법정동: 가양1동·가양제1동 → 가양동, 상계3.4동 → 상계동, 화곡본동 → 화곡동
ADMIN_DONG = re.compile(r"^(?P<base>.+?)(?:제?\d+(?:[.,·]\d+)*|본)동$")


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def fetch_text(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def print_json(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


# ------------------------- region 해석 -------------------------

def legal_dong_name(name):
    """행정동 이름이면 법정동 이름을, 아니면 None 을 돌려준다."""
    match = ADMIN_DONG.match(name or "")
    return f"{match.group('base')}동" if match else None


def _matches_hints(loc, hints):
    words = f"{loc.get('name1') or ''} {loc.get('name2') or ''}".split()
    return all(any(word == hint or word.startswith(hint) for word in words) for hint in hints)


def _region_label(loc):
    return " ".join(p for p in (loc.get("name1"), loc.get("name2"), loc.get("name3")) if p)


def resolve_region(region):
    """지역명 → 당근 내부 region 객체 (id, name1/2/3, name*Id).

    당근부동산 지도는 법정동(가양동) 단위라서 행정동(가양1동·가양제1동)은 법정동으로 먼저 찾는다.
    앞 단어는 시도/시군구 힌트("서울 강서구 가양1동")로 쓴다.
    후보 순위: 힌트 일치 → 동명 정확 일치 → 서울특별시 → depth 3.
    """
    if not region:
        return None
    tokens = region.split()
    dong, hints = tokens[-1], tokens[:-1]
    legal = legal_dong_name(dong)
    names = [legal, dong] if legal else [dong]

    locs, name = [], dong
    for name in names:
        queries = [" ".join(hints + [name])] + ([name] if hints else [])
        for query in queries:
            locs = fetch_json(REGION_API + urllib.parse.quote(query)).get("locations") or []
            if locs:
                break
        if locs:
            break
    if not locs:
        raise SystemExit(f"지역 후보 없음: {region}")

    def rank(loc):
        return (
            not _matches_hints(loc, hints),
            name not in (loc.get("name"), loc.get("name3")),
            loc.get("name1") != SEOUL,
            loc.get("depth") != 3,
        )

    ordered = sorted(locs, key=rank)
    sel = dict(ordered[0])
    sel["resolution"] = {
        "query": region,
        "dong_name": name,
        "admin_to_legal": name != dong,
        "candidates": [_region_label(loc) for loc in ordered[:5]],
    }
    return sel


def find_sibling_regions(sel, max_siblings=6):
    """같은 name2(구/시) 내 인접 동들을 region API 로 조회 (SSR siblings 가 없을 때의 --expand fallback)."""
    name2 = sel.get("name2") or ""
    if not name2:
        return []
    try:
        data = fetch_json(REGION_API + urllib.parse.quote(name2.split()[-1]))
    except (json.JSONDecodeError, OSError, TimeoutError, urllib.error.URLError):
        return []
    sibs = []
    seen = {sel.get("name3Id")}
    for x in (data.get("locations") or []):
        if x.get("depth") != 3:
            continue
        if x.get("name2Id") != sel.get("name2Id"):
            continue
        if x.get("name3Id") in seen:
            continue
        seen.add(x.get("name3Id"))
        sibs.append(x)
        if len(sibs) >= max_siblings:
            break
    return sibs


def map_url(sel, *slugs):
    parts = [sel.get("name1") or "", sel.get("name2") or "", sel.get("name3") or ""]
    parts += [slug for slug in slugs if slug]
    return MAP_BASE + "/".join(urllib.parse.quote(p) for p in parts)


# ------------------------- 필터 -------------------------

def _split_filter(value, slugs):
    """콤마 필터 → enum 목록. 한글 slug(원룸, 월세 …)도 받는다."""
    by_label = {label: key for key, label in slugs.items()}
    tokens = [token.strip() for token in (value or "").split(",") if token.strip()]
    return [by_label.get(token, token.upper()) for token in tokens]


def _slug_options(enums, slugs, aliases=None):
    """필터 enum 들을 서버 slug 목록으로. slug 없는 값이 하나라도 있으면 무필터([None])."""
    if not enums:
        return [None]
    out = []
    for enum in enums:
        slug = slugs.get((aliases or {}).get(enum, enum))
        if slug is None:
            return [None]
        if slug not in out:
            out.append(slug)
    return out


def _deal_slug(deal_type):
    if not deal_type:
        return None
    enums = _split_filter(deal_type, DEAL_TYPE_SLUGS)
    if len(enums) != 1 or enums[0] not in DEAL_TYPE_SLUGS:
        raise SystemExit(f"--deal-type 은 DIRECT(직거래) 또는 BROKER(중개) 하나만: {deal_type}")
    return DEAL_TYPE_SLUGS[enums[0]]


# ------------------------- 목록 파싱 -------------------------

def parse_listing_page(html):
    """지도 페이지 HTML → (items, meta, note). TanStack 스트림 우선, RELAY_STORE fallback.

    스트림의 loaderData.articles 는 대표 거래 1건만 담으므로, 같은 스트림의
    dehydratedData.relayRecords 가 있으면 전체 trades·층수·건물명으로 보강한다.
    """
    feeds = extract_feeds(html)
    if feeds:
        items, seen = [], set()
        for feed in feeds:
            for item in stream_items(feed):
                if item["article_id"] not in seen:
                    seen.add(item["article_id"])
                    items.append(item)
        records = extract_relay_records(html)
        if records:
            relay = {it["article_id"]: it for it in extract_articles(records, max_items=10_000)}
            for item in items:
                extra = relay.get(item["article_id"])
                if not extra:
                    continue
                if extra["trades"]:
                    item["trades"] = extra["trades"]
                for key in ("floor_label", "building_name"):
                    if extra.get(key):
                        item[key] = extra[key]
        feed = feeds[0]
        meta = {
            "total_available": feed.get("articleCount"),
            "property_filter": feed.get("propertyFilter"),
            "siblings": [s.get("name3") for s in feed.get("siblings") or [] if isinstance(s, dict) and s.get("name3")],
        }
        return items, meta, None
    store = extract_relay_store(html)
    if store:
        return extract_articles(store, max_items=10_000), {}, None
    if feeds is not None:
        return [], {}, "SSR 스트림에 articles 없음 (페이지 구조 변경 가능)"
    return [], {}, "매물 데이터 없음: TanStack SSR 스트림·RELAY_STORE 모두 없음 (페이지 구조 변경 또는 차단)"


def collect_for_region(sel, sales_type_filter=None, trade_type_filter=None, limit=None, keyword=None,
                       deal_type=None, exact_dong=False):
    """한 동의 지도 페이지(필터 slug 조합별)를 읽어 매물을 모은다.

    반환: {"url", "urls", "items", "note", "total_available", "siblings"}
    """
    sales = _split_filter(sales_type_filter, SALES_TYPE_SLUGS)
    trades = _split_filter(trade_type_filter, TRADE_TYPE_SLUGS)
    deal_slug = _deal_slug(deal_type)
    combos = itertools.product(
        _slug_options(sales, SALES_TYPE_SLUGS, SALES_TYPE_ALIASES),
        _slug_options(trades, TRADE_TYPE_SLUGS),
    )

    urls, items, notes, seen = [], [], [], set()
    total, siblings = None, []
    for sales_slug, trade_slug in combos:
        url = map_url(sel, sales_slug, trade_slug, deal_slug)
        urls.append(url)
        try:
            html = fetch_text(url)
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            notes.append(f"HTTP 404: 당근부동산 지도에 없는 동 이름 (행정동이면 법정동으로 입력): {sel.get('name3')}")
            continue
        page_items, meta, note = parse_listing_page(html)
        if note:
            notes.append(note)
        if meta.get("total_available") is not None:
            total = (total or 0) + meta["total_available"]
        siblings = siblings or meta.get("siblings") or []
        for item in page_items:
            if item["article_id"] not in seen:
                seen.add(item["article_id"])
                items.append(item)

    if sales:
        allowed = set().union(*(SALES_TYPE_GROUPS.get(s, {s}) for s in sales))
        items = [it for it in items if (it.get("salesType") or "").upper() in allowed]
    if trades:
        tset = set(trades)
        items = [it for it in items if any((tr["type"] or "").upper() in tset for tr in it["trades"])]
    if exact_dong:
        items = [it for it in items if it.get("region_name3") in (None, sel.get("name3"))]
    if keyword:
        needle = keyword.casefold()
        items = [it for it in items if needle in json.dumps(it, ensure_ascii=False).casefold()]
    return {
        "url": urls[0],
        "urls": urls,
        "items": items,
        "note": "; ".join(dict.fromkeys(notes)) or None,
        "total_available": total,
        "siblings": siblings,
    }


# ------------------------- 상세(JSON-LD) -------------------------

def parse_detail(url):
    return _parse_detail(url, fetch_text)


# ------------------------- 커맨드 -------------------------

def cmd_search(args):
    sel = resolve_region(args.region) if args.region else None
    if not sel:
        raise SystemExit("--region 이 필요합니다")

    all_items, sources, errors = [], [], []
    seen = set()
    regions = [sel]
    expanded = False
    while regions:
        rg = regions.pop(0)
        try:
            res = collect_for_region(rg, args.sales_type, args.trade_type, args.limit, args.keyword,
                                     deal_type=args.deal_type, exact_dong=args.exact_dong)
        except (json.JSONDecodeError, OSError, TimeoutError, urllib.error.URLError) as e:
            errors.append({"region": rg.get("name3"), "error": str(e)})
            res = None
        if res is not None:
            source = {"region": f"{rg.get('name1')} {rg.get('name2')} {rg.get('name3')}", "url": res["url"],
                      "count": len(res["items"]), "total_available": res["total_available"], "note": res["note"]}
            if len(res["urls"]) > 1:
                source["urls"] = res["urls"]
            sources.append(source)
            searched = f"{rg.get('name2')} {rg.get('name3')}"
            for it in res["items"]:
                if it["article_id"] in seen:
                    continue
                seen.add(it["article_id"])
                it["searched_region"] = searched
                it["region"] = it.pop("region_name3", None) or searched
                all_items.append(it)
        if args.expand and not expanded:
            expanded = True
            names = (res or {}).get("siblings") or []
            if names:
                regions = [{"name1": sel.get("name1"), "name2": sel.get("name2"), "name3": n}
                           for n in names if n != sel.get("name3")][:args.expand_max]
            else:
                regions = find_sibling_regions(sel, max_siblings=args.expand_max)

    all_items = all_items[:args.limit]
    # 제목 보강(상세 JSON-LD) — 상위 N개만 (네트워크 비용 절약)
    if args.titles > 0:
        for it in all_items[:args.titles]:
            if not it.get("url"):
                continue
            try:
                d = parse_detail(it["url"])
                it["title"] = d.get("title")
                it["address"] = d.get("address")
                it["floor_label"] = d.get("floor_label")
                it["nearby_subway"] = d.get("nearby_subway")
                it["release_date"] = d.get("release_date")
            except (json.JSONDecodeError, OSError, TimeoutError, urllib.error.URLError):
                pass

    print_json({
        "effective_region": f"{sel.get('name1')} {sel.get('name2')} {sel.get('name3')}",
        "region_resolution": sel.get("resolution"),
        "expand": bool(args.expand),
        "regions_searched": len(sources) + len(errors),
        "sources": sources,
        "count": len(all_items),
        "errors": errors,
        "items": all_items,
    })


def cmd_detail(args):
    print_json(parse_detail(args.url))


def build_parser():
    p = argparse.ArgumentParser(description="당근부동산 읽기전용 검색/상세 (realty.daangn.com)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="지역 매물 검색")
    s.add_argument("--region", required=True,
                   help="동 이름 (예: 염창동, 가양1동, '서울 강서구 등촌1동'). 행정동은 법정동으로 바꿔 찾는다")
    s.add_argument("--sales-type",
                   help="용도 필터(콤마구분, 경로 slug로 서버 필터): APART,OFFICETEL,ONE_ROOM(OPEN_/SPLIT_ONE_ROOM),"
                        "TWO_ROOM(빌라),HOUSE,STORE,OFFICE,BUILDING,FACTORY,LAND 또는 한글(원룸, 빌라 …)")
    s.add_argument("--trade-type", help="거래 필터(콤마구분): MONTH(월세),BORROW(전세),BUY(매매),SHORT(단기),YEAR(연세)")
    s.add_argument("--deal-type", help="거래방식 필터: DIRECT(직거래) 또는 BROKER(중개)")
    s.add_argument("--exact-dong", action="store_true", help="SSR에 섞인 인접 동 매물을 빼고 검색한 동만 남긴다")
    s.add_argument("--keyword", help="반환 매물의 공개 필드 텍스트 필터")
    s.add_argument("--only-verified", action="store_true", help="기존 CLI 호환용 인증 매물 플래그")
    s.add_argument("--expand", action="store_true", help="같은 구/시 인접 동까지 확장 검색")
    s.add_argument("--expand-max", type=int, default=6, help="확장 시 인접 동 최대 개수 (기본 6)")
    s.add_argument("--titles", type=int, default=5, help="상세 JSON-LD로 제목·층수 보강할 상위 N개 (기본 5, 0=비활성)")
    s.add_argument("--limit", type=int, default=20, help="최대 매물 수 (기본 20)")
    s.set_defaults(func=cmd_search)

    d = sub.add_parser("detail", help="매물 상세 (제목·주소·층수)")
    d.add_argument("url", help="https://realty.daangn.com/articles/<id>")
    d.set_defaults(func=cmd_detail)
    return p


if __name__ == "__main__":
    args = build_parser().parse_args()
    args.func(args)
