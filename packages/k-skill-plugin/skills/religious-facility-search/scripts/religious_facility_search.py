#!/usr/bin/env python3
"""종교시설 찾기 — 공식 Kakao Local API (k-skill-proxy 경유).

공개 접근 경로:
  1) GET {proxy}/v1/kakao-map/search/keyword?q=<위치> → 기준점 좌표 (anchor)
  2) GET {proxy}/v1/kakao-map/search/keyword?q=<종류>&x=..&y=..&radius=..&sort=distance
     → 거리순 장소 목록 (공식 distance 필드 사용)

upstream이 Kakao Developers REST API 키를 요구하므로 k-skill-proxy를 거친다
(사용자 머신에는 키가 필요 없고, 프록시 운영자 키로 인증한다).
category_name에 "종교" 노드가 있는 결과만 통과시키므로
이름에 "교회"가 들어간 카페·서점 같은 오탐이 걸러진다.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROXY_BASE = "https://k-skill-proxy.nomadamas.org"
SEARCH_KEYWORD_PATH = "/v1/kakao-map/search/keyword"

USER_AGENT = "k-skill-religious-facility-search/1"

RELIGION_CATEGORY = "종교"
TYPE_ALIASES = {
    "교회": ["교회"],
    "성당": ["성당"],
    "절": ["절", "사찰"],
    "사찰": ["절", "사찰"],
    "전체": [],
}
# --type 전체: "종교시설" 단일 키워드는 교회·사찰을 놓치므로 종류별로 합친다
ALL_TYPE_QUERIES = ["교회", "성당", "사찰"]
COORD_RE = re.compile(r"^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$")
PAGE_SIZE = 15          # Kakao Local keyword 검색의 페이지당 최대 건수
MAX_PAGES = 3           # 페이지네이션 상한 → 최대 45개 후보
MAX_CANDIDATES = PAGE_SIZE * MAX_PAGES


class LookupError_(Exception):
    """조회 실패를 명시적 실패 모드로 올린다."""


def proxy_base():
    return (os.environ.get("KSKILL_PROXY_BASE_URL") or DEFAULT_PROXY_BASE).rstrip("/")


def fetch_json(url, timeout=15):
    request = urllib.request.Request(url, headers={"user-agent": USER_AGENT, "accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            detail = error.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        raise LookupError_(f"프록시 HTTP {error.code} ({detail or '응답 본문 없음'})") from error
    except urllib.error.URLError as error:
        raise LookupError_(f"네트워크 오류: {error.reason}") from error

    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise LookupError_("프록시 응답이 JSON이 아니다 (proxy 변경 가능)") from error


def search_places(query, x=None, y=None, radius=None, max_pages=MAX_PAGES):
    """proxy keyword 검색. (documents, meta)를 돌려준다. 첫 페이지가 비면 명시적 실패."""
    params = {"q": query, "size": PAGE_SIZE}
    if x is not None and y is not None:
        params.update({"x": x, "y": y, "sort": "distance"})
        if radius:
            params["radius"] = radius

    documents, meta = [], {}
    for page in range(1, max_pages + 1):
        params["page"] = page
        url = f"{proxy_base()}{SEARCH_KEYWORD_PATH}?{urllib.parse.urlencode(params)}"
        payload = fetch_json(url)
        batch = payload.get("documents") or []
        meta = payload.get("meta") or {}
        documents.extend(batch)
        if page == 1 and not documents:
            raise LookupError_(f'"{query}" 검색 결과가 비었다 (검색어를 넓히거나 지역명을 붙여볼 것)')
        if meta.get("is_end", True) or not batch:
            break
    return documents, meta


def map_place(document):
    parts = [p.strip() for p in (document.get("category_name") or "").split(">") if p.strip()]
    distance_raw = (document.get("distance") or "").strip()
    return {
        "id": document.get("id"),
        "name": document.get("place_name"),
        "category": parts[-1] if parts else None,
        "denomination": parts[-2] if len(parts) >= 4 else None,
        "category_group": RELIGION_CATEGORY if RELIGION_CATEGORY in parts else None,
        "lat": float(document["y"]) if document.get("y") else None,
        "lon": float(document["x"]) if document.get("x") else None,
        "address": (document.get("road_address_name") or document.get("address_name") or "").strip() or None,
        "jibun": (document.get("address_name") or "").strip() or None,
        "phone": (document.get("phone") or "").strip() or None,
        "homepage": None,  # Kakao Local API는 외부 홈페이지를 제공하지 않는다
        "place_url": document.get("place_url"),
        "distance_m": int(distance_raw) if distance_raw else None,
    }


def resolve_anchor(location):
    """위치 문자열을 좌표로 바꾼다. 실패하면 None (거리 없이 결과만 제공)."""
    try:
        documents, _ = search_places(location)
    except LookupError_:
        return None
    if not documents:
        return None
    top = documents[0]
    return {"name": top.get("place_name"), "lat": float(top["y"]), "lon": float(top["x"])}


def _category_tokens(place):
    tokens = []
    for part in (place.get("category"), place.get("denomination")):
        if not part:
            continue
        tokens.extend(token.strip() for token in part.replace(",", " ").split() if token.strip())
    return tokens


def matches_type(place, facility_type):
    if place.get("category_group") != RELIGION_CATEGORY:
        return False
    wanted = TYPE_ALIASES.get(facility_type, [facility_type])
    if not wanted:
        return True
    tokens = _category_tokens(place)
    return any(token in tokens for token in wanted)


def _dedupe_by_id(places):
    seen, unique = set(), []
    for place in places:
        if place["id"] not in seen:
            seen.add(place["id"])
            unique.append(place)
    return unique


def collect(query, facility_type, anchor, radius_m, limit):
    x = y = None
    if anchor:
        x, y = anchor["lon"], anchor["lat"]

    if facility_type == "전체" and query == "전체":
        # "종교시설" 단일 검색은 교회·사찰을 놓치므로 종류별 검색을 합친다
        documents, scanned, hits = [], 0, 0
        for token in ALL_TYPE_QUERIES:
            try:
                docs, _ = search_places(token, x=x, y=y, radius=radius_m)
            except LookupError_:
                continue  # 한 종류가 0건이어도 나머지 종류는 돌려준다
            hits += 1
            scanned += len(docs)
            documents.extend(docs)
        if hits == 0:
            raise LookupError_('"전체" 검색 결과가 비었다 (지역을 넓히거나 --type을 좁혀볼 것)')
    else:
        documents, _ = search_places(query, x=x, y=y, radius=radius_m)
        scanned = len(documents)

    places = _dedupe_by_id(map_place(doc) for doc in documents)
    places = [p for p in places if matches_type(p, facility_type)]

    if anchor:
        places.sort(key=lambda p: (p["distance_m"] is None, p["distance_m"] or 0))

    return scanned, len(places), places[:limit]


def format_report(query, anchor, scanned, matched, places, facility_type):
    lines = []
    if anchor:
        lines.append(f"기준 위치: {anchor['name']} ({anchor['lat']:.5f}, {anchor['lon']:.5f})")
    summary = f'검색어: "{query}" · 후보 {scanned}건 중 종교시설 {matched}건'
    if matched > len(places):
        summary += f" (가까운 {len(places)}건 표시)"
    lines.append(summary)
    lines.append("")

    if not places:
        lines.append(f"조건에 맞는 {facility_type}을(를) 찾지 못했다. 지역을 넓혀 다시 찾거나 "
                     f"--type 전체 로 확인할 것 (--radius 는 결과를 좁히는 옵션이다).")
        return "\n".join(lines)

    for index, place in enumerate(places, start=1):
        label = place["category"] or "종교시설"
        if place.get("denomination"):
            label = f"{label} · {place['denomination']}"
        lines.append(f"{index}. {place['name']}  ({label})")
        if place.get("address"):
            lines.append(f"   {place['address']}")
        if place.get("distance_m") is not None:
            lines.append(f"   약 {place['distance_m']:,}m")
        contact = []
        if place.get("phone"):
            contact.append(f"전화 {place['phone']}")
        if place.get("homepage"):
            contact.append(place["homepage"])
        if contact:
            lines.append("   " + "  ".join(contact))
        lines.append(f"   지도 {place['place_url']}")
        lines.append("")

    lines.append("예배·미사·법회 시간은 이 데이터에 없다. 각 홈페이지나 전화로 확인할 것.")
    return "\n".join(lines).rstrip()


def main():
    parser = argparse.ArgumentParser(description="종교시설 찾기 (공식 Kakao Local API, k-skill-proxy 경유)")
    parser.add_argument("location", nargs="?", help="동네·역명·랜드마크 (예: 강남역, 성수동)")
    parser.add_argument("--name", help="교회/시설 이름으로 직접 검색")
    parser.add_argument("--type", default="교회", choices=sorted(TYPE_ALIASES), help="시설 종류 (기본: 교회)")
    parser.add_argument("--radius", type=int, help="기준 위치로부터 최대 거리(m, 최대 20000)")
    parser.add_argument("--limit", type=int, default=5, help=f"표시 개수 (기본 5, 최대 {MAX_CANDIDATES})")
    parser.add_argument("--json", action="store_true", help="JSON으로 출력")
    args = parser.parse_args()

    if not args.location and not args.name:
        parser.error("location 또는 --name 중 하나는 필요하다. 사용자에게 현재 위치를 먼저 물어볼 것.")

    if not 1 <= args.limit <= MAX_CANDIDATES:
        parser.error(f"--limit은 1~{MAX_CANDIDATES} 사이여야 한다. 페이지 {MAX_PAGES}장(페이지당 "
                     f"{PAGE_SIZE}건)까지만 가져오므로 그보다 많이 표시할 수 없다.")

    if args.radius is not None and not 1 <= args.radius <= 20000:
        parser.error("--radius는 1~20000(m) 사이여야 한다. Kakao Local API의 상한이다.")

    if args.location and COORD_RE.match(args.location):
        parser.error("좌표 검색은 지원하지 않는다. 동네·역명·랜드마크로 입력할 것 (예: 강남역, 성수동).")

    if args.name:
        # 위치는 좌표(x,y)로 전달하므로 검색어는 시설 이름만 쓴다
        # ("강남역 온누리교회"처럼 붙이면 keyword API가 0건을 돌려준다)
        query = args.name
    elif args.type == "전체":
        query = args.type  # collect()가 종류별 검색으로 풀어서 합친다
    else:
        query = args.type

    try:
        anchor = resolve_anchor(args.location) if args.location else None
        if args.location and anchor is None:
            print(f"기준 위치 \"{args.location}\"을(를) 찾지 못해 거리 없이 조회한다.", file=sys.stderr)
        scanned, matched, places = collect(query, args.type, anchor, args.radius, args.limit)
    except LookupError_ as error:
        print(f"조회 실패: {error}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps({"query": query, "anchor": anchor, "scanned": scanned,
                          "matched": matched, "items": places},
                         ensure_ascii=False, indent=2))
    else:
        print(format_report(query, anchor, scanned, matched, places, args.type))
    return 0


if __name__ == "__main__":
    sys.exit(main())
