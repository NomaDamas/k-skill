const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildDatasetDownloadUrl,
  inferRegion,
  normalizePublicRestroomRows,
  parseCoordinateQuery,
  searchNearbyPublicRestroomsByCoordinates,
  searchNearbyPublicRestroomsByLocationQuery
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const anchorSearchHtml = fs.readFileSync(path.join(fixturesDir, "anchor-search.html"), "utf8");
const anchorPanel = JSON.parse(fs.readFileSync(path.join(fixturesDir, "anchor-panel.json"), "utf8"));
const csvFixture = fs.readFileSync(path.join(fixturesDir, "public-restrooms-seoul.csv"), "utf8");

test("parseCoordinateQuery recognizes latitude/longitude pairs", () => {
  assert.deepEqual(parseCoordinateQuery("37.573713, 126.978338"), {
    latitude: 37.573713,
    longitude: 126.978338
  });
  assert.equal(parseCoordinateQuery("광화문"), null);
});

test("inferRegion maps Korean region names to the official localdata orgCode", () => {
  assert.deepEqual(inferRegion("서울특별시 종로구 세종대로"), {
    name: "서울특별시",
    orgCode: "6110000_ALL"
  });
  assert.deepEqual(inferRegion("경기도 성남시 분당구"), {
    name: "경기도",
    orgCode: "6410000_ALL"
  });
  assert.equal(inferRegion("미상 주소"), null);
});

test("buildDatasetDownloadUrl defaults to the nationwide CSV and supports regional narrowing", () => {
  assert.equal(
    buildDatasetDownloadUrl(),
    "https://file.localdata.go.kr/file/download/public_restroom_info/info"
  );
  assert.equal(
    buildDatasetDownloadUrl({ orgCode: "6110000_ALL" }),
    "https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=6110000_ALL"
  );
});

test("normalizePublicRestroomRows keeps useful restroom metadata and sorts by distance", () => {
  const items = normalizePublicRestroomRows(csvFixture, {
    latitude: 37.57371315593711,
    longitude: 126.97833785777944
  });

  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => [item.id, item.name, item.type, item.address]),
    [
      ["202530000000100863", "통인시장 고객만족센터", "공중화장실", "서울특별시 종로구 자하문로 15길 18"],
      ["202530000000100830", "보건소", "개방화장실", "서울특별시 종로구 자하문로19길 36"],
      ["202530000000100842", "종로문화체육센터", "개방화장실", "서울특별시 종로구 인왕산로1길 21"]
    ]
  );
  assert.ok(items[0].distanceMeters < items[1].distanceMeters);
  const cultureCenter = items.find((item) => item.id === "202530000000100842");
  assert.equal(cultureCenter.openTimeDetail, "09:00~18:00");
  assert.equal(
    cultureCenter.mapUrl,
    "https://map.kakao.com/link/map/%EC%A2%85%EB%A1%9C%EB%AC%B8%ED%99%94%EC%B2%B4%EC%9C%A1%EC%84%BC%ED%84%B0,37.57428,126.96468"
  );
  assert.equal(cultureCenter.hasBabyChangingTable, true);
  assert.equal(cultureCenter.hasEmergencyBell, true);
});

test("normalizePublicRestroomRows collapses identical restroom rows from the official CSV", () => {
  const duplicatedCsv = `${csvFixture.trim()}\n${csvFixture.trim().split("\n")[1]}\n`;
  const items = normalizePublicRestroomRows(duplicatedCsv, {
    latitude: 37.57371315593711,
    longitude: 126.97833785777944
  });

  assert.equal(items.length, 3);
  assert.equal(
    items.filter((item) => item.id === "202530000000100842").length,
    1
  );
});

test("normalizePublicRestroomRows can prefer the anchor district over suspicious cross-district coordinates", () => {
  const weightedCsv = `${csvFixture.trim()}\n3000000,999999999999999999,개방화장실,법제3조제16호-영제3조제1항제1호,멀리있는구청,서울특별시 서대문구 통일로 1,서울특별시 서대문구 냉천동 1,1,1,0,0,0,0,1,0,0,테스트기관,0212345678,정시,09:00~18:00,,37.57372,126.97834,공공기관-지방자치단체,수세식,Y,N,,N,N,,,2024-12-31,I,2026-03-24 03:27:16,2025-11-10 09:45:40\n`;
  const items = normalizePublicRestroomRows(weightedCsv, {
    latitude: 37.57371315593711,
    longitude: 126.97833785777944
  }, {
    preferredDistrict: "종로구"
  });

  assert.notEqual(items[0].name, "멀리있는구청");
  assert.equal(items[0].address.includes("종로구"), true);
});

test("searchNearbyPublicRestroomsByCoordinates queries the official CSV and returns nearest normalized items", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return makeResponse(Buffer.from(csvFixture, "utf8"));
  };

  const result = await searchNearbyPublicRestroomsByCoordinates({
    latitude: 37.57371315593711,
    longitude: 126.97833785777944,
    limit: 2,
    fetchImpl
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, "통인시장 고객만족센터");
  assert.equal(result.meta.datasetUrl, "https://file.localdata.go.kr/file/download/public_restroom_info/info");
  assert.deepEqual(calls, ["https://file.localdata.go.kr/file/download/public_restroom_info/info"]);
});

test("searchNearbyPublicRestroomsByCoordinates forwards maxDistanceMeters to the CSV normalization path", async () => {
  const result = await searchNearbyPublicRestroomsByCoordinates({
    latitude: 37.57371315593711,
    longitude: 126.97833785777944,
    limit: 5,
    maxDistanceMeters: 100,
    fetchImpl: async () => makeResponse(Buffer.from(csvFixture, "utf8"))
  });

  assert.equal(result.items.length, 0);
  assert.equal(result.meta.total, 0);
});

test("searchNearbyPublicRestroomsByLocationQuery resolves a Kakao anchor, narrows to the regional CSV, and returns nearest restrooms", async () => {
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

    if (resolved === "https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=6110000_ALL") {
      return makeResponse(Buffer.from(csvFixture, "utf8"));
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchNearbyPublicRestroomsByLocationQuery("광화문", {
    limit: 2,
    fetchImpl
  });

  assert.equal(result.anchor.name, "광화문");
  assert.equal(result.anchor.address, "서울특별시 종로구 세종대로 172");
  assert.equal(result.meta.region.name, "서울특별시");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, "종로문화체육센터");
  assert.deepEqual(calls, [
    "https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8",
    "https://place-api.map.kakao.com/places/panel3/1001",
    "https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=6110000_ALL"
  ]);
});

test("searchNearbyPublicRestroomsByLocationQuery falls through to later Kakao candidates when a panel request fails", async () => {
  const calls = [];
  const multiCandidateSearchHtml = `
    <ul>
      <li class="search_item base" data-id="1001" data-title="광화문">
        <strong class="tit_g">광화문</strong>
        <span class="txt_ginfo">역사유적지</span>
        <span class="txt_g">서울특별시 종로구 세종로 1-68</span>
      </li>
      <li class="search_item base" data-id="1002" data-title="광화문광장">
        <strong class="tit_g">광화문광장</strong>
        <span class="txt_ginfo">광장</span>
        <span class="txt_g">서울특별시 종로구 세종대로 172</span>
      </li>
    </ul>
  `;
  const fallbackPanel = {
    summary: {
      ...anchorPanel.summary,
      confirm_id: "1002",
      name: "광화문광장"
    }
  };
  const fetchImpl = async (url) => {
    const resolved = String(url);
    calls.push(resolved);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8")) {
      return makeResponse(multiCandidateSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return { ok: false, status: 500 };
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1002") {
      return makeResponse(fallbackPanel, "application/json");
    }

    if (resolved === "https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=6110000_ALL") {
      return makeResponse(Buffer.from(csvFixture, "utf8"));
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchNearbyPublicRestroomsByLocationQuery("광화문", {
    limit: 2,
    fetchImpl
  });

  assert.equal(result.anchor.id, "1002");
  assert.equal(result.anchor.name, "광화문광장");
  assert.equal(result.items.length, 2);
  assert.deepEqual(calls, [
    "https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8",
    "https://place-api.map.kakao.com/places/panel3/1001",
    "https://place-api.map.kakao.com/places/panel3/1002",
    "https://file.localdata.go.kr/file/download/public_restroom_info/info?orgCode=6110000_ALL"
  ]);
});

test("searchNearbyPublicRestroomsByLocationQuery still surfaces non-HTTP Kakao panel errors", async () => {
  const fetchImpl = async (url) => {
    const resolved = String(url);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8")) {
      return makeResponse(anchorSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      throw new Error("socket hang up");
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  await assert.rejects(
    searchNearbyPublicRestroomsByLocationQuery("광화문", {
      fetchImpl
    }),
    /socket hang up/
  );
});

function makeResponse(body, contentType = "text/csv;charset=UTF-8") {
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
      return Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    },
    async arrayBuffer() {
      return Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
    }
  };
}
