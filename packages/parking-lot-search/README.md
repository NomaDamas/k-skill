# parking-lot-search

Korean parking-lot lookup backed first by the official Data.go.kr `전국주차장정보표준데이터` Open API.

## Usage principles

- Do not infer or track the user's location automatically.
- Ask for the current location first, then use a neighborhood/station/landmark or `latitude, longitude` pair.
- The default result set is public (`공영`) parking lots only.
- The package resolves text locations through Kakao Map place search, then searches the official parking dataset near the resolved coordinates.
- Live occupancy and reservation are not provided by the official standard data.

## Official surfaces

- Data.go.kr standard dataset: `https://www.data.go.kr/data/15012896/standard.do`
- Data.go.kr Open API docs: `https://www.data.go.kr/data/15012896/openapi.do`
- Open API endpoint: `http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api`
- Kakao Map mobile search: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map place panel JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

## Proxy-first usage

By default, the package calls the shared k-skill proxy:

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

Set `KSKILL_PROXY_BASE_URL` or pass `proxyBaseUrl` to use a local proxy.

## Direct Data.go.kr usage

For direct official API calls, pass `apiKey` or set `DATA_GO_KR_API_KEY` and `useDirectApi: true`.

```js
const result = await searchNearbyParkingLotsByLocationQuery("광화문", {
  apiKey: process.env.DATA_GO_KR_API_KEY,
  limit: 5,
  radius: 2000
});
```

## Public API

- `parseCoordinateQuery(locationQuery)`
- `normalizeParkingLotRows(payload, origin, options)`
- `buildOfficialParkingLotApiUrl(options)`
- `searchNearbyParkingLotsByCoordinates(options)`
- `searchNearbyParkingLotsByLocationQuery(locationQuery, options)`

## Modu Parking status

Issue #135 mentioned connecting 모두의주차장 if possible. This package does **not** scrape or call an unofficial Modu Parking surface. Add it later only if there is an approved, stable, and legally usable API contract.
