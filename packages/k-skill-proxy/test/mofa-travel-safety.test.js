const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildServer,
  normalizeMofaTravelAlarmQuery
} = require("../src/server");

test("MOFA normalizer accepts ISO country filtering and bounded pagination", () => {
  assert.deepEqual(normalizeMofaTravelAlarmQuery({
    page: "1",
    perPage: "5",
    country_iso_alp2: "ru"
  }), {
    page: 1,
    perPage: 5,
    countryIsoAlp2: "RU"
  });
  assert.throws(() => normalizeMofaTravelAlarmQuery({
    country_iso_alp2: "RUS"
  }), /two-letter/);
});

test("MOFA route injects service key, normalizes success, and caches", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: "0", resultMsg: "정상" },
        body: {
          totalCount: 1,
          currentCount: 1,
          items: { item: [{
            country_nm: "러시아",
            country_iso_alp2: "RU",
            alarm_lvl: 4,
            region_ty: "일부",
            remark: "공식 경보 원문"
          }] }
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "mofa-secret" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/mofa-travel-safety/travel-alerts?country_iso_alp2=RU&perPage=1";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().items[0].country_nm, "러시아");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.match(calls[0], /cond%5Bcountry_iso_alp2%3A%3AEQ%5D=RU/);
  assert.doesNotMatch(JSON.stringify(first.json()), /mofa-secret/);
});

test("MOFA route reports missing key", async (t) => {
  const app = buildServer({ env: {} });
  t.after(async () => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/v1/mofa-travel-safety/travel-alerts?country_iso_alp2=RU"
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("MOFA live E2E reaches the official endpoint when explicitly enabled", { skip: !process.env.KSKILL_LIVE_E2E }, async () => {
  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: process.env.DATA_GO_KR_API_KEY
    }
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/mofa-travel-safety/travel-alerts?country_iso_alp2=RU&perPage=1"
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().items.length > 0);
    assert.equal(response.json().items[0].country_iso_alp2, "RU");
  } finally {
    await app.close();
  }
});

function mofaFetchFailure(code) {
  const error = new TypeError("fetch failed");
  error.cause = Object.assign(new Error(code), { code });
  return error;
}

test("MOFA route surfaces upstream connect timeout as 504 upstream_timeout with cause and route", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw mofaFetchFailure("UND_ERR_CONNECT_TIMEOUT");
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "mofa-secret" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/mofa-travel-safety/travel-alerts?country_iso_alp2=RU&perPage=1";
  const response = await app.inject({ method: "GET", url });
  assert.equal(response.statusCode, 504);
  assert.equal(response.json().error, "upstream_timeout");
  assert.equal(response.json().upstream.failure, "upstream_timeout");
  assert.equal(response.json().upstream.cause, "UND_ERR_CONNECT_TIMEOUT");
  assert.equal(response.json().upstream.route, url);
});

test("MOFA route surfaces DNS failures as 503 upstream_unreachable", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw mofaFetchFailure("ENOTFOUND");
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "mofa-secret" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mofa-travel-safety/travel-alerts?country_iso_alp2=RU&perPage=1"
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_unreachable");
  assert.equal(response.json().upstream.cause, "ENOTFOUND");
});

test("MOFA route keeps upstream HTTP error responses distinct from network failures", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" }, body: {} }
  }), { status: 403, headers: { "content-type": "application/json" } });
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "mofa-secret" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mofa-travel-safety/travel-alerts?country_iso_alp2=RU&perPage=1"
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "upstream_error");
});
