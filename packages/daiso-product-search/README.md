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
- 현재 확인된 공식 표면은 **매장 픽업 재고**를 제공하지만, 다이소몰 보안 정책에 따라 `Unauthorized` 로 차단될 수 있습니다.
- 매장 픽업 재고가 차단되면 `pickupStock.status === "unavailable"`, `retrievalStatus === "blocked"`, `reason === "unauthorized"` 로 반환하고, 공식 픽업 가능 매장 목록(`selPkupStr`) 으로 그 매장의 **픽업 가능 여부** 만이라도 `pickupEligibility` 로 회수합니다. 수량은 여전히 알 수 없습니다.
- 매장 픽업 재고의 `status` 는 조회 결과 범주입니다. 실제 재고 여부는 `inStock` 또는 `inventoryStatus` (`"in_stock"`, `"out_of_stock"`, `"unknown"`) 를 기준으로 판단합니다.
- 가능한 경우 `onlineStock.referenceOnly === true` 인 온라인 재고 참고값을 함께 확인할 수 있지만, 매장 재고로 단정해서는 안 됩니다.
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

2026-05-05 현재 `selStrPkupStck` 가 `Unauthorized` 로 차단되는 경우가 확인되어, 이 패키지는 해당 응답을 예외로 전파하지 않고 아래 형태로 정규화합니다. 이 동작은 세션 우회 없이 공식 표면의 제한을 보수적으로 보고하기 위한 것입니다.

```json
{
  "pickupStock": {
    "strCd": "10224",
    "pdNo": "1049275",
    "quantity": null,
    "inStock": null,
    "status": "unavailable",
    "retrievalStatus": "blocked",
    "inventoryStatus": "unknown",
    "reason": "unauthorized",
    "message": "Daiso Mall blocked store pickup stock lookup with Unauthorized."
  }
}
```

2026-05-08 부터는 매장 픽업 재고가 차단되면 공식 픽업 가능 매장 목록 표면(`selPkupStr`)을 추가로 호출해 그 매장이 해당 상품의 픽업 가능 매장에 들어 있는지 여부만이라도 회수합니다. 수량은 여전히 알 수 없지만, "그 매장에서 이 상품을 픽업으로 살 수 있는지" 는 답할 수 있게 됩니다.

```json
{
  "pickupEligibility": {
    "pdNo": "1049275",
    "strCd": "10224",
    "pickupEligible": true,
    "eligibleStoreCount": 1,
    "matchedStore": {
      "strCd": "10224",
      "name": "강남역2호점",
      "pickupAvailable": true,
      "openTime": "10:00",
      "closeTime": "22:00"
    },
    "retrievalStatus": "resolved"
  }
}
```

## 공개 API

- `searchStores(query, options?)`
- `getStoreDetail(strCd, options?)`
- `searchProducts(query, options?)`
  - 반환되는 각 상품 후보는 `pdNo` 와 함께 `onldPdNo` 를 포함할 수 있습니다. 다이소몰 온라인 재고 표면이 별도 마스터 상품 번호를 요구하는 경우 이 값을 그대로 `getOnlineStock()` 에 넘기면 됩니다.
- `getStorePickupStock({ pdNo, strCd }, options?)`
  - 성공한 조회는 `status: "available"`, `retrievalStatus: "resolved"` 를 포함합니다. 여기서 `status` 는 조회 성공 범주이며 상품 재고 여부가 아닙니다.
  - 실제 재고 여부는 `inStock` 또는 `inventoryStatus` 로 확인합니다. 수량이 0이면 `status: "available"` 이면서 `inventoryStatus: "out_of_stock"` 일 수 있습니다.
  - 다이소몰이 매장 픽업 재고를 `401`/`403` 또는 `{ "success": false, "message": "Unauthorized" }` 로 차단하면 `status: "unavailable"`, `retrievalStatus: "blocked"`, `inventoryStatus: "unknown"` 결과를 반환합니다.
- `getStorePickupEligibility({ pdNo, strCd, storeName?, keyword?, pageSize? }, options?)`
  - 공식 `POST /api/ms/msg/selPkupStr` 표면을 호출해 해당 상품의 픽업 가능 매장 목록을 받아 `pickupEligible` 여부를 판정합니다.
  - `storeName` 이 주어지면 매장명에서 `N호점` 같은 접미사를 제거해 `keyword` 로 자동 변환합니다. `keyword` 를 직접 넘기면 그대로 사용합니다. `strCd` 조회에서 `storeName`/`keyword` 가 없거나 첫 페이지가 전체 결과를 다 덮지 못하면 확정 `false` 대신 `pickupEligible: null`, `retrievalStatus: "insufficient_coverage"` 를 반환합니다.
  - 응답은 `pickupEligible`(`true`/`false`/`null`), `eligibleStoreCount`, `eligibleStores`, `matchedStore`, `searchedKeyword`, `pageSize`, `totalCount`, `retrievalStatus`, `raw` 를 포함합니다.
  - 정확한 수량은 제공되지 않습니다. 수량 확인은 `selStrPkupStck` 를 통해야 하며 차단 시에는 확인 불가입니다.
- `getOnlineStock({ pdNo, onldPdNo? }, options?)`
  - 반환값은 `referenceOnly: true` 를 포함합니다. 온라인 재고는 다이소몰 온라인몰 재고 참고값이며 특정 매장의 픽업/진열 재고가 아닙니다.
- `lookupStoreProductAvailability({ storeQuery, productQuery, includePickupEligibility?, ...options })`
  - `pickupStock.retrievalStatus === "blocked"` 일 때만 `selPkupStr` 폴백을 호출해 `pickupEligibility` 를 채웁니다. `includePickupEligibility: false` 로 끌 수 있습니다.
