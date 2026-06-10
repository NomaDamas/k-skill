const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ENDPOINTS,
  TossApiError,
  TossCredentialsError,
  clearTokenCache,
  issueAccessToken,
  getAccessToken,
  buildAuthHeaders,
  buildAccountHeaders,
  getOrderbook,
  getPrices,
  getTrades,
  getPriceLimits,
  getCandles,
  getStocks,
  getStockWarnings,
  getExchangeRate,
  getMarketCalendarKR,
  getMarketCalendarUS,
  listOfficialAccounts,
  getHoldings,
  listOpenOrders,
  getOrderDetail,
  getBuyingPower,
  getSellableQuantity,
  getCommissions
} = require("../src/official-client");

const CLIENT_ID = "c_test_id";
const CLIENT_SECRET = "s_super_secret_value";
const ACCESS_TOKEN = "eyJhbGciOiJ.access.token";
const BASE_URL = "https://openapi.tossinvest.com";

function jsonResponse({ status = 200, body = {}, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

// Builds a fetch mock from an ordered queue of responses (or response factories).
// Records every call's url, method, headers, and body.
function makeFetch(queue) {
  const calls = [];
  const responses = Array.isArray(queue) ? [...queue] : [queue];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body });
    if (responses.length === 0) {
      throw new Error(`Unexpected fetch call (no queued response) for ${url}`);
    }
    const next = responses.shift();
    return typeof next === "function" ? next() : next;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const tokenOk = () =>
  jsonResponse({ body: { access_token: ACCESS_TOKEN, token_type: "Bearer", expires_in: 86400 } });

function baseOptions(extra = {}) {
  return {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    baseUrl: BASE_URL,
    env: {},
    now: () => 1_000_000,
    sleep: async () => {},
    ...extra
  };
}

test.beforeEach(() => {
  clearTokenCache();
});

test("issueAccessToken posts client_credentials form body to /oauth2/token", async () => {
  const fetchImpl = makeFetch([tokenOk()]);
  const result = await issueAccessToken(baseOptions({ fetch: fetchImpl }));

  assert.equal(result.accessToken, ACCESS_TOKEN);
  assert.equal(result.tokenType, "Bearer");
  assert.equal(result.expiresIn, 86400);

  const call = fetchImpl.calls[0];
  assert.equal(call.url, `${BASE_URL}/oauth2/token`);
  assert.equal(call.method, "POST");
  assert.equal(call.headers["Content-Type"], "application/x-www-form-urlencoded");
  const params = new URLSearchParams(call.body);
  assert.equal(params.get("grant_type"), "client_credentials");
  assert.equal(params.get("client_id"), CLIENT_ID);
  assert.equal(params.get("client_secret"), CLIENT_SECRET);
});

test("getAccessToken caches the token and reuses it across calls", async () => {
  const fetchImpl = makeFetch([tokenOk(), tokenOk()]);
  const opts = baseOptions({ fetch: fetchImpl });

  const first = await getAccessToken(opts);
  const second = await getAccessToken(opts);

  assert.equal(first, ACCESS_TOKEN);
  assert.equal(second, ACCESS_TOKEN);
  const tokenCalls = fetchImpl.calls.filter((c) => c.url.endsWith("/oauth2/token"));
  assert.equal(tokenCalls.length, 1, "token endpoint should be hit exactly once");
});

test("getAccessToken refreshes after expiry", async () => {
  const fetchImpl = makeFetch([
    jsonResponse({ body: { access_token: "tok-1", token_type: "Bearer", expires_in: 100 } }),
    jsonResponse({ body: { access_token: "tok-2", token_type: "Bearer", expires_in: 100 } })
  ]);
  let clock = 1_000_000;
  const opts = baseOptions({ fetch: fetchImpl, now: () => clock });

  const first = await getAccessToken(opts);
  assert.equal(first, "tok-1");

  // Advance beyond expiry (100s ttl minus 60s skew => ~40s of validity).
  clock += 200_000;
  const second = await getAccessToken(opts);
  assert.equal(second, "tok-2");

  const tokenCalls = fetchImpl.calls.filter((c) => c.url.endsWith("/oauth2/token"));
  assert.equal(tokenCalls.length, 2);
});

test("market helpers send only the bearer header (no account header)", async () => {
  const fetchImpl = makeFetch([tokenOk(), jsonResponse({ body: { result: { price: "72000" } } })]);
  const res = await getPrices(["005930", "AAPL"], baseOptions({ fetch: fetchImpl, account: "1" }));

  assert.deepEqual(res.data, { result: { price: "72000" } });
  const apiCall = fetchImpl.calls.find((c) => c.url.includes("/api/v1/prices"));
  assert.equal(apiCall.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.equal(apiCall.headers["X-Tossinvest-Account"], undefined);
});

test("getPrices and getStocks comma-join multiple symbols per the OpenAPI symbols param", async () => {
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({ body: { result: [] } }),
    jsonResponse({ body: { result: [] } })
  ]);
  const opts = baseOptions({ fetch: fetchImpl });

  await getPrices(["005930", "000660", "AAPL"], opts);
  await getStocks(["005930", "AAPL"], opts);

  const pricesCall = fetchImpl.calls.find((c) => c.url.includes("/api/v1/prices"));
  const stocksCall = fetchImpl.calls.find((c) => c.url.includes("/api/v1/stocks"));
  assert.equal(new URL(pricesCall.url).searchParams.get("symbols"), "005930,000660,AAPL");
  assert.equal(new URL(stocksCall.url).searchParams.get("symbols"), "005930,AAPL");
});

test("account helpers send X-Tossinvest-Account header when account is configured", async () => {
  const fetchImpl = makeFetch([tokenOk(), jsonResponse({ body: { result: { holdings: [] } } })]);
  const res = await getHoldings(baseOptions({ fetch: fetchImpl, account: "42" }));

  assert.deepEqual(res.data, { result: { holdings: [] } });
  const apiCall = fetchImpl.calls.find((c) => c.url.includes("/api/v1/holdings"));
  assert.equal(apiCall.headers["X-Tossinvest-Account"], "42");
  assert.equal(apiCall.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
});

test("account-required helper throws TossCredentialsError before any network call when account is missing", async () => {
  const fetchImpl = makeFetch([]);
  await assert.rejects(
    () => getHoldings(baseOptions({ fetch: fetchImpl })),
    (error) => error instanceof TossCredentialsError && /X-Tossinvest-Account/.test(error.message)
  );
  assert.equal(fetchImpl.calls.length, 0, "no fetch should occur for a missing account header");
});

test("listOfficialAccounts is bearer-only and does not require an account header", async () => {
  const fetchImpl = makeFetch([tokenOk(), jsonResponse({ body: { result: [{ accountSeq: 1 }] } })]);
  const res = await listOfficialAccounts(baseOptions({ fetch: fetchImpl }));

  assert.deepEqual(res.data, { result: [{ accountSeq: 1 }] });
  const apiCall = fetchImpl.calls.find((c) => c.url.includes("/api/v1/accounts"));
  assert.equal(apiCall.headers["X-Tossinvest-Account"], undefined);
  assert.equal(ENDPOINTS.listOfficialAccounts.requiresAccount, false);
});

test("error envelope is parsed into TossApiError with code, message, requestId, httpStatus", async () => {
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({
      status: 404,
      body: { error: { requestId: "REQ-1", code: "stock-not-found", message: "no such stock" } }
    })
  ]);

  await assert.rejects(
    () => getStockWarnings("ZZZZ", baseOptions({ fetch: fetchImpl })),
    (error) => {
      assert.ok(error instanceof TossApiError);
      assert.equal(error.code, "stock-not-found");
      assert.equal(error.requestId, "REQ-1");
      assert.equal(error.httpStatus, 404);
      assert.match(error.message, /stock-not-found/);
      return true;
    }
  );
});

test("requestId falls back to the X-Request-Id header when absent from the body", async () => {
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({
      status: 500,
      headers: { "X-Request-Id": "HDR-REQ-9" },
      body: { error: { code: "internal-error", message: "boom" } }
    })
  ]);

  await assert.rejects(
    () => getCommissions(baseOptions({ fetch: fetchImpl, account: "1" })),
    (error) => error instanceof TossApiError && error.requestId === "HDR-REQ-9"
  );
});

test("thrown errors never expose the client_secret or the access token", async () => {
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({
      status: 400,
      body: {
        error: {
          requestId: "REQ-2",
          code: "invalid-request",
          message: `leaked ${CLIENT_SECRET} and ${ACCESS_TOKEN}`,
          data: { secret: CLIENT_SECRET, token: ACCESS_TOKEN }
        }
      }
    })
  ]);

  await assert.rejects(
    () => getBuyingPower(baseOptions({ fetch: fetchImpl, account: "1" })),
    (error) => {
      const serialized = `${error.message} ${JSON.stringify(error.data)}`;
      assert.ok(!serialized.includes(CLIENT_SECRET), "client_secret must be redacted");
      assert.ok(!serialized.includes(ACCESS_TOKEN), "access token must be redacted");
      assert.match(serialized, /\[REDACTED\]/);
      return true;
    }
  );
});

test("a 401 re-issues the token exactly once, then throws on a second 401", async () => {
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({ status: 401, body: { error: { code: "expired-token", message: "expired", requestId: "R1" } } }),
    tokenOk(),
    jsonResponse({ status: 401, body: { error: { code: "expired-token", message: "expired", requestId: "R2" } } })
  ]);

  await assert.rejects(
    () => getHoldings(baseOptions({ fetch: fetchImpl, account: "1" })),
    (error) => error instanceof TossApiError && error.code === "expired-token"
  );

  const tokenCalls = fetchImpl.calls.filter((c) => c.url.endsWith("/oauth2/token"));
  assert.equal(tokenCalls.length, 2, "token should be re-issued exactly once after the first 401");
});

test("a 401 followed by success retries with a fresh token", async () => {
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({ status: 401, body: { error: { code: "expired-token", message: "expired", requestId: "R1" } } }),
    tokenOk(),
    jsonResponse({ body: { result: { ok: true } } })
  ]);

  const res = await getHoldings(baseOptions({ fetch: fetchImpl, account: "1" }));
  assert.deepEqual(res.data, { result: { ok: true } });
});

test("429 waits Retry-After then retries and succeeds", async () => {
  const slept = [];
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({
      status: 429,
      headers: { "Retry-After": "2", "X-RateLimit-Remaining": "0" },
      body: { error: { code: "rate-limit-exceeded", message: "slow down" } }
    }),
    jsonResponse({ body: { result: { price: "1" } }, headers: { "X-RateLimit-Limit": "10", "X-RateLimit-Remaining": "9" } })
  ]);

  const res = await getPrices(
    "005930",
    baseOptions({ fetch: fetchImpl, account: "1", sleep: async (ms) => slept.push(ms) })
  );

  assert.deepEqual(res.data, { result: { price: "1" } });
  assert.equal(res.rateLimit.limit, 10);
  assert.equal(res.rateLimit.remaining, 9);
  assert.deepEqual(slept, [2000], "should wait Retry-After seconds (in ms)");
});

test("429 beyond maxRetries throws a TossApiError", async () => {
  const slept = [];
  const fetchImpl = makeFetch([
    tokenOk(),
    jsonResponse({ status: 429, headers: { "Retry-After": "1" }, body: { error: { code: "rate-limit-exceeded", message: "slow" } } }),
    jsonResponse({ status: 429, headers: { "Retry-After": "1" }, body: { error: { code: "rate-limit-exceeded", message: "slow" } } })
  ]);

  await assert.rejects(
    () =>
      getPrices(
        "005930",
        baseOptions({ fetch: fetchImpl, account: "1", maxRetries: 1, sleep: async (ms) => slept.push(ms) })
      ),
    (error) => error instanceof TossApiError && error.code === "rate-limit-exceeded" && error.httpStatus === 429
  );
  assert.equal(slept.length, 1, "should retry exactly maxRetries times before throwing");
});

test("missing client credentials throws TossCredentialsError without echoing secrets", async () => {
  const fetchImpl = makeFetch([]);
  await assert.rejects(
    () => getPrices("005930", { fetch: fetchImpl, env: {} }),
    (error) =>
      error instanceof TossCredentialsError &&
      /TOSSINVEST_CLIENT_ID/.test(error.message) &&
      !error.message.includes(CLIENT_SECRET)
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test("buildAuthHeaders and buildAccountHeaders construct the expected header sets", () => {
  assert.deepEqual(buildAuthHeaders("abc"), { Authorization: "Bearer abc" });
  assert.deepEqual(buildAccountHeaders("abc", 7), {
    Authorization: "Bearer abc",
    "X-Tossinvest-Account": "7"
  });
  assert.throws(() => buildAccountHeaders("abc", ""), TossCredentialsError);
  assert.throws(() => buildAuthHeaders(""), TossCredentialsError);
});

test("each read-only helper builds the correct path, query, headers, and path params", async () => {
  const opts = (fetchImpl) => baseOptions({ fetch: fetchImpl, account: "5" });
  const cases = [
    { run: (o) => getOrderbook("005930", o), path: "/api/v1/orderbook", query: { symbol: "005930" }, account: false },
    { run: (o) => getTrades("005930", { ...o, count: 30 }), path: "/api/v1/trades", query: { symbol: "005930", count: "30" }, account: false },
    { run: (o) => getPriceLimits("005930", o), path: "/api/v1/price-limits", query: { symbol: "005930" }, account: false },
    { run: (o) => getCandles("005930", { ...o, interval: "1d", count: 50 }), path: "/api/v1/candles", query: { symbol: "005930", interval: "1d", count: "50" }, account: false },
    { run: (o) => getStockWarnings("005930", o), path: "/api/v1/stocks/005930/warnings", query: {}, account: false },
    { run: (o) => getExchangeRate({ ...o, from: "USD", to: "KRW" }), path: "/api/v1/exchange-rate", query: { from: "USD", to: "KRW" }, account: false },
    { run: (o) => getMarketCalendarKR({ ...o, date: "2026-06-09" }), path: "/api/v1/market-calendar/KR", query: { date: "2026-06-09" }, account: false },
    { run: (o) => getMarketCalendarUS(o), path: "/api/v1/market-calendar/US", query: {}, account: false },
    { run: (o) => listOpenOrders(o), path: "/api/v1/orders", query: { status: "OPEN" }, account: true },
    { run: (o) => getOrderDetail("ORD-1", o), path: "/api/v1/orders/ORD-1", query: {}, account: true },
    { run: (o) => getBuyingPower({ ...o, currency: "KRW" }), path: "/api/v1/buying-power", query: { currency: "KRW" }, account: true },
    { run: (o) => getSellableQuantity("005930", o), path: "/api/v1/sellable-quantity", query: { symbol: "005930" }, account: true }
  ];

  for (const tc of cases) {
    clearTokenCache();
    const fetchImpl = makeFetch([tokenOk(), jsonResponse({ body: { result: {} } })]);
    await tc.run(opts(fetchImpl));
    const apiCall = fetchImpl.calls.find((c) => !c.url.endsWith("/oauth2/token"));
    const parsed = new URL(apiCall.url);
    assert.equal(parsed.pathname, tc.path, `path for ${tc.path}`);
    for (const [k, v] of Object.entries(tc.query)) {
      assert.equal(parsed.searchParams.get(k), v, `query ${k} for ${tc.path}`);
    }
    if (tc.account) {
      assert.equal(apiCall.headers["X-Tossinvest-Account"], "5", `account header for ${tc.path}`);
    } else {
      assert.equal(apiCall.headers["X-Tossinvest-Account"], undefined, `no account header for ${tc.path}`);
    }
  }
});

test("module exposes no order mutation helpers (read-only safety contract)", () => {
  const mod = require("../src/official-client");
  assert.equal(mod.placeOrder, undefined);
  assert.equal(mod.createOrder, undefined);
  assert.equal(mod.modifyOrder, undefined);
  assert.equal(mod.cancelOrder, undefined);
});
