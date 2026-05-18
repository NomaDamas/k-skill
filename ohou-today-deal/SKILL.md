---
name: ohou-today-deal
description: 오늘의집 공개 오늘의딜 페이지에서 로그인 없이 특가 상품을 조회하고 할인율, 가격, 리뷰, 링크를 정리하는 읽기 전용 스킬.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# 오늘의집 오늘의딜 조회

## What this skill does

오늘의집 공개 오늘의딜 페이지(`https://ohou.se/commerces/today_deals`)의 서버 렌더링 초기 데이터(`__NEXT_DATA__`)를 읽어 특가 상품을 조회한다.

- 오늘의딜/스페셜딜 상품 목록 조회
- 할인율, 원가, 판매가, 쿠폰/결제혜택 반영 최저가 정리
- 브랜드, 리뷰 수, 평점, 무료배송 여부, 상품 링크 확인
- 키워드, 최소 할인율, 무료배송 필터

## When to use

- "오늘의집 오늘의딜 뭐 있어?"
- "오늘의집에서 할인율 높은 특가 상품 3개 보여줘"
- "오늘의집 무료배송 특가만 골라줘"
- "오늘의집에서 러그 특가 찾아줘"

## When not to use

- 로그인, 장바구니, 구매, 결제 자동화 — 이 스킬은 의도적으로 구매 플로우를 포함하지 않는다.
- 개인화 추천, 사용자별 쿠폰 적용 확정, 실시간 재고 보장.
- 법적 증빙 수준의 가격 확정 — 조회 시점 기준 참고용이다.
- 차단 우회, CAPTCHA 우회 — 표준 라이브러리 `urllib` 한 호출로 안 되면 실패 모드로 처리한다.

## Required inputs

별도 입력 없이 실행 가능. 선택적으로 아래를 지정할 수 있다:

- `--query`: 상품명/브랜드 키워드
- `--min-discount`: 최소 할인율 (0~100 정수)
- `--free-delivery`: 무료배송 상품만
- `--sort`: 정렬 기준 (`discount`, `price`, `review`, `annual-sales`)
- `--limit`: 결과 개수 (양의 정수, 기본 10)
- `--html-file`: 오프라인 HTML/JSON fixture 경로

## Official/public surface

- 오늘의집 오늘의딜 페이지: `https://ohou.se/commerces/today_deals`
- 현재 웹 페이지는 canonical/OG URL로 `https://store.ohou.se/today_deals`를 노출하지만, 브라우저 접근용 공개 URL은 `ohou.se/commerces/today_deals`다.
- 응답 HTML의 Next.js `__NEXT_DATA__` 안 React Query `dehydratedState`에서 `today-deal-feed`, `special-today-deal-feed` queryKey 두 곳의 `todayDealFeed.slots`만 명시적으로 읽는다. 다른 페이지 모듈(navigation, banner 등)에 `type: DEAL` 노드가 있어도 무시한다.
- HTTP 요청은 `User-Agent: k-skill-ohou-today-deal/1.0 (+https://github.com/NomaDamas/k-skill)`로 보낸다. ohou.se 앞단 Akamai bot manager는 익명/단축 UA를 차단하지만 봇 이름 + contact URL이 포함된 well-formed UA는 통과시키므로 우회/조작 없이 정직한 자기소개로 요청한다.

## Prerequisites

- `python3`
- 별도 로그인/API 키 없음

## Workflow

### 1. 오늘의딜 상품 조회

오늘의집 오늘의딜 공개 페이지에서 상품 목록을 가져온다. 기본 정렬은 할인율 높은 순이다.

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list --limit 10
```

응답 예시:
```json
{
  "source": {
    "name": "ohou-today-deal",
    "url": "https://ohou.se/commerces/today_deals",
    "fetched_at": "2026-05-18T01:44:16+00:00",
    "surface": "__NEXT_DATA__ today-deal-feed + special-today-deal-feed"
  },
  "filters": {"query": null, "min_discount": null, "free_delivery": false, "sort": "discount", "limit": 10},
  "count": 10,
  "total_count": 72,
  "filtered_count": 72,
  "items": [
    {
      "id": "823405",
      "title": "삼익가구 BEST상품 총집합",
      "brand": "삼익가구",
      "url": "https://ohou.se/productions/823405/selling",
      "original_price": 449000,
      "selling_price": 132000,
      "discount_rate": 70,
      "best_price": 118800,
      "best_discount_rate": 73,
      "best_discount_description": "쿠폰 할인가",
      "review_count": 53818,
      "review_average": 4.7,
      "free_delivery": false,
      "sold_out": false
    }
  ]
}
```

### 2. 할인율 높은 순 정렬

`bestDiscountPrice.discountRate`(쿠폰/결제혜택 반영 할인율)가 있으면 우선 사용하고, 없으면 상품 기본 `discountRate`를 사용한다.

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --sort discount \
  --limit 5
```

정렬 옵션: `discount`(할인율), `price`(낮은 가격), `review`(리뷰 많은 순), `annual-sales`(연간 판매량).

### 3. 키워드·할인율·무료배송 필터

상품명 또는 브랜드에 키워드가 포함된 상품만 걸러내고, 최소 할인율과 무료배송 조건을 조합할 수 있다.

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --query 러그 \
  --min-discount 30 \
  --free-delivery \
  --limit 5
```

### 4. 오프라인 fixture로 검증

실제 네트워크 없이 저장된 HTML/JSON 파일로 동일한 파싱을 테스트한다.

```bash
python3 ohou-today-deal/scripts/ohou_today_deal.py list \
  --html-file ./today-deals.html \
  --limit 3
```

## Output format

기본 출력은 들여쓰기 JSON (`indent=2`). 파이프/스크립트에서 사용할 때는 출력을 `jq` 등으로 후처리한다.

주요 필드:

| 필드 | 설명 |
|---|---|
| `source.fetched_at` | 조회 시각 (UTC ISO 8601) |
| `count` | 반환된 상품 수 |
| `total_count` | 전체 오늘의딜 상품 수 |
| `filtered_count` | 필터 적용 후 상품 수 |
| `items[].best_price` | 쿠폰/결제혜택 반영 최저가 (없으면 null) |
| `items[].best_discount_rate` | 혜택 반영 할인율 (없으면 null) |
| `items[].free_delivery` | 무료배송 여부 |
| `items[].sold_out` | 품절 여부 |

## Endpoints used

이 스킬이 호출하는 공개 endpoint:

| Method | URL | 용도 |
|---|---|---|
| GET | `https://ohou.se/commerces/today_deals` | 오늘의딜 공개 HTML (서버 렌더링) |

비로그인 / 무인증. 헤더는 `User-Agent` + `Accept` 만.

## Response policy

- 상위 3~5개만 먼저 보여준다.
- 상품명, 브랜드, 할인가, 원가, 할인율, 평점/리뷰 수, 무료배송 여부, 링크를 정리한다.
- 가격, 할인, 품절, 쿠폰/결제혜택은 "조회 시각 기준"으로 변동 가능하다고 명시한다.
- 구매/장바구니/결제는 자동화하지 말고 상품 링크만 제공한다.
- "지금 사라" 같은 행위 유도 금지 — 사용자가 직접 페이지에서 구매한다.

## Done when

- 오늘의딜 상품 후보가 JSON 또는 요약 목록으로 반환된다.
- 할인율/가격 기준과 조회 시점이 분리되어 설명된다.
- 로그인, 구매, 결제, 개인화 기능을 시도하지 않았다.

## Failure modes

- **`__NEXT_DATA__` 미발견**: 오늘의집이 Next.js SSR 구조를 변경하거나, 서버 렌더링 대신 클라이언트 렌더링으로 전환하면 `ValueError` 발생. 스킬 파서 수정이 필요하다.
- **today-deal-feed queryKey 미발견**: React Query 키 이름이 바뀌면 `extract_deals()`는 빈 리스트를 반환한다 (`total_count: 0`). `TODAY_DEAL_FEED_KEYS` 상수를 새 키 이름으로 업데이트해야 한다.
- **HTTP 403**: ohou.se 앞단 Akamai bot manager가 요청을 차단한 경우. `User-Agent` 헤더가 변경되어 봇 자기소개 + contact URL 시그니처를 잃었을 가능성이 높다. 우회 시도하지 않고 에러 출력 후 종료한다.
- **HTTP 4xx/5xx (기타)**: 일시 장애. 우회 시도하지 않고 에러 출력 후 종료.
- **빈 응답 (`total_count: 0`)**: 오늘의딜이 아직 업데이트되지 않았거나, 페이지 구조가 바뀐 경우. 브라우저에서 직접 확인을 안내한다.
- **가격/쿠폰 변동**: `best_price`는 조회 시점 기준이며, 사용자별 쿠폰/결제수단에 따라 실제 결제가는 다를 수 있다.
- **필드 누락**: 일부 상품에 `bestDiscountPrice`, `badgeProperties.isFreeDelivery`, `scrapInfo` 등이 없을 수 있다. null로 처리된다.

## Notes

- read-only 스킬이다.
- 화면 선택자보다 서버 렌더링 초기 JSON을 우선한다.
- 새 dependency 없이 Python 표준 라이브러리만 사용한다.
