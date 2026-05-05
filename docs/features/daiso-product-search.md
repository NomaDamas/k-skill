# 다이소 상품 조회 가이드

## 이 기능으로 할 수 있는 일

- 다이소 매장명으로 공식 매장 후보 찾기
- 상품명/검색어로 공식 상품 후보 찾기
- 특정 매장의 **매장 픽업 재고** 확인
- 매장 픽업 재고가 `Unauthorized` 로 차단되면 `retrievalStatus: "blocked"` 차단 상태를 명확히 표시하고, 필요하면 `referenceOnly: true` 온라인 재고 참고값 함께 확인

## 먼저 필요한 것

- 인터넷 연결
- `node` 18+

## 입력값

- 매장명
  - 예: `강남역2호점`
  - 예: `스타필드하남점`
- 상품명 또는 검색어
  - 예: `VT 리들샷 100`
  - 예: `리들샷 300`

## 공식 표면

- store search: `https://www.daisomall.co.kr/api/ms/msg/selStr`
- store detail: `https://www.daisomall.co.kr/api/dl/dla-api/selStrInfo`
- product search list: `https://www.daisomall.co.kr/ssn/search/SearchGoods`
- product summary list: `https://www.daisomall.co.kr/ssn/search/GoodsMummResult`
- store pickup stock: `https://www.daisomall.co.kr/api/pd/pdh/selStrPkupStck`
- optional online stock: `https://www.daisomall.co.kr/api/pdo/selOnlStck`

## 기본 흐름

1. 매장명이 없으면 먼저 매장명을 물어봅니다.
2. 상품명이 없으면 상품명/검색어를 한 번 더 물어봅니다.
3. `selStr` 로 매장 후보를 찾고, 필요하면 `selStrInfo` 로 매장 상세를 확인합니다.
4. `SearchGoods` 로 상품 후보를 찾습니다.
5. `selStrPkupStck` 로 해당 매장의 상품 재고를 확인합니다.
6. `selStrPkupStck` 가 `Unauthorized` 로 차단되면 매장 픽업 재고는 `unavailable/blocked/unauthorized` 로 보고하고 세션 우회를 시도하지 않습니다.
7. 필요하면 `SearchGoods` 응답의 `onldPdNo` 를 함께 보존해 `selOnlStck` 온라인 재고 교차 확인에 사용합니다.
8. 공식 표면이 매장 내 위치를 주지 않으면 재고 중심으로 답합니다.

## 예시

```js
const { lookupStoreProductAvailability } = require("daiso-product-search")

async function main() {
  const result = await lookupStoreProductAvailability({
    storeQuery: "강남역2호점",
    productQuery: "VT 리들샷 100"
  })

  console.log({
    store: result.selectedStore,
    product: result.selectedProduct,
    pickupStock: result.pickupStock,
    onlineStock: result.onlineStock
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

## 실전 운영 팁

- 매장 후보가 여러 개면 상위 2~3개만 보여주고 다시 확인받는 편이 안전합니다.
- 상품 후보가 여러 개면 브랜드, 용량, 호수까지 같이 보여 주는 편이 덜 헷갈립니다.
- 재고 수량은 실시간 100% 보장값이 아니므로, 필요하면 `방문 직전 다시 확인` 문구를 같이 줍니다.
- 공식 표면이 매장 내 위치를 주지 않으면 `공식 표면에서는 매장 재고까지만 확인된다`고 답합니다.
- 매장 픽업 재고가 `Unauthorized` 로 차단된 경우에는 `다이소몰이 현재 매장 픽업 재고 API를 차단해 정확한 매장 재고 수량은 확인할 수 없다`고 답하고, 결과의 `retrievalStatus: "blocked"` 와 온라인 재고의 `referenceOnly: true` 참고값을 구분합니다.

## 라이브 확인 메모

2026-03-27 기준으로 `selStrPkupStck` 는 실제 매장 픽업 재고를 반환했지만, 2026-05-05 기준 이 엔드포인트가 `Unauthorized` 로 차단되는 사례가 확인되었습니다.

현재 운영 원칙은 다음과 같습니다.

- `POST /api/ms/msg/selStr` → 매장 후보 확인
- `GET /ssn/search/SearchGoods?searchTerm=...` → 상품 후보 및 `onldPdNo` 확인
- `POST /api/pd/pdh/selStrPkupStck` → 성공하면 `status: "available"`, `retrievalStatus: "resolved"` 로 매장 픽업 재고 표시
- `selStrPkupStck` 가 `401`/`403` 또는 `{ "success": false, "message": "Unauthorized" }` 를 반환하면 `status: "unavailable"`, `retrievalStatus: "blocked"`, `reason: "unauthorized"` 로 표시
- `POST /api/pdo/selOnlStck` → 가능한 경우 온라인 재고 참고값 표시
