---
name: coupang-product-search
description: 공식 쿠팡 쇼핑 URL과 브라우저 캡처 HTML을 이용해 상품 후보, 가격, 상세, 리뷰를 정리한다. 먼저 Open API 제한과 anti-bot 차단 여부를 확인하고, 가능하면 검색→상세→리뷰 순으로 답한다.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# Coupang Product Search

## What this skill does

쿠팡에서 사용자의 니즈에 맞는 상품을 찾기 위해 다음을 지원한다.

- 공식 쿠팡 검색 URL 생성
- 브라우저 세션에서 캡처한 검색 결과 HTML 파싱
- 상품 상세/가격/판매자/배지/필수 표기 정보 파싱
- 상품 리뷰 요약/개별 리뷰 파싱
- direct fetch / headless browser 차단 여부 probe

## Important limitation first

2026-03-31 기준으로 확인한 사실:

- 쿠팡 개발자 Open API는 **판매자/WING 중심** 문서만 확인되었다.
- 일반 소비자용 상품 검색·리뷰 조회 Open API는 확인하지 못했다.
- 이 저장소 환경에서 desktop direct HTTP 는 `403 Access Denied` 로 차단되었다.
- mobile direct HTTP 도 차단되었지만, rerun 마다 `200 challenge-html` 또는 `403 access-denied-html` 처럼 **차단 응답이 달라질 수 있었다.**
- headless Playwright-core probe 역시 차단되었고, **blocked shape 도 edge/challenge 상태에 따라 달라질 수 있었다.**

따라서 이 스킬은 **anti-bot 우회**를 시도하지 않는다. 대신:

1. 공식 URL을 만든다.
2. 브라우저 세션에서 확보한 HTML 이 있으면 파싱한다.
3. HTML 확보가 막히면 probe 결과와 함께 제한을 설명한다.

## When to use

- "쿠팡에서 생수 가격 좀 찾아줘"
- "이 쿠팡 상품 상세/리뷰 요약해줘"
- "쿠팡 headless 자동화가 가능한지 먼저 테스트해줘"
- "쿠팡 검색 URL부터 만들고 상품 후보 정리해줘"

## When not to use

- 로그인, 장바구니, 결제 자동화가 필요한 경우
- anti-bot 우회나 계정/session 탈취가 필요한 경우
- 공식 URL이나 브라우저 HTML 없이 결과를 단정해야 하는 경우

## Official surfaces checked

- seller Open API docs: `https://developers.coupangcorp.com/hc/ko/sections/360004260614-상품-API`
- desktop search URL: `https://www.coupang.com/np/search?q=<query>`
- mobile search URL: `https://m.coupang.com/nm/search?q=<query>`
- product URL pattern: `https://www.coupang.com/vp/products/<productId>?itemId=<itemId>&vendorItemId=<vendorItemId>`
- review section anchor: `#sdpReview`

## Workflow

### 1. Clarify the need

검색어가 너무 넓으면 먼저 의도를 좁힌다.

- 권장 질문: `어떤 용도/예산/브랜드/용량을 우선할까요? 예: 생수 2L / 무라벨 / 로켓배송` 
- URL이 이미 있으면 바로 상세/리뷰 단계로 간다.

### 2. Probe the environment

가능 여부를 먼저 확인한다.

```js
const { probeAutomation } = require("coupang-product-search")

const probe = await probeAutomation("생수")
console.log(probe)
```

- `blocked: true` 면 direct fetch / headless browser 가 막힌 것이다.
- `browserFetchHtml` 을 주입하지 않은 clean checkout 에서는 `browser === null` 이고, `browser` 값은 수동/외부 Playwright-core runner 같은 `browserFetchHtml` 주입 경로를 붙였을 때만 채워진다.
- 이 경우 **브라우저 세션에서 캡처한 HTML** 또는 사용자가 제공한 쿠팡 상품 URL/HTML 이 필요하다고 설명한다.

### 3. Search products when browser HTML is available

```js
const { searchProducts } = require("coupang-product-search")

const search = await searchProducts("생수", {
  fetchHtml: browserCapture
})

console.log(search.items)
```

정리 우선순위:

- 제목 정확도
- 가격
- 로켓배송/무료배송/와우가 등 배지
- 평점/리뷰 수
- 판매자명

### 4. Read product detail

```js
const { getProductDetail } = require("coupang-product-search")

const detail = await getProductDetail(search.items[0].productUrl, {
  fetchHtml: browserCapture
})

console.log(detail)
```

반환값에는 보통 아래 정보가 포함된다.

- 상품명
- 가격 / 할인 전 가격 / 단위당 가격
- 판매자명
- 배송 배지 / 도착 문구
- 필수 표기 정보
- 리뷰 요약

### 5. Read reviews

```js
const { getProductReviews } = require("coupang-product-search")

const reviews = await getProductReviews(detail.productUrl, {
  fetchHtml: browserCapture
})

console.log(reviews.summary)
console.log(reviews.items.slice(0, 3))
```

## Response policy

- probe 가 막혔으면 **막혔다고 먼저 말한다.**
- 브라우저 HTML 없이 live 결과를 단정하지 않는다.
- 후보가 여러 개면 상위 3개만 짧게 비교한다.
- 리뷰는 전체 평균/개수 + 대표 리뷰 2~3개 정도만 요약한다.

## Done when

- 검색어 또는 상품 URL이 확보되었다.
- probe 결과를 확인했다.
- 가능하면 검색 → 상세 → 리뷰를 순서대로 정리했다.
- 차단되면 차단 사실과 필요한 다음 입력(브라우저 HTML / 상품 URL)을 분명히 설명했다.
