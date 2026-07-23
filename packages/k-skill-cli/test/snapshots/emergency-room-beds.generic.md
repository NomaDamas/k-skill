# emergency-room-beds — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# Emergency Room Beds

## What this skill does

사용자가 알려준 현재 위치를 기준으로 **근처 응급실**과 공개 E-Gen 응급실 상태 플래그를 찾는다.

- 위치는 자동 추정하지 않는다.
- 위치가 없으면 먼저 현재 위치를 묻는다.
- 위치 문자열은 Kakao Map anchor 검색으로 좌표를 잡는다.
- 응급실 목록은 E-Gen 공개 응급실 찾기 표면을 사용한다.
- 응급실 운영 여부, 입원실/병상 운영 플래그, 권역외상센터/소아전문 여부, 데이터 갱신시각을 보여준다.
- **정확한 실시간 잔여 병상 수나 병상 가동률을 확정해서 말하지 않는다.** 공개 E-Gen nearby 목록은 병상 수치가 아니라 운영 플래그를 제공한다.

## When to use

- "근처 응급실 찾아줘"
- "응급실 병상 상태 확인해줘"
- "광화문 주변 응급실 어디가 가까워?"
- "현재 위치 근처 응급실 운영 여부 알려줘"

## Mandatory first question

위치 정보가 없으면 먼저 물어본다.

`현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 응급실 상태를 찾아볼게요.`

## Official/public surfaces

- NEMC 모니터링: `https://dw.nemc.or.kr/nemcMonitoring/mainmgr/Main.do`
- E-Gen 응급실 찾기: `https://www.e-gen.or.kr/egen/search_emergency_room.do`
- E-Gen nearby list endpoint: `https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

## Workflow

1. 사용자의 현재 위치를 확보한다.
2. `emergency-room-beds` 패키지의 `searchNearbyEmergencyRoomsByLocationQuery()`를 사용한다.
3. 보통 3~5개 이내로 거리순 결과를 정리한다.
4. 반드시 "공개 E-Gen nearby 목록 기준이며 정확한 잔여 병상 수/가동률은 제공되지 않는다"고 밝힌다.
5. 긴급 상황이면 119 또는 병원 전화 확인을 권한다.

## Responding

결과는 짧고 실용적으로 정리한다.

- 병원명 / 거리
- 응급의료기관 등급 / 병원 유형
- 응급실 운영 여부
- 입원실/병상 운영 플래그
- 권역외상센터/소아전문 여부
- 주소 / 대표전화
- 갱신시각
- 지도 링크

## Node.js example

```js
const { searchNearbyEmergencyRoomsByLocationQuery } = require("emergency-room-beds");

async function main() {
  const result = await searchNearbyEmergencyRoomsByLocationQuery("광화문", {
    limit: 3,
    radius: 5
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

- 위치 기준 anchor를 확인했다.
- 가까운 응급실을 찾았거나, 못 찾은 이유와 다음 검색 범위를 제시했다.
- 공개 데이터의 한계(정확한 잔여 병상 수/가동률 미제공)를 명확히 밝혔다.
- 긴급 상황에서는 119/전화 확인 안내를 포함했다.
