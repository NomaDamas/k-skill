---
name: blue-ribbon-nearby
description: Use when the user asks for nearby restaurants or 근처 맛집 and wants 블루리본 picks. Always ask the user's current location first, then search official Blue Ribbon nearby restaurants via k-skill-proxy.
license: MIT
metadata:
  category: food
  locale: ko-KR
  phase: v1
---

# Blue Ribbon Nearby

## What this skill does

유저가 알려준 현재 위치를 기준으로 블루리본 서베이 공식 zone 을 찾고, k-skill-proxy 를 경유해 **근처 블루리본 맛집**을 보여준다.

- 위치는 자동으로 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- 위치 문자열은 공식 `zone` 목록으로 매칭하고, 주변 JSON endpoint 로 좁혀서 찾는다.
- 좌표를 직접 받으면 더 정확한 nearby 검색을 할 수 있다.
- nearby 검색은 기본적으로 k-skill-proxy (`/v1/blue-ribbon/nearby`) 를 경유한다. 프록시에 `BLUE_RIBBON_SESSION_ID` 가 설정되어 있어야 한다.

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

기본적으로 k-skill-proxy 를 경유해 nearby 결과를 가져온다.

```js
const { searchNearbyByLocationQuery } = require("blue-ribbon-nearby");

const result = await searchNearbyByLocationQuery("광화문", {
  distanceMeters: 1000,
  limit: 5
});

console.log(result.anchor);
console.log(result.items);
```

내부적으로는 zone 매칭 후 프록시의 `/v1/blue-ribbon/nearby` 에 좌표와 거리를 넘긴다. 프록시가 프리미엄 세션으로 Blue Ribbon upstream 을 호출한다.

직접 호출이 필요하면 `useDirectApi: true` 옵션을 쓸 수 있지만, 프리미엄 세션 없이는 `premium_required` 에러가 난다.

### 4. Respond with a short restaurant summary

보통 3~5개만 짧게 정리한다.

- 식당명
- 리본 개수
- 대표 음식 카테고리
- 주소
- 거리

## Done when

- 유저의 현재 위치를 먼저 확인했다.
- 공식 Blue Ribbon nearby 결과를 최소 1개 이상 찾았거나, 프록시 미설정 등의 이유로 결과를 가져올 수 없다는 이유와 다음 질문을 제시했다.
- 결과를 거리순으로 짧게 정리했다.

## 브라우저 fallback (봇 차단 우회)

bluer.co.kr이 자동화 접근을 차단(403)할 경우, `rebrowser-playwright`가 설치되어 있으면 실제 Chrome 브라우저를 통해 자동으로 fallback한다.

### 조건

- `rebrowser-playwright`가 설치되어 있어야 한다: `npm install rebrowser-playwright`
- Google Chrome이 시스템에 설치되어 있어야 한다
- headed 모드로 동작한다 (디스플레이 환경 필요)

### 동작 방식

1. 기존 fetch 요청이 403을 반환하면 자동으로 브라우저 fallback 활성화
2. stealth 패치 적용 (webdriver 제거, plugins/languages 스푸핑 등)
3. 실제 Chrome으로 zone 카탈로그 또는 nearby API를 호출
4. 결과를 기존 파이프라인에 그대로 전달

별도 설정 없이 `rebrowser-playwright`만 설치하면 자동으로 작동한다. 설치되어 있지 않으면 기존처럼 403 에러를 그대로 던진다.

## Failure modes

- 위치 문자열이 공식 zone 과 잘 매칭되지 않을 수 있다.
- 같은 키워드가 여러 상권에 걸치면 추가 확인이 필요하다.
- Blue Ribbon 사이트가 구조/파라미터를 바꾸면 zone 파싱 또는 nearby endpoint 가 깨질 수 있다.
- 프록시의 `BLUE_RIBBON_SESSION_ID` 가 만료(30일)되면 갱신이 필요하다.
- 브라우저 fallback은 headed 모드 전용이므로 서버(CI) 환경에서는 동작하지 않는다.

## Notes

- 이 스킬은 조회형 스킬이다.
- 유저 위치는 자동 추적하지 않고, 대화 중 받은 값만 사용한다.
- 맛집 문의는 기본적으로 이 스킬을 먼저 쓰되, 블루리본 외 다른 기준이 명시되면 그 기준을 우선한다.
