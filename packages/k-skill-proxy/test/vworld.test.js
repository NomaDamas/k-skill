const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isVWorldSuccessBody,
  normalizeVWorldPriceQuery,
  normalizeVWorldSearchQuery,
  projectVWorldBody,
  proxyVWorldRequest
} = require("../src/vworld");
const { buildServer } = require("../src/server");

test("normalizes only the allowlisted VWorld search surface", () => {
  assert.deepEqual(
    normalizeVWorldSearchQuery({
      query: "강나루현대",
      type: "place",
      size: "100",
      page: "1",
      domain: "apartment-price-mcp.warmjin.com"
    }),
    {
      query: "강나루현대",
      type: "place",
      category: null,
      size: 100,
      page: 1,
      domain: "apartment-price-mcp.warmjin.com"
    }
  );

  assert.deepEqual(
    normalizeVWorldSearchQuery({ query: "서울 강서구 가양동 448-1", type: "address", category: "parcel" }),
    {
      query: "서울 강서구 가양동 448-1",
      type: "address",
      category: "parcel",
      size: 100,
      page: 1,
      domain: null
    }
  );

  assert.throws(() => normalizeVWorldSearchQuery({ query: "x", type: "road" }), /type/);
  assert.throws(() => normalizeVWorldSearchQuery({ query: "x", key: "must-not-be-in-query" }), /key/);
  assert.throws(() => normalizeVWorldSearchQuery({ query: "x", size: "101" }), /size/);
});

test("normalizes and bounds VWorld apartment-price pagination and unit filters", () => {
  assert.deepEqual(
    normalizeVWorldPriceQuery({
      pnu: "1150010400104480001",
      stdrYear: "2026",
      pageNo: "2",
      numOfRows: "1000",
      dongNm: "101",
      hoNm: "1601",
      domain: "apartment-price-mcp.warmjin.com"
    }),
    {
      pnu: "1150010400104480001",
      stdrYear: "2026",
      pageNo: 2,
      numOfRows: 1000,
      dongNm: "101",
      hoNm: "1601",
      domain: "apartment-price-mcp.warmjin.com"
    }
  );

  assert.throws(() => normalizeVWorldPriceQuery({ pnu: "115", stdrYear: "2026" }), /pnu/);
  assert.throws(
    () => normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "2026", dongNm: "101" }),
    /dongNm and hoNm/
  );
  assert.throws(
    () => normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "2026", numOfRows: "1001" }),
    /numOfRows/
  );
  assert.throws(() => normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "0000" }), /stdrYear/);
  assert.throws(() => normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "9999" }), /stdrYear/);
});

test("forwards the header credential only to the fixed VWorld host and redacts echoed secrets", async () => {
  const calls = [];
  const secret = "synthetic+/=credential";
  const result = await proxyVWorldRequest({
    operation: "search",
    params: normalizeVWorldSearchQuery({ query: "강나루현대", type: "place" }),
    apiKey: secret,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(
        JSON.stringify({ response: { status: "OK", result: { items: [] }, echoedUrl: String(url) } }),
        { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
      );
    }
  });

  const upstream = new URL(calls[0].url);
  assert.equal(upstream.origin, "https://api.vworld.kr");
  assert.equal(upstream.pathname, "/req/search");
  assert.equal(upstream.searchParams.get("key"), secret);
  assert.equal(calls[0].options.headers.accept, "application/json");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(result.statusCode, 200);
  assert.doesNotMatch(result.body, new RegExp(secret));
  assert.doesNotMatch(result.body, new RegExp(encodeURIComponent(secret)));
  assert.doesNotMatch(result.body, /echoedUrl/);
});

test("requires a credential and recognizes only semantic VWorld successes", async () => {
  await assert.rejects(
    proxyVWorldRequest({
      operation: "prices",
      params: normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "2026" }),
      apiKey: ""
    }),
    (error) => error.code === "upstream_not_configured" && error.statusCode === 503
  );

  assert.equal(
    isVWorldSuccessBody("search", '{"response":{"status":"OK","result":{"items":[]}}}'),
    true
  );
  assert.equal(isVWorldSuccessBody("search", '{"response":{"status":"ERROR"}}'), false);
  assert.equal(
    isVWorldSuccessBody(
      "prices",
      '{"apartHousingPrices":{"resultCode":"","totalCount":"0","pageNo":"1","numOfRows":"1000","field":[]}}'
    ),
    true
  );
  assert.equal(
    isVWorldSuccessBody("prices", '{"apartHousingPrices":{"resultCode":"AUTH"}}'),
    false
  );
  assert.equal(isVWorldSuccessBody("search", '{"response":{"status":"OK","result":{}}}'), false);
  assert.equal(
    isVWorldSuccessBody("prices", '{"apartHousingPrices":{"resultCode":"","field":[]}}'),
    false
  );
  assert.equal(
    isVWorldSuccessBody(
      "prices",
      '{"apartHousingPrices":{"resultCode":"","totalCount":"1","pageNo":"2","numOfRows":"1000","field":[]}}',
      { pageNo: 1, numOfRows: 1000, pnu: "1150010400104480001", stdrYear: "2026" }
    ),
    false
  );
  assert.equal(
    isVWorldSuccessBody(
      "prices",
      '{"apartHousingPrices":{"resultCode":"","totalCount":"1","pageNo":"1","numOfRows":"1000","field":[{"pnu":"9999999999999999999","stdrYear":"2026"}]}}',
      { pageNo: 1, numOfRows: 1000, pnu: "1150010400104480001", stdrYear: "2026" }
    ),
    false
  );
  assert.equal(
    isVWorldSuccessBody(
      "search",
      '{"response":{"status":"OK","result":{"items":[],"page":"2","query":"other"}}}',
      { page: 1, size: 100, query: "강나루현대", type: "place", category: null }
    ),
    false
  );
});

test("response projection replaces upstream error codes with fixed safe values", () => {
  const secret = "SYNTHETICSECRET";
  const search = JSON.parse(projectVWorldBody(
    "search",
    JSON.stringify({ response: { status: secret, error: { code: secret, text: secret } } }),
    secret
  ));
  const prices = JSON.parse(projectVWorldBody(
    "prices",
    JSON.stringify({ apartHousingPrices: { resultCode: secret, resultMsg: secret } }),
    secret
  ));

  assert.deepEqual(search, {
    response: {
      status: "ERROR",
      error: { code: "UPSTREAM_ERROR", text: "VWorld search request failed." }
    }
  });
  assert.deepEqual(prices, {
    apartHousingPrices: {
      resultCode: "UPSTREAM_ERROR",
      resultMsg: "VWorld apartment-price request failed."
    }
  });
});

test("response projection fails closed for malformed and deeply nested credential encodings", () => {
  const secret = "SyntheticSecret";
  let deeplyEncoded = secret;
  for (let depth = 0; depth < 32; depth += 1) {
    deeplyEncoded = encodeURIComponent(deeplyEncoded);
  }
  const projected = JSON.parse(projectVWorldBody(
    "search",
    JSON.stringify({
      response: {
        status: "OK",
        result: {
          items: [{
            id: "1150010400104480001",
            title: "%ZZ%53ynthetic%53ecret",
            address: { parcel: deeplyEncoded, road: "서울 강서구" }
          }]
        }
      }
    }),
    secret
  ));

  assert.equal(projected.response.result.items[0].title, "[REDACTED]");
  assert.equal(projected.response.result.items[0].address.parcel, "[REDACTED]");
});

test("response projection never truncates an invalid price identity into a valid one", () => {
  const body = projectVWorldBody(
    "prices",
    JSON.stringify({
      apartHousingPrices: {
        resultCode: "",
        resultMsg: "",
        totalCount: "1",
        pageNo: "1",
        numOfRows: "1000",
        field: [{
          pnu: "11500104001044800010",
          stdrYear: "2026-extra",
          aphusNm: "강나루현대",
          dongNm: "101",
          hoNm: "1601",
          floorNm: "16",
          prvuseAr: "59.76",
          pblntfPc: "587000000"
        }]
      }
    }),
    "synthetic-secret"
  );
  const record = JSON.parse(body).apartHousingPrices.field[0];

  assert.equal(record.pnu, "11500104001044800010");
  assert.equal(record.stdrYear, "2026-extra");
});

test("response projection never truncates invalid pagination into the requested page", () => {
  const body = projectVWorldBody(
    "prices",
    JSON.stringify({
      apartHousingPrices: {
        resultCode: "",
        resultMsg: "",
        totalCount: "1",
        pageNo: `${"0".repeat(31)}19`,
        numOfRows: `${"0".repeat(28)}10009`,
        field: []
      }
    }),
    "synthetic-secret"
  );

  assert.equal(
    isVWorldSuccessBody("prices", body, { pageNo: 1, numOfRows: 1000 }),
    false
  );
});

test("rejects redirected VWorld responses even when a custom fetch ignores redirect:error", async () => {
  await assert.rejects(
    proxyVWorldRequest({
      operation: "search",
      params: normalizeVWorldSearchQuery({ query: "강나루현대", type: "place" }),
      apiKey: "synthetic-secret",
      fetchImpl: async () => ({
        redirected: true,
        url: "https://redirected.example/",
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => '{"response":{"status":"OK","result":{"items":[]}}}'
      })
    }),
    (error) => error.code === "upstream_error" && error.statusCode === 502
  );
});

test("sanitizes VWorld response-body read failures", async () => {
  const secret = "synthetic-secret";
  await assert.rejects(
    proxyVWorldRequest({
      operation: "search",
      params: normalizeVWorldSearchQuery({ query: "강나루현대", type: "place" }),
      apiKey: secret,
      fetchImpl: async () => ({
        redirected: false,
        url: "https://api.vworld.kr/req/search",
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => {
          throw new Error(`body failed at https://api.vworld.kr/req/search?key=${secret}`);
        }
      })
    }),
    (error) =>
      error.code === "upstream_error" &&
      error.statusCode === 502 &&
      error.message === "VWorld upstream response body failed." &&
      !error.message.includes(secret)
  );
});

test("rejects VWorld response bodies above the bounded streaming limit", async () => {
  await assert.rejects(
    proxyVWorldRequest({
      operation: "search",
      params: normalizeVWorldSearchQuery({ query: "강나루현대", type: "place" }),
      apiKey: "synthetic-secret",
      fetchImpl: async () => new Response("x".repeat(2 * 1024 * 1024 + 1))
    }),
    (error) =>
      error.code === "upstream_error" &&
      error.statusCode === 502 &&
      error.message === "VWorld upstream response body failed."
  );
});

test("VWorld search route delegates its header credential, caches success, and never accepts query credentials", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({ response: { status: "OK", result: { items: [{ id: "1150010400104480001" }] } } }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/vworld/search?query=%EA%B0%95%EB%82%98%EB%A3%A8%ED%98%84%EB%8C%80&type=place&domain=apartment-price-mcp.warmjin.com";
  const first = await app.inject({
    method: "GET",
    url,
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });
  const second = await app.inject({
    method: "GET",
    url,
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });
  const missing = await app.inject({ method: "GET", url });
  const queryCredential = await app.inject({
    method: "GET",
    url: `${url}&key=query-secret`,
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });

  assert.equal(first.statusCode, 200);
  assert.deepEqual(second.json(), first.json());
  assert.equal(calls.length, 1, "the second valid request should reuse a successful cached body");
  assert.match(calls[0], /^https:\/\/api\.vworld\.kr\/req\/search\?/);
  assert.match(calls[0], /key=delegated-secret/);
  assert.equal(missing.statusCode, 503);
  assert.equal(queryCredential.statusCode, 400);
  assert.doesNotMatch(first.body, /delegated-secret/);
  assert.doesNotMatch(missing.body, /delegated-secret/);
  assert.equal(first.headers["cache-control"], "private, no-store");
  assert.equal(first.headers.vary, "x-k-skill-vworld-api-key");
});

test("VWorld apartment-price route preserves JSON and never caches price pages", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const body = calls === 1
      ? { apartHousingPrices: { resultCode: "AUTH", resultMsg: "invalid", field: [] } }
      : {
          apartHousingPrices: {
            resultCode: "",
            resultMsg: "",
            totalCount: "1",
            pageNo: "1",
            numOfRows: "1000",
            field: [{ pblntfPc: "587000000" }]
          }
        };
    return Response.json(body);
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const request = {
    method: "GET",
    url: "/v1/vworld/apartment-prices?pnu=1150010400104480001&stdrYear=2026&pageNo=1&numOfRows=1000&dongNm=101&hoNm=1601",
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  };
  const failed = await app.inject(request);
  const recovered = await app.inject(request);
  const cached = await app.inject(request);

  assert.equal(failed.statusCode, 200);
  assert.equal(failed.json().apartHousingPrices.resultCode, "UPSTREAM_ERROR");
  assert.equal(recovered.json().apartHousingPrices.field[0].pblntfPc, "587000000");
  assert.deepEqual(cached.json(), recovered.json());
  assert.equal(calls, 3, "price pages must never be cached across independent snapshots");
});

test("VWorld routes do not cache structurally incomplete success envelopes", async (t) => {
  const originalFetch = global.fetch;
  let searchCalls = 0;
  let priceCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes("/req/search")) {
      searchCalls += 1;
      return Response.json({ response: { status: "OK", result: {} } });
    }
    priceCalls += 1;
    return Response.json({ apartHousingPrices: { resultCode: "", field: [] } });
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  const headers = { "x-k-skill-vworld-api-key": "delegated-secret" };
  const searchUrl = "/v1/vworld/search?query=test&type=place";
  const priceUrl = "/v1/vworld/apartment-prices?pnu=1150010400104480001&stdrYear=2026";

  await app.inject({ method: "GET", url: searchUrl, headers });
  await app.inject({ method: "GET", url: searchUrl, headers });
  await app.inject({ method: "GET", url: priceUrl, headers });
  await app.inject({ method: "GET", url: priceUrl, headers });

  assert.equal(searchCalls, 2);
  assert.equal(priceCalls, 2);
});

test("VWorld apartment-price route rejects mismatched page identities and caches nothing", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return Response.json({
      apartHousingPrices: {
        resultCode: "",
        resultMsg: "",
        totalCount: "1",
        pageNo: calls === 1 ? "2" : "1",
        numOfRows: "1000",
        field: []
      }
    });
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  const request = {
    method: "GET",
    url: "/v1/vworld/apartment-prices?pnu=1150010400104480001&stdrYear=2026&pageNo=1&numOfRows=1000",
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  };

  const wrongPage = await app.inject(request);
  const recovered = await app.inject(request);
  const again = await app.inject(request);

  assert.equal(wrongPage.statusCode, 502);
  assert.equal(wrongPage.json().error, "upstream_error");
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.json().apartHousingPrices.pageNo, "1");
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.json(), recovered.json());
  assert.equal(calls, 3, "rejected identities and successful price pages must never be cached");
});

test("VWorld apartment-price route rejects mismatched row pnu/year/unit identity", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => Response.json({
    apartHousingPrices: {
      resultCode: "",
      resultMsg: "",
      totalCount: "1",
      pageNo: "1",
      numOfRows: "1000",
      field: [{
        pnu: "9999999999999999999",
        stdrYear: "2025",
        dongNm: "102",
        hoNm: "9999",
        pblntfPc: "1"
      }]
    }
  });
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/vworld/apartment-prices?pnu=1150010400104480001&stdrYear=2026&pageNo=1&numOfRows=1000&dongNm=101&hoNm=1601",
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "upstream_error");
  assert.match(response.json().message, /mismatched apartment-price/i);
});

test("VWorld search route rejects mismatched pagination identity before caching", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return Response.json({
      response: {
        status: "OK",
        result: {
          items: [{ id: "1", title: "ok", address: { parcel: "a", road: "b" } }],
          page: "9",
          size: "100",
          query: "other",
          type: "place"
        }
      }
    });
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const request = {
    method: "GET",
    url: "/v1/vworld/search?query=강나루현대&type=place&page=1&size=100",
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  };
  const first = await app.inject(request);
  const second = await app.inject(request);

  assert.equal(first.statusCode, 502);
  assert.equal(first.json().error, "upstream_error");
  assert.equal(second.statusCode, 502);
  assert.equal(calls, 2, "mismatched search identities must not be cached");
});

test("credential-scoped cache and projected responses reject reversible credential encodings", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    const key = new URL(url).searchParams.get("key");
    const unicodeEscaped = [...key]
      .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join("");
    let repeatedlyEncoded = key;
    for (let depth = 0; depth < 10; depth += 1) {
      repeatedlyEncoded = encodeURIComponent(repeatedlyEncoded);
    }
    return Response.json({
      response: {
        status: "OK",
        result: {
          items: [{
            id: "1150010400104480001",
            title: unicodeEscaped,
            address: { parcel: repeatedlyEncoded, road: "서울 강서구" }
          }]
        },
        echoedUrl: String(url)
      }
    });
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  const url = "/v1/vworld/search?query=encoded-cache-test&type=place";
  const secret = "synthetic+/=credential";
  const first = await app.inject({
    method: "GET",
    url,
    headers: { "x-k-skill-vworld-api-key": secret }
  });
  const second = await app.inject({
    method: "GET",
    url,
    headers: { "x-k-skill-vworld-api-key": "different-credential" }
  });

  assert.equal(calls, 2, "different credentials must not share a successful-response cache entry");
  for (const body of [first.body, second.body]) {
    const payload = JSON.parse(body);
    assert.equal(payload.response.result.items[0].title, "[REDACTED]");
    assert.equal(payload.response.result.items[0].address.parcel, "[REDACTED]");
    assert.equal(payload.response.echoedUrl, undefined);
    assert.doesNotMatch(body, new RegExp(encodeURIComponent(encodeURIComponent(secret))));
  }
});
