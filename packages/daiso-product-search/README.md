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
- 매장 픽업 재고가 차단되면 `pickupStock.status === "unavailable"`, `reason === "unauthorized"` 로 반환하고, 가능한 경우 `onlineStock.referenceOnly === true` 인 온라인 재고 참고값을 함께 확인합니다.
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
    "status": "available"
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
    "reason": "unauthorized",
    "message": "Daiso Mall blocked store pickup stock lookup with Unauthorized."
  }
}
```

## 공개 API

- `searchStores(query, options?)`
- `getStoreDetail(strCd, options?)`
- `searchProducts(query, options?)`
  - 반환되는 각 상품 후보는 `pdNo` 와 함께 `onldPdNo` 를 포함할 수 있습니다. 다이소몰 온라인 재고 표면이 별도 마스터 상품 번호를 요구하는 경우 이 값을 그대로 `getOnlineStock()` 에 넘기면 됩니다.
- `getStorePickupStock({ pdNo, strCd }, options?)`
  - 다이소몰이 매장 픽업 재고를 `401`/`403` 또는 `{ "success": false, "message": "Unauthorized" }` 로 차단하면 `status: "unavailable"` 결과를 반환합니다.
- `getOnlineStock({ pdNo, onldPdNo? }, options?)`
  - 반환값은 `referenceOnly: true` 를 포함합니다. 온라인 재고는 다이소몰 온라인몰 재고 참고값이며 특정 매장의 픽업/진열 재고가 아닙니다.
- `lookupStoreProductAvailability({ storeQuery, productQuery, ...options })`
