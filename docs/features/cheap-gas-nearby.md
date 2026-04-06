# 근처 가장 싼 주유소 찾기 가이드

## 이 기능으로 할 수 있는 일

- 현재 위치 기준 근처 최저가 주유소 검색
- 휘발유/경유 기준 nearby 가격 비교
- Opinet 공식 API(`aroundAll.do`, `detailById.do`) 기반 요약
- 셀프 여부, 세차장, 경정비, 품질인증 여부까지 함께 정리

## 먼저 필요한 것

- 인터넷 연결
- `node` 18+
- `cheap-gas-nearby` package 또는 이 저장소 전체 설치

사용자 쪽에서 별도 `OPINET_API_KEY` 를 준비할 필요가 없다. 기본적으로 `https://k-skill-proxy.nomadamas.org` 프록시를 경유하며, upstream key는 proxy 서버에서만 주입한다.

## 가장 먼저 할 일

이 기능은 **반드시 현재 위치를 먼저 물어본 뒤** 실행합니다.

권장 질문 예시:

```text
현재 위치를 알려주세요. 동네/역명/랜드마크/위도·경도 중 편한 형식으로 보내주시면 근처에서 가장 싼 주유소를 찾아볼게요.
```

제품을 안 알려주면 보통 **휘발유(B027)** 기준으로 시작하고, 경유가 필요하면 `D047` 로 바꿉니다.

## 입력값

- 동네/상권: `강남`, `성수동`, `판교`
- 역명/랜드마크: `서울역`, `강남역`, `코엑스`
- 좌표: `37.55472, 126.97068`
- 제품코드: `B027`(휘발유), `D047`(경유)

위치 문자열은 Kakao Map anchor 검색으로 **WGS84 좌표**를 잡고, 내부적으로 **KATEC** 으로 변환해 Opinet nearby 검색에 사용합니다.

## 공식 표면

- Opinet 오픈 API 안내: `https://www.opinet.co.kr/user/custapi/openApiInfo.do`
- 반경 내 주유소: `https://www.opinet.co.kr/api/aroundAll.do`
- 주유소 상세정보(ID): `https://www.opinet.co.kr/api/detailById.do`
- 지역코드: `https://www.opinet.co.kr/api/areaCode.do`
- Kakao Map 모바일 검색: `https://m.map.kakao.com/actions/searchView`
- Kakao Map 장소 패널 JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

Opinet nearby 검색의 핵심 파라미터:

- `x`, `y`: 기준 위치 **KATEC** 좌표
- `radius`: 반경(m, 최대 5000)
- `prodcd`: `B027`, `D047`, `B034`, `C004`, `K015`
- `sort=1`: 가격순

## 기본 흐름

1. 유저에게 현재 위치를 먼저 묻습니다.
2. 위치 문자열을 받으면 Kakao Map으로 anchor 후보를 고르고 좌표를 확보합니다.
3. 좌표를 **WGS84 → KATEC** 으로 변환합니다.
4. Opinet `aroundAll.do` 를 `sort=1` 가격순으로 조회합니다.
5. 상위 후보는 `detailById.do` 로 재조회해 주소/전화번호/편의시설을 보강합니다.
6. 가격순 상위 3~5개만 짧게 응답합니다.

## Node.js 예시

```js
const { searchCheapGasStationsByLocationQuery } = require("cheap-gas-nearby");

async function main() {
  const result = await searchCheapGasStationsByLocationQuery("서울역", {
    productCode: "B027",
    radius: 1000,
    limit: 3
  });

  for (const item of result.items) {
    console.log(`${item.name}: ${item.price}원/L, ${item.distanceMeters}m, ${item.roadAddress}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Offline smoke example

실제 키가 없는 환경에서도 패키지 동작은 fixture 기반으로 검증할 수 있습니다.

```bash
node --test packages/cheap-gas-nearby/test/index.test.js
```

## 운영 팁

- 프록시 서버가 내려가 있거나 upstream key가 없으면 503 을 반환하므로 상태를 안내합니다.
- 서울역/강남처럼 넓은 질의는 anchor 위치가 흔들릴 수 있으니 필요하면 더 구체적인 역 출구/동 이름을 한 번 더 받습니다.
- 동일 가격이면 거리순으로 다시 정렬해 보여주는 편이 좋습니다.
- 결과가 너무 많으면 반경을 `1000m` 또는 `2000m` 정도로 유지하는 편이 읽기 쉽습니다.

## 주의할 점

- Opinet Open API 인증키는 proxy 서버에서만 관리합니다. 사용자/client 쪽 secrets 파일에는 넣지 않습니다.
- Kakao Map anchor 검색은 위치 기준점만 잡기 위한 보조 단계이고, 최종 가격/순위 데이터는 Opinet을 기준으로 합니다.
- Opinet 응답의 좌표는 KATEC 이므로 WGS84와 혼동하면 안 됩니다.
