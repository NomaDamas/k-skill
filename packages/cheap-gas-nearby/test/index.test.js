const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildAroundSearchParams,
  normalizeAnchorPanel,
  normalizeDetailItem,
  parseAroundResponse,
  parseSearchResultsHtml,
  searchCheapGasStationsByLocationQuery,
  selectAnchorCandidate,
  wgs84ToKatec
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const anchorSearchHtml = fs.readFileSync(path.join(fixturesDir, "anchor-search.html"), "utf8");
const anchorPanel = JSON.parse(fs.readFileSync(path.join(fixturesDir, "anchor-panel.json"), "utf8"));
const aroundResponse = JSON.parse(fs.readFileSync(path.join(fixturesDir, "around-response.json"), "utf8"));
const detailA1000001 = JSON.parse(fs.readFileSync(path.join(fixturesDir, "detail-a1000001.json"), "utf8"));
const detailA1000003 = JSON.parse(fs.readFileSync(path.join(fixturesDir, "detail-a1000003.json"), "utf8"));

test("parseSearchResultsHtml extracts Kakao search cards for anchor resolution", () => {
  const items = parseSearchResultsHtml(anchorSearchHtml);

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    id: "1001",
    name: "서울역",
    category: "기차역",
    address: "서울 용산구 동자동",
    phone: "1544-7788"
  });
});

test("selectAnchorCandidate prefers the obvious station/landmark match", () => {
  const anchor = selectAnchorCandidate("서울역", parseSearchResultsHtml(anchorSearchHtml));

  assert.equal(anchor.id, "1001");
  assert.equal(anchor.name, "서울역");
});

test("normalizeAnchorPanel keeps source URL and WGS84 coordinates", () => {
  const item = normalizeAnchorPanel(anchorPanel, { id: "1001", name: "서울역", category: "기차역" });

  assert.equal(item.id, "1001");
  assert.equal(item.latitude, 37.55472);
  assert.equal(item.longitude, 126.97068);
  assert.equal(item.sourceUrl, "https://place.map.kakao.com/1001");
});

test("normalizeAnchorPanel leaves missing Kakao coordinates unusable instead of coercing them to zero", () => {
  const item = normalizeAnchorPanel(
    {
      ...anchorPanel,
      summary: {
        ...anchorPanel.summary,
        point: {
          lon: null,
          lat: null
        }
      }
    },
    { id: "1001", name: "서울역", category: "기차역" },
  );

  assert.equal(item.latitude, null);
  assert.equal(item.longitude, null);
});

test("wgs84ToKatec converts WGS84 coordinates into the KATEC values Opinet expects", () => {
  const { x, y } = wgs84ToKatec(37.55472, 126.97068);

  assert.ok(Math.abs(x - 309252.2237) < 1);
  assert.ok(Math.abs(y - 550779.9944) < 1);
});

test("buildAroundSearchParams encodes the official Opinet nearby search contract", () => {
  const params = buildAroundSearchParams({
    x: 309252.2237,
    y: 550779.9944,
    radius: 1000,
    productCode: "B027",
    sort: 1
  });

  assert.equal(params.out, "json");
  assert.equal(params.x, "309252.2237");
  assert.equal(params.y, "550779.9944");
  assert.equal(params.radius, "1000");
  assert.equal(params.prodcd, "B027");
  assert.equal(params.sort, "1");
});

test("parseAroundResponse normalizes nearby Opinet stations and keeps cheapest ordering", () => {
  const items = parseAroundResponse(aroundResponse);

  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => [item.id, item.price, item.distanceMeters]),
    [
      ["A1000001", 1635, 112.4],
      ["A1000002", 1649, 315],
      ["A1000003", 1649, 220]
    ]
  );
});

test("normalizeDetailItem enriches a station with address, services, and product prices", () => {
  const item = normalizeDetailItem(detailA1000001);

  assert.equal(item.id, "A1000001");
  assert.equal(item.name, "서울역셀프주유소");
  assert.equal(item.brandCode, "SKE");
  assert.equal(item.roadAddress, "서울 용산구 한강대로 405");
  assert.equal(item.phone, "02-1111-2222");
  assert.equal(item.isSelf, true);
  assert.equal(item.hasCarWash, true);
  assert.equal(item.hasMaintenance, true);
  assert.equal(item.kpetroCertified, true);
  assert.equal(item.prices.gasoline, 1635);
  assert.equal(item.prices.diesel, 1529);
});

test("searchCheapGasStationsByLocationQuery resolves the anchor, queries Opinet, enriches details, and sorts by price then distance", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const resolved = String(url);
    calls.push(resolved);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EC%84%9C%EC%9A%B8%EC%97%AD")) {
      return makeResponse(anchorSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return makeResponse(anchorPanel, "application/json");
    }

    if (resolved.startsWith("https://www.opinet.co.kr/api/aroundAll.do?")) {
      return makeResponse(aroundResponse, "application/json");
    }

    if (resolved.includes("detailById.do") && resolved.includes("id=A1000001")) {
      return makeResponse(detailA1000001, "application/json");
    }

    if (resolved.includes("detailById.do") && resolved.includes("id=A1000003")) {
      return makeResponse(detailA1000003, "application/json");
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchCheapGasStationsByLocationQuery("서울역", {
    apiKey: "test-opinet-key",
    radius: 1000,
    limit: 2,
    detailLimit: 2,
    fetchImpl
  });

  assert.equal(result.anchor.name, "서울역");
  assert.equal(result.anchor.sourceUrl, "https://place.map.kakao.com/1001");
  assert.deepEqual(
    result.items.map((item) => [item.id, item.price, item.distanceMeters, item.roadAddress]),
    [
      ["A1000001", 1635, 112.4, "서울 용산구 한강대로 405"],
      ["A1000003", 1649, 220, "서울 중구 통일로 10"]
    ]
  );
  assert.equal(result.meta.productCode, "B027");
  assert.equal(result.meta.radius, 1000);
  assert.ok(calls.some((url) => url.includes("aroundAll.do")));
  assert.ok(calls.some((url) => url.includes("detailById.do") && url.includes("A1000001")));
});

test("searchCheapGasStationsByLocationQuery falls back to the next ranked Kakao anchor candidate when the first panel has no coordinates", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const resolved = String(url);
    calls.push(resolved);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EC%84%9C%EC%9A%B8%EC%97%AD")) {
      return makeResponse(anchorSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return makeResponse(
        {
          ...anchorPanel,
          summary: {
            ...anchorPanel.summary,
            point: {}
          }
        },
        "application/json",
      );
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1002") {
      return makeResponse(
        {
          ...anchorPanel,
          summary: {
            ...anchorPanel.summary,
            confirm_id: "1002",
            name: "서울역 1호선",
            point: {
              lon: 126.97253,
              lat: 37.55513
            },
            address: {
              disp: "서울 중구 봉래동2가"
            },
            phone_numbers: [
              { tel: "02-0000-0000" }
            ]
          }
        },
        "application/json",
      );
    }

    if (resolved.startsWith("https://www.opinet.co.kr/api/aroundAll.do?")) {
      return makeResponse(aroundResponse, "application/json");
    }

    if (resolved.includes("detailById.do") && resolved.includes("id=A1000001")) {
      return makeResponse(detailA1000001, "application/json");
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchCheapGasStationsByLocationQuery("서울역", {
    apiKey: "test-opinet-key",
    limit: 1,
    detailLimit: 1,
    fetchImpl
  });

  assert.equal(result.anchor.id, "1002");
  assert.equal(result.anchor.name, "서울역 1호선");
  assert.equal(result.anchor.latitude, 37.55513);
  assert.equal(result.anchor.longitude, 126.97253);
  assert.deepEqual(
    calls.filter((url) => url.startsWith("https://place-api.map.kakao.com/places/panel3/")),
    [
      "https://place-api.map.kakao.com/places/panel3/1001",
      "https://place-api.map.kakao.com/places/panel3/1002"
    ]
  );
});

test("searchCheapGasStationsByLocationQuery keeps score-ranked Kakao fallback order after the best panel fails", async () => {
  const gangnamSearchHtml = `
    <ul>
      <li class="search_item base" data-id="2001" data-title="강남대로">
        <strong class="tit_g">강남대로</strong>
        <span class="txt_ginfo">거리</span>
        <span class="txt_g">서울 강남구</span>
      </li>
      <li class="search_item base" data-id="2002" data-title="강남역">
        <strong class="tit_g">강남역</strong>
        <span class="txt_ginfo">지하철역</span>
        <span class="txt_g">서울 강남구 역삼동</span>
      </li>
      <li class="search_item base" data-id="2003" data-title="강남역 11번출구">
        <strong class="tit_g">강남역 11번출구</strong>
        <span class="txt_ginfo">지하철역</span>
        <span class="txt_g">서울 강남구 역삼동</span>
      </li>
    </ul>
  `;
  const calls = [];
  const fetchImpl = async (url) => {
    const resolved = String(url);
    calls.push(resolved);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EA%B0%95%EB%82%A8%EC%97%AD")) {
      return makeResponse(gangnamSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/2002") {
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/2003") {
      return makeResponse(
        {
          summary: {
            confirm_id: "2003",
            name: "강남역 11번출구",
            category: {
              name3: "지하철역"
            },
            address: {
              disp: "서울 강남구 역삼동"
            },
            point: {
              lon: 127.028,
              lat: 37.498
            }
          }
        },
        "application/json",
      );
    }

    if (resolved.startsWith("https://www.opinet.co.kr/api/aroundAll.do?")) {
      return makeResponse(aroundResponse, "application/json");
    }

    if (resolved.includes("detailById.do") && resolved.includes("id=A1000001")) {
      return makeResponse(detailA1000001, "application/json");
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchCheapGasStationsByLocationQuery("강남역", {
    apiKey: "test-opinet-key",
    limit: 1,
    detailLimit: 1,
    fetchImpl
  });

  assert.equal(result.anchor.id, "2003");
  assert.equal(result.anchor.name, "강남역 11번출구");
  assert.deepEqual(
    calls.filter((url) => url.startsWith("https://place-api.map.kakao.com/places/panel3/")),
    [
      "https://place-api.map.kakao.com/places/panel3/2002",
      "https://place-api.map.kakao.com/places/panel3/2003"
    ]
  );
});

test("searchCheapGasStationsByLocationQuery rejects non-numeric limit and detailLimit values instead of returning an empty list", async () => {
  await assert.rejects(
    searchCheapGasStationsByLocationQuery("37.55472,126.97068", {
      apiKey: "test-opinet-key",
      limit: "abc",
      fetchImpl: async () => {
        throw new Error("fetch should not run for invalid limit input");
      }
    }),
    /limit must be a finite number/i,
  );

  await assert.rejects(
    searchCheapGasStationsByLocationQuery("37.55472,126.97068", {
      apiKey: "test-opinet-key",
      detailLimit: "abc",
      fetchImpl: async () => {
        throw new Error("fetch should not run for invalid detailLimit input");
      }
    }),
    /detailLimit must be a finite number/i,
  );
});

function makeResponse(body, contentType) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": contentType
    }
  });
}
