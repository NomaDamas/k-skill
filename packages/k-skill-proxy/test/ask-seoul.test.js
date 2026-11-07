const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeAskSeoulWeatherRiskQuery,
  proxyAskSeoulWeatherRiskRequest
} = require("../src/ask-seoul");
const { buildServer } = require("../src/server");

test("ASK Seoul weather-risk data query only forwards its documented read-only filters", () => {
  assert.deepEqual(
    normalizeAskSeoulWeatherRiskQuery("data", {
      place_id: "seoul_admd_1171052000",
      from: "2026-08-01",
      to: "2026-08-02",
      limit: "25",
      cursor: "cursor-1"
    }),
    {
      place_id: "seoul_admd_1171052000",
      from: "2026-08-01",
      to: "2026-08-02",
      limit: "25",
      cursor: "cursor-1"
    }
  );

  assert.throws(
    () => normalizeAskSeoulWeatherRiskQuery("data", { sql: "SELECT * FROM _keys" }),
    /not exposed/
  );
  assert.throws(
    () => normalizeAskSeoulWeatherRiskQuery("bundle", { ignored: "value" }),
    /does not accept query parameters/
  );
});

test("ASK Seoul weather-risk upstream call injects the service key only at the proxy boundary", async () => {
  const calls = [];
  const upstream = await proxyAskSeoulWeatherRiskRequest({
    operation: "data",
    params: { place_id: "seoul_admd_1171052000", limit: "25" },
    baseUrl: "https://ask-seoul.example.test",
    apiKey: "proxy-only-key-example",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
  });

  assert.equal(upstream.statusCode, 200);
  assert.equal(upstream.body, '{"rows":[]}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ask-seoul.example.test/skill/v1/products/weather_place_risk_window/data?place_id=seoul_admd_1171052000&limit=25");
  assert.equal(calls[0].init.headers.authorization, "Bearer proxy-only-key-example");
  assert.equal(calls[0].init.redirect, "error");
  assert.doesNotMatch(calls[0].url, /proxy-only-key-example/);
});

test("ASK Seoul weather-risk route caches successful calls and rejects unexposed query fields", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      bundle_id: "seoul-weather-risk",
      product_id: "weather_place_risk_window",
      rows: [],
      row_count: 0
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  };

  const app = buildServer({ env: {
    ASK_SEOUL_SKILL_API_BASE_URL: "https://ask-seoul.example.test",
    ASK_SEOUL_KSKILL_API_KEY: "proxy-only-key-example"
  } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/ask-seoul/weather-risk/data?place_id=seoul_admd_1171052000&limit=25"
  });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), {
    bundle_id: "seoul-weather-risk",
    product_id: "weather_place_risk_window",
    rows: [],
    row_count: 0
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.authorization, "Bearer proxy-only-key-example");

  const second = await app.inject({
    method: "GET",
    url: "/v1/ask-seoul/weather-risk/data?place_id=seoul_admd_1171052000&limit=25"
  });
  assert.equal(second.statusCode, 200);
  assert.equal(calls.length, 1, "successful responses should be served from the bounded cache");

  const rejected = await app.inject({
    method: "GET",
    url: "/v1/ask-seoul/weather-risk/data?sql=SELECT%20*%20FROM%20_keys"
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.json().error, "bad_request");
  assert.equal(calls.length, 1, "rejected query parameters must not reach ASK Seoul");
});

test("ASK Seoul weather-risk proxy never caches a malformed successful response", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "upstream_contract_broken" }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  };

  const app = buildServer({ env: {
    ASK_SEOUL_SKILL_API_BASE_URL: "https://ask-seoul.example.test",
    ASK_SEOUL_KSKILL_API_KEY: "proxy-only-key-example"
  } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({ method: "GET", url: "/v1/ask-seoul/weather-risk/data?limit=25" });
  const second = await app.inject({ method: "GET", url: "/v1/ask-seoul/weather-risk/data?limit=25" });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 2, "malformed 200 responses must not poison the cache");
});

test("proxy health reveals ASK Seoul weather-risk readiness without revealing service credentials", async (t) => {
  const app = buildServer({ env: {
    ASK_SEOUL_SKILL_API_BASE_URL: "https://ask-seoul.example.test",
    ASK_SEOUL_KSKILL_API_KEY: "proxy-only-key-example"
  } });
  t.after(async () => {
    await app.close();
  });

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().upstreams.askSeoulWeatherRiskConfigured, true);
  assert.doesNotMatch(health.body, /proxy-only-key-example|ask-seoul\.example\.test/);
});
