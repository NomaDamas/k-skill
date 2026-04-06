---
name: cheap-gas-nearby
description: Use when the user asks for nearby cheapest gas stations or 근처 가장 싼 주유소. Always ask the user's current location first, then use Kakao Map anchor resolution plus official Opinet fuel-price APIs.
license: MIT
metadata:
  category: transport
  locale: ko-KR
  phase: v1
---

# Cheap Gas Nearby

## What this skill does

유저가 알려준 현재 위치를 기준으로 **근처에서 가장 싼 주유소**를 찾아준다.

- 위치는 자동으로 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- 가격 데이터는 한국석유공사 **Opinet 공식 API**를 우선 사용한다.
- 동네/역명/랜드마크 입력은 Kakao Map anchor 검색으로 좌표를 잡은 뒤 Opinet nearby 검색으로 연결한다.
- 기본 제품은 **휘발유(B027)** 이고, 유저가 경유라고 명시하면 **경유(D047)** 로 바꾼다.

## When to use

- "근처 가장 싼 주유소 찾아줘"
- "서울역 근처 휘발유 제일 싼 데 어디야?"
- "강남에서 경유 싼 주유소 몇 군데만 보여줘"
- "지금 여기 근처 셀프주유소 중 싼 순으로 알려줘"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처에서 가장 싼 주유소를 찾아볼게요.`
- 제품이 불명확하면: `휘발유 기준으로 볼까요, 경유 기준으로 볼까요? 따로 말씀 없으면 휘발유로 찾을게요.`
- 위치가 애매하면: `가까운 역명이나 동 이름으로 한 번만 더 알려주세요.`

## Default path

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/opinet/around` 와 `/v1/opinet/detail` 을 경유해 조회한다. 사용자 쪽에서 별도 `OPINET_API_KEY` 를 준비할 필요가 없다.

## Official Opinet surfaces

- 오픈 API 안내: `https://www.opinet.co.kr/user/custapi/openApiInfo.do`
- 반경 내 주유소: `https://www.opinet.co.kr/api/aroundAll.do`
- 주유소 상세정보(ID): `https://www.opinet.co.kr/api/detailById.do`
- 지역코드: `https://www.opinet.co.kr/api/areaCode.do`

반경 검색 핵심 파라미터:

- `x`, `y`: 기준 위치 **KATEC** 좌표
- `radius`: 반경(m, 최대 5000)
- `prodcd`: `B027`(휘발유), `D047`(경유), `B034`(고급휘발유), `C004`(등유), `K015`(LPG)
- `sort=1`: 가격순

## Location resolution surface

- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

위치 문자열은 Kakao Map으로 **anchor 좌표(WGS84)** 를 구한 뒤, 내부적으로 **WGS84 → KATEC** 변환을 적용해 Opinet `aroundAll.do` 에 넘긴다.

## Workflow

1. 유저에게 반드시 현재 위치를 묻는다.
2. 위치 문자열을 받으면 Kakao Map anchor 검색으로 좌표를 찾는다.
   - 위도/경도를 직접 받으면 anchor 검색을 생략한다.
3. 좌표를 KATEC으로 변환한다.
4. Opinet `aroundAll.do` 를 `sort=1` 가격순으로 조회한다.
5. 상위 후보에 대해 `detailById.do` 를 호출해 도로명주소, 전화번호, 셀프 여부, 세차장, 경정비, 품질인증 여부를 보강한다.
6. 보통 3~5개만 짧게 정리한다.

## Responding

결과는 보통 아래 필드를 포함해 짧게 정리한다.

- 주유소명
- 가격(휘발유/경유 중 요청한 제품)
- 거리
- 주소
- 셀프 여부
- 세차장/경정비/품질인증 여부(있으면)

## Node.js example

```js
const { searchCheapGasStationsByLocationQuery } = require("cheap-gas-nearby");

async function main() {
  const result = await searchCheapGasStationsByLocationQuery("서울역", {
    productCode: "B027",
    radius: 1000,
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
- 기본 proxy 경유로 Opinet 데이터를 조회했다.
- 공식 Opinet nearby 결과를 최소 1개 이상 찾았거나, 못 찾은 이유와 다음 질문을 제시했다.
- 가격순 상위 결과를 3~5개 이내로 정리했다.

## Failure modes

- 프록시 서버가 내려가 있거나 `OPINET_API_KEY` 가 서버에 설정되지 않은 경우.
- Kakao Map anchor가 애매하면 좌표가 잘못 잡힐 수 있어 추가 위치 확인이 필요하다.
- Opinet Open API 응답이 일시적으로 비거나 갱신 중일 수 있다.
