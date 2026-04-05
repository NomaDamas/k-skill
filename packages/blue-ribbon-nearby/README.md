# blue-ribbon-nearby

Blue Ribbon Survey 공식 표면을 사용해 위치 문자열을 공식 zone 으로 매칭하고, 가능할 때 근처 블루리본 맛집을 조회하는 Node.js 패키지입니다.

> [!WARNING]
> **2026-04-05 기준** Blue Ribbon의 `/restaurants/map` endpoint 가 공개 요청에 `403 {"error":"PREMIUM_REQUIRED"}` 를 반환합니다. 이 패키지는 zone 매칭까지는 계속 지원하지만, live nearby 결과는 현재 `premium_required` 도메인 에러로 명시적으로 실패합니다.

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

다만 현재 `/restaurants/map` 는 공개 호출에서 premium gate 가 걸려 있으므로, live nearby 조회는 아래처럼 `premium_required` 에러를 던질 수 있습니다.

## 사용 예시

```js
const { searchNearbyByLocationQuery } = require("blue-ribbon-nearby");

async function main() {
  try {
    const result = await searchNearbyByLocationQuery("광화문", {
      distanceMeters: 1000,
      limit: 5
    });

    console.log(result.anchor);
    console.log(result.items);
  } catch (error) {
    if (error.code === "premium_required") {
      console.error("Blue Ribbon nearby live results are currently premium-gated.");
      console.error(error.message);
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Current live status

**2026-04-05** 에 `광화문`, `distanceMeters=1000`, `limit=5` 로 실제 호출하면 현재는 아래와 같은 도메인 에러가 반환됩니다.

```json
{
  "code": "premium_required",
  "statusCode": 403,
  "upstreamError": "PREMIUM_REQUIRED"
}
```

## Historical snapshot

2026-03-27 에는 아래처럼 live nearby 결과가 내려왔습니다. 현재는 upstream 정책 변경으로 이 스냅샷을 재현할 수 없습니다.

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

`searchNearbyByLocationQuery()` / `searchNearbyByCoordinates()` 는 `/restaurants/map` 가 `403 {"error":"PREMIUM_REQUIRED"}` 를 반환하면 아래 속성을 가진 에러를 던집니다.

- `error.code === "premium_required"`
- `error.statusCode === 403`
- `error.upstreamError === "PREMIUM_REQUIRED"`
