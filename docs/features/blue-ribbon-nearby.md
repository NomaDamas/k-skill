# 근처 블루리본 맛집 가이드

## 이 기능으로 할 수 있는 일

- 유저가 알려준 현재 위치를 공식 Blue Ribbon zone 으로 매칭
- 공식 Blue Ribbon zone 목록으로 동네/역명 매칭
- 좌표 기반 nearby 요청 파라미터 구성
- live nearby premium gate 감지 및 설명

> [!WARNING]
> **2026-04-05 기준** `https://www.bluer.co.kr/restaurants/map` 이 공개 요청에 `403 {"error":"PREMIUM_REQUIRED"}` 를 반환합니다. 따라서 현재 이 기능은 zone 매칭까지는 가능하지만, live nearby 결과는 `premium_required` 에러로 종료될 수 있습니다.

## 먼저 필요한 것

- 인터넷 연결
- `node` 18+
- `blue-ribbon-nearby` package 또는 이 저장소 전체 설치

## 가장 먼저 할 일

이 기능은 **반드시 현재 위치를 먼저 물어본 뒤** 실행합니다.

권장 질문 예시:

```text
현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 블루리본 맛집을 찾아볼게요.
```

## 입력값

- 동네/상권: `광화문`, `성수동`, `판교`
- 역명/랜드마크: `강남역`, `서울역`, `코엑스`
- 좌표: `37.573713, 126.978338`

랜드마크는 내부 alias 로 가장 가까운 공식 Blue Ribbon zone 이름에 매칭합니다. 예: `코엑스` → `삼성동/대치동`

맛집 문의는 기본적으로 `blue-ribbon-nearby` 스킬부터 검토합니다.

## 공식 Blue Ribbon 표면

- 지역/상권 목록: `https://www.bluer.co.kr/search/zone`
- 주변 맛집 JSON: `https://www.bluer.co.kr/restaurants/map`
- 검색 페이지: `https://www.bluer.co.kr/search`

주변 검색의 핵심 파라미터:

- `zone1`
- `zone2`
- `zone2Lat`
- `zone2Lng`
- `isAround=true`
- `ribbon=true`
- `ribbonType=RIBBON_THREE,RIBBON_TWO,RIBBON_ONE`
- `distance=500|1000|2000|5000`

좌표만 있을 때는 `latitude1`, `latitude2`, `longitude1`, `longitude2` bounding box 로 nearby 범위를 만든다.

## 기본 흐름

1. 유저에게 반드시 현재 위치를 묻습니다.
2. 동네/역명/랜드마크를 받으면 공식 `search/zone` 목록에서 가장 가까운 zone 후보를 찾습니다.
   - 공식 zone 이름이 아닌 대표 랜드마크는 먼저 nearest zone alias 로 확장합니다. 예: `코엑스` → `삼성동/대치동`
3. 좌표를 받으면 nearby bounding box 를 계산합니다.
4. 공식 `/restaurants/map` endpoint 를 `isAround=true`, `ribbon=true`, `ribbonType=RIBBON_THREE,RIBBON_TWO,RIBBON_ONE`, `sort=distance` 로 조회합니다.
5. 현재 upstream 이 `403 {"error":"PREMIUM_REQUIRED"}` 를 반환하면 `premium_required` 도메인 에러로 승격해 원인을 설명합니다.
6. live nearby 결과가 실제로 열려 있을 때만 거리순 상위 결과를 3~5개 정리합니다.

## Node.js 예시

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
      console.error("Blue Ribbon live nearby results are currently premium-only.");
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

## 현재 live 상태

**2026-04-05** 현재 `광화문`, `distanceMeters=1000`, `limit=5` 로 실제 호출하면 아래와 같은 에러가 납니다.

```json
{
  "code": "premium_required",
  "statusCode": 403,
  "upstreamError": "PREMIUM_REQUIRED"
}
```

같은 날짜에 광화문 좌표로 `searchNearbyByCoordinates()` 를 호출해도 동일한 `premium_required` 에러 계약이 확인됩니다.

이 remap 은 `403 {"error":"PREMIUM_REQUIRED"}` 인 nearby 응답에만 적용되며, 다른 upstream 실패는 기존 generic request error 형태를 유지합니다.

## 과거 live smoke 예시

아래 값은 **2026-03-27** 에는 실제 호출로 확인됐던 결과 일부입니다. 현재는 upstream 정책 변경으로 재현되지 않습니다.

```json
{
  "anchor": {
    "zone1": "서울 강북",
    "zone2": "광화문/종로2가"
  },
  "items": [
    {
      "name": "미치루스시",
      "ribbonType": "RIBBON_ONE",
      "ribbonCount": 1,
      "distanceMeters": 61
    },
    {
      "name": "한성옥",
      "ribbonType": "RIBBON_ONE",
      "ribbonCount": 1,
      "distanceMeters": 170
    },
    {
      "name": "청진옥",
      "ribbonType": "RIBBON_TWO",
      "ribbonCount": 2,
      "distanceMeters": 242
    }
  ]
}
```

## 운영 팁

- 위치 문자열이 애매하면 동네보다 **가까운 역명** 또는 **위도/경도** 를 한 번 더 받는 편이 정확합니다.
- zone 후보가 여러 개면 바로 검색하지 말고 2~3개만 다시 확인합니다.
- 결과를 길게 나열하기보다 거리순 상위 3~5개만 먼저 보여주는 편이 좋습니다.

## 주의할 점

- Blue Ribbon 사이트는 현재 browser-like 요청 헤더가 있어도 `/restaurants/map` 에 대해 `403 {"error":"PREMIUM_REQUIRED"}` 를 반환할 수 있습니다.
- 검색 페이지의 zone 목록이 바뀌면 매칭 결과도 바뀔 수 있습니다.
- 좌표 없이 너무 넓은 지역명만 받으면 상권 후보가 많아질 수 있습니다.
