---
name: blue-ribbon-nearby
description: Use when the user asks for nearby restaurants or 근처 맛집. Always ask the user's current location first, then search official 블루리본 Blue Ribbon Survey ribbon restaurants near that location.
license: MIT
metadata:
  category: food
  locale: ko-KR
  phase: v1
---

# Blue Ribbon Nearby

## What this skill does

유저가 알려준 현재 위치를 기준으로 블루리본 서베이 공식 검색 표면에서 **근처 블루리본 맛집**만 추려서 보여준다.

- 위치는 자동으로 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- 위치 문자열은 공식 `zone` 목록으로 매칭하고, 가능하면 주변 JSON endpoint 로 좁혀서 찾는다.
- 좌표를 직접 받으면 더 정확한 nearby 검색을 할 수 있다.

## When to use

- "근처 맛집 찾아줘"
- "여기 근처 블루리본 맛집 뭐 있어?"
- "광화문 근처 괜찮은 식당 추천해줘"
- "내 주변 블루리본 식당만 보여줘"

## Routing rule

- 사용자가 **맛집** / **근처 식당** / **근처 레스토랑** 을 물으면 기본적으로 이 스킬부터 고려한다.
- 다만 사용자가 블루리본 외 다른 기준(예: 망고플레이트, 네이버 지도 리뷰, 특정 음식점 예약) 을 명시하면 그 표면을 우선한다.

## Prerequisites

- 인터넷 연결
- `node` 18+
- 이 저장소의 `blue-ribbon-nearby` package 또는 동일 로직

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 블루리본 맛집을 찾아볼게요.`
- 위치가 애매하면: `가까운 역명이나 동 이름으로 한 번만 더 알려주세요.`
- 좌표를 받으면 그대로 nearby 검색에 사용한다.

## Accepted location inputs

- 동네/상권: `성수동`, `광화문`, `판교`
- 역명/랜드마크: `강남역`, `서울역`, `코엑스`
- 위도/경도: `37.573713, 126.978338`

랜드마크는 내부 alias 로 가장 가까운 공식 Blue Ribbon zone 이름에 매칭한다. 예: `코엑스` → `삼성동/대치동`

## Official Blue Ribbon surfaces

- zone catalog: `https://www.bluer.co.kr/search/zone`
- nearby search JSON: `https://www.bluer.co.kr/restaurants/map`
- search page: `https://www.bluer.co.kr/search`

핵심 nearby 파라미터:

- `zone1`
- `zone2`
- `zone2Lat`
- `zone2Lng`
- `isAround=true`
- `ribbon=true`
- `ribbonType=RIBBON_THREE,RIBBON_TWO,RIBBON_ONE`
- `distance=500|1000|2000|5000`

좌표 직접 검색 시에는 `latitude1`, `latitude2`, `longitude1`, `longitude2` bounding box 를 사용한다.

## Workflow

### 1. Ask the current location first

위치를 안 물은 상태에서 검색을 시작하지 않는다.

### 2. Resolve the location

- 동네/역명/랜드마크를 받으면 공식 `https://www.bluer.co.kr/search/zone` 목록과 먼저 매칭한다.
- 코엑스처럼 공식 zone 이름이 아닌 대표 랜드마크는 가장 가까운 공식 zone alias 로 먼저 확장한다.
- 위도/경도를 받으면 좌표 기반 nearby 검색으로 바로 들어간다.
- 가장 유력한 zone 후보가 여러 개면 2~3개만 보여주고 다시 확인받는다.

### 3. Query the nearby Blue Ribbon endpoint

공식 JSON endpoint 에 nearby 조건을 붙여 호출한다.

```js
const { searchNearbyByLocationQuery } = require("blue-ribbon-nearby");

const result = await searchNearbyByLocationQuery("광화문", {
  distanceMeters: 1000,
  limit: 5
});

console.log(result.anchor);
console.log(result.items);
```

내부적으로는 `ribbon=true`, `ribbonType=RIBBON_THREE,RIBBON_TWO,RIBBON_ONE`, `isAround=true`, `sort=distance`, `zone2Lat`, `zone2Lng` 같은 파라미터를 사용한다.

### 4. Respond with a short restaurant summary

보통 3~5개만 짧게 정리한다.

- 식당명
- 리본 개수
- 대표 음식 카테고리
- 주소
- 거리

## Done when

- 유저의 현재 위치를 먼저 확인했다.
- 공식 Blue Ribbon nearby 결과를 최소 1개 이상 찾았거나, 찾지 못한 이유와 다음 질문을 제시했다.
- 결과를 거리순으로 짧게 정리했다.

## Failure modes

- 위치 문자열이 공식 zone 과 잘 매칭되지 않을 수 있다.
- 같은 키워드가 여러 상권에 걸치면 추가 확인이 필요하다.
- Blue Ribbon 사이트가 구조/파라미터를 바꾸면 zone 파싱 또는 nearby endpoint 가 깨질 수 있다.

## Notes

- 이 스킬은 조회형 스킬이다.
- 유저 위치는 자동 추적하지 않고, 대화 중 받은 값만 사용한다.
- 맛집 문의는 기본적으로 이 스킬을 먼저 쓰되, 블루리본 외 다른 기준이 명시되면 그 기준을 우선한다.
