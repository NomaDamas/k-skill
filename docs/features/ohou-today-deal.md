# 오늘의집 오늘의딜 조회 가이드

## 이 기능으로 할 수 있는 일

`ohou-today-deal`은 오늘의집 공개 오늘의딜 페이지에서 특가 상품 정보를 읽어 할인율, 가격, 리뷰, 무료배송 여부, 링크를 정리하는 읽기 전용 스킬이다.

- 오늘의딜/스페셜딜 상품 목록 조회
- 할인율 높은 순, 낮은 가격 순, 리뷰 많은 순 정렬
- 키워드, 최소 할인율, 무료배송 필터
- 상품 링크 제공

## 먼저 필요한 것

- `python3`
- 인터넷 연결
- 별도 로그인/API 키 없음

## 공개 접근 경로

- 브라우저용 공개 URL: `https://ohou.se/commerces/today_deals`
- 페이지가 노출하는 canonical/OG URL: `https://store.ohou.se/today_deals`
- 데이터 표면: HTML 안의 Next.js `__NEXT_DATA__` 안 React Query `dehydratedState`에서 `today-deal-feed`, `special-today-deal-feed` queryKey 두 곳의 `todayDealFeed.slots`만 명시적으로 읽는다.
- HTTP 요청은 `User-Agent: k-skill-ohou-today-deal/1.0 (+https://github.com/NomaDamas/k-skill)` 헤더로 보낸다 (ohou.se 앞단 Akamai bot manager가 익명/단축 UA를 차단하기 때문에 봇 이름 + contact URL이 들어간 well-formed UA로 정직하게 자기소개한다 — 우회/조작이 아님).

이 기능은 화면 클릭, 로그인 세션, 장바구니, 결제 자동화를 하지 않는다.

## 예시

할인율 높은 오늘의딜 상위 5개:

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --sort discount \
  --limit 5
```

러그 관련 무료배송 특가:

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --query 러그 \
  --free-delivery \
  --limit 5
```

30% 이상 할인 상품:

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --min-discount 30 \
  --limit 10
```

오프라인 fixture로 검증:

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --html-file ./today-deals.html \
  --limit 3
```

## 출력에서 확인할 점

- `items[].title`: 상품명
- `items[].brand`: 브랜드
- `items[].original_price`, `items[].selling_price`: 기본 가격
- `items[].best_price`, `items[].best_discount_rate`: 쿠폰/결제혜택 반영 최저가가 있을 때의 가격과 할인율
- `items[].review_count`, `items[].review_average`: 리뷰 정보
- `items[].free_delivery`: 무료배송 여부
- `items[].url`: 상품 페이지

## 주의할 점

- 가격, 쿠폰, 결제혜택, 품절 여부는 실시간으로 바뀔 수 있다.
- `best_price`는 오늘의집 페이지가 노출한 혜택 기준이며, 사용자별 쿠폰/결제수단에 따라 실제 결제가는 달라질 수 있다.
- HTML 구조나 `__NEXT_DATA__` 스키마가 바뀌면 파서 수정이 필요하다.
- 구매, 장바구니, 결제는 사용자가 직접 진행해야 한다.
