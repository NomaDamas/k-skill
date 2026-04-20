# 근처 공영주차장 찾기

`parking-lot-search` 스킬은 사용자가 알려준 위치 기준으로 가까운 공영주차장을 찾는다.

## 핵심 원칙

- 위치를 자동 추적하지 않는다. 먼저 현재 위치를 질문한다.
- 기본 결과는 `공영` 주차장만 포함한다.
- 데이터 출처는 공공데이터포털 `전국주차장정보표준데이터` Open API다.
- 실시간 잔여 주차면, 만차 여부, 예약 가능 여부는 공식 표준데이터에 없으므로 단정하지 않는다.

## 사용 예

```text
현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처 공영주차장을 찾아볼게요.
```

위치를 받으면 `parking-lot-search` 패키지 또는 k-skill-proxy `/v1/parking-lots/search`를 사용한다.

## Node.js 예시

```js
const { searchNearbyParkingLotsByLocationQuery } = require("parking-lot-search");

async function main() {
  const result = await searchNearbyParkingLotsByLocationQuery("광화문", {
    limit: 3,
    radius: 1500
  });

  console.log(result.anchor);
  console.log(result.items.map((item) => ({
    name: item.name,
    distanceMeters: Math.round(item.distanceMeters),
    feeInfo: item.feeInfo,
    basicCharge: item.basicCharge,
    mapUrl: item.mapUrl
  })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Proxy endpoint

```http
GET /v1/parking-lots/search?latitude=37.573713&longitude=126.978338&address_hint=서울특별시%20종로구&limit=3&radius=1500
```

응답은 가까운 주차장 목록, query echo, cache metadata를 포함한다. 운영 proxy에는 `DATA_GO_KR_API_KEY`가 필요하다.

## 모두의주차장

Issue #135에서 모두의주차장 연동 가능성이 언급되었지만 v1은 공식 공공데이터 기반으로 시작한다. 승인된 공식/파트너 API 계약이 확인되기 전에는 모두의주차장 비공식 API 호출이나 scraping을 하지 않는다.

## 참고 표면

- 표준데이터: <https://www.data.go.kr/data/15012896/standard.do>
- Open API: <https://www.data.go.kr/data/15012896/openapi.do>
- Endpoint: `http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api`
