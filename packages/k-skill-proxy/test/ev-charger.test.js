const test = require("node:test");
const assert = require("node:assert/strict");

const { buildServer } = require("../src/server");
const {
  EV_CHARGER_BASE_URL,
  EV_CHARGER_UPSTREAM_TIMEOUT_MS,
  extractEvChargerPayload,
  fetchEvCharger,
  normalizeEvChargerQuery
} = require("../src/ev-charger");

test("EV charger normalizers apply defaults and narrow operation filters", () => {
  assert.deepEqual(normalizeEvChargerQuery("info", {
    zcode: "11",
    zscode: "11680",
    statId: "ME000001",
    chgerId: "01",
    location: "서울 강남구",
    pageNo: "2",
    numOfRows: "100"
  }), {
    operation: "info",
    upstreamOperation: "getChargerInfo",
    pageNo: 2,
    numOfRows: 100,
    zcode: "11",
    zscode: "11680",
    statId: "ME000001",
    chgerId: "01"
  });

  assert.deepEqual(normalizeEvChargerQuery("status", {
    statId: "ME000001",
    limitYn: "y",
    period: "10"
  }), {
    operation: "status",
    upstreamOperation: "getChargerStatus",
    pageNo: 1,
    numOfRows: 10,
    statId: "ME000001",
    limitYn: "Y",
    period: 10
  });
});

test("EV charger info resolves a unique location to exact official region codes", () => {
  assert.deepEqual(normalizeEvChargerQuery("info", { location: "서울 강남구" }), {
    operation: "info",
    upstreamOperation: "getChargerInfo",
    pageNo: 1,
    numOfRows: 10,
    zcode: "11",
    zscode: "11680"
  });
});

test("EV charger normalizers reject caller-controlled auth/format and malformed filters", () => {
  assert.throws(() => normalizeEvChargerQuery("info", { serviceKey: "caller-key" }), /serviceKey/);
  assert.throws(() => normalizeEvChargerQuery("info", { dataType: "XML" }), /dataType/);
  assert.throws(() => normalizeEvChargerQuery("info", { pageNo: "1.5" }), /pageNo/);
  assert.throws(() => normalizeEvChargerQuery("info", { numOfRows: "10000" }), /numOfRows/);
  assert.throws(() => normalizeEvChargerQuery("info", { zcode: "123" }), /zcode/);
  assert.throws(() => normalizeEvChargerQuery("info", { zscode: "abc" }), /zscode/);
  assert.throws(() => normalizeEvChargerQuery("status", { limitYn: "maybe" }), /limitYn/);
  assert.throws(() => normalizeEvChargerQuery("status", { period: "0" }), /period/);
  assert.throws(() => normalizeEvChargerQuery("status", { location: "서울" }), /location/);
  assert.throws(() => normalizeEvChargerQuery("info", { statId: "x".repeat(41) }), /statId/);
});

test("EV charger pagination and status period use official bounds", () => {
  for (const numOfRows of [10, 9999]) {
    assert.equal(normalizeEvChargerQuery("info", { numOfRows }).numOfRows, numOfRows);
  }
  for (const numOfRows of [3, 10000]) {
    assert.throws(() => normalizeEvChargerQuery("info", { numOfRows }), /numOfRows/);
  }
  for (const period of [1, 10]) {
    assert.equal(normalizeEvChargerQuery("status", { period }).period, period);
  }
  assert.throws(() => normalizeEvChargerQuery("status", { period: 11 }), /period/);
});

test("EV charger payload extraction accepts direct and response envelopes", () => {
  assert.deepEqual(extractEvChargerPayload({
    pageNo: 1,
    numOfRows: 10,
    totalCount: 1,
    items: { item: { statId: "ME000001" } }
  }).items, [{ statId: "ME000001" }]);

  assert.deepEqual(extractEvChargerPayload({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { pageNo: 1, numOfRows: 10, totalCount: 0, items: "" }
    }
  }).items, []);
});

test("EV charger upstream timeout covers slow data.go.kr responses", () => {
  assert.equal(EV_CHARGER_UPSTREAM_TIMEOUT_MS, 90000);
});

test("EV charger payload extraction rejects flat semantic auth failures", () => {
  assert.throws(
    () => extractEvChargerPayload({
      resultCode: "30",
      resultMsg: "SERVICE KEY IS NOT REGISTERED",
      pageNo: 1,
      numOfRows: 10,
      totalCount: 0,
      items: ""
    }),
    /SERVICE KEY|resultCode=30/i
  );
});

test("EV charger fetch resolves location codes, injects the server key, and never leaks the key", async () => {
  let seenUrl = "";
  const result = await fetchEvCharger({
    params: normalizeEvChargerQuery("info", { location: "서울 강남구", numOfRows: 10 }),
    serviceKey: "server secret +/==",
    fetchImpl: async (url) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({
        pageNo: 1,
        numOfRows: 10,
        totalCount: 1,
        items: { item: [{ statId: "ME000001", statNm: "시청 충전소" }] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const parsedUrl = new URL(seenUrl);
  assert.equal(`${parsedUrl.origin}${parsedUrl.pathname}`, `${EV_CHARGER_BASE_URL}/getChargerInfo`);
  assert.equal(parsedUrl.searchParams.get("serviceKey"), "server secret +/==");
  assert.equal(parsedUrl.searchParams.get("dataType"), "JSON");
  assert.equal(parsedUrl.searchParams.get("zcode"), "11");
  assert.equal(parsedUrl.searchParams.get("zscode"), "11680");
  assert.equal(parsedUrl.searchParams.has("location"), false);
  assert.equal(result.error, undefined);
  assert.equal(result.total_count, 1);
  assert.equal(JSON.stringify(result).includes("server secret"), false);
});

test("EV charger info rejects unresolved locations before upstream fetch", async (t) => {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "proxy-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const queries = [
    { location: "존재하지않는지역" },
    { location: "중구" },
    { location: "서울 강남구", zcode: "26" },
    { location: "서울 강남구", zscode: "11110" }
  ];
  for (const query of queries) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/ev-charger/info?${new URLSearchParams(query)}`
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "bad_request");
  }
  assert.equal(callCount, 0);
});

test("EV charger fetch classifies semantic, XML, empty, and invalid JSON failures", async () => {
  const params = normalizeEvChargerQuery("status", { statId: "ME000001" });
  const cases = [
    new Response(JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" } } }), { status: 200 }),
    new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", { status: 200, headers: { "content-type": "application/xml" } }),
    new Response("", { status: 200 }),
    new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
  ];

  for (const response of cases) {
    const result = await fetchEvCharger({ params, serviceKey: "secret", fetchImpl: async () => response });
    assert.equal(result.status_code, 502);
    assert.match(result.error, /^upstream_/);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("EV charger routes validate before fetch, report missing key, and cache successes only", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      pageNo: 1,
      numOfRows: 10,
      totalCount: 1,
      items: { item: [{ statId: "ME000001", chgerId: "01", stat: "2" }] }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "proxy-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const malformed = await app.inject({ method: "GET", url: "/v1/ev-charger/status?limitYn=maybe" });
  assert.equal(malformed.statusCode, 400);
  assert.equal(calls.length, 0);

  const first = await app.inject({ method: "GET", url: "/v1/ev-charger/status?statId=ME000001" });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  const cached = await app.inject({ method: "GET", url: "/v1/ev-charger/status?statId=ME000001" });
  assert.equal(cached.statusCode, 200);
  assert.equal(cached.json().proxy.cache.hit, true);
  assert.equal(calls.length, 1);

  const missing = buildServer({ env: {} });
  t.after(() => missing.close());
  const unavailable = await missing.inject({
    method: "GET",
    url: `/v1/ev-charger/info?${new URLSearchParams({ location: "서울 강남구" })}`
  });
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().error, "upstream_not_configured");
});

test("EV charger semantic errors return 502 and are not cached", async (t) => {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return new Response(JSON.stringify({
      response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "must-not-leak" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({ method: "GET", url: "/v1/ev-charger/info?zcode=11" });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().error, "upstream_forbidden");
    assert.equal(response.body.includes("must-not-leak"), false);
  }
  assert.equal(callCount, 2);
});
