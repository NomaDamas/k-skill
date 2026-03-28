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
- 현재 확인된 공식 표면은 **매장 픽업 재고**를 제공합니다.
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
    "inStock": false
  }
}
```

## 공개 API

- `searchStores(query, options?)`
- `getStoreDetail(strCd, options?)`
- `searchProducts(query, options?)`
  - 반환되는 각 상품 후보는 `pdNo` 와 함께 `onldPdNo` 를 포함할 수 있습니다. 다이소몰 온라인 재고 표면이 별도 마스터 상품 번호를 요구하는 경우 이 값을 그대로 `getOnlineStock()` 에 넘기면 됩니다.
- `getStorePickupStock({ pdNo, strCd }, options?)`
- `getOnlineStock({ pdNo, onldPdNo? }, options?)`
- `lookupStoreProductAvailability({ storeQuery, productQuery, ...options })`
