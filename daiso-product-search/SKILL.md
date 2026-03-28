---
name: daiso-product-search
description: Look up Daiso products by store name and product keyword using official Daiso Mall store/search/stock surfaces. Use when the user wants to know whether a product is available at a specific Daiso store.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# Daiso Product Search

## What this skill does

다이소몰 공식 검색/매장/재고 표면을 사용해 **특정 다이소 매장의 상품 재고**를 확인한다.

- 공식 매장 검색으로 매장 코드를 찾는다.
- 공식 상품 검색으로 상품 후보를 찾는다.
- 공식 매장 픽업 재고 표면으로 해당 매장의 재고를 확인한다.
- **공식 표면이 매장 내 진열 위치를 주지 않으면 재고 중심으로만 답한다.**

## When to use

- "강남역2호점에 리들샷 있어?"
- "다이소 특정 매장 재고 확인해줘"
- "이 상품 어느 매장에 있는지 확인해줘"
- "다이소 매장명 주면 그 매장 재고 봐줘"

## When not to use

- 매장명도 상품명도 전혀 없는 상태에서 바로 재고를 단정해야 하는 경우
- 결제/주문/픽업 예약까지 자동화해야 하는 경우
- 비공식 크롤링 결과를 우선해야 하는 경우

## Prerequisites

- 인터넷 연결
- `node` 18+
- 이 저장소의 `daiso-product-search` package 또는 동일 로직

## Required inputs

### 1. Ask the store name first if it is missing

매장명이 없으면 바로 조회하지 말고 먼저 물어본다.

- 권장 질문: `어느 다이소 매장을 확인할까요? 매장명(예: 강남역2호점)을 알려주세요.`
- 비슷한 매장이 여러 개면: `후보 매장이 여러 개예요. 정확한 매장명을 하나만 골라주세요.`

### 2. Ask the product name or keyword if it is missing

상품명/검색어도 반드시 필요하다.

- 권장 질문: `찾을 상품명이나 검색어도 알려주세요. 예: VT 리들샷 100`
- 너무 넓으면: `검색어가 너무 넓어요. 브랜드나 용량까지 같이 알려주세요.`

## Official Daiso Mall surfaces

- store keyword catalog: `https://www.daisomall.co.kr/api/ms/msg/selStrSrchKeyword`
- store search: `https://www.daisomall.co.kr/api/ms/msg/selStr`
- store detail: `https://www.daisomall.co.kr/api/dl/dla-api/selStrInfo`
- product search summary: `https://www.daisomall.co.kr/ssn/search/Search`
- product search list: `https://www.daisomall.co.kr/ssn/search/SearchGoods`
- product summary list: `https://www.daisomall.co.kr/ssn/search/GoodsMummResult`
- store pickup stock: `https://www.daisomall.co.kr/api/pd/pdh/selStrPkupStck`
- optional online stock cross-check: `https://www.daisomall.co.kr/api/pdo/selOnlStck`

## Workflow

### 1. Resolve the store

공식 매장 검색 API로 매장명을 먼저 해결한다.

```js
const { searchStores } = require("daiso-product-search")

const storeResult = await searchStores("강남역2호점", {
  limit: 5
})

console.log(storeResult.items)
```

매장 후보가 여러 개면 상위 2~3개만 보여주고 다시 확인받는다.

### 2. Resolve the product

공식 `SearchGoods` 표면으로 상품 후보를 찾는다.

```js
const { searchProducts } = require("daiso-product-search")

const productResult = await searchProducts("VT 리들샷 100", {
  limit: 10
})

console.log(productResult.items)
```

상품 후보가 여러 개면 아래 우선순위로 짧게 정리한다.

- 정확히 일치하는 이름
- 브랜드 + 용량/호수까지 포함된 이름
- 리뷰 수/검색 점수가 높은 후보
- 온라인 재고 교차 확인이 필요하면 후보의 `onldPdNo` 를 함께 보존한다

### 3. Check the store pickup stock

공식 매장 픽업 재고 API로 해당 매장의 재고를 확인한다.

```js
const { getStorePickupStock } = require("daiso-product-search")

const stock = await getStorePickupStock({
  pdNo: "1049275",
  strCd: "10224"
})

console.log(stock)
```

### 4. Use the end-to-end helper when both names are already known

```js
const { lookupStoreProductAvailability } = require("daiso-product-search")

const result = await lookupStoreProductAvailability({
  storeQuery: "강남역2호점",
  productQuery: "VT 리들샷 100"
})

console.log(result.selectedStore)
console.log(result.selectedProduct)
console.log(result.pickupStock)
```

### 5. Respond conservatively

응답은 짧고 명확하게 정리한다.

- 매장명
- 상품명
- 매장 재고 수량 또는 재고 없음
- 필요하면 온라인 재고 참고값
- **공식 표면이 매장 내 진열 위치를 주지 않으면 `공식 표면에서는 매장 재고까지만 확인된다`고 분명히 말한다.**

## Done when

- 매장명과 상품명이 모두 확인되었다.
- 공식 표면으로 매장 후보와 상품 후보를 찾았다.
- 공식 매장 재고 결과를 최소 1회 반환했다.
- 위치 정보가 없으면 없다고 분명히 고지했다.

## Failure modes

- 매장명이 너무 넓으면 같은 상권의 여러 지점이 동시에 잡힐 수 있다.
- 상품명이 너무 넓으면 다른 용량/호수 후보가 많이 섞일 수 있다.
- 공식 재고는 시점 차이로 실제 방문 시 수량이 달라질 수 있다.
- 현재 확인된 공식 표면은 **매장 내 aisle/진열 위치**를 직접 주지 않을 수 있다.

## Notes

- 조회형 스킬이다.
- 공식 표면 우선 원칙을 유지한다.
- 공식 표면이 위치를 주지 않으면 억지 추정을 하지 않는다.
