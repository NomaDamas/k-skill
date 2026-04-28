# public-restroom-nearby

공식 `공중화장실정보` 표준데이터를 기본으로 사용하고, Kakao REST API 키가 있으면 Kakao 키워드/주유소 검색까지 병합해 근처 공중화장실/개방화장실을 찾는 Node.js 패키지입니다.

## 설치

배포 후:

```bash
npm install public-restroom-nearby
```

이 저장소에서 개발할 때:

```bash
npm install
```

## 사용 원칙

- 유저 위치는 자동으로 추적하지 않습니다.
- 먼저 현재 위치를 묻고, 받은 동네/역명/랜드마크/위도·경도를 사용하세요.
- 화장실 데이터는 공식 `공중화장실정보` CSV를 직접 사용합니다.
- `kakaoRestApiKey` 옵션 또는 `KAKAO_REST_API_KEY` 환경변수가 있으면 3계층(`CSV` + Kakao `공중화장실`/`개방화장실` 키워드 + Kakao `OL7` 주유소 카테고리)을 병합합니다.
- Kakao 응답의 `distance` 필드는 신뢰하지 않고 모든 결과를 WGS84 좌표 기준 haversine 거리로 다시 계산해 정렬합니다.
- 위치 문자열은 Kakao Map anchor 검색으로 좌표를 구하고, 가능하면 해당 시도 CSV로 좁혀서 조회합니다.

## 공식 표면

- 공공데이터포털 표준데이터 안내: `https://www.data.go.kr/data/15012892/standard.do`
- 파일 소개 페이지: `https://file.localdata.go.kr/file/public_restroom_info/info`
- 전국 CSV: `https://file.localdata.go.kr/file/download/public_restroom_info/info`
- 지역별 CSV: `https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=<시도코드>`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`
- Kakao Local 키워드 검색: `https://dapi.kakao.com/v2/local/search/keyword.json` (`공중화장실`, `개방화장실`)
- Kakao Local 카테고리 검색: `https://dapi.kakao.com/v2/local/search/category.json` (`category_group_code=OL7`)
- Kakao 좌표→주소 보정: `https://dapi.kakao.com/v2/local/geo/coord2address.json`

## 사용 예시

```js
const { searchNearbyPublicRestroomsByLocationQuery } = require("public-restroom-nearby");

async function main() {
  const result = await searchNearbyPublicRestroomsByLocationQuery("광화문", {
    limit: 3
  });

  for (const item of result.items) {
    console.log(`${item.name}: ${Math.round(item.distanceMeters)}m, ${item.address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

좌표를 직접 받은 경우:

```js
const { searchNearbyPublicRestroomsByCoordinates } = require("public-restroom-nearby");

async function main() {
  const result = await searchNearbyPublicRestroomsByCoordinates({
    latitude: 37.57103,
    longitude: 126.97679,
    limit: 3,
    kakaoRestApiKey: process.env.KAKAO_REST_API_KEY
  });

  console.log(result.items);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```


Kakao 키가 설정된 경우 기본 Kakao 검색 반경은 1,000m이며 `radiusMeters` 로 조정할 수 있습니다. `maxDistanceMeters` 는 병합 후 전체 결과 필터링에 사용됩니다. CSV 좌표의 실제 건물명/주소를 Kakao `coord2address` 로 보정하려면 `correctCsvWithKakao: true` 를 넘기세요.

병합 중복 제거는 좌표 50m 이내를 같은 시설로 보고 CSV(Layer 1)를 우선 보존합니다. 지도 링크는 장소명을 URL 인코딩해 공백/괄호/한국어 이름이 좌표 파싱을 깨지 않도록 생성합니다.

거리 제한이 필요하면 `maxDistanceMeters` 를 함께 넘겨서 반경 바깥 결과를 잘라낼 수 있습니다.

```js
const { searchNearbyPublicRestroomsByLocationQuery } = require("public-restroom-nearby");

async function main() {
  const result = await searchNearbyPublicRestroomsByLocationQuery("광화문", {
    limit: 3,
    maxDistanceMeters: 100
  });

  console.log(`100m 이내 결과 수: ${result.meta.total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Live smoke snapshot

2026-04-16 에 `광화문`, `limit=3` 로 실제 호출했을 때 상위 결과 예시:

```json
{
  "anchor": {
    "name": "광화문",
    "address": "서울 종로구 사직로 161 (세종로)"
  },
  "meta": {
    "region": {
      "name": "서울특별시"
    }
  },
  "items": [
    {
      "name": "세종로공영주차장",
      "type": "개방화장실"
    },
    {
      "name": "종로구청화장실",
      "type": "개방화장실"
    },
    {
      "name": "세종문화회관 화장실",
      "type": "개방화장실"
    }
  ]
}
```

같은 날짜에 `광화문`, `limit=3`, `maxDistanceMeters=100` 로 확인했을 때는 `meta.total = 0` 으로 100m 이내 결과만 남도록 동작했습니다.

## 공개 API

- `parseCoordinateQuery(locationQuery)`
- `inferRegion(address)`
- `buildDatasetDownloadUrl(options?)`
- `normalizePublicRestroomRows(csvText, origin, options?)`
- `searchNearbyPublicRestroomsByCoordinates(options)`
- `searchNearbyPublicRestroomsByLocationQuery(locationQuery, options?)`
