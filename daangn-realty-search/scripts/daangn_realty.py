#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""당근부동산(realty.daangn.com) 읽기 전용 매물 검색/상세.

2026-06 당근부동산 도메인 이전 대응:
- 기존 www.daangn.com/kr/realty/?_data=routes/kr.realty._index → HTTP 204 (폐기)
- 신규 realty.daangn.com/map/{name1}/{name2}/{name3} 페이지의
  window.RELAY_STORE (Relay 정규화 스토어)를 파싱한다.

RELAY_STORE 경로:
  ArticleFeedConnection.edges → ArticleFeedEdge.node → ArticleFeedCard.article → Article
  Article: originalId, area(㎡), salesTypeV3(→*SalesTypeV2.type), trades(→Month/Buy/BorrowTrade)
가격 단위: 만원 (deposit 2000 = 2천만원, monthlyPay 100 = 100만원, price 28700 = 2억8700만).
층수: 상세 페이지 JSON-LD additionalProperty 의 floor/topFloor.
"""
import argparse
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from daangn_detail_ld import parse_detail as _parse_detail
from daangn_relay_store import extract_articles, extract_relay_store

reconfigure_stdout = getattr(sys.stdout, "reconfigure", None)
if callable(reconfigure_stdout):
    try:
        reconfigure_stdout(encoding="utf-8")
    except (OSError, ValueError):
        pass

HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"}
REGION_API = "https://www.daangn.com/kr/api/v1/regions/keyword?keyword="
MAP_BASE = "https://realty.daangn.com/map/"


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

def resolve_region(region):
    """지역명 → 당근 내부 region 객체 (id, name1/2/3, name*Id)."""
    if not region:
        return None
    data = fetch_json(REGION_API + urllib.parse.quote(region))
    locs = data.get("locations") or []
    if not locs:
        raise SystemExit(f"지역 후보 없음: {region}")
    exact = [x for x in locs if region in (x.get("name"), x.get("name1"), x.get("name2"), x.get("name3"))]
    seoul = [x for x in locs if x.get("name1") == "서울특별시" and x.get("depth") == 3]
    return (exact or seoul or locs)[0]


def find_sibling_regions(sel, max_siblings=6):
    """같은 name2(구/시) 내 인접 동들을 조회 (--expand 용).

    name2 키워드로 다시 region API를 때려 같은 name2Id 를 가진 depth=3 동들을 모은다.
    """
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


def map_url(sel):
    parts = [sel.get("name1") or "", sel.get("name2") or "", sel.get("name3") or ""]
    path = "/".join(urllib.parse.quote(p) for p in parts)
    return MAP_BASE + path


# ------------------------- 상세(JSON-LD) -------------------------

def parse_detail(url):
    return _parse_detail(url, fetch_text)


# ------------------------- 커맨드 -------------------------

def collect_for_region(sel, sales_type_filter, trade_type_filter, limit, keyword=None):
    url = map_url(sel)
    html = fetch_text(url)
    store = extract_relay_store(html)
    if not store:
        return url, [], "RELAY_STORE 없음 (페이지 구조 변경 또는 차단)"
    items = extract_articles(store, max_items=10_000)
    # 필터
    if sales_type_filter:
        sset = {s.strip().upper() for s in sales_type_filter.split(",")}
        items = [it for it in items if (it.get("salesType") or "").upper() in sset]
    if trade_type_filter:
        tset = {t.strip().upper() for t in trade_type_filter.split(",")}
        items = [it for it in items if any((tr["type"] or "").upper() in tset for tr in it["trades"])]
    if keyword:
        needle = keyword.casefold()
        items = [it for it in items if needle in json.dumps(it, ensure_ascii=False).casefold()]
    return url, items, None


def cmd_search(args):
    sel = resolve_region(args.region) if args.region else None
    if not sel:
        raise SystemExit("--region 이 필요합니다")
    regions = [sel]
    if args.expand:
        regions += find_sibling_regions(sel, max_siblings=args.expand_max)

    all_items, sources, errors = [], [], []
    seen = set()
    for rg in regions:
        try:
            url, items, err = collect_for_region(rg, args.sales_type, args.trade_type, args.limit, args.keyword)
        except (json.JSONDecodeError, OSError, TimeoutError, urllib.error.URLError) as e:
            errors.append({"region": rg.get("name3"), "error": str(e)})
            continue
        sources.append({"region": f"{rg.get('name1')} {rg.get('name2')} {rg.get('name3')}", "url": url,
                        "count": len(items), "note": err})
        for it in items:
            if it["article_id"] in seen:
                continue
            seen.add(it["article_id"])
            it["region"] = f"{rg.get('name2')} {rg.get('name3')}"
            all_items.append(it)

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
            except (json.JSONDecodeError, OSError, TimeoutError, urllib.error.URLError):
                pass

    print_json({
        "effective_region": f"{sel.get('name1')} {sel.get('name2')} {sel.get('name3')}",
        "expand": bool(args.expand),
        "regions_searched": len(regions),
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
    s.add_argument("--region", required=True, help="동 이름 (예: 매교동, 합정동)")
    s.add_argument("--sales-type", help="용도 필터(콤마구분): APART,OFFICETEL,STORE,OPEN_ONE_ROOM,SPLIT_ONE_ROOM,TWO_ROOM,HOUSE")
    s.add_argument("--trade-type", help="거래 필터(콤마구분): MONTH(월세),BUY(매매),BORROW(전세)")
    s.add_argument("--keyword", help="기존 CLI 호환용 키워드 필터(현재 공개 피드에서는 미사용)")
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
