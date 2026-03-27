# blue-ribbon-nearby

Blue Ribbon Survey 공식 표면을 사용해 근처 블루리본 맛집을 찾는 Node.js 패키지입니다.

## 설치

배포 후:

```bash
npm install blue-ribbon-nearby
```

이 저장소에서 개발할 때:

```bash
npm install
```

## 사용 원칙

- 유저 위치는 자동으로 추적하지 않습니다.
- 먼저 현재 위치를 묻고, 받은 동네/역명/랜드마크/위도·경도를 사용하세요.
- 대표 랜드마크는 가장 가까운 공식 Blue Ribbon zone alias 로 확장합니다. 예: `코엑스` → `삼성동/대치동`
- 블루리본 인증 맛집만 남기도록 `ribbonType=RIBBON_THREE,RIBBON_TWO,RIBBON_ONE` 필터를 기본 적용합니다.

## 공식 Blue Ribbon 표면

- 지역/상권 목록: `https://www.bluer.co.kr/search/zone`
- 주변 맛집 JSON: `https://www.bluer.co.kr/restaurants/map`
- 검색 페이지: `https://www.bluer.co.kr/search`

패키지는 먼저 `search/zone` 에서 가장 가까운 공식 zone 을 찾고, 그다음 `/restaurants/map` nearby 검색으로 블루리본 인증 맛집만 추립니다. 이때 `zone1`, `zone2`, `zone2Lat`, `zone2Lng`, `isAround=true`, `ribbon=true` 를 사용해 주변 결과만 다시 조회합니다.

## 사용 예시

```js
const { searchNearbyByLocationQuery } = require("blue-ribbon-nearby");

async function main() {
  const result = await searchNearbyByLocationQuery("광화문", {
    distanceMeters: 1000,
    limit: 5
  });

  console.log(result.anchor);
  console.log(result.items);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Live smoke snapshot

2026-03-27 에 `광화문`, `distanceMeters=1000`, `limit=5` 로 실제 호출했을 때 상위 결과 예시는 아래와 같았습니다.

```json
{
  "anchor": {
    "zone1": "서울 강북",
    "zone2": "광화문/종로2가"
  },
  "items": [
    { "name": "미치루스시", "ribbonType": "RIBBON_ONE", "ribbonCount": 1, "distanceMeters": 61 },
    { "name": "한성옥", "ribbonType": "RIBBON_ONE", "ribbonCount": 1, "distanceMeters": 170 },
    { "name": "청진옥", "ribbonType": "RIBBON_TWO", "ribbonCount": 2, "distanceMeters": 242 }
  ]
}
```

## 공개 API

- `fetchZoneCatalog()`
- `parseZoneCatalogHtml(html)`
- `findZoneMatches(locationQuery, zones, options?)`
- `buildNearbySearchParams(options)`
- `searchNearbyByLocationQuery(locationQuery, options?)`
- `searchNearbyByCoordinates(options)`
