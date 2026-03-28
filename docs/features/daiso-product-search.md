# 다이소 상품 조회 가이드

## 이 기능으로 할 수 있는 일

- 다이소 매장명으로 공식 매장 후보 찾기
- 상품명/검색어로 공식 상품 후보 찾기
- 특정 매장의 **매장 픽업 재고** 확인
- 필요하면 온라인 재고 참고값 함께 확인

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
6. 필요하면 `SearchGoods` 응답의 `onldPdNo` 를 함께 보존해 `selOnlStck` 온라인 재고 교차 확인에 사용합니다.
7. 공식 표면이 매장 내 위치를 주지 않으면 재고 중심으로 답합니다.

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

## 라이브 확인 메모

2026-03-27 기준으로 다음 공식 호출이 실제 응답을 반환했습니다.

- `POST /api/ms/msg/selStr` → `강남역2호점` 매장 후보
- `GET /ssn/search/SearchGoods?searchTerm=리들샷...` → `1049275` 포함 상품 후보
- `POST /api/pd/pdh/selStrPkupStck` → `strCd=10224`, `pdNo=1049275` 조합의 매장 픽업 재고

같은 날짜 smoke test 에서 `강남역2호점 + VT 리들샷 100` 조합은 재고 수량 `0` 으로 응답했습니다. 즉, **공식 경로가 실제로 동작함은 확인했지만 당시 해당 매장 재고는 없었습니다.**
