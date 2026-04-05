# cheap-gas-nearby

한국석유공사 오피넷(Opinet) 공식 API를 사용해 근처의 가장 싼 주유소를 찾는 Node.js 패키지입니다.

## 설치

배포 후:

```bash
npm install cheap-gas-nearby
```

이 저장소에서 개발할 때:

```bash
npm install
```

## 사용 원칙

- 유저 위치는 자동으로 추적하지 않습니다.
- 먼저 현재 위치를 묻고, 받은 동네/역명/랜드마크/위도·경도를 사용하세요.
- 가격 데이터는 공식 Opinet Open API를 우선 사용합니다.
- 위치 문자열은 Kakao Map anchor 검색으로 좌표를 잡은 뒤, Opinet `aroundAll.do` 검색으로 연결합니다.
- 공식 API key (`OPINET_API_KEY`) 또는 `apiKey` 옵션이 필요합니다.

## 공식 표면

- 오픈 API 안내: `https://www.opinet.co.kr/user/custapi/openApiInfo.do`
- 반경 내 주유소: `https://www.opinet.co.kr/api/aroundAll.do`
- 주유소 상세정보(ID): `https://www.opinet.co.kr/api/detailById.do`
- 지역코드: `https://www.opinet.co.kr/api/areaCode.do`
- Kakao Map anchor 검색: `https://m.map.kakao.com/actions/searchView`

## 사용 예시

```js
const { searchCheapGasStationsByLocationQuery } = require("cheap-gas-nearby");

async function main() {
  const result = await searchCheapGasStationsByLocationQuery("서울역", {
    apiKey: process.env.OPINET_API_KEY,
    radius: 1000,
    productCode: "B027",
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

## 공개 API

- `parseSearchResultsHtml(html)`
- `selectAnchorCandidate(query, items)`
- `normalizeAnchorPanel(panel, searchItem)`
- `wgs84ToKatec(latitude, longitude)`
- `buildAroundSearchParams(options)`
- `parseAroundResponse(payload)`
- `normalizeDetailItem(payload)`
- `searchCheapGasStationsByCoordinates(options)`
- `searchCheapGasStationsByLocationQuery(locationQuery, options)`
