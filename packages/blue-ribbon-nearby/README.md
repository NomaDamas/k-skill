# blue-ribbon-nearby

Blue Ribbon Survey 공식 표면을 사용해 위치 문자열을 공식 zone 으로 매칭하고, k-skill-proxy 를 경유해 근처 블루리본 맛집을 조회하는 Node.js 패키지입니다.

> [!NOTE]
> Blue Ribbon의 `/restaurants/map` 은 프리미엄 전용입니다. 이 패키지는 기본적으로 k-skill-proxy 를 경유해 프리미엄 세션으로 nearby 검색을 수행합니다. 직접 호출 시(`useDirectApi: true`) 프리미엄 세션 없이는 `premium_required` 에러가 발생합니다.

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

nearby 검색은 기본적으로 k-skill-proxy (`/v1/blue-ribbon/nearby`) 를 경유합니다. 프록시에 `BLUE_RIBBON_SESSION_ID` 환경변수가 설정되어 있어야 합니다.

## 사용 예시

```js
const { searchNearbyByLocationQuery } = require("blue-ribbon-nearby");

async function main() {
  // 기본: k-skill-proxy 경유
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

직접 호출이 필요하면 `useDirectApi: true` 옵션을 사용하세요. 프리미엄 세션이 없으면 `premium_required` 에러가 발생합니다.

## Live smoke snapshot

2026-03-27 에 `광화문`, `distanceMeters=1000`, `limit=5` 로 실제 호출했을 때 상위 결과 예시:

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

기본적으로 k-skill-proxy 를 경유합니다. `useDirectApi: true` 로 직접 호출할 때 프리미엄 세션이 없으면 `premium_required` 에러가 발생합니다.

프록시 base URL 은 `options.proxyBaseUrl`, `KSKILL_PROXY_BASE_URL` 환경변수, 또는 기본값 `https://k-skill-proxy.nomadamas.org` 순으로 결정됩니다.
