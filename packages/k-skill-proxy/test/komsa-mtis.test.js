const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeKomsaFerryQuery,
  fetchKomsaFerryInfo
} = require("../src/komsa-mtis");
const { buildServer } = require("../src/server");

test("normalizeKomsaFerryQuery allowlists datasets and normalizes filters", () => {
  assert.deepEqual(normalizeKomsaFerryQuery("schedules", {
    date: "2026-08-24",
    vessel: " 섬사랑12호 ",
    route: "향화-낙월",
    page: "2",
    limit: "20"
  }), {
    dataset: "schedules",
    endpoint: "oprt-schd-info",
    pageNo: "2",
    numOfRows: "20",
    rlvtYmd: "20260824",
    psnshpNm: "섬사랑12호"
  });
  assert.throws(() => normalizeKomsaFerryQuery("unknown", {}), /Unsupported dataset/);
  assert.throws(() => normalizeKomsaFerryQuery("schedules", { date: "2026-02-30" }), /valid date/);
});

test("fetchKomsaFerryInfo sends the official camelCase schedule parameters", async () => {
  let requestedUrl;
  const result = await fetchKomsaFerryInfo({
    serviceKey: "test-key",
    ...normalizeKomsaFerryQuery("schedules", {
      date: "2026-08-24",
      vessel: "섬사랑12호"
    }),
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return new Response(JSON.stringify({
        response: {
          header: { resultCode: "200", resultMsg: "NORMAL_SERVICE" },
          body: { pageNo: 1, numOfRows: 1, totalCount: 0, items: { item: [] } }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  assert.equal(result.error, undefined);
  assert.equal(requestedUrl.searchParams.get("rlvtYmd"), "20260824");
  assert.equal(requestedUrl.searchParams.get("psnshpNm"), "섬사랑12호");
  assert.equal(requestedUrl.searchParams.get("rlvt_ymd"), null);
  assert.equal(requestedUrl.searchParams.get("psnshp_nm"), null);
});

test("normalizeKomsaFerryQuery uses official parameter names per dataset", () => {
  assert.equal(normalizeKomsaFerryQuery("ports", { port: "소청", region: "인천광역시" }).portclNm, "소청");
  assert.equal(
    normalizeKomsaFerryQuery("ports", { port: "소청", region: "인천광역시" }).admdstCtpvNm,
    "인천광역시"
  );
  assert.equal(normalizeKomsaFerryQuery("license-routes", { route: "향화-낙월" }).lcnsSeawyNm, "향화-낙월");
  assert.equal(normalizeKomsaFerryQuery("operation-routes", { route: "향화낙월" }).nvgSeawyNm, "향화낙월");
  assert.deepEqual(
    normalizeKomsaFerryQuery("status", { date: "2026-08-24", time: "730", vessel: "섬사랑12호" }),
    {
      dataset: "status",
      endpoint: "oprt-stts-info",
      pageNo: "1",
      numOfRows: "10",
      rlvtYmd: "20260824",
      sailTm: "730",
      psnshpNm: "섬사랑12호"
    }
  );
});

test("fetchKomsaFerryInfo injects the server key and parses JSON", async () => {
  let requested;
  const result = await fetchKomsaFerryInfo({
    serviceKey: "server-secret",
    fetchImpl: async (url) => {
      requested = new URL(url);
      return new Response(JSON.stringify({
        response: {
          header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
          body: { totalCount: 1, pageNo: 1, numOfRows: 10, items: { item: [{ psnshp_nm: "섬사랑12호" }] } }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    ...normalizeKomsaFerryQuery("schedules", { date: "20260824" })
  });

  assert.equal(requested.pathname, "/eopt/api/oprt-schd-info");
  assert.equal(requested.searchParams.get("serviceKey"), "server-secret");
  assert.equal(requested.searchParams.get("type"), "json");
  assert.equal(result.items[0].psnshp_nm, "섬사랑12호");
  assert.equal(JSON.stringify(result).includes("server-secret"), false);
});

test("KOMSA route returns 503 without an operator key and serves a cached success", async (t) => {
  const missing = buildServer({ env: {} });
  t.after(async () => missing.close());
  const unavailable = await missing.inject({
    method: "GET",
    url: "/v1/komsa/ferry/schedules?date=20260824"
  });
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().error, "upstream_not_configured");

  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: "00" },
        body: { totalCount: 1, pageNo: 1, numOfRows: 10, items: { item: [{ psnshp_nm: "테스트호" }] } }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({ env: { KOMSA_MTIS_API_KEY: "test-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  const first = await app.inject({ method: "GET", url: "/v1/komsa/ferry/schedules?date=20260824" });
  const second = await app.inject({ method: "GET", url: "/v1/komsa/ferry/schedules?date=20260824" });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(calls, 1);
  assert.doesNotMatch(first.body, /test-key/);
});
