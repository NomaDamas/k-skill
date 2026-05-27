# 다이소 상품 조회 가이드

## 이 기능으로 할 수 있는 일

- 다이소 매장명으로 공식 매장 후보 찾기
- 상품명/검색어로 공식 상품 후보 찾기
- 특정 매장의 **매장 픽업 재고 수량** 확인 (Bearer 토큰 인증 기반 공식 `selStrPkupStck` 표면)
- 필요하면 `referenceOnly: true` 온라인 재고 참고값 함께 확인

## 이 기능으로 할 수 없는 일 (스킬 범위 한계)

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
- auth (비로그인 JWT 발급): `https://www.daisomall.co.kr/api/auth/request`
- store pickup stock: `https://www.daisomall.co.kr/api/pd/pdh/selStrPkupStck` (Bearer 인증 필요)
- pickup eligibility fallback: `https://www.daisomall.co.kr/api/ms/msg/selPkupStr`
- optional online stock: `https://www.daisomall.co.kr/api/pdo/selOnlStck`

## 기본 흐름

1. 매장명이 없으면 먼저 매장명을 물어봅니다.
2. 상품명이 없으면 상품명/검색어를 한 번 더 물어봅니다.
3. `selStr` 로 매장 후보를 찾고, 필요하면 `selStrInfo` 로 매장 상세를 확인합니다.
4. `SearchGoods` 로 상품 후보를 찾습니다.
5. `GET /api/auth/request` 로 비로그인 JWT를 받아 AES-128-CBC / 키 `"PRE_AUTH_ENC_KEY"` 로 암호화한 뒤 Bearer 헤더를 빌드합니다.
6. `selStrPkupStck` 에 Bearer 헤더를 실어 해당 매장의 상품 재고를 확인합니다.
7. 403 응답이 오면 `/api/auth/request` 를 재호출해 Bearer를 새로 빌드한 뒤 한 번 재시도합니다.
8. Bearer 재시도 후에도 401/403이면 `pickupStock.retrievalStatus: "blocked"` 를 반환하고, 선택적으로 `selPkupStr` 기반 `pickupEligibility` 로 픽업 가능 여부를 보조 확인합니다.
9. 필요하면 `SearchGoods` 응답의 `onldPdNo` 를 함께 보존해 `selOnlStck` 온라인 재고 교차 확인에 사용합니다.
10. 공식 표면이 매장 내 위치를 주지 않으면 재고 중심으로 답합니다.

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
- 매장 픽업 재고의 `status` 는 조회 결과 범주입니다. 상품 재고 여부는 `inStock` 또는 `inventoryStatus` 로 설명하고, `status: "available"` 만으로 재고가 있다고 말하지 않습니다.
- 인증 키(`PRE_AUTH_ENC_KEY`)는 JS 번들에 하드코딩되어 있으며 변경될 수 있습니다. 403이 지속되면 키가 교체된 것일 수 있습니다.

## 라이브 확인 메모

2026-03-27 기준으로 `selStrPkupStck` 는 실제 매장 픽업 재고를 반환했습니다.
2026-05-15 기준 Bearer 토큰 인증(`/api/auth/request` + AES-128-CBC)으로 정상 접근 가능합니다.

현재 운영 원칙은 다음과 같습니다.

- `POST /api/ms/msg/selStr` → 매장 후보 확인
- `GET /ssn/search/SearchGoods?searchTerm=...` → 상품 후보 및 `onldPdNo` 확인
- `GET /api/auth/request` → 비로그인 JWT 발급, 헤더 `x-dm-uid` 보존 (유효 30초)
- JWT를 AES-128-CBC / 키 `"PRE_AUTH_ENC_KEY"` 로 암호화 → `bearer = base64(IV) + base64(암호문)` 조합
- `POST /api/pd/pdh/selStrPkupStck` + `Authorization: Bearer <bearer>`, `X-DM-UID: <uid>` → 성공 시 `status: "available"`, `retrievalStatus: "resolved"`. 실제 재고 여부는 `inStock` / `inventoryStatus` 로 표시
- 403 → `/api/auth/request` 재호출 후 Bearer 재빌드 후 1회 재시도
- `POST /api/pdo/selOnlStck` → 가능한 경우 온라인 재고 참고값 표시
