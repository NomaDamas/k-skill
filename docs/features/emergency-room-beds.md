# 근처 응급실 병상 상태 확인

`emergency-room-beds` 스킬은 사용자가 알려준 위치 기준으로 가까운 응급실을 찾고, E-Gen 공개 응급실 찾기 표면에서 제공하는 응급실/입원실 운영 상태 플래그를 정리한다.

## 핵심 원칙

- 위치를 자동 추적하지 않는다. 위치가 없으면 먼저 현재 위치를 질문한다.
- 데이터 출처는 NEMC/E-Gen 공개 페이지와 E-Gen nearby 응급실 목록 endpoint다.
- E-Gen nearby 목록은 응급실 운영 여부와 입원실/병상 운영 플래그를 제공하지만, 병원별 정확한 실시간 잔여 병상 수나 병상 가동률 수치를 제공하지 않는다.
- 긴급 상황에서는 결과와 별개로 119 또는 병원 대표전화 확인을 안내한다.

## 사용 예

```text
현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 응급실 상태를 찾아볼게요.
```

위치를 받으면 `emergency-room-beds` 패키지의 `searchNearbyEmergencyRoomsByLocationQuery()`를 사용한다.

## Node.js 예시

```js
const { searchNearbyEmergencyRoomsByLocationQuery } = require("emergency-room-beds");

async function main() {
  const result = await searchNearbyEmergencyRoomsByLocationQuery("광화문", {
    limit: 3,
    radius: 5
  });

  console.log(result.anchor);
  console.log(result.items.map((item) => ({
    name: item.name,
    distanceKm: item.distanceKm,
    emergencyRoomOperating: item.bedStatus.emergencyRoomOperating,
    inpatientBedsOperating: item.bedStatus.inpatientBedsOperating,
    updatedAt: item.updatedAt,
    phone: item.phone,
    mapUrl: item.mapUrl
  })));
  console.log(result.meta.bedCountLimitation);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 응답 필드

- 병원명, 거리, 응급의료기관 등급, 병원 유형
- 응급실 운영 여부 (`emergencyRoomOperating`)
- 입원실/병상 운영 플래그 (`inpatientBedsOperating`)
- 권역외상센터/소아전문/소아야간진료 여부
- 주소, 대표전화, 갱신시각, 지도 링크
- 공개 데이터 한계 문구: 정확한 실시간 잔여 병상 수/가동률 미제공

## 참고 표면

- NEMC 모니터링: <https://dw.nemc.or.kr/nemcMonitoring/mainmgr/Main.do>
- E-Gen 응급실 찾기: <https://www.e-gen.or.kr/egen/search_emergency_room.do>
- E-Gen nearby endpoint: `https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`
