# Kakao Bar Nearby

## What this skill does

유저가 알려준 현재 위치를 기준으로 **카카오맵 기준 근처 술집**을 찾아준다.

- 위치는 자동으로 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- `서울역`, `강남`, `사당`, `신논현`, `논현` 같은 역명/동네/랜드마크 질의를 그대로 받을 수 있다.
- 결과에는 현재 영업 상태, 대표 메뉴, 좌석 옵션(단체석/바테이블 등), 전화번호를 포함한다.

## When to use

- "서울역 근처 술집 찾아줘"
- "강남에서 지금 영업중인 와인바 뭐 있어?"
- "논현 근처 4명 갈만한 술집 알려줘"
- "사당에서 전화번호 있는 이자카야 몇 군데만 보여줘"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치를 알려주세요. 서울역/강남/사당 같은 역명이나 동네명으로 보내주시면 카카오맵 기준 근처 술집을 찾아볼게요.`
- 위치가 애매하면: `가까운 역명이나 동 이름으로 한 번만 더 알려주세요.`

## Official Kakao Map surfaces

- 모바일 검색: `https://m.map.kakao.com/actions/searchView?q=<query>`
- 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`
- 장소 상세 페이지: `https://place.map.kakao.com/<confirmId>`

## Workflow

1. 유저에게 반드시 현재 위치를 묻는다.
2. 받은 위치 문자열을 카카오맵 검색으로 anchor 후보(역/랜드마크)로 해석한다.
3. 같은 위치 문자열에 `술집` 키워드를 붙여 nearby 술집 검색 결과를 가져온다.
4. 상위 후보의 panel3 JSON 을 조회해 현재 영업 상태, 메뉴, 좌석 옵션, 전화번호를 정규화한다.
5. **영업 중인 술집을 먼저** 보여주고, 필요하면 곧 열 곳도 함께 보여준다.

## Responding

보통 3~5개만 짧게 정리한다.

- 술집명
- 카테고리
- 영업 상태 (`영업 중`, `영업 전`, `휴무일` 등)
- 대표 메뉴 2~3개
- 좌석/인원 수용 힌트 (`단체석`, `바테이블` 등)
- 전화번호
- 거리(가능하면)

## Node.js example

```js
const { searchNearbyBarsByLocationQuery } = require("kakao-bar-nearby");

async function main() {
  const result = await searchNearbyBarsByLocationQuery("서울역", {
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

## Done when

- 유저의 현재 위치를 먼저 확인했다.
- 카카오맵 기준 술집 결과를 최소 1개 이상 찾았거나, 찾지 못한 이유와 다음 질문을 제시했다.
- 영업 상태/메뉴/좌석 옵션/전화번호가 포함된 요약을 보여줬다.
