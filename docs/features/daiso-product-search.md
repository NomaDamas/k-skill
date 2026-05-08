# 다이소 상품 조회 가이드

## 이 기능으로 할 수 있는 일

- 다이소 매장명으로 공식 매장 후보 찾기
- 상품명/검색어로 공식 상품 후보 찾기
- 특정 매장의 **매장 픽업 재고 수량** 확인 (공식 `selStrPkupStck` 표면이 응답할 때 한정)
- 매장 픽업 재고가 `Unauthorized` 로 차단되면 `retrievalStatus: "blocked"` 차단 상태를 명확히 표시하고, 공식 픽업 가능 매장 목록(`selPkupStr`)으로 그 매장의 **픽업 가능 여부(yes/no)** 만이라도 `pickupEligibility` 로 확인
- 필요하면 `referenceOnly: true` 온라인 재고 참고값 함께 확인

## 이 기능으로 할 수 없는 일 (스킬 범위 한계)

- **`selStrPkupStck` 가 차단된 동안에는 정확한 매장별 재고 수량을 답할 수 없습니다.** 2026-05-05 부터 공식 매장 픽업 재고 API 가 `Unauthorized (401/403)` 로 차단되어 있고, 이 스킬은 세션 우회·CAPTCHA 우회·로그인 강제 등 anti-bot 우회를 시도하지 않습니다.
- 차단 상태에서는 `pickupEligibility.pickupEligible` 로 "그 매장이 그 상품의 픽업 가능 매장으로 등록되어 있는지(yes/no)" 까지만 답합니다. **수량(예: "3개 남음")은 답하지 않습니다.**
- 매장 내 진열 위치(aisle/매대)는 공식 표면이 제공하지 않으므로 답하지 않습니다.
- 결제·주문·픽업 예약 자동화는 범위가 아닙니다.
- 비공식 크롤링·헤드리스 브라우저 우회·계정 세션 재사용은 범위가 아닙니다.

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
- store pickup eligibility (특정 상품의 픽업 가능 매장 목록): `https://www.daisomall.co.kr/api/ms/msg/selPkupStr`
- optional online stock: `https://www.daisomall.co.kr/api/pdo/selOnlStck`

## 기본 흐름

1. 매장명이 없으면 먼저 매장명을 물어봅니다.
2. 상품명이 없으면 상품명/검색어를 한 번 더 물어봅니다.
3. `selStr` 로 매장 후보를 찾고, 필요하면 `selStrInfo` 로 매장 상세를 확인합니다.
4. `SearchGoods` 로 상품 후보를 찾습니다.
5. `selStrPkupStck` 로 해당 매장의 상품 재고를 확인합니다.
6. `selStrPkupStck` 가 `Unauthorized` 로 차단되면 매장 픽업 재고는 `unavailable/blocked/unauthorized` 로 보고하고 세션 우회를 시도하지 않습니다.
7. 6번 차단이 발생하면 공식 `selPkupStr` 표면으로 그 상품의 **픽업 가능 매장 목록**을 받아 사용자가 고른 매장이 그 안에 들어 있는지(=`pickupEligibility.pickupEligible`) 만이라도 답합니다. 수량은 여전히 알 수 없습니다.
8. 필요하면 `SearchGoods` 응답의 `onldPdNo` 를 함께 보존해 `selOnlStck` 온라인 재고 교차 확인에 사용합니다.
9. 공식 표면이 매장 내 위치를 주지 않으면 재고 중심으로 답합니다.

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
    pickupEligibility: result.pickupEligibility,
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
- 매장 픽업 재고의 `status` 는 조회 결과 범주입니다. 상품 재고 여부는 `inStock` 또는 `inventoryStatus` 로 설명하고, `status: "available"` 만으로 재고가 있다고 말하지 않습니다.
- 매장 픽업 재고가 `Unauthorized` 로 차단된 경우에는 `다이소몰이 현재 매장 픽업 재고 API를 차단해 정확한 매장 재고 수량은 확인할 수 없다`고 답하고, 결과의 `retrievalStatus: "blocked"` 와 온라인 재고의 `referenceOnly: true` 참고값을 구분합니다.
- 픽업 재고가 차단되어도 `pickupEligibility.pickupEligible === true` 면 `이 상품은 해당 매장의 픽업 가능 매장 목록에 등록되어 있어 픽업 자체는 가능합니다. 다만 정확한 수량은 확인할 수 없습니다.` 정도로 보수적으로 답합니다. `pickupEligible === false` 면 `해당 매장은 이 상품의 픽업 가능 매장에 등록되어 있지 않습니다.` 라고 답합니다. `null` 이면 차단으로 확인 불가로 답합니다.

## 라이브 확인 메모

2026-03-27 기준으로 `selStrPkupStck` 는 실제 매장 픽업 재고를 반환했지만, 2026-05-05 기준 이 엔드포인트가 `Unauthorized` 로 차단되는 사례가 확인되었습니다.

현재 운영 원칙은 다음과 같습니다.

- `POST /api/ms/msg/selStr` → 매장 후보 확인
- `GET /ssn/search/SearchGoods?searchTerm=...` → 상품 후보 및 `onldPdNo` 확인
- `POST /api/pd/pdh/selStrPkupStck` → 성공하면 `status: "available"`, `retrievalStatus: "resolved"` 로 조회 성공을 표시하고, 실제 재고 여부는 `inStock` / `inventoryStatus` 로 표시
- `selStrPkupStck` 가 `401`/`403` 또는 `{ "success": false, "message": "Unauthorized" }` 를 반환하면 `status: "unavailable"`, `retrievalStatus: "blocked"`, `inventoryStatus: "unknown"`, `reason: "unauthorized"` 로 표시
- `POST /api/ms/msg/selPkupStr` → 픽업 재고가 차단되면 호출. 매장 픽업 가능 매장 목록을 받아 `pickupEligibility.pickupEligible`(true/false/null), `eligibleStoreCount`, `eligibleStores`, `matchedStore` 로 응답 (수량 미제공)
- `POST /api/pdo/selOnlStck` → 가능한 경우 온라인 재고 참고값 표시
