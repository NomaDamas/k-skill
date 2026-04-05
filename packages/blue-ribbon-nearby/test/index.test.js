const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildNearbySearchParams,
  findZoneMatches,
  normalizeNearbyItem,
  parseZoneCatalogHtml,
  searchNearbyByCoordinates,
  searchNearbyByLocationQuery
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const zoneHtml = fs.readFileSync(path.join(fixturesDir, "search-zone.html"), "utf8");
const mapPayload = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "restaurants-map.json"), "utf8")
);
const landmarkZoneHtml = `
  <a href="/search?query=&zone1=${encodeURIComponent("서울 강남")}&zone2=${encodeURIComponent("삼성동/대치동")}&zone2Lat=37.511310&zone2Lng=127.059330">삼성동/대치동</a>
  <a href="/search?query=&zone1=${encodeURIComponent("서울 강북")}&zone2=${encodeURIComponent("남대문/서울역/후암동")}&zone2Lat=37.555000&zone2Lng=126.972000">남대문/서울역/후암동</a>
`;

test("parseZoneCatalogHtml extracts official zone anchors and coordinates", () => {
  const zones = parseZoneCatalogHtml(zoneHtml);

  assert.equal(zones.length, 3);
  assert.deepEqual(zones[0], {
    zone1: "서울 강북",
    zone2: "광화문/종로2가",
    latitude: 37.57371315593711,
    longitude: 126.97833785777944,
    href:
      "https://www.bluer.co.kr/search?query=&zone1=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%B6%81&zone2=%EA%B4%91%ED%99%94%EB%AC%B8/%EC%A2%85%EB%A1%9C2%EA%B0%80&zone2Lat=37.57371315593711&zone2Lng=126.97833785777944"
  });
});

test("findZoneMatches prefers exact and partial official-zone matches", () => {
  const zones = parseZoneCatalogHtml(zoneHtml);
  const exact = findZoneMatches("광화문", zones, { limit: 1 });
  const partial = findZoneMatches("서울 성수", zones, { limit: 1 });

  assert.equal(exact[0].zone.zone2, "광화문/종로2가");
  assert.equal(partial[0].zone.zone2, "성수동");
  assert.ok(exact[0].score > partial[0].score / 2);
});

test("findZoneMatches resolves documented landmark aliases like 코엑스 to the nearest official zone", () => {
  const zones = parseZoneCatalogHtml(landmarkZoneHtml);
  const [match] = findZoneMatches("코엑스", zones, { limit: 1 });

  assert.equal(match.zone.zone2, "삼성동/대치동");
});

test("buildNearbySearchParams encodes the official nearby ribbon query for a matched zone", () => {
  const [firstZone] = parseZoneCatalogHtml(zoneHtml);
  const params = buildNearbySearchParams({ zone: firstZone, distanceMeters: 1000, sort: "distance" });

  assert.equal(params.zone1, "서울 강북");
  assert.equal(params.zone2, "광화문/종로2가");
  assert.equal(params.zone2Lat, "37.57371315593711");
  assert.equal(params.zone2Lng, "126.97833785777944");
  assert.equal(params.distance, "1000");
  assert.equal(params.isAround, "true");
  assert.equal(params.ribbon, "true");
  assert.equal(params.ribbonType, "RIBBON_THREE,RIBBON_TWO,RIBBON_ONE");
  assert.equal(params.sort, "distance");
});

test("normalizeNearbyItem exposes the public restaurant summary with computed distance", () => {
  const item = normalizeNearbyItem(mapPayload.items[0], {
    latitude: 37.57371315593711,
    longitude: 126.97833785777944
  });

  assert.equal(item.id, 29209);
  assert.equal(item.name, "유유안");
  assert.equal(item.address, "서울특별시 종로구 새문안로 97");
  assert.equal(item.ribbonType, "RIBBON_TWO");
  assert.equal(item.ribbonCount, 2);
  assert.ok(item.distanceMeters > 0);
  assert.deepEqual(item.foodTypes.slice(0, 2), ["중식", "광동식중식"]);
});

test("searchNearbyByLocationQuery resolves documented landmark aliases like 코엑스", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).includes("/search/zone")) {
      return makeResponse(200, landmarkZoneHtml, "text/html");
    }

    if (String(url).includes("/restaurants/map")) {
      return makeResponse(200, mapPayload, "application/json");
    }

    return makeResponse(404, "not found", "text/plain");
  };

  try {
    const result = await searchNearbyByLocationQuery("코엑스", {
      distanceMeters: 1000,
      limit: 5
    });

    assert.equal(result.anchor.zone2, "삼성동/대치동");
    assert.equal(result.candidates[0].zone.zone2, "삼성동/대치동");
    assert.equal(result.candidates[0].matchedBy, "alias");
    assert.equal(result.items.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchNearbyByLocationQuery resolves a zone match, fetches the official nearby map payload, and normalizes the top results", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).includes("/search/zone")) {
      return makeResponse(200, zoneHtml, "text/html");
    }

    if (String(url).includes("/restaurants/map")) {
      return makeResponse(200, mapPayload, "application/json");
    }

    return makeResponse(404, "not found", "text/plain");
  };

  try {
    const result = await searchNearbyByLocationQuery("광화문", {
      distanceMeters: 1000,
      limit: 5
    });

    assert.equal(result.anchor.zone2, "광화문/종로2가");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].name, "유유안");
    assert.equal(result.items[0].ribbonCount, 2);
    assert.equal(result.meta.total, 3);
    assert.ok(result.items.every((item) => item.ribbonCount > 0));
    assert.doesNotMatch(
      JSON.stringify(result.items),
      /정통삼계탕/,
      "non-ribbon restaurants should be filtered out even if the upstream payload includes them",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchNearbyByLocationQuery surfaces PREMIUM_REQUIRED with a stable domain error", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).includes("/search/zone")) {
      return makeResponse(200, zoneHtml, "text/html");
    }

    if (String(url).includes("/restaurants/map")) {
      return makeResponse(403, { error: "PREMIUM_REQUIRED" }, "application/json");
    }

    return makeResponse(404, "not found", "text/plain");
  };

  try {
    await assert.rejects(
      () =>
        searchNearbyByLocationQuery("광화문", {
          distanceMeters: 1000,
          limit: 5
        }),
      assertPremiumRequiredError
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchNearbyByCoordinates surfaces PREMIUM_REQUIRED with the same domain error", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).includes("/restaurants/map")) {
      return makeResponse(403, { error: "PREMIUM_REQUIRED" }, "application/json");
    }

    return makeResponse(404, "not found", "text/plain");
  };

  try {
    await assert.rejects(
      () =>
        searchNearbyByCoordinates({
          latitude: 37.57371315593711,
          longitude: 126.97833785777944,
          distanceMeters: 1000,
          limit: 5
        }),
      assertPremiumRequiredError
    );
  } finally {
    global.fetch = originalFetch;
  }
});

function assertPremiumRequiredError(error) {
  return (
    error.statusCode === 403 &&
    error.code === "premium_required" &&
    error.upstreamError === "PREMIUM_REQUIRED" &&
    error.upstreamUrl.includes("/restaurants/map") &&
    /premium/i.test(error.message)
  );
}

function makeResponse(status, body, contentType) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: {
      "content-type": contentType
    }
  });
}
