---
name: public-restroom-nearby
description: Use when the user asks for nearby public/open restrooms or 근처 화장실. Always ask the user's current location first, then use the official nationwide public-restroom standard dataset plus Kakao anchor resolution.
license: MIT
metadata:
  category: convenience
  locale: ko-KR
  phase: v1
---

# Public Restroom Nearby

## What this skill does

유저가 알려준 현재 위치를 기준으로 **근처 공중화장실 / 개방화장실** 을 찾는다.

- 위치는 자동으로 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- 화장실 데이터는 공식 `공중화장실정보` 표준데이터를 사용한다.
- 위치 문자열은 Kakao Map anchor 검색으로 좌표를 잡고, 가능한 경우 해당 시도 데이터만 좁혀서 조회한다.
- 좌표를 직접 받으면 바로 nearby 계산으로 들어간다.

## When to use

- "근처 화장실 찾아줘"
- "서울역 근처 공중화장실 있어?"
- "광화문 주변 개방화장실 몇 군데만 보여줘"
- "지금 여기서 가까운 화장실 지도 링크 줘"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 공중화장실을 찾아볼게요.`
- 위치가 애매하면: `가까운 역명이나 동 이름으로 한 번만 더 알려주세요.`

## Official surfaces

- 공공데이터포털 공중화장실 표준데이터 안내: `https://www.data.go.kr/data/15012892/standard.do`
- 전국 CSV: `https://file.localdata.go.kr/file/download/public_restroom_info/info`
- 지역별 CSV: `https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=<시도코드>`
- 파일 소개 페이지: `https://file.localdata.go.kr/file/public_restroom_info/info`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

## Workflow

1. 유저에게 반드시 현재 위치를 묻는다.
2. 위치 문자열을 받으면 Kakao Map으로 anchor 후보를 고르고 좌표를 확보한다.
3. anchor 주소에서 시도(서울/경기/부산 등)를 추론할 수 있으면 해당 지역 CSV로 좁힌다.
4. 공식 `공중화장실정보` CSV를 내려받아 위·경도 기준 거리순으로 정렬한다.
5. 보통 3~5개만 짧게 정리하고, 필요하면 지도 링크(`map.kakao.com/link/map/...`)를 같이 준다.

## Responding

결과는 보통 아래 필드를 포함해 짧게 정리한다.

- 화장실명
- 구분명(공중화장실 / 개방화장실)
- 거리
- 주소
- 개방시간/상세
- 지도 링크

## Node.js example

```js
const { searchNearbyPublicRestroomsByLocationQuery } = require("public-restroom-nearby");

async function main() {
  const result = await searchNearbyPublicRestroomsByLocationQuery("광화문", {
    limit: 3
  });

  console.log(result.anchor);
  console.log(result.items);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Done when

- 유저의 현재 위치를 먼저 확인했다.
- 공식 데이터 기반으로 최소 1개 이상 nearby restroom 을 찾았거나, 못 찾은 이유와 다음 질문을 제시했다.
- 가장 가까운 결과를 3~5개 이내로 정리했다.

## Failure modes

- Kakao Map anchor 가 애매하면 위치 기준점이 흔들릴 수 있다.
- 공개 표준데이터는 실시간 점유/잠금 상태를 주지 않으므로 개방시간 중심으로만 안내해야 한다.
- CSV 인코딩/컬럼 구조가 바뀌면 정규화 로직을 다시 확인해야 한다.
