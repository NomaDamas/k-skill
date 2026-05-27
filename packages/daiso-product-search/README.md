# daiso-product-search

다이소몰 공식 검색/매장/재고 표면을 사용해 특정 매장의 상품 재고를 조회하는 Node.js 패키지입니다.

## 설치

배포 후:

```bash
npm install daiso-product-search
```

이 저장소에서 개발할 때:

```bash
npm install
```

## 사용 원칙

- 매장명과 상품명 둘 다 필요합니다.
- 공식 다이소몰 표면을 우선 사용합니다.
- `selStrPkupStck` 는 Bearer 토큰 인증이 필요합니다. `/api/auth/request` 로 비로그인 JWT를 받아 AES-128-CBC / 키 `"PRE_AUTH_ENC_KEY"` 로 암호화한 뒤 Bearer 헤더로 전달합니다. 401/403 응답 시 토큰을 재발급해 1회 재시도합니다. 그래도 인증이 막히면 수량 조회는 `retrievalStatus: "blocked"` 로 반환하고 `selPkupStr` 픽업 가능 여부 폴백을 사용할 수 있습니다.
- 매장 픽업 재고의 `status` 는 조회 결과 범주입니다. 실제 재고 여부는 `inStock` 또는 `inventoryStatus` (`"in_stock"`, `"out_of_stock"`, `"unknown"`) 를 기준으로 판단합니다.
- 공식 표면이 매장 내 진열 위치를 주지 않으면 재고 중심으로 응답해야 합니다.

## 사용 예시

```js
const { lookupStoreProductAvailability } = require("daiso-product-search")

async function main() {
  const result = await lookupStoreProductAvailability({
    storeQuery: "강남역2호점",
    productQuery: "VT 리들샷 100",
    productLimit: 10
  })

  console.log(result.selectedStore)
  console.log(result.selectedProduct)
  console.log(result.pickupStock)
  console.log(result.pickupEligibility)
  console.log(result.onlineStock)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

## Live smoke snapshot

2026-03-27 에 `storeQuery=강남역2호점`, `productQuery=VT 리들샷 100` 으로 실제 호출했을 때 공식 표면은 아래처럼 store/product/stock 을 반환했습니다.

```json
{
  "selectedStore": {
    "strCd": "10224",
    "name": "강남역2호점"
  },
  "selectedProduct": {
    "pdNo": "1049275",
    "displayName": "VT 리들샷 100 페이셜 부스팅 퍼스트 앰플 2ml*6개입"
  },
  "pickupStock": {
    "strCd": "10224",
    "pdNo": "1049275",
    "quantity": 0,
    "inStock": false,
    "status": "available",
    "retrievalStatus": "resolved",
    "inventoryStatus": "out_of_stock"
  }
}
```


## 공개 API

- `searchStores(query, options?)`
- `getStoreDetail(strCd, options?)`
- `searchProducts(query, options?)`
  - 반환되는 각 상품 후보는 `pdNo` 와 함께 `onldPdNo` 를 포함할 수 있습니다. 다이소몰 온라인 재고 표면이 별도 마스터 상품 번호를 요구하는 경우 이 값을 그대로 `getOnlineStock()` 에 넘기면 됩니다.
- `getStorePickupStock({ pdNo, strCd }, options?)`
  - 호출 전 `/api/auth/request` 로 Bearer 토큰을 자동 빌드합니다. 401/403 응답 시 토큰을 재발급해 1회 재시도합니다.
  - 성공한 조회는 `status: "available"`, `retrievalStatus: "resolved"` 를 포함합니다. 여기서 `status` 는 조회 성공 범주이며 상품 재고 여부가 아닙니다.
  - 실제 재고 여부는 `inStock` 또는 `inventoryStatus` 로 확인합니다. 수량이 0이면 `status: "available"` 이면서 `inventoryStatus: "out_of_stock"` 일 수 있습니다.
  - 인증이 계속 막히면 예외 대신 `status: "unavailable"`, `retrievalStatus: "blocked"`, `inventoryStatus: "unknown"` 를 반환합니다.
- `getStorePickupEligibility({ pdNo, strCd, storeName?, keyword?, pageSize? }, options?)`
  - `selPkupStr` 로 특정 상품의 픽업 가능 매장 목록을 조회해 선택 매장이 픽업 가능 매장인지 확인합니다.
  - 수량은 제공하지 않으며 `pickupEligible` (`true`/`false`/`null`) 과 `retrievalStatus` (`"resolved"`, `"blocked"`, `"insufficient_coverage"`) 로 폴백 판단을 전달합니다.
- `getOnlineStock({ pdNo, onldPdNo? }, options?)`
  - 반환값은 `referenceOnly: true` 를 포함합니다. 온라인 재고는 다이소몰 온라인몰 재고 참고값이며 특정 매장의 픽업/진열 재고가 아닙니다.
- `lookupStoreProductAvailability({ storeQuery, productQuery, ...options })`
  - 매장·상품 검색 → Bearer 인증 → 픽업 재고 조회를 한 번에 처리합니다.
  - 픽업 재고 인증이 계속 막혀 `pickupStock.retrievalStatus === "blocked"` 이면 `pickupEligibility` 에 `selPkupStr` 기반 픽업 가능 여부를 채웁니다. 필요 없으면 `includePickupEligibility: false` 를 전달합니다.
