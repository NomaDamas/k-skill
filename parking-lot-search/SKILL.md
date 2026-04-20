---
name: parking-lot-search
description: Use when the user asks for nearby parking lots or 근처 주차장/공영주차장. Always ask the user's current location first, then use official Data.go.kr public parking data through k-skill-proxy or the parking-lot-search package.
license: MIT
metadata:
  category: convenience
  locale: ko-KR
  phase: v1
---

# Parking Lot Search

## What this skill does

유저가 알려준 현재 위치를 기준으로 **근처 공영주차장** 을 찾는다.

- 위치는 자동 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- 기본값은 `공영` 주차장만 보여준다.
- 공식 `전국주차장정보표준데이터` Open API를 사용한다.
- 위치 문자열은 Kakao Map anchor 검색으로 좌표를 잡은 뒤, 공식 주차장 데이터에서 거리순으로 정리한다.
- 실시간 만차/잔여면/예약 여부는 공식 표준데이터에 없으므로 확정해서 말하지 않는다.

## When to use

- "근처 주차장 찾아줘"
- "광화문 주변 공영주차장 어디 있어?"
- "서울역 근처 무료 주차장 있어?"
- "지금 여기서 가까운 공영주차장 지도 링크 줘"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

권장 질문:

`현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 공영주차장을 찾아볼게요.`

위치가 애매하면:

`가까운 역명이나 동 이름으로 한 번만 더 알려주세요.`

## Official surfaces

- 표준데이터 안내: `https://www.data.go.kr/data/15012896/standard.do`
- Open API 안내: `https://www.data.go.kr/data/15012896/openapi.do`
- Open API endpoint: `http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api`
- k-skill proxy: `/v1/parking-lots/search`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

## Workflow

1. 유저에게 반드시 현재 위치를 묻는다.
2. 위치 문자열을 받으면 Kakao Map으로 anchor 후보를 고르고 좌표를 확보한다.
3. anchor 주소에서 `시도 + 시군구` address hint를 만든다.
4. k-skill-proxy `/v1/parking-lots/search` 또는 `parking-lot-search` 패키지로 공식 주차장 데이터를 조회한다.
5. 보통 3~5개만 짧게 정리하고, 지도 링크를 같이 준다.
6. 요금/운영시간은 데이터 기준일자와 함께 안내하고, 실시간 현황이 아님을 밝힌다.

## Responding

결과는 보통 아래 필드를 포함해 짧게 정리한다.

- 주차장명
- 거리
- 공영/민영 및 노상/노외/부설 유형
- 주소
- 운영요일/운영시간
- 요금정보, 기본요금, 추가요금
- 주차구획수
- 전화번호/관리기관
- 데이터기준일자
- 지도 링크

## Node.js example

```js
const { searchNearbyParkingLotsByLocationQuery } = require("parking-lot-search");

async function main() {
  const result = await searchNearbyParkingLotsByLocationQuery("광화문", {
    limit: 3,
    radius: 1500
  });

  console.log(result.anchor);
  console.log(result.items);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 모두의주차장 status

Issue #135에서 모두의주차장 연동 가능성을 언급했지만, v1은 공식 공공데이터 기반으로 시작한다. 승인된 공식/파트너 API 계약이 확인되기 전에는 모두의주차장 비공식 API 호출이나 scraping을 하지 않는다.

## Done when

- 유저의 현재 위치를 먼저 확인했다.
- 공식 데이터 기반으로 최소 1개 이상 nearby parking lot을 찾았거나, 못 찾은 이유와 다음 질문을 제시했다.
- 가장 가까운 결과를 3~5개 이내로 정리했다.
- 실시간 잔여면/예약 가능 여부가 아님을 필요한 경우 명확히 했다.
