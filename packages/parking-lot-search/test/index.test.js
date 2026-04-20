const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_PROXY_BASE_URL,
  buildOfficialParkingLotApiUrl,
  normalizeParkingLotRows,
  parseCoordinateQuery,
  searchNearbyParkingLotsByCoordinates,
  searchNearbyParkingLotsByLocationQuery
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const anchorSearchHtml = fs.readFileSync(path.join(fixturesDir, "anchor-search.html"), "utf8");
const anchorPanel = JSON.parse(fs.readFileSync(path.join(fixturesDir, "anchor-panel.json"), "utf8"));
const parkingApiResponse = JSON.parse(fs.readFileSync(path.join(fixturesDir, "parking-api-response.json"), "utf8"));

const ORIGIN = {
  latitude: 37.57371315593711,
  longitude: 126.97833785777944
};

test("parseCoordinateQuery recognizes latitude/longitude pairs", () => {
  assert.deepEqual(parseCoordinateQuery("37.573713, 126.978338"), {
    latitude: 37.573713,
    longitude: 126.978338
  });
  assert.equal(parseCoordinateQuery("광화문"), null);
});

test("buildOfficialParkingLotApiUrl targets the standard public parking API with safe filters", () => {
  const url = new URL(buildOfficialParkingLotApiUrl({
    serviceKey: "data-key",
    pageNo: 2,
    numOfRows: 500,
    addressHint: "서울특별시 종로구",
    parkingType: "노외",
    publicOnly: true
  }));

  assert.equal(url.origin + url.pathname, "http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api");
  assert.equal(url.searchParams.get("serviceKey"), "data-key");
  assert.equal(url.searchParams.get("type"), "json");
  assert.equal(url.searchParams.get("pageNo"), "2");
  assert.equal(url.searchParams.get("numOfRows"), "500");
  assert.equal(url.searchParams.get("prkplceSe"), "공영");
  assert.equal(url.searchParams.get("prkplceType"), "노외");
  assert.equal(url.searchParams.get("rdnmadr"), "서울특별시 종로구");
});

test("normalizeParkingLotRows keeps public parking metadata and sorts by distance", () => {
  const items = normalizeParkingLotRows(parkingApiResponse, ORIGIN);

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => [item.id, item.name, item.category, item.type]), [
    ["111-2-000003", "광화문광장 공영주차장", "공영", "노상"],
    ["111-2-000001", "종로구청 공영주차장", "공영", "노외"]
  ]);
  assert.equal(items[0].feeInfo, "무료");
  assert.equal(items[0].capacity, 20);
  assert.equal(items[0].weekday.open, "09:00");
  assert.equal(items[0].weekday.close, "21:00");
  assert.equal(items[0].hasAccessibleParking, false);
  assert.equal(items[1].basicCharge, 1000);
  assert.equal(items[1].hasAccessibleParking, true);
  assert.equal(
    items[0].mapUrl,
    "https://map.kakao.com/link/map/%EA%B4%91%ED%99%94%EB%AC%B8%EA%B4%91%EC%9E%A5%20%EA%B3%B5%EC%98%81%EC%A3%BC%EC%B0%A8%EC%9E%A5,37.57375,126.97836"
  );
});

test("normalizeParkingLotRows can include private parking when requested", () => {
  const items = normalizeParkingLotRows(parkingApiResponse, ORIGIN, { publicOnly: false });

  assert.equal(items.length, 3);
  assert.equal(items[0].name, "세종로 민영주차장");
  assert.equal(items[0].category, "민영");
});

test("searchNearbyParkingLotsByCoordinates uses the official API directly when apiKey is provided", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return makeResponse(parkingApiResponse);
  };

  const result = await searchNearbyParkingLotsByCoordinates({
    ...ORIGIN,
    limit: 1,
    radius: 500,
    addressHint: "서울특별시 종로구",
    apiKey: "data-key",
    fetchImpl
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "광화문광장 공영주차장");
  assert.equal(result.meta.total, 2);
  assert.equal(result.meta.source, "data.go.kr");
  assert.match(calls[0], /^http:\/\/api\.data\.go\.kr\/openapi\/tn_pubr_prkplce_info_api\?/);
  assert.match(calls[0], /rdnmadr=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C\+%EC%A2%85%EB%A1%9C%EA%B5%AC/);
});

test("searchNearbyParkingLotsByCoordinates uses k-skill-proxy by default", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return makeResponse({
      anchor: { ...ORIGIN, name: "입력 좌표" },
      items: normalizeParkingLotRows(parkingApiResponse, ORIGIN),
      meta: { total: 2, limit: 2, source: "k-skill-proxy" }
    });
  };

  const result = await searchNearbyParkingLotsByCoordinates({
    ...ORIGIN,
    limit: 2,
    addressHint: "서울특별시 종로구",
    fetchImpl
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.meta.source, "k-skill-proxy");
  const url = new URL(calls[0]);
  assert.equal(url.origin, DEFAULT_PROXY_BASE_URL);
  assert.equal(url.pathname, "/v1/parking-lots/search");
  assert.equal(url.searchParams.get("latitude"), String(ORIGIN.latitude));
  assert.equal(url.searchParams.get("longitude"), String(ORIGIN.longitude));
  assert.equal(url.searchParams.get("address_hint"), "서울특별시 종로구");
});

test("searchNearbyParkingLotsByLocationQuery resolves a Kakao anchor and derives an address hint", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const resolved = String(url);
    calls.push(resolved);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8")) {
      return makeResponse(anchorSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return makeResponse(anchorPanel, "application/json");
    }

    if (resolved.startsWith("http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api?")) {
      const urlObject = new URL(resolved);
      assert.equal(urlObject.searchParams.get("rdnmadr"), "서울특별시 종로구");
      return makeResponse(parkingApiResponse);
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchNearbyParkingLotsByLocationQuery("광화문", {
    limit: 2,
    apiKey: "data-key",
    fetchImpl
  });

  assert.equal(result.anchor.name, "광화문");
  assert.equal(result.anchor.address, "서울특별시 종로구 세종대로 172");
  assert.equal(result.items.length, 2);
  assert.deepEqual(calls.slice(0, 2), [
    "https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8",
    "https://place-api.map.kakao.com/places/panel3/1001"
  ]);
});

test("searchNearbyParkingLotsByCoordinates validates inputs", async () => {
  await assert.rejects(
    searchNearbyParkingLotsByCoordinates({ latitude: "x", longitude: 126.9 }),
    /latitude and longitude must be finite numbers/
  );
  await assert.rejects(
    searchNearbyParkingLotsByCoordinates({ ...ORIGIN, limit: 0 }),
    /limit must be between 1 and 50/
  );
  await assert.rejects(
    searchNearbyParkingLotsByCoordinates({ ...ORIGIN, radius: 0 }),
    /radius must be between 1 and 50000/
  );
});

function makeResponse(body, contentType = "application/json;charset=UTF-8") {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "content-type") {
          return contentType;
        }
        return null;
      }
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    }
  };
}
