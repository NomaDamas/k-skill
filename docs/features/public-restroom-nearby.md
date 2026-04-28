# 근처 공중화장실 찾기 가이드

## 이 기능으로 할 수 있는 일

- 현재 위치 기준 근처 공중화장실 / 개방화장실 검색
- 동네/역명/랜드마크를 Kakao Map anchor 로 변환한 뒤 nearby 계산
- 공식 `공중화장실정보` 표준데이터 기반 거리순 요약
- Kakao REST API 키가 있으면 `공중화장실`/`개방화장실` 키워드와 `OL7` 주유소 레이어를 추가 병합
- 개방시간, 주소, 지도 링크까지 함께 정리

## 가장 먼저 할 일

이 기능은 **반드시 현재 위치를 먼저 물어본 뒤** 실행합니다.

권장 질문 예시:

```text
현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 공중화장실을 찾아볼게요.
```

## 입력값

- 동네/상권: `광화문`, `성수동`, `해운대`
- 역명/랜드마크: `서울역`, `강남역`, `코엑스`
- 좌표: `37.57103, 126.97679`

위치 문자열은 Kakao Map anchor 검색으로 **WGS84 좌표**를 잡고, anchor 주소에서 추론한 시도 코드가 있으면 해당 지역 CSV만 내려받습니다.

## 공식 표면

- 공공데이터포털 공중화장실 표준데이터 안내: `https://www.data.go.kr/data/15012892/standard.do`
- 파일 소개 페이지: `https://file.localdata.go.kr/file/public_restroom_info/info`
- 전국 CSV: `https://file.localdata.go.kr/file/download/public_restroom_info/info`
- 지역별 CSV: `https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=<시도코드>`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`
- Kakao Local 키워드 검색: `https://dapi.kakao.com/v2/local/search/keyword.json` (`공중화장실`, `개방화장실`)
- Kakao Local 카테고리 검색: `https://dapi.kakao.com/v2/local/search/category.json` (`category_group_code=OL7`)
- Kakao 좌표→주소 보정: `https://dapi.kakao.com/v2/local/geo/coord2address.json`

공식 CSV에는 화장실명, 주소, 위·경도, 남녀/장애인 화장실 수, 개방시간, 기저귀교환대, 비상벨 등이 담겨 있습니다.

## 기본 흐름

1. 유저에게 현재 위치를 먼저 묻습니다.
2. 위치 문자열을 받으면 Kakao Map으로 anchor 후보를 고르고 좌표를 확보합니다.
3. anchor 주소에서 서울/경기/부산 같은 시도 정보를 추론합니다.
4. 공식 `공중화장실정보` CSV를 내려받고, Kakao REST API 키가 있으면 `공중화장실`, `개방화장실`, `OL7` 주유소 결과를 추가 조회합니다.
5. Kakao 응답의 `distance` 값은 사용하지 않고 모든 결과를 WGS84 위·경도 haversine 거리로 다시 계산합니다.
6. CSV를 우선 보존하면서 50m 이내 중복 시설을 제거한 뒤, 가장 가까운 3~5개만 짧게 응답합니다.

## Node.js 예시

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

Kakao REST API 키가 있으면 기본 반경 1,000m에서 Kakao 레이어를 병합합니다. `radiusMeters` 로 Kakao 조회 반경을 조정할 수 있고, `maxDistanceMeters` 는 CSV와 Kakao 병합 후 전체 결과에 적용됩니다. Kakao 키가 없으면 기존처럼 CSV 단일 소스로 동작합니다.

반경 제한이 필요하면 `maxDistanceMeters` 옵션으로 100m 같은 거리 캡을 줄 수 있습니다.

```js
const { searchNearbyPublicRestroomsByLocationQuery } = require("public-restroom-nearby");

async function main() {
  const result = await searchNearbyPublicRestroomsByLocationQuery("광화문", {
    limit: 3,
    maxDistanceMeters: 100,
    kakaoRestApiKey: process.env.KAKAO_REST_API_KEY
  });

  console.log(`100m 이내 결과 수: ${result.meta.total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

CSV 좌표의 표시명/주소가 실제 건물과 어긋나는 경우에는 Kakao `coord2address` 보정을 명시적으로 켤 수 있습니다. 기본값은 꺼짐입니다.

```js
const result = await searchNearbyPublicRestroomsByLocationQuery("양재천", {
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
  correctCsvWithKakao: true
});
```

## Offline smoke example

fixture 기반 검증:

```bash
node --test packages/public-restroom-nearby/test/index.test.js
```

## 검증된 live smoke 예시

아래 값은 **2026-04-16** 에 `광화문`, `limit=3` 로 실제 호출해 확인한 결과 일부입니다.

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
      "type": "개방화장실",
      "openTimeDetail": "00~24"
    },
    {
      "name": "종로구청화장실",
      "type": "개방화장실",
      "openTimeDetail": "평일9시간(09:00~18:00)"
    },
    {
      "name": "세종문화회관 화장실",
      "type": "개방화장실",
      "openTimeDetail": "08~22"
    }
  ]
}
```

같은 날짜에 `광화문`, `limit=3`, `maxDistanceMeters=100` 으로 확인했을 때는 `meta.total = 0` 이었습니다.

## 운영 팁

- 좌표를 직접 받으면 anchor 검색을 생략해 더 빠르게 nearby 계산을 할 수 있습니다.
- 화장실이 너무 많이 잡히는 지역이면 `maxDistanceMeters` 로 100m, 300m 같은 거리 캡을 먼저 걸어두세요.
- CSV와 Kakao 검색 모두 **실시간 잠금/점검 상태는 보장하지 않습니다**. CSV 개방시간과 현장 안내를 보수적으로 안내하세요.
- 넓은 질의(예: `강남`)는 기준점이 흔들릴 수 있으니 필요하면 역명/동 이름으로 한 번 더 좁히세요.
- 지도 링크가 필요하면 `item.mapUrl` 을 함께 전달하면 됩니다.

## 주의할 점

- 데이터는 공식 공개 CSV와 Kakao POI 검색을 병합하지만 실시간 availability API는 아닙니다.
- CSV 인코딩은 CP949 계열일 수 있어 직접 구현할 때 디코딩 처리가 필요합니다.
- Kakao Map anchor 검색은 기준점만 잡는 용도입니다. Kakao REST 결과를 병합하더라도 CSV가 1순위 데이터이며, 50m 이내 중복은 CSV 항목을 보존합니다.
- Kakao `distance` 필드는 사용하지 않습니다. 정렬과 필터링은 모두 로컬 haversine 계산값 기준입니다.
