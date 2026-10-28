#!/usr/bin/env python3
"""ohou-today-deal — 오늘의집 공개 오늘의딜 특가 상품 조회 CLI.

조회 전용. 로그인·장바구니·구매·결제 자동화 없음.
__NEXT_DATA__ 서버 렌더링 초기 데이터만 읽는 read-only 스킬.

Usage:
    ohou-today-deal list [--limit N] [--sort discount|price|review|annual-sales]
    ohou-today-deal list --query 러그 --min-discount 30 --free-delivery
    ohou-today-deal list --html-file ./fixture.html

Supported surface:
    https://ohou.se/commerces/today_deals  (공개 HTML)
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DEFAULT_URL = "https://ohou.se/commerces/today_deals"
DEFAULT_USER_AGENT = (
    "k-skill-ohou-today-deal/1.0 (+https://github.com/NomaDamas/k-skill)"
)
TODAY_DEAL_FEED_KEYS: tuple[tuple[str, ...], ...] = (
    ("today-deal-feed",),
    ("special-today-deal-feed",),
)


@dataclass(frozen=True)
class OhouDeal:
    id: str
    title: str
    brand: str | None
    url: str
    image_url: str | None
    original_price: int | None
    selling_price: int | None
    discount_rate: int | None
    best_price: int | None
    best_discount_rate: int | None
    best_discount_description: str | None
    review_count: int
    review_average: float | None
    scrap_count: int | None
    annual_sales: int | None
    free_delivery: bool
    sold_out: bool
    start_at: str | None
    end_at: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_html(url: str = DEFAULT_URL, timeout: int = 20) -> str:
    # ohou.se Akamai 정책: 익명 UA(`python-urllib`, `Mozilla/5.0` 단독)는 403,
    # 봇 이름+contact URL이 포함된 well-formed UA는 허용. 우회가 아닌 자기소개.
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "text/html,application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_next_data(document: str) -> dict[str, Any]:
    stripped = document.lstrip()
    if stripped.startswith("{"):
        return json.loads(stripped)

    match = re.search(
        r'<script\b[^>]*\bid=["\']__NEXT_DATA__[^>]*>(.*?)</script>',
        document,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Could not find __NEXT_DATA__ in Today Deal HTML")
    return json.loads(html.unescape(match.group(1)))


def _walk(value: Any):
    """스택 기반 DFS로 JSON 트리의 모든 dict 노드를 순회한다.

    __NEXT_DATA__는 깊고 거대한 트리 구조를 가질 수 있어
    재귀 대신 반복문을 사용해 sys.getrecursionlimit() 제한을 회피한다.
    """
    stack = [value]
    while stack:
        curr = stack.pop()
        if isinstance(curr, dict):
            yield curr
            stack.extend(curr.values())
        elif isinstance(curr, list):
            stack.extend(reversed(curr))


def _looks_like_deal_node(node: dict[str, Any]) -> bool:
    deal = node.get("deal")
    return (
        node.get("type") == "DEAL"
        and isinstance(deal, dict)
        and bool(deal.get("id"))
        and bool(deal.get("name"))
    )


def _iter_today_deal_feeds(payload: dict[str, Any]):
    """__NEXT_DATA__에서 today-deal-feed / special-today-deal-feed 쿼리만 골라낸다.

    React Query dehydrated state는 `props.pageProps.dehydratedState.queries`에
    `[{queryKey, state: {data: {...}}}]` 형태로 저장된다. queryKey가 일치하는
    엔트리의 `state.data.todayDealFeed.slots`만 today-deal 콘텐츠로 인정한다.
    """
    allowed = {tuple(key) for key in TODAY_DEAL_FEED_KEYS}
    queries = (
        payload.get("props", {})
        .get("pageProps", {})
        .get("dehydratedState", {})
        .get("queries", [])
    )
    if not isinstance(queries, list):
        return
    for entry in queries:
        if not isinstance(entry, dict):
            continue
        query_key = entry.get("queryKey")
        if not isinstance(query_key, list):
            continue
        if tuple(query_key) not in allowed:
            continue
        state = entry.get("state") or {}
        data = state.get("data") or {}
        feed = data.get("todayDealFeed") or {}
        slots = feed.get("slots")
        if isinstance(slots, list):
            yield tuple(query_key), slots


def _normalize_deal(node: dict[str, Any]) -> OhouDeal:
    deal = node.get("deal", {})
    price = deal.get("price") or {}
    best_price = node.get("bestDiscountPrice") or {}
    brand = deal.get("brand") or {}
    review = deal.get("reviewStatistic") or {}
    scrap = deal.get("scrapInfo") or {}
    badge = deal.get("badgeProperties") or {}
    annual_sales = node.get("salesStats", {}).get("annualCumulativeSales")
    deal_id = str(deal.get("id", ""))

    return OhouDeal(
        id=deal_id,
        title=str(deal.get("name") or node.get("title") or ""),
        brand=brand.get("name"),
        url=f"https://ohou.se/productions/{deal_id}/selling",
        image_url=deal.get("imageUrl"),
        original_price=_to_int(price.get("representativeOriginalPrice")),
        selling_price=_to_int(price.get("representativeSellingPrice")),
        discount_rate=_to_int(price.get("discountRate")),
        best_price=_to_int(best_price.get("price")),
        best_discount_rate=_to_int(best_price.get("discountRate")),
        best_discount_description=best_price.get("discountPlanDescription"),
        review_count=_to_int(review.get("reviewCount")) or 0,
        review_average=_to_float(review.get("reviewAverage")),
        scrap_count=_to_int(scrap.get("scrapCount")),
        annual_sales=_to_int(annual_sales),
        free_delivery=bool(badge.get("isFreeDelivery")),
        sold_out=bool(deal.get("isSoldOut")),
        start_at=node.get("startAt"),
        end_at=node.get("endAt"),
    )


def extract_deals(payload: dict[str, Any]) -> list[OhouDeal]:
    seen: set[str] = set()
    deals: list[OhouDeal] = []
    found_feed = False

    for _query_key, slots in _iter_today_deal_feeds(payload):
        found_feed = True
        for node in slots:
            if not isinstance(node, dict) or not _looks_like_deal_node(node):
                continue
            deal = _normalize_deal(node)
            if deal.id in seen:
                continue
            seen.add(deal.id)
            deals.append(deal)

    # Fixture/legacy fallback: payload에 React Query dehydratedState가 없거나
    # queryKey 구조가 다른 경우(테스트 fixture, 단순화된 페이로드)에 한해서만
    # 전체 트리를 DFS로 훑어 DEAL 노드를 수집한다. 라이브 페이지는 항상
    # 위쪽 명시적 분기에서 잡히므로 이 fallback은 영향받지 않는다.
    if not found_feed:
        for node in _walk(payload):
            if not _looks_like_deal_node(node):
                continue
            deal = _normalize_deal(node)
            if deal.id in seen:
                continue
            seen.add(deal.id)
            deals.append(deal)

    return deals


def filter_deals(
    deals: list[OhouDeal],
    *,
    query: str | None = None,
    min_discount: int | None = None,
    free_delivery: bool = False,
    include_sold_out: bool = False,
) -> list[OhouDeal]:
    """단일 루프로 모든 필터 조건을 검사한다."""
    needle = query.casefold() if query else None
    filtered: list[OhouDeal] = []

    for deal in deals:
        if not include_sold_out and deal.sold_out:
            continue
        if needle and needle not in deal.title.casefold() and needle not in (deal.brand or "").casefold():
            continue
        if min_discount is not None and (deal.best_discount_rate or deal.discount_rate or 0) < min_discount:
            continue
        if free_delivery and not deal.free_delivery:
            continue
        filtered.append(deal)

    return filtered


def sort_deals(deals: list[OhouDeal], sort_key: str) -> list[OhouDeal]:
    if sort_key == "discount":
        return sorted(
            deals,
            key=lambda deal: (deal.best_discount_rate or deal.discount_rate or -1, deal.review_count),
            reverse=True,
        )
    if sort_key == "price":
        return sorted(deals, key=lambda deal: deal.best_price or deal.selling_price or sys.maxsize)
    if sort_key == "review":
        return sorted(deals, key=lambda deal: (deal.review_count, deal.review_average or 0), reverse=True)
    if sort_key == "annual-sales":
        return sorted(deals, key=lambda deal: deal.annual_sales or -1, reverse=True)
    return deals


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    document = Path(args.html_file).read_text(encoding="utf-8") if args.html_file else fetch_html(args.url)
    payload = extract_next_data(document)
    deals = extract_deals(payload)
    filtered = filter_deals(
        deals,
        query=args.query,
        min_discount=args.min_discount,
        free_delivery=args.free_delivery,
        include_sold_out=args.include_sold_out,
    )
    sorted_deals = sort_deals(filtered, args.sort)
    limited_deals = sorted_deals[: args.limit]

    kst = timezone(timedelta(hours=9))
    now_utc = datetime.now(timezone.utc)

    return {
        "source": {
            "name": "ohou-today-deal",
            "url": args.url,
            "fetched_at": now_utc.isoformat(),
            "fetched_at_kst": now_utc.astimezone(kst).strftime("%Y-%m-%d %H:%M:%S KST"),
            "surface": "__NEXT_DATA__ today-deal-feed + special-today-deal-feed",
        },
        "filters": {
            "query": args.query,
            "min_discount": args.min_discount,
            "free_delivery": args.free_delivery,
            "include_sold_out": args.include_sold_out,
            "sort": args.sort,
            "limit": args.limit,
        },
        "count": len(limited_deals),
        "total_count": len(deals),
        "filtered_count": len(filtered),
        "items": [deal.to_dict() for deal in limited_deals],
    }


def _positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"expected integer, got {value!r}") from exc
    if parsed <= 0:
        raise argparse.ArgumentTypeError(f"must be a positive integer, got {parsed}")
    return parsed


def _discount_rate(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"expected integer, got {value!r}") from exc
    if not 0 <= parsed <= 100:
        raise argparse.ArgumentTypeError(
            f"discount rate must be between 0 and 100, got {parsed}"
        )
    return parsed


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read Ohouse today deal products from public HTML.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="오늘의집 오늘의딜 상품 목록")
    list_parser.add_argument("--url", default=DEFAULT_URL)
    list_parser.add_argument("--html-file", help="테스트/오프라인 검증용 HTML 또는 JSON 파일")
    list_parser.add_argument("--query", help="상품명 또는 브랜드 키워드")
    list_parser.add_argument("--min-discount", type=_discount_rate, help="최소 할인율 (0~100)")
    list_parser.add_argument("--free-delivery", action="store_true", help="무료배송 상품만")
    list_parser.add_argument("--include-sold-out", action="store_true", help="품절 상품 포함")
    list_parser.add_argument(
        "--sort",
        choices=["default", "discount", "price", "review", "annual-sales"],
        default="discount",
    )
    list_parser.add_argument("--limit", type=_positive_int, default=10, help="결과 개수 (양의 정수)")

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    if args.command == "list":
        print(json.dumps(build_payload(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
