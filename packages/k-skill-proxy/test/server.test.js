const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildServer,
  createMemoryCache,
  isFailureResponse,
  makeCacheKey,
  normalizeData4LibraryBookDetailQuery,
  normalizeData4LibraryBookExistsQuery,
  normalizeData4LibraryBookSearchQuery,
  normalizeData4LibraryLibrariesByBookQuery,
  normalizeData4LibraryLibrarySearchQuery,
  normalizeKakaoLocalGeocodeQuery,
  normalizeKosisDataQuery,
  normalizeKosisMetaQuery,
  normalizeKosisSearchQuery,
  normalizeKstartupQuery,
  normalizeNtsBusinessStatusQuery,
  normalizeNtsBusinessValidateQuery,
  proxyAirKoreaRequest,
  proxyData4LibraryRequest,
  proxyHrfcoWaterLevelRequest,
  proxyKakaoLocalRequest,
  proxyKosisRequest,
  proxyKmaWeatherRequest,
  proxySeoulBikeRealtimeRequest,
  proxySeoulBikeStationsRequest,
  proxySeoulCityDataRequest,
  proxySeoulSubwayRequest
} = require("../src/server");
const { resolveEducationOfficeFromNaturalLanguage } = require("../src/neis-office-codes");

test("makeCacheKey requires a non-empty route to prevent cross-route collisions", () => {
  assert.throws(() => makeCacheKey({ q: "강남" }), /route/);
  assert.throws(() => makeCacheKey({ route: "", q: "강남" }), /route/);
  assert.throws(() => makeCacheKey(null), /route/);
  assert.throws(() => makeCacheKey(undefined), /route/);

  const sameShapeA = makeCacheKey({ route: "alpha", q: "x" });
  const sameShapeB = makeCacheKey({ route: "beta", q: "x" });
  assert.notEqual(sameShapeA, sameShapeB, "different routes must yield different cache keys");

  const duplicate = makeCacheKey({ route: "alpha", q: "x" });
  assert.equal(sameShapeA, duplicate, "same input must produce same key");
});

test("isFailureResponse flags explicit errors, upstream degradation, and empty-items-with-warnings", () => {
  assert.equal(isFailureResponse({ error: "bad_request", message: "..." }), true);
  assert.equal(isFailureResponse({ upstream: { degraded: true } }), true);
  assert.equal(
    isFailureResponse({ items: [], warnings: ["upstream invalid"] }),
    true,
    "empty items plus warnings must be treated as failure"
  );

  assert.equal(isFailureResponse({ items: [{ id: 1 }], warnings: ["sample feed"] }), false,
    "non-empty items with warnings is a graceful fallback, not a failure");
  assert.equal(isFailureResponse({ items: [] }), false, "empty items alone is valid (zero hits)");
  assert.equal(isFailureResponse({ warnings: [] }), false);
  assert.equal(isFailureResponse({ forecast: [], baseDate: "20260420" }), false,
    "routes without items/warnings convention pass through");
  assert.equal(isFailureResponse(null), false);
  assert.equal(isFailureResponse("string"), false);
});

test("createMemoryCache refuses to store failure responses", () => {
  const cache = createMemoryCache();

  assert.equal(cache.set("k1", { items: [], warnings: ["upstream invalid"] }, 60000), false);
  assert.equal(cache.get("k1"), null, "failure payload must not be persisted");

  assert.equal(cache.set("k2", { error: "bad_request" }, 60000), false);
  assert.equal(cache.get("k2"), null);

  assert.equal(cache.set("k3", { upstream: { degraded: true } }, 60000), false);
  assert.equal(cache.get("k3"), null);

  assert.equal(cache.set("k4", { items: [{ id: 1 }] }, 60000), true);
  assert.deepEqual(cache.get("k4"), { items: [{ id: 1 }] }, "successful payload must be stored");
});

test("food-safety search does not cache upstream failures so transient errors self-heal", async (t) => {
  const originalFetch = global.fetch;
  const recallCalls = [];
  let recallMode = "fail";
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("PrsecImproptFoodInfoService03/getPrsecImproptFoodList01")) {
      return new Response(
        JSON.stringify({ body: { items: [] } }),
        { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
      );
    }
    if (text.includes("openapi.foodsafetykorea.go.kr/api/live-food-key/I0490/json/1/50")) {
      recallCalls.push(recallMode);
      if (recallMode === "fail") {
        return new Response(
          "<script>alert('인증키가 유효하지 않습니다.'); history.back();</script>",
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }
      return new Response(
        JSON.stringify({
          I0490: {
            row: [
              {
                PRDLST_NM: "재시도 성공 식품",
                BSSH_NM: "회복푸드",
                RTRVLPRVNS: "회수 조치"
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
      );
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "data-go-key",
      FOODSAFETYKOREA_API_KEY: "live-food-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = `/v1/mfds/food-safety/search?query=${encodeURIComponent("재시도 성공 식품")}&limit=3`;

  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().items.length, 0);
  assert.match(first.json().warnings.join(" "), /not valid JSON/);
  assert.equal(first.json().proxy.cache.hit, false);

  recallMode = "ok";

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(
    second.json().proxy.cache.hit,
    false,
    "failure response must not have been cached - retry must hit upstream"
  );
  assert.equal(second.json().items.length, 1);
  assert.equal(second.json().items[0].product_name, "재시도 성공 식품");

  const third = await app.inject({ method: "GET", url });
  assert.equal(third.json().proxy.cache.hit, true, "successful payload must now be cached");
  assert.equal(third.json().items[0].product_name, "재시도 성공 식품");

  assert.equal(recallCalls.length, 2, "upstream hit on first (fail) and second (recovered) - third served from cache");
});

test("NTS business normalizers validate status and authenticity payloads", () => {
  const tooManyBusinessNumbers = Array.from({ length: 101 }, (_, index) => String(index).padStart(10, "0"));

  assert.deepEqual(normalizeNtsBusinessStatusQuery({ b_no: "123-45-67890, 9876543210" }), {
    b_no: ["1234567890", "9876543210"]
  });

  assert.deepEqual(
    normalizeNtsBusinessValidateQuery({
      businesses: [
        {
          b_no: "123-45-67890",
          start_dt: "2020-01-31",
          p_nm: "홍길동",
          b_nm: "테스트상사",
          corp_no: "110111-1234567"
        }
      ]
    }),
    {
      businesses: [
        {
          b_no: "1234567890",
          start_dt: "20200131",
          p_nm: "홍길동",
          b_nm: "테스트상사",
          corp_no: "1101111234567"
        }
      ]
    }
  );

  assert.throws(() => normalizeNtsBusinessStatusQuery({ b_no: "123" }), /business registration number/);
  assert.throws(
    () => normalizeNtsBusinessValidateQuery({ businesses: [{ b_no: "1234567890", p_nm: "홍길동" }] }),
    /start_dt/
  );
  assert.throws(
    () => normalizeNtsBusinessStatusQuery({ b_no: tooManyBusinessNumbers }),
    /up to 100/
  );
  assert.throws(
    () => normalizeNtsBusinessValidateQuery({
      businesses: [{ b_no: "1234567890", start_dt: "20200101", p_nm: "홍길동", corp_no: "123" }]
    }),
    /corp_no/
  );
  assert.throws(
    () => normalizeNtsBusinessValidateQuery({
      businesses: [{ b_no: "1234567890", start_dt: "20200101", p_nm: "홍".repeat(31) }]
    }),
    /p_nm/
  );
  assert.throws(
    () => normalizeNtsBusinessValidateQuery({
      businesses: [{ b_no: "1234567890", start_dt: "20200101", p_nm: "홍길동", b_adr: "가".repeat(501) }]
    }),
    /b_adr/
  );
});

test("NTS business status route proxies POST body with service key server-side", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({ status_code: "OK", request_cnt: 1, data: [{ b_no: "1234567890", b_stt: "계속사업자" }] }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["123-45-67890"] }
  });

  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.data[0].b_stt, "계속사업자");
  assert.equal(body.proxy.cache.hit, false);
  assert.match(calls[0].url, /\/nts-businessman\/v1\/status\?serviceKey=data-go-key$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { b_no: ["1234567890"] });
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");

  const cached = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["1234567890"] }
  });
  const cachedBody = cached.json();

  assert.equal(cached.statusCode, 200);
  assert.equal(cachedBody.proxy.cache.hit, true);
  assert.equal(calls.length, 1);
});

test("NTS business validate route normalizes businesses and reports missing key", async (t) => {
  const missingKeyApp = buildServer();
  t.after(async () => {
    await missingKeyApp.close();
  });

  const unavailable = await missingKeyApp.inject({
    method: "POST",
    url: "/v1/nts-business/validate",
    payload: { businesses: [{ b_no: "1234567890", start_dt: "20200101", p_nm: "홍길동" }] }
  });
  const unavailableBody = unavailable.json();

  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailableBody.error, "upstream_not_configured");

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({ status_code: "OK", valid_cnt: 1, data: [{ b_no: "1234567890", valid: "01", valid_msg: "확인할 수 있습니다." }] }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/nts-business/validate",
    payload: { businesses: [{ b_no: "123-45-67890", start_dt: "2020.01.01", p_nm: "홍길동", p_nm2: "", b_adr: "서울" }] }
  });

  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.data[0].valid, "01");
  assert.match(calls[0].url, /\/nts-businessman\/v1\/validate\?serviceKey=data-go-key$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    businesses: [{ b_no: "1234567890", start_dt: "20200101", p_nm: "홍길동", b_adr: "서울" }]
  });
});

test("NTS business validate route does not cache or echo sensitive query fields", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({
        status_code: "OK",
        valid_cnt: 1,
        data: [{
          b_no: "1234567890",
          valid: "01",
          request_param: {
            b_no: "1234567890",
            start_dt: "20200101",
            p_nm: "홍길동",
            b_adr: "서울시 중구"
          }
        }]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const payload = {
    businesses: [{
      b_no: "123-45-67890",
      start_dt: "2020.01.01",
      p_nm: "홍길동",
      b_adr: "서울시 중구"
    }]
  };

  const first = await app.inject({
    method: "POST",
    url: "/v1/nts-business/validate",
    payload
  });
  const firstBody = first.json();
  const firstBodyText = JSON.stringify(firstBody);

  assert.equal(first.statusCode, 200);
  assert.equal(firstBody.proxy.cache.hit, false);
  assert.equal(firstBody.query, undefined, "validate responses must not echo representative/date/address inputs");
  assert.equal(firstBodyText.includes("홍길동"), false);
  assert.equal(firstBodyText.includes("20200101"), false);
  assert.equal(firstBodyText.includes("서울시 중구"), false);
  assert.deepEqual(firstBody.data[0].request_param, { b_no: "1234567890" });

  const second = await app.inject({
    method: "POST",
    url: "/v1/nts-business/validate",
    payload
  });
  const secondBody = second.json();

  assert.equal(second.statusCode, 200);
  assert.equal(secondBody.proxy.cache.hit, false);
  assert.equal(calls.length, 2, "validate successes must not be cached because they contain sensitive inputs");
});

test("NTS business semantic upstream failures are non-cacheable errors", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ status_code: "SERVICE_ERROR", message: "upstream service failure" }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["1234567890"] }
  });
  const firstBody = first.json();

  assert.equal(first.statusCode, 502);
  assert.equal(firstBody.error, "upstream_error");
  assert.equal(firstBody.upstream_status_code, "SERVICE_ERROR");
  assert.equal(firstBody.proxy.cache.hit, false);

  const second = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["1234567890"] }
  });

  assert.equal(second.statusCode, 502);
  assert.equal(calls, 2, "semantic upstream failures must not be cached");
});

test("NTS business route maps upstream fetch failures to 502 without caching", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error("network down");
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["1234567890"] }
  });
  const firstBody = first.json();

  assert.equal(first.statusCode, 502);
  assert.equal(firstBody.error, "proxy_error");
  assert.equal(firstBody.message, "NTS business upstream request failed.");

  const second = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["1234567890"] }
  });
  assert.equal(second.statusCode, 502);
  assert.equal(calls, 2, "fetch failures must not be cached");
});

test("NTS business route does not leak service keys from upstream fetch exception messages", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    throw new Error(`proxy tunnel failed for ${url}`);
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "super-secret-data-go-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/nts-business/status",
    payload: { b_no: ["1234567890"] }
  });
  const body = response.json();
  const bodyText = JSON.stringify(body);

  assert.equal(response.statusCode, 502);
  assert.equal(body.error, "proxy_error");
  assert.equal(body.message, "NTS business upstream request failed.");
  assert.equal(bodyText.includes("super-secret-data-go-key"), false);
  assert.equal(bodyText.includes("serviceKey"), false);
});

test("health endpoint stays public and reports auth/upstream status", async (t) => {
  const app = buildServer({
    provider: async () => {
      throw new Error("provider should not be called");
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.auth.tokenRequired, false);
  assert.equal(body.upstreams.airKoreaConfigured, false);
  assert.equal(body.upstreams.kmaOpenApiConfigured, false);
  assert.equal(body.upstreams.krxConfigured, false);
  assert.equal(body.upstreams.seoulOpenApiConfigured, false);
  assert.equal(body.upstreams.hrfcoConfigured, false);
  assert.equal(body.upstreams.data4libraryConfigured, false);
});

test("health endpoint reports KRX upstream status when configured", async (t) => {
  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().upstreams.krxConfigured, true);
});

test("KOSIS normalizers map public query aliases to upstream params", () => {
  assert.deepEqual(normalizeKosisSearchQuery({ q: "인구", limit: "3" }), {
    method: "getList",
    format: "json",
    jsonVD: "Y",
    searchNm: "인구",
    resultCount: 3,
    startCount: 1
  });

  assert.deepEqual(normalizeKosisMetaQuery({ table_id: "DT_1IN0001", meta_type: "itm" }), {
    method: "getMeta",
    type: "ITM",
    format: "json",
    jsonVD: "Y",
    orgId: "101",
    tblId: "DT_1IN0001"
  });

  assert.deepEqual(normalizeKosisDataQuery({
    tableId: "DT_1JC1501",
    prd_se: "y",
    start: "2023",
    end: "2024",
    objL2: "00"
  }), {
    method: "getList",
    format: "json",
    jsonVD: "Y",
    orgId: "101",
    tblId: "DT_1JC1501",
    itmId: "ALL",
    prdSe: "Y",
    startPrdDe: "2023",
    endPrdDe: "2024",
    objL2: "00"
  });
});

test("KOSIS proxy injects the server-side key without accepting client apiKey", async () => {
  const calls = [];
  const upstream = await proxyKosisRequest({
    operation: "search",
    apiKey: "server-kosis-key",
    params: {
      method: "getList",
      format: "json",
      jsonVD: "Y",
      searchNm: "인구",
      resultCount: 1,
      startCount: 1,
      apiKey: "client-supplied-key"
    },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(upstream.statusCode, 200);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.origin + url.pathname, "https://kosis.kr/openapi/statisticsSearch.do");
  assert.equal(url.searchParams.get("apiKey"), "server-kosis-key");
  assert.equal(url.searchParams.get("searchNm"), "인구");
});

test("KOSIS search endpoint stays public and caches successful upstream responses", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify([{ TBL_ID: "DT_1JC1501", TBL_NM: "1인 가구 비율" }]), {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      KOSIS_API_KEY: "server-kosis-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = `/v1/kosis/search?q=${encodeURIComponent("1인 가구")}&limit=1&apiKey=client-key`;
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json()[0].TBL_ID, "DT_1JC1501");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json()[0].TBL_NM, "1인 가구 비율");

  assert.equal(calls.length, 1, "second request should be served from proxy cache");
  assert.equal(new URL(calls[0]).searchParams.get("apiKey"), "server-kosis-key");
});

test("Kakao Local geocode normalizer maps public aliases to upstream params", () => {
  assert.deepEqual(normalizeKakaoLocalGeocodeQuery({ q: "서울역", limit: "3" }), {
    query: "서울역",
    size: 3,
    page: 1
  });
});

test("Kakao Local proxy injects the server-side REST API key", async () => {
  const calls = [];
  const upstream = await proxyKakaoLocalRequest({
    endpoint: "address",
    apiKey: "server-kakao-key",
    params: {
      query: "서울역",
      size: 1,
      apiKey: "client-supplied-key"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), headers: options.headers });
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(upstream.statusCode, 200);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://dapi.kakao.com/v2/local/search/address.json");
  assert.equal(url.searchParams.get("query"), "서울역");
  assert.equal(url.searchParams.get("apiKey"), null);
  assert.equal(calls[0].headers.authorization, "KakaoAK server-kakao-key");
});

test("Kakao Local geocode endpoint falls back from address to keyword and caches", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    const path = new URL(url).pathname;
    if (path.endsWith("/search/address.json")) {
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
    return new Response(JSON.stringify({ documents: [{ place_name: "서울역", x: "126.9706", y: "37.5559" }] }), {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      KAKAO_REST_API_KEY: "server-kakao-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = `/v1/kakao-local/geocode?q=${encodeURIComponent("서울역")}&limit=1&apiKey=client-key`;
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().documents[0].place_name, "서울역");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().documents[0].x, "126.9706");

  assert.equal(calls.length, 2, "second request should be served from proxy cache");
  assert.equal(new URL(calls[0]).searchParams.get("apiKey"), null);
});

test("Kakao Map keyword search injects KakaoAK header, forwards x/y/radius/sort, and caches", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        documents: [
          { place_name: "스타벅스 강남R점", x: "127.027619", y: "37.497946", distance: "120" }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      KAKAO_REST_API_KEY: "server-kakao-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/kakao-map/search/keyword?q=" + encodeURIComponent("스타벅스") + "&x=127.0276&y=37.4979&radius=500&sort=distance&apiKey=client-key";
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().documents[0].place_name, "스타벅스 강남R점");
  assert.equal(first.json().proxy.cache.hit, false);

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.json().proxy.cache.hit, true);

  assert.equal(calls.length, 1, "second request should be served from proxy cache");
  const parsed = new URL(calls[0].url);
  assert.equal(parsed.origin + parsed.pathname, "https://dapi.kakao.com/v2/local/search/keyword.json");
  assert.equal(parsed.searchParams.get("query"), "스타벅스");
  assert.equal(parsed.searchParams.get("x"), "127.0276");
  assert.equal(parsed.searchParams.get("y"), "37.4979");
  assert.equal(parsed.searchParams.get("radius"), "500");
  assert.equal(parsed.searchParams.get("sort"), "distance");
  assert.equal(parsed.searchParams.get("apiKey"), null);
  assert.equal(calls[0].headers.authorization, "KakaoAK server-kakao-key");
});

test("Kakao Map keyword search validates coordinate pairing and radius bounds", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers ?? {} });
    return jsonResponse({ documents: [], meta: { total_count: 0 } });
  };

  const app = buildServer({
    env: { KAKAO_REST_API_KEY: "server-kakao-key" }
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const missingY = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/keyword?q=hi&x=127.0"
  });
  assert.equal(missingY.statusCode, 400);

  const badSort = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/keyword?q=hi&sort=newest"
  });
  assert.equal(badSort.statusCode, 400);

  const badRadius = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/keyword?q=hi&x=127.0&y=37.5&radius=99999"
  });
  assert.equal(badRadius.statusCode, 400);

  const radiusWithoutCoords = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/keyword?q=hi&radius=500"
  });
  assert.equal(radiusWithoutCoords.statusCode, 400);
  assert.match(radiusWithoutCoords.json().message, /radius/i);

  const distanceSortWithoutCoords = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/keyword?q=hi&sort=distance"
  });
  assert.equal(distanceSortWithoutCoords.statusCode, 400);
  assert.match(distanceSortWithoutCoords.json().message, /sort=distance/i);
  assert.equal(calls.length, 0, "validation failures should not call Kakao upstream");
});

test("Kakao Map category search rejects unsupported category group codes", async (t) => {
  const app = buildServer({
    env: { KAKAO_REST_API_KEY: "server-kakao-key" }
  });
  t.after(async () => {
    await app.close();
  });

  const bad = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/category?category_group_code=XX9&x=127.0&y=37.5"
  });
  assert.equal(bad.statusCode, 400);

  const missing = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/category?category_group_code=FD6"
  });
  assert.equal(missing.statusCode, 400);
});

test("Kakao Map category search routes to /search/category.json with FD6 and coords", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        meta: { total_count: 0, pageable_count: 0, is_end: true },
        documents: []
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: { KAKAO_REST_API_KEY: "k" }
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/search/category?category_group_code=FD6&x=127.0276&y=37.4979&radius=300"
  });
  assert.equal(response.statusCode, 200);
  const parsed = new URL(calls[0].url);
  assert.equal(parsed.origin + parsed.pathname, "https://dapi.kakao.com/v2/local/search/category.json");
  assert.equal(parsed.searchParams.get("category_group_code"), "FD6");
});

test("Kakao Map coord2region routes to /geo/coord2regioncode.json with input_coord", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        meta: { total_count: 1 },
        documents: [{ region_type: "B", address_name: "서울특별시 강남구 역삼동" }]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: { KAKAO_REST_API_KEY: "k" }
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/coord2region?x=127.0276&y=37.4979&input_coord=WGS84"
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.json().documents[0].address_name, /강남구/);
  const parsed = new URL(calls[0]);
  assert.equal(parsed.origin + parsed.pathname, "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  assert.equal(parsed.searchParams.get("input_coord"), "WGS84");
});

test("Kakao Map coord2address routes to /geo/coord2address.json with x/y", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        meta: { total_count: 1 },
        documents: [
          {
            road_address: { address_name: "서울 강남구 테헤란로 521" },
            address: { address_name: "서울 강남구 역삼동" }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: { KAKAO_REST_API_KEY: "k" }
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kakao-map/coord2address?x=127.0276&y=37.4979"
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.json().documents[0].road_address.address_name, /테헤란로/);
  const parsed = new URL(calls[0]);
  assert.equal(parsed.origin + parsed.pathname, "https://dapi.kakao.com/v2/local/geo/coord2address.json");
});

test("Kakao Map endpoints return 503 when KAKAO_REST_API_KEY is missing", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("upstream should not be called without API key");
  };

  const app = buildServer({ env: {} });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const urls = [
    "/v1/kakao-map/search/keyword?q=hi",
    "/v1/kakao-map/search/category?category_group_code=FD6&x=127&y=37.5",
    "/v1/kakao-map/coord2address?x=127&y=37.5",
    "/v1/kakao-map/coord2region?x=127&y=37.5",
    "/v1/kakao-mobility/directions?origin=127.0,37.5&destination=127.1,37.6"
  ];
  for (const url of urls) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 503, `${url} should report 503 when key is missing`);
    assert.equal(response.json().error, "upstream_not_configured");
  }
});

test("Kakao Mobility directions endpoint injects KakaoAK, forwards priority/options, and caches", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        trans_id: "abc",
        routes: [
          {
            result_code: 0,
            result_msg: "성공",
            summary: { distance: 12345, duration: 1200, fare: { taxi: 12000, toll: 1000 } }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { KAKAO_REST_API_KEY: "mob-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/kakao-mobility/directions?origin=126.9706,37.5559&destination=127.0276,37.4979&priority=TIME&car_fuel=GASOLINE&alternatives=true";
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().routes[0].result_code, 0);

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(calls.length, 1);

  const parsed = new URL(calls[0].url);
  assert.equal(parsed.origin + parsed.pathname, "https://apis-navi.kakaomobility.com/v1/directions");
  assert.equal(parsed.searchParams.get("origin"), "126.9706,37.5559");
  assert.equal(parsed.searchParams.get("destination"), "127.0276,37.4979");
  assert.equal(parsed.searchParams.get("priority"), "TIME");
  assert.equal(parsed.searchParams.get("car_fuel"), "GASOLINE");
  assert.equal(parsed.searchParams.get("alternatives"), "true");
  assert.equal(calls[0].headers.authorization, "KakaoAK mob-key");
});

test("Kakao Mobility directions forwards whitelisted avoid options", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        trans_id: "avoid",
        routes: [{ result_code: 0, result_msg: "성공", summary: { distance: 1000, duration: 300 } }]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { KAKAO_REST_API_KEY: "mob-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kakao-mobility/directions?origin=126.9706,37.5559&destination=127.0276,37.4979&avoid=toll%7Cmotorway"
  });
  assert.equal(response.statusCode, 200);
  const parsed = new URL(calls[0].url);
  assert.equal(parsed.searchParams.get("avoid"), "toll|motorway");
});

test("Kakao Mobility directions endpoint validates coordinate, priority, and waypoint count", async (t) => {
  const app = buildServer({ env: { KAKAO_REST_API_KEY: "k" } });
  t.after(async () => {
    await app.close();
  });

  const missing = await app.inject({
    method: "GET",
    url: "/v1/kakao-mobility/directions"
  });
  assert.equal(missing.statusCode, 400);

  const badPriority = await app.inject({
    method: "GET",
    url: "/v1/kakao-mobility/directions?origin=127.0,37.5&destination=127.1,37.6&priority=CHEAP"
  });
  assert.equal(badPriority.statusCode, 400);

  const badAvoid = await app.inject({
    method: "GET",
    url: "/v1/kakao-mobility/directions?origin=127.0,37.5&destination=127.1,37.6&avoid=unpaved"
  });
  assert.equal(badAvoid.statusCode, 400);

  const tooManyWaypoints = await app.inject({
    method: "GET",
    url: "/v1/kakao-mobility/directions?origin=127.0,37.5&destination=127.1,37.6&waypoints="
      + encodeURIComponent("127.0,37.5|127.0,37.5|127.0,37.5|127.0,37.5|127.0,37.5|127.0,37.5")
  });
  assert.equal(tooManyWaypoints.statusCode, 400);
});

test("Kakao Mobility directions rejects out-of-range waypoints before upstream", async (t) => {
  const originalFetch = global.fetch;
  let upstreamCalls = 0;
  global.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("Unexpected upstream call for invalid waypoint.");
  };

  const app = buildServer({ env: { KAKAO_REST_API_KEY: "k" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kakao-mobility/directions?origin=127.0,37.5&destination=127.1,37.6&waypoints=181,37.55"
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /waypoint\[0\]/);
  assert.equal(upstreamCalls, 0);
});

test("Kakao Mobility directions surfaces routes[0].result_code != 0 as 502 and does not cache", async (t) => {
  const originalFetch = global.fetch;
  let upstreamCalls = 0;
  global.fetch = async () => {
    upstreamCalls += 1;
    return new Response(
      JSON.stringify({
        routes: [{ result_code: 104, result_msg: "출발지와 도착지가 너무 가깝습니다." }]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { KAKAO_REST_API_KEY: "k" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/kakao-mobility/directions?origin=127.0,37.5&destination=127.0001,37.5001";
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 502);
  assert.equal(first.json().error, "upstream_semantic_error");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 502);
  assert.equal(upstreamCalls, 2, "semantic failures must not be cached");
});

test("Kakao Map health endpoint reflects kakaoMapConfigured and kakaoMobilityConfigured", async (t) => {
  const appOff = buildServer({ env: {} });
  t.after(async () => {
    await appOff.close();
  });
  const off = await appOff.inject({ method: "GET", url: "/health" });
  assert.equal(off.json().upstreams.kakaoMapConfigured, false);
  assert.equal(off.json().upstreams.kakaoMobilityConfigured, false);

  const appOn = buildServer({ env: { KAKAO_REST_API_KEY: "k" } });
  t.after(async () => {
    await appOn.close();
  });
  const on = await appOn.inject({ method: "GET", url: "/health" });
  assert.equal(on.json().upstreams.kakaoMapConfigured, true);
  assert.equal(on.json().upstreams.kakaoMobilityConfigured, true);
});

test("Naver Map directions endpoint returns 503 when proxy lacks Naver Map keys", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("upstream should not be called when keys are missing");
  };

  const app = buildServer({ env: {} });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-map/directions?start=126.9706,37.5559&goal=127.0276,37.4979"
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
  assert.match(response.json().message, /NAVER_MAP_CLIENT_ID/);
});

test("Naver Map directions endpoint injects server-side Naver keys and caches successful responses", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        code: 0,
        message: "found_route",
        route: {
          trafast: [
            { summary: { distance: 12345, duration: 600000, tollFare: 1000, taxiFare: 0, fuelPrice: 1500 } }
          ]
        }
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "server-naver-id",
      NAVER_MAP_CLIENT_SECRET: "server-naver-secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/naver-map/directions?start=126.9706,37.5559&goal=127.0276,37.4979&option=trafast";
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().code, 0);
  assert.equal(first.json().proxy.cache.hit, false);

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, true);

  assert.equal(calls.length, 1, "second request should be served from proxy cache");
  const parsed = new URL(calls[0].url);
  assert.equal(parsed.origin + parsed.pathname, "https://maps.apigw.ntruss.com/map-direction/v1/driving");
  assert.equal(parsed.searchParams.get("start"), "126.9706,37.5559");
  assert.equal(parsed.searchParams.get("goal"), "127.0276,37.4979");
  assert.equal(parsed.searchParams.get("option"), "trafast");
  assert.equal(calls[0].headers["x-ncp-apigw-api-key-id"], "server-naver-id");
  assert.equal(calls[0].headers["x-ncp-apigw-api-key"], "server-naver-secret");
});

test("Naver Map directions endpoint validates coordinate input shape", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("upstream should not be called for invalid input");
  };

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const bad = await app.inject({
    method: "GET",
    url: "/v1/naver-map/directions?start=not-coords&goal=127.0,37.5"
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, "bad_request");

  const missing = await app.inject({
    method: "GET",
    url: "/v1/naver-map/directions?start=126.9,37.5"
  });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error, "bad_request");

  const outOfRange = await app.inject({
    method: "GET",
    url: "/v1/naver-map/directions?start=999,37.5&goal=127,37.5"
  });
  assert.equal(outOfRange.statusCode, 400);

  const badOption = await app.inject({
    method: "GET",
    url: "/v1/naver-map/directions?start=126.9,37.5&goal=127.0,37.5&option=fastest"
  });
  assert.equal(badOption.statusCode, 400);
});

test("Naver Map directions endpoint surfaces upstream semantic failures as 502 without caching", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({ code: 5, message: "no_route_found" }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/naver-map/directions?start=126.9,37.5&goal=127.0,37.5";
  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 502);
  assert.equal(first.json().error, "upstream_semantic_error");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 502);
  assert.equal(calls.length, 2, "semantic failures must not be cached");
});

test("Naver Map endpoints sanitize upstream auth errors as 503 without leaking the body", async (t) => {
  const originalFetch = global.fetch;
  let upstreamStatus = 401;
  global.fetch = async () => new Response(`Authentication Failed: ${upstreamStatus} secret diagnostic`, {
    status: upstreamStatus,
    headers: { "content-type": "text/plain" }
  });

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const cases = [
    {
      upstreamStatus: 401,
      url: "/v1/naver-map/directions?start=126.9,37.5&goal=127.0,37.5"
    },
    {
      upstreamStatus: 403,
      url: "/v1/naver-map/geocode?q=%EC%84%9C%EC%9A%B8%EC%97%AD"
    },
    {
      upstreamStatus: 401,
      url: "/v1/naver-map/reverse-geocode?coords=126.9,37.5"
    }
  ];

  for (const testCase of cases) {
    upstreamStatus = testCase.upstreamStatus;
    const response = await app.inject({ method: "GET", url: testCase.url });
    assert.equal(response.statusCode, 503);
    const body = response.json();
    assert.equal(body.error, "upstream_error");
    assert.equal(body.upstream.status_code, testCase.upstreamStatus);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes("Authentication Failed"));
    assert.ok(!serialized.includes("secret diagnostic"));
    assert.equal(body.upstream.body_snippet, undefined);
  }
});

test("Naver Map endpoints preserve upstream 429 for caller backoff", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("quota exceeded diagnostic", {
    status: 429,
    headers: { "content-type": "text/plain" }
  });

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const cases = [
    "/v1/naver-map/directions?start=126.9,37.5&goal=127.0,37.5",
    "/v1/naver-map/geocode?q=%EC%84%9C%EC%9A%B8%EC%97%AD",
    "/v1/naver-map/reverse-geocode?coords=126.9,37.5"
  ];

  for (const url of cases) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 429);
    const body = response.json();
    assert.equal(body.error, "upstream_error");
    assert.equal(body.upstream.status_code, 429);
    assert.equal(body.upstream.body_snippet, "quota exceeded diagnostic");
  }
});

test("Naver Map directions endpoint keeps non-auth upstream snippets for diagnostics", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("Transient upstream diagnostic", {
    status: 500,
    headers: { "content-type": "text/plain" }
  });

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-map/directions?start=126.9,37.5&goal=127.0,37.5"
  });

  assert.equal(response.statusCode, 502);
  const body = response.json();
  assert.equal(body.upstream.status_code, 500);
  assert.equal(body.upstream.body_snippet, "Transient upstream diagnostic");
});

test("Naver Map geocode endpoint injects Naver keys and forwards query, count, and language", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        status: "OK",
        meta: { totalCount: 1, page: 1, count: 1 },
        addresses: [
          {
            roadAddress: "서울특별시 중구 한강대로 405",
            jibunAddress: "서울특별시 중구 봉래동2가 122",
            x: "126.9706",
            y: "37.5559"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "geo-id",
      NAVER_MAP_CLIENT_SECRET: "geo-secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-map/geocode?q=" + encodeURIComponent("서울역") + "&count=5"
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "OK");
  assert.equal(response.json().addresses[0].x, "126.9706");

  const parsed = new URL(calls[0].url);
  assert.equal(parsed.origin + parsed.pathname, "https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
  assert.equal(parsed.searchParams.get("query"), "서울역");
  assert.equal(parsed.searchParams.get("count"), "5");
  assert.equal(parsed.searchParams.get("language"), "kor");
  assert.equal(calls[0].headers["x-ncp-apigw-api-key-id"], "geo-id");
  assert.equal(calls[0].headers["x-ncp-apigw-api-key"], "geo-secret");
});

test("Naver Map reverse-geocode endpoint validates coords and orders", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("upstream should not be called");
  };

  const app = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const missing = await app.inject({
    method: "GET",
    url: "/v1/naver-map/reverse-geocode"
  });
  assert.equal(missing.statusCode, 400);

  const badOrder = await app.inject({
    method: "GET",
    url: "/v1/naver-map/reverse-geocode?coords=127.0,37.5&orders=banana"
  });
  assert.equal(badOrder.statusCode, 400);

  const xmlOutput = await app.inject({
    method: "GET",
    url: "/v1/naver-map/reverse-geocode?coords=127.0,37.5&output=xml"
  });
  assert.equal(xmlOutput.statusCode, 400);
  assert.equal(xmlOutput.json().error, "bad_request");
  assert.match(xmlOutput.json().message, /output as json/);
});

test("Naver Map health endpoint reflects naverMapConfigured flag", async (t) => {
  const appOff = buildServer({ env: {} });
  t.after(async () => {
    await appOff.close();
  });
  const offResponse = await appOff.inject({ method: "GET", url: "/health" });
  assert.equal(offResponse.json().upstreams.naverMapConfigured, false);

  const appOn = buildServer({
    env: {
      NAVER_MAP_CLIENT_ID: "id",
      NAVER_MAP_CLIENT_SECRET: "secret"
    }
  });
  t.after(async () => {
    await appOn.close();
  });
  const onResponse = await appOn.inject({ method: "GET", url: "/health" });
  assert.equal(onResponse.json().upstreams.naverMapConfigured, true);
});

test("korean stock search endpoint stays public and caches normalized search queries", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7005930003",
              ISU_SRT_CD: "005930",
              ISU_NM: "삼성전자",
              ISU_ABBRV: "삼성전자",
              ISU_ENG_NM: "Samsung Electronics",
              LIST_DD: "19750611",
              MKT_TP_NM: "KOSPI",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "대형주",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "100",
              LIST_SHRS: "5969782550"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info") || text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%20%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90%20&bas_dd=20260404"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?query=%20%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90%20&date=20260404&limit=10"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls.length, 3);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().items[0].market, "KOSPI");
  assert.equal(first.json().items[0].code, "005930");
  assert.equal(first.json().items[0].name, "삼성전자");
  assert.ok(fetchCalls.every((entry) => entry.url.startsWith("https://data-dbg.krx.co.kr/")));
  assert.match(fetchCalls[0].url, /basDd=20260404/);
  assert.equal(fetchCalls[0].headers.AUTH_KEY, "krx-key");
});

test("korean stock search rate limit does not trust spoofed cf-connecting-ip on direct requests", async (t) => {
  const app = buildServer({
    env: {
      KSKILL_PROXY_RATE_LIMIT_MAX: "1"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404",
    headers: {
      "cf-connecting-ip": "1.1.1.1"
    }
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404",
    headers: {
      "cf-connecting-ip": "2.2.2.2"
    }
  });

  assert.equal(first.statusCode, 503);
  assert.equal(first.json().error, "upstream_not_configured");
  assert.equal(second.statusCode, 429);
  assert.equal(second.json().error, "rate_limited");
});

test("korean stock search surfaces degraded upstream metadata when another market fails", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7005930003",
              ISU_SRT_CD: "005930",
              ISU_NM: "삼성전자",
              ISU_ABBRV: "삼성전자",
              ISU_ENG_NM: "Samsung Electronics",
              LIST_DD: "19750611",
              MKT_TP_NM: "KOSPI",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "대형주",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "100",
              LIST_SHRS: "5969782550"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info")) {
      return new Response("boom", {
        status: 500,
        statusText: "Internal Server Error"
      });
    }

    if (text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items.length, 1);
  assert.equal(response.json().items[0].market, "KOSPI");
  assert.equal(response.json().items[0].code, "005930");
  assert.equal(response.json().items[0].name, "삼성전자");
  assert.equal(response.json().upstream.degraded, true);
  assert.deepEqual(response.json().upstream.requested_markets, ["KOSPI", "KOSDAQ", "KONEX"]);
  assert.deepEqual(response.json().upstream.successful_markets, ["KOSPI", "KONEX"]);
  assert.deepEqual(response.json().upstream.failed_markets, [
    {
      market: "KOSDAQ",
      code: "upstream_error",
      status_code: 502,
      message: "KRX API HTTP 오류 (status: 500): Internal Server Error"
    }
  ]);
  assert.equal(fetchCalls.length, 3);
  assert.ok(fetchCalls.every((entry) => entry.url.startsWith("https://data-dbg.krx.co.kr/")));
});

test("korean stock search does not cache degraded responses and retries a recovered market", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  let kosdaqAttempts = 0;

  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info") || text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info")) {
      kosdaqAttempts += 1;

      if (kosdaqAttempts === 1) {
        return new Response("boom", {
          status: 500,
          statusText: "Internal Server Error"
        });
      }

      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7196170005",
              ISU_SRT_CD: "196170",
              ISU_NM: "알테오젠",
              ISU_ABBRV: "알테오젠",
              ISU_ENG_NM: "Alteogen",
              LIST_DD: "20140509",
              MKT_TP_NM: "KOSDAQ",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "제약",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "500",
              LIST_SHRS: "53470829"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%95%8C%ED%85%8C%EC%98%A4%EC%A0%A0&bas_dd=20260408"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%95%8C%ED%85%8C%EC%98%A4%EC%A0%A0&bas_dd=20260408"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().items.length, 0);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(first.json().upstream.degraded, true);
  assert.deepEqual(first.json().upstream.failed_markets, [
    {
      market: "KOSDAQ",
      code: "upstream_error",
      status_code: 502,
      message: "KRX API HTTP 오류 (status: 500): Internal Server Error"
    }
  ]);

  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, false);
  assert.equal(second.json().items.length, 1);
  assert.equal(second.json().items[0].market, "KOSDAQ");
  assert.equal(second.json().items[0].code, "196170");
  assert.equal(kosdaqAttempts, 2);
  assert.equal(fetchCalls.length, 4);
});

test("korean stock search reuses per-market base snapshots across different queries for the same date", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7005930003",
              ISU_SRT_CD: "005930",
              ISU_NM: "삼성전자",
              ISU_ABBRV: "삼성전자",
              ISU_ENG_NM: "Samsung Electronics",
              LIST_DD: "19750611",
              MKT_TP_NM: "KOSPI",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "대형주",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "100",
              LIST_SHRS: "5969782550"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info") || text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const byKoreanName = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404"
  });
  const byEnglishName = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=Samsung&bas_dd=20260404"
  });

  assert.equal(byKoreanName.statusCode, 200);
  assert.equal(byEnglishName.statusCode, 200);
  assert.equal(byKoreanName.json().items[0].code, "005930");
  assert.equal(byEnglishName.json().items[0].code, "005930");
  assert.equal(fetchCalls.length, 3);
});

test("korean stock base-info endpoint returns 503 when proxy server lacks KRX API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/base-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("korean stock base-info endpoint normalizes upstream KRX fields", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  let calledHeaders;
  global.fetch = async (url, options = {}) => {
    calledUrl = String(url);
    calledHeaders = options.headers;
    return new Response(
      JSON.stringify({
        OutBlock_1: [
          {
            ISU_CD: "KR7005930003",
            ISU_SRT_CD: "005930",
            ISU_NM: "삼성전자",
            ISU_ABBRV: "삼성전자",
            ISU_ENG_NM: "Samsung Electronics",
            LIST_DD: "19750611",
            MKT_TP_NM: "KOSPI",
            SECUGRP_NM: "주권",
            SECT_TP_NM: "대형주",
            KIND_STKCERT_TP_NM: "보통주",
            PARVAL: "100",
            LIST_SHRS: "5969782550"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/base-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 200);
  assert.ok(calledUrl.startsWith("https://data-dbg.krx.co.kr/"));
  assert.match(calledUrl, /stk_isu_base_info/);
  assert.match(calledUrl, /basDd=20260404/);
  assert.equal(calledHeaders.AUTH_KEY, "krx-key");
  assert.equal(response.json().item.code, "005930");
  assert.equal(response.json().item.name, "삼성전자");
  assert.equal(response.json().item.listed_shares, 5969782550);
});

test("korean stock trade-info endpoint caches successful responses", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  let calledUrl;
  global.fetch = async (url) => {
    fetchCalls += 1;
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        OutBlock_1: [
          {
            BAS_DD: "20260404",
            ISU_CD: "KR7005930003",
            ISU_SRT_CD: "005930",
            ISU_NM: "삼성전자",
            MKT_NM: "KOSPI",
            SECT_TP_NM: "대형주",
            TDD_CLSPRC: "84000",
            CMPPREVDD_PRC: "1000",
            FLUC_RT: "1.20",
            TDD_OPNPRC: "83000",
            TDD_HGPRC: "84500",
            TDD_LWPRC: "82800",
            ACC_TRDVOL: "12345678",
            ACC_TRDVAL: "1030000000000",
            MKTCAP: "500000000000000",
            LIST_SHRS: "5969782550"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&code=005930&bas_dd=20260404"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&stockCode=005930&date=20260404"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.ok(calledUrl.startsWith("https://data-dbg.krx.co.kr/"));
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().item.close_price, 84000);
  assert.equal(first.json().item.trading_value, 1030000000000);
});

test("korean stock trade-info endpoint does not relabel an unmatched single-row upstream response", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("stk_bydd_trd")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              BAS_DD: "20260404",
              ISU_CD: "KR7000660001",
              ISU_NM: "하이트진로",
              MKT_NM: "KOSPI",
              SECT_TP_NM: "중형주",
              TDD_CLSPRC: "21000"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "not_found");
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls.every((entry) => entry.startsWith("https://data-dbg.krx.co.kr/")));
});

test("korean stock trade-info endpoint treats empty trade snapshots as not_found without base-info fallback", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("stk_bydd_trd")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("stk_isu_base_info")) {
      throw new Error("base-info fallback should not run for empty trade snapshots");
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "not_found");
  assert.match(response.json().message, /휴장일이거나 데이터가 아직 없을 수 있습니다/);
  assert.deepEqual(fetchCalls, [
    "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=20260404"
  ]);
});

test("fine dust endpoint stays publicly callable without proxy auth", async (t) => {
  let providerCalls = 0;
  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key"
    },
    provider: async () => {
      providerCalls += 1;
      return { station_name: "강남구" };
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/fine-dust/report?regionHint=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().station_name, "강남구");
  assert.equal(providerCalls, 1);
});

test("fine dust endpoint returns candidate stations when region resolution is ambiguous", async (t) => {
  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key"
    },
    provider: async () => {
      const error = new Error("단일 측정소를 확정하지 못했습니다.");
      error.statusCode = 400;
      error.code = "ambiguous_location";
      error.sidoName = "광주";
      error.candidateStations = ["평동", "오선동"];
      throw error;
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/fine-dust/report?regionHint=%EA%B4%91%EC%A3%BC%20%EA%B4%91%EC%82%B0%EA%B5%AC"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ambiguous_location");
  assert.equal(response.json().sido_name, "광주");
  assert.deepEqual(response.json().candidate_stations, ["평동", "오선동"]);
});

test("fine dust endpoint caches successful provider responses", async (t) => {
  let providerCalls = 0;
  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    },
    provider: async () => {
      providerCalls += 1;
      return {
        station_name: "강남구",
        station_address: "서울 강남구 학동로 426",
        lookup_mode: "fallback",
        measured_at: "2026-03-27 21:00",
        pm10: { value: "42", grade: "보통" },
        pm25: { value: "19", grade: "보통" },
        khai_grade: "보통"
      };
    }
  });

  t.after(async () => {
    await app.close();
  });

  const request = {
    method: "GET",
    url: "/v1/fine-dust/report?regionHint=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC"
  };

  const first = await app.inject(request);
  const second = await app.inject(request);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(providerCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("proxyAirKoreaRequest injects serviceKey and preserves caller query params", async () => {
  let calledUrl;
  const result = await proxyAirKoreaRequest({
    service: "ArpltnInforInqireSvc",
    operation: "getMsrstnAcctoRltmMesureDnsty",
    query: {
      returnType: "json",
      stationName: "강남구",
      dataTerm: "DAILY",
      ver: "1.4"
    },
    serviceKey: "test-service-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.match(calledUrl, /\/B552584\/ArpltnInforInqireSvc\/getMsrstnAcctoRltmMesureDnsty\?/);
  assert.match(calledUrl, /stationName=%EA%B0%95%EB%82%A8%EA%B5%AC/);
  assert.match(calledUrl, /serviceKey=test-service-key/);
});

test("public AirKorea passthrough route forwards allowed upstream responses", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('{"response":{"header":{"resultCode":"00"}}}', {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });

  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?returnType=json&stationName=%EA%B0%95%EB%82%A8%EA%B5%AC&dataTerm=DAILY&ver=1.4"
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /resultCode/);
});

test("seoul subway endpoint caches successful upstream responses for normalized queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        errorMessage: {
          status: 200,
          code: "INFO-000",
          message: "정상 처리되었습니다."
        },
        realtimeArrivalList: [
          {
            statnNm: "강남",
            trainLineNm: "2호선",
            updnLine: "내선",
            arvlMsg2: "전역 출발",
            arvlMsg3: "역삼",
            barvlDt: "60"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?station=%EA%B0%95%EB%82%A8&start_index=0&end_index=8"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?stationName=%EA%B0%95%EB%82%A8"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("seoul subway endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        errorMessage: {
          status: 200,
          code: "INFO-000",
          message: "정상 처리되었습니다."
        },
        realtimeArrivalList: [
          {
            statnNm: "강남",
            trainLineNm: "2호선",
            updnLine: "내선",
            arvlMsg2: "전역 출발",
            arvlMsg3: "역삼",
            barvlDt: "60"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?stationName=%EA%B0%95%EB%82%A8"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().realtimeArrivalList[0].statnNm, "강남");
  assert.match(calledUrl, /realtimeStationArrival\/0\/8\/%EA%B0%95%EB%82%A8$/);
});

test("seoul subway endpoint returns 503 when proxy server lacks Seoul API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?stationName=%EA%B0%95%EB%82%A8"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("proxySeoulSubwayRequest injects API key and preserves index/station params", async () => {
  let calledUrl;
  const result = await proxySeoulSubwayRequest({
    stationName: "강남",
    startIndex: "2",
    endIndex: "5",
    apiKey: "test-seoul-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.match(calledUrl, /\/api\/subway\/test-seoul-key\/json\/realtimeStationArrival\/2\/5\/%EA%B0%95%EB%82%A8$/);
});

test("seoul density endpoint caches successful upstream responses for normalized area queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        "SeoulRtd.citydata_ppltn": [
          {
            AREA_NM: "강남역",
            AREA_CONGEST_LVL: "약간 붐빔",
            AREA_PPLTN_MIN: "24000",
            AREA_PPLTN_MAX: "26000",
            PPLTN_TIME: "2026-05-14 09:30",
            AREA_CONGEST_MSG: "사람이 몰려있을 수 있어요"
          }
        ],
        RESULT: { "RESULT.CODE": "INFO-000", "RESULT.MESSAGE": "정상 처리되었습니다." }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/seoul-density/citydata?area=%EA%B0%95%EB%82%A8%EC%97%AD"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/seoul-density/citydata?area=%EA%B0%95%EB%82%A8%EC%97%AD"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("seoul density endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        "SeoulRtd.citydata_ppltn": [{ AREA_NM: "강남역" }],
        RESULT: { "RESULT.CODE": "INFO-000" }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: { SEOUL_OPEN_API_KEY: "seoul-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-density/citydata?area=%EA%B0%95%EB%82%A8%EC%97%AD"
  });

  assert.equal(response.statusCode, 200);
  assert.match(calledUrl, /\/seoul-key\/json\/citydata_ppltn\/1\/1\/%EA%B0%95%EB%82%A8%EC%97%AD$/);
});

test("seoul density endpoint returns 503 when proxy server lacks Seoul API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-density/citydata?area=%EA%B0%95%EB%82%A8%EC%97%AD"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("seoul density endpoint returns 400 when area is missing", async (t) => {
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-density/citydata"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("proxySeoulCityDataRequest injects API key and encodes area name", async () => {
  let calledUrl;
  const result = await proxySeoulCityDataRequest({
    area: "강남역",
    apiKey: "test-seoul-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.match(calledUrl, /\/test-seoul-key\/json\/citydata_ppltn\/1\/1\/%EA%B0%95%EB%82%A8%EC%97%AD$/);
});



test("seoul bike realtime endpoint caches successful upstream responses for normalized page queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        rentBikeStatus: {
          list_total_count: 1,
          RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." },
          row: [
            {
              stationId: "ST-10",
              stationName: "101. 광화문역 1번출구 앞",
              rackTotCnt: "15",
              parkingBikeTotCnt: "4",
              shared: "27",
              stationLatitude: "37.5717",
              stationLongitude: "126.9763"
            }
          ]
        }
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({ method: "GET", url: "/v1/seoul-bike/realtime?start_index=1&end_index=10" });
  const second = await app.inject({ method: "GET", url: "/v1/seoul-bike/realtime?startIndex=1&endIndex=10" });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().rentBikeStatus.row[0].parkingBikeTotCnt, "4");
});

test("seoul bike routes stay publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  const calledUrls = [];
  global.fetch = async (url) => {
    calledUrls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const realtime = await app.inject({ method: "GET", url: "/v1/seoul-bike/realtime" });
  const stations = await app.inject({ method: "GET", url: "/v1/seoul-bike/stations?startIndex=2&endIndex=5" });

  assert.equal(realtime.statusCode, 200);
  assert.equal(stations.statusCode, 200);
  assert.match(calledUrls[0], /\/seoul-key\/json\/bikeList\/1\/1000\/?$/);
  assert.match(calledUrls[1], /\/seoul-key\/json\/tbCycleStationInfo\/2\/5\/?$/);
});

test("seoul bike routes return 503 when proxy server lacks Seoul API key", async (t) => {
  const app = buildServer();
  t.after(async () => {
    await app.close();
  });

  for (const url of [
    "/v1/seoul-bike/realtime",
    "/v1/seoul-bike/stations",
    "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763"
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 503, url);
    assert.equal(response.json().error, "upstream_not_configured");
  }
});

test("proxySeoulBikeRealtimeRequest and stations request inject API key and preserve paging", async () => {
  const calledUrls = [];
  const fetchImpl = async (url) => {
    calledUrls.push(String(url));
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const realtime = await proxySeoulBikeRealtimeRequest({
    startIndex: 2,
    endIndex: 5,
    apiKey: "test-seoul-key",
    fetchImpl
  });
  const stations = await proxySeoulBikeStationsRequest({
    startIndex: 3,
    endIndex: 7,
    apiKey: "test-seoul-key",
    fetchImpl
  });

  assert.equal(realtime.statusCode, 200);
  assert.equal(stations.statusCode, 200);
  assert.match(calledUrls[0], /\/test-seoul-key\/json\/bikeList\/2\/5\/?$/);
  assert.match(calledUrls[1], /\/test-seoul-key\/json\/tbCycleStationInfo\/3\/7\/?$/);
});

test("seoul bike nearby endpoint filters and sorts realtime stations by distance", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        rentBikeStatus: {
          list_total_count: 3,
          RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." },
          row: [
            {
              stationId: "ST-FAR",
              stationName: "999. 먼 대여소",
              rackTotCnt: "20",
              parkingBikeTotCnt: "10",
              shared: "50",
              stationLatitude: "37.5900",
              stationLongitude: "126.9900"
            },
            {
              stationId: "ST-NEAR",
              stationName: "101. 광화문역 1번출구 앞",
              rackTotCnt: "15",
              parkingBikeTotCnt: "4",
              shared: "27",
              stationLatitude: "37.5717",
              stationLongitude: "126.9763"
            },
            {
              stationId: "ST-EMPTY",
              stationName: "102. 세종대로 앞",
              rackTotCnt: "12",
              parkingBikeTotCnt: "0",
              shared: "0",
              stationLatitude: "37.5720",
              stationLongitude: "126.9770"
            }
          ]
        }
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&radius_m=120&limit=5"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/seoul-bike/nearby?latitude=37.5717&longitude=126.9763&radiusMeters=120&limit=5"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  const body = first.json();
  assert.equal(body.count, 2);
  assert.deepEqual(body.items.map((item) => item.station_id), ["ST-NEAR", "ST-EMPTY"]);
  assert.equal(body.items[0].available_bikes, 4);
  assert.equal(body.items[0].empty_docks, 11);
  assert.equal(body.items[1].available_bikes, 0);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("seoul bike nearby endpoint returns non-cacheable error for upstream semantic failures", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        RESULT: { CODE: "ERROR-336", MESSAGE: "limit exceeded" }
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&radius_m=120&limit=5"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&radius_m=120&limit=5"
  });

  assert.equal(first.statusCode, 502);
  assert.equal(second.statusCode, 502);
  assert.equal(fetchCalls, 2, "semantic upstream errors must not be cached");
  assert.equal(first.json().error, "upstream_semantic_error");
  assert.equal(first.json().upstream.code, "ERROR-336");
  assert.equal(first.json().proxy.cache.hit, false);
});

test("seoul bike realtime and stations endpoints do not cache upstream semantic failures", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        rentBikeStatus: {
          RESULT: { CODE: "ERROR-336", MESSAGE: "limit exceeded" }
        }
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const realtimeFirst = await app.inject({ method: "GET", url: "/v1/seoul-bike/realtime?startIndex=1&endIndex=10" });
  const realtimeSecond = await app.inject({ method: "GET", url: "/v1/seoul-bike/realtime?startIndex=1&endIndex=10" });
  const stations = await app.inject({ method: "GET", url: "/v1/seoul-bike/stations?startIndex=1&endIndex=10" });

  assert.equal(realtimeFirst.statusCode, 502);
  assert.equal(realtimeSecond.statusCode, 502);
  assert.equal(stations.statusCode, 502);
  assert.equal(fetchCalls, 3, "semantic upstream errors must not be cached across Seoul Bike passthrough routes");
  assert.equal(realtimeFirst.json().error, "upstream_semantic_error");
  assert.equal(stations.json().upstream.code, "ERROR-336");
});

test("seoul bike routes sanitize upstream fetch failures without leaking API keys", async (t) => {
  const originalFetch = global.fetch;
  const secret = "SECRETSEOULKEY";
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    throw new Error(`network failure ${url}`);
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: secret,
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  for (const url of [
    "/v1/seoul-bike/realtime?startIndex=1&endIndex=1",
    "/v1/seoul-bike/stations?startIndex=1&endIndex=1",
    "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&radius_m=120&limit=5"
  ]) {
    const first = await app.inject({ method: "GET", url });
    const second = await app.inject({ method: "GET", url });

    assert.equal(first.statusCode, 502, url);
    assert.equal(second.statusCode, 502, `${url} repeat`);
    assert.equal(first.json().error, "upstream_error", url);
    assert.equal(first.json().message, "Seoul Bike upstream request failed.", url);
    assert.equal(first.json().proxy.cache.hit, false, url);
    assert.doesNotMatch(first.body, new RegExp(secret), url);
    assert.doesNotMatch(second.body, new RegExp(secret), `${url} repeat`);
    assert.doesNotMatch(first.body, /openapi\.seoul\.go\.kr/i, url);
  }

  assert.equal(fetchCalls, 6, "sanitized upstream failures must not be cached");
});

test("seoul bike nearby endpoint validates coordinates", async (t) => {
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({ method: "GET", url: "/v1/seoul-bike/nearby?lat=not-a-number&lon=126.9763" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");

  for (const url of [
    "/v1/seoul-bike/nearby?lat=&lon=126.9763",
    "/v1/seoul-bike/nearby?lat=37.5717&lon="
  ]) {
    const blankResponse = await app.inject({ method: "GET", url });
    assert.equal(blankResponse.statusCode, 400, url);
    assert.equal(blankResponse.json().error, "bad_request", url);
  }
});

test("seoul bike endpoints reject partially numeric integer query params", async (t) => {
  const app = buildServer({ env: { SEOUL_OPEN_API_KEY: "seoul-key" } });
  t.after(async () => {
    await app.close();
  });

  for (const url of [
    "/v1/seoul-bike/realtime?startIndex=10abc&endIndex=20",
    "/v1/seoul-bike/stations?startIndex=1&endIndex=1.5",
    "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&radius_m=120m",
    "/v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&limit=5.5"
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.json().error, "bad_request", url);
  }
});

test("korea weather endpoint caches successful upstream responses for normalized coordinate queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    assert.match(String(url), /getVilageFcst/);
    assert.match(String(url), /base_date=20260405/);
    assert.match(String(url), /base_time=0500/);
    assert.match(String(url), /nx=60/);
    assert.match(String(url), /ny=127/);

    return new Response(
      JSON.stringify({
        response: {
          header: {
            resultCode: "00",
            resultMsg: "NORMAL_SERVICE"
          },
          body: {
            dataType: "JSON",
            items: {
              item: [
                {
                  baseDate: "20260405",
                  baseTime: "0500",
                  category: "TMP",
                  fcstDate: "20260405",
                  fcstTime: "0600",
                  fcstValue: "14",
                  nx: 60,
                  ny: 127
                }
              ]
            }
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KMA_OPEN_API_KEY: "kma-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    },
    now: () => new Date("2026-04-05T06:30:00+09:00")
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?lat=37.5665&lon=126.978"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?nx=60&ny=127&baseDate=20260405&baseTime=0500"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.deepEqual(first.json().query, {
    baseDate: "20260405",
    baseTime: "0500",
    nx: 60,
    ny: 127,
    pageNo: 1,
    numOfRows: 1000,
    dataType: "JSON"
  });
});

test("korea weather endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        response: {
          header: {
            resultCode: "00",
            resultMsg: "NORMAL_SERVICE"
          },
          body: {
            dataType: "JSON",
            items: {
              item: []
            }
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KMA_OPEN_API_KEY: "kma-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?nx=60&ny=127&baseDate=20260405&baseTime=0500"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().response.header.resultCode, "00");
  assert.ok(calledUrl.startsWith("https://apis.data.go.kr/"));
  assert.match(calledUrl, /serviceKey=kma-key/);
  assert.match(calledUrl, /base_date=20260405/);
  assert.match(calledUrl, /base_time=0500/);
  assert.match(calledUrl, /nx=60/);
  assert.match(calledUrl, /ny=127/);
});

test("korea weather endpoint rejects out-of-range coordinates before reaching upstream", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called for invalid coordinates");
  };

  const app = buildServer({
    env: {
      KMA_OPEN_API_KEY: "kma-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?lat=91&lon=126.978"
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "bad_request",
    message: "Provide valid lat and lon."
  });
  assert.equal(fetchCalls, 0);
});

test("korea weather endpoint returns 503 when proxy server lacks KMA API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?nx=60&ny=127"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("proxyKmaWeatherRequest injects API key and preserves caller query params", async () => {
  let calledUrl;
  const result = await proxyKmaWeatherRequest({
    baseDate: "20260405",
    baseTime: "0500",
    nx: 60,
    ny: 127,
    pageNo: 2,
    numOfRows: 50,
    dataType: "JSON",
    apiKey: "test-kma-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.ok(calledUrl.startsWith("https://apis.data.go.kr/"));
  assert.match(calledUrl, /\/1360000\/VilageFcstInfoService_2\.0\/getVilageFcst\?/);
  assert.match(calledUrl, /serviceKey=test-kma-key/);
  assert.match(calledUrl, /base_date=20260405/);
  assert.match(calledUrl, /base_time=0500/);
  assert.match(calledUrl, /nx=60/);
  assert.match(calledUrl, /ny=127/);
  assert.match(calledUrl, /pageNo=2/);
  assert.match(calledUrl, /numOfRows=50/);
  assert.match(calledUrl, /dataType=JSON/);
});

test("han river water-level endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.endsWith("/waterlevel/info.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              obsnm: "한강대교",
              agcnm: "한강홍수통제소",
              addr: "서울특별시 용산구",
              etcaddr: "한강대교",
              attwl: "5.5",
              wrnwl: "8.0",
              almwl: "10.0",
              srswl: "11.0",
              pfh: "13.0",
              fstnyn: "Y"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("/waterlevel/list/10M/1018683.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              ymdhm: "202604051900",
              wl: "0.66",
              fw: "208.58"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      HRFCO_OPEN_API_KEY: "hrfco-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().station_name, "한강대교");
  assert.equal(response.json().water_level.value_m, 0.66);
  assert.equal(response.json().flow_rate.value_cms, 208.58);
  assert.equal(response.json().proxy.cache.hit, false);
  assert.match(fetchCalls[0], /\/waterlevel\/info\.json$/);
  assert.match(fetchCalls[1], /\/waterlevel\/list\/10M\/1018683\.json$/);
});

test("han river water-level endpoint caches normalized station queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    const text = String(url);

    if (text.endsWith("/waterlevel/info.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              obsnm: "한강대교",
              agcnm: "한강홍수통제소",
              addr: "서울특별시 용산구",
              etcaddr: "한강대교"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("/waterlevel/list/10M/1018683.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              ymdhm: "202604051900",
              wl: "0.66",
              fw: "208.58"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      HRFCO_OPEN_API_KEY: "hrfco-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?station=%20%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90%20"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 2);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("han river water-level endpoint returns ambiguous candidates for broad station names", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);

    if (text.endsWith("/waterlevel/info.json")) {
      return new Response(
        JSON.stringify({
          content: [
            { wlobscd: "1018683", obsnm: "한강대교", agcnm: "한강홍수통제소" },
            { wlobscd: "1018680", obsnm: "한강철교", agcnm: "한강홍수통제소" }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      HRFCO_OPEN_API_KEY: "hrfco-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ambiguous_station");
  assert.deepEqual(response.json().candidate_stations, ["한강대교", "한강철교"]);
});

test("han river water-level endpoint returns 503 when proxy server lacks HRFCO API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("proxyHrfcoWaterLevelRequest injects API key and resolves station code path", async () => {
  let calledUrls = [];
  const result = await proxyHrfcoWaterLevelRequest({
    stationName: "한강대교",
    apiKey: "test-hrfco-key",
    fetchImpl: async (url) => {
      calledUrls.push(String(url));

      if (String(url).endsWith("/waterlevel/info.json")) {
        return new Response(
          JSON.stringify({
            content: [
              { wlobscd: "1018683", obsnm: "한강대교", agcnm: "한강홍수통제소" }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json;charset=UTF-8" }
          }
        );
      }

      return new Response(
        JSON.stringify({
          content: [
            { wlobscd: "1018683", ymdhm: "202604051900", wl: "0.66", fw: "208.58" }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).station_code, "1018683");
  assert.match(calledUrls[0], /\/test-hrfco-key\/waterlevel\/info\.json$/);
  assert.match(calledUrls[1], /\/test-hrfco-key\/waterlevel\/list\/10M\/1018683\.json$/);
});

const SAMPLE_APT_TRADE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <aptNm>래미안</aptNm><umdNm>반포동</umdNm><excluUseAr>84.99</excluUseAr>
        <floor>12</floor><dealAmount>  245,000</dealAmount>
        <dealYear>2024</dealYear><dealMonth>3</dealMonth><dealDay>15</dealDay>
        <buildYear>2009</buildYear><dealingGbn>중개거래</dealingGbn><cdealType></cdealType>
      </item>
    </items>
    <totalCount>1</totalCount>
  </body>
</response>`;

const SAMPLE_KRX_BASE_INFO = {
  OutBlock_1: [
    {
      ISU_CD: "KR7005930003",
      ISU_SRT_CD: "005930",
      ISU_NM: "삼성전자",
      ISU_ABBRV: "삼성전자",
      ISU_ENG_NM: "Samsung Electronics",
      LIST_DD: "19750611",
      MKT_TP_NM: "KOSPI",
      SECUGRP_NM: "주권",
      SECT_TP_NM: "전기전자",
      KIND_STKCERT_TP_NM: "보통주",
      PARVAL: "100",
      LIST_SHRS: "5,919,638,922"
    }
  ]
};

const SAMPLE_KRX_TRADE_INFO = {
  OutBlock_1: [
    {
      BAS_DD: "20260404",
      ISU_CD: "KR7005930003",
      ISU_SRT_CD: "005930",
      ISU_NM: "삼성전자",
      MKT_NM: "KOSPI",
      SECT_TP_NM: "전기전자",
      TDD_CLSPRC: "85,000",
      CMPPREVDD_PRC: "1,200",
      FLUC_RT: "1.43",
      TDD_OPNPRC: "84,100",
      TDD_HGPRC: "85,400",
      TDD_LWPRC: "83,900",
      ACC_TRDVOL: "12,345,678",
      ACC_TRDVAL: "1,045,678,900,000",
      MKTCAP: "503,169,308,370,000",
      LIST_SHRS: "5,919,638,922"
    }
  ]
};

test("real estate region-code endpoint returns matching codes", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/region-code?q=%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(body.results.length > 0);
  assert.ok(body.results.some((r) => r.lawd_cd === "11680"));
  assert.equal(body.proxy.cache.hit, false);
});

test("real estate region-code endpoint returns 400 for missing query", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/region-code"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("real estate transaction endpoint returns 503 without API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("real estate transaction endpoint returns 404 for invalid asset type", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/mansion/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 404);
});

test("real estate transaction endpoint returns 404 for commercial/rent", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/commercial/rent?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 404);
});

test("real estate transaction endpoint returns 400 for invalid lawd_cd", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=abc&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 400);
});

test("real estate transaction endpoint fetches and returns parsed data", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return new Response(SAMPLE_APT_TRADE_XML, {
      status: 200,
      headers: { "content-type": "text/xml;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].name, "래미안");
  assert.equal(body.items[0].price_10k, 245000);
  assert.equal(body.query.asset_type, "apartment");
  assert.equal(body.query.deal_type, "trade");
  assert.equal(body.proxy.cache.hit, false);
});

test("real estate transaction endpoint caches successful responses", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(SAMPLE_APT_TRADE_XML, {
      status: 200,
      headers: { "content-type": "text/xml;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "test-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls, 1);
});

test("health endpoint reports molitConfigured status", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.json().upstreams.molitConfigured, true);
});

test("health endpoint reports foodsafetyKoreaConfigured when FOODSAFETYKOREA_API_KEY is set", async (t) => {
  const app = buildServer({
    env: { FOODSAFETYKOREA_API_KEY: "food-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.json().upstreams.foodsafetyKoreaConfigured, true);
});

const SAMPLE_NEIS_MEAL_JSON = JSON.stringify({
  mealServiceDietInfo: [
    {
      head: [{ LIST_TOTAL_COUNT: 1 }]
    },
    {
      row: [
        {
          ATPT_OFCDC_SC_CODE: "J10",
          SD_SCHUL_CODE: "1234567",
          MLSV_YMD: "20260410",
          MMEAL_SC_CODE: "2",
          DDISH_NM: "밥<br/>국"
        }
      ]
    }
  ]
});

test("neis school-meal endpoint returns 503 without KEDU_INFO_KEY", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=20260410"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("neis school-meal endpoint returns 400 when mealDate is invalid", async (t) => {
  const app = buildServer({
    env: { KEDU_INFO_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=2026041"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("neis school-meal endpoint proxies NEIS JSON and caches", async (t) => {
  const originalFetch = global.fetch;
  let fetchedUrl = "";
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    fetchedUrl = String(url);
    return new Response(SAMPLE_NEIS_MEAL_JSON, {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      KEDU_INFO_KEY: "neis-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=2026-04-10&mealKindCode=2"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=2026-04-10&mealKindCode=2"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().mealServiceDietInfo[1].row[0].DDISH_NM, "밥<br/>국");
  assert.equal(first.json().query.meal_date, "20260410");
  assert.equal(first.json().query.meal_kind_code, "2");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls, 1);
  assert.ok(fetchedUrl.includes("open.neis.go.kr/hub/mealServiceDietInfo"));
  assert.ok(fetchedUrl.includes("KEY=neis-key"));
  assert.ok(fetchedUrl.includes("ATPT_OFCDC_SC_CODE=J10"));
  assert.ok(fetchedUrl.includes("SD_SCHUL_CODE=1234567"));
  assert.ok(fetchedUrl.includes("MLSV_YMD=20260410"));
  assert.ok(fetchedUrl.includes("MMEAL_SC_CODE=2"));
});

test("health endpoint reports neisSchoolMealConfigured when KEDU_INFO_KEY is set", async (t) => {
  const app = buildServer({
    env: { KEDU_INFO_KEY: "x" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.json().upstreams.neisSchoolMealConfigured, true);
});

test("resolveEducationOfficeFromNaturalLanguage maps Seoul office phrases to B10", () => {
  const a = resolveEducationOfficeFromNaturalLanguage("서울특별시교육청");
  assert.equal(a.ok, true);
  assert.equal(a.code, "B10");

  const b = resolveEducationOfficeFromNaturalLanguage("B10");
  assert.equal(b.ok, true);
  assert.equal(b.code, "B10");
});

test("resolveEducationOfficeFromNaturalLanguage returns ambiguous for 경상", () => {
  const r = resolveEducationOfficeFromNaturalLanguage("경상");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
});

const SAMPLE_NEIS_SCHOOL_JSON = JSON.stringify({
  schoolInfo: [
    { head: [{ LIST_TOTAL_COUNT: 1 }] },
    {
      row: [
        {
          ATPT_OFCDC_SC_CODE: "B10",
          SD_SCHUL_CODE: "7010123",
          SCHUL_NM: "서울미래초등학교",
          ORG_RDNMA: "서울특별시 …"
        }
      ]
    }
  ]
});

test("neis school-search returns 400 without schoolName", async (t) => {
  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${encodeURIComponent("서울특별시교육청")}`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("neis school-search returns ambiguous_education_office for 경상", async (t) => {
  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${encodeURIComponent("경상")}&schoolName=${encodeURIComponent("중학교")}`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ambiguous_education_office");
  assert.ok(Array.isArray(response.json().candidate_codes));
});

test("neis school-search proxies schoolInfo and resolves 교육청 이름", async (t) => {
  const originalFetch = global.fetch;
  let fetchedUrl = "";
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    fetchedUrl = String(url);
    return new Response(SAMPLE_NEIS_SCHOOL_JSON, {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      KEDU_INFO_KEY: "neis-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const edu = encodeURIComponent("서울특별시교육청");
  const school = encodeURIComponent("미래초등학교");
  const first = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${edu}&schoolName=${school}`
  });
  const second = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${edu}&schoolName=${school}`
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().schoolInfo[1].row[0].SCHUL_NM, "서울미래초등학교");
  assert.equal(first.json().resolved_education_office.atpt_ofcdc_sc_code, "B10");
  assert.equal(first.json().resolved_education_office.input, "서울특별시교육청");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls, 1);
  assert.ok(fetchedUrl.includes("open.neis.go.kr/hub/schoolInfo"));
  assert.ok(fetchedUrl.includes("ATPT_OFCDC_SC_CODE=B10"));
  assert.ok(fetchedUrl.includes("SCHUL_NM"));
  assert.ok(decodeURIComponent(fetchedUrl).includes("미래초등학교"));
});

test("neis school-search maps rejected upstream fetches to a 502 proxy error", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("boom");
  };

  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${encodeURIComponent("서울특별시교육청")}&schoolName=${encodeURIComponent("미래초등학교")}`
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    error: "proxy_error",
    message: "boom"
  });
});

test("neis school-meal maps rejected upstream fetches to a 502 proxy error", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("boom");
  };

  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=B10&schoolCode=7010123&mealDate=20260410"
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    error: "proxy_error",
    message: "boom"
  });
});

test("household waste info endpoint requires SGG_NM filter", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("household waste info endpoint reports 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("household waste info endpoint requires pageNo and numOfRows with cond", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("household waste info endpoint injects serviceKey, forces returnType=json, and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(
      JSON.stringify({
        response: {
          body: {
            items: [
              {
                SGG_NM: "강남구",
                MNG_ZONE_NM: "역삼1동",
                EMSN_PLC: "지정장소",
                LF_WST_EMSN_DOW: "월,수,금",
                LF_WST_EMSN_BGNG_TM: "18:00",
                LF_WST_EMSN_END_TM: "23:00"
              }
            ]
          }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "test-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url =
    "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100";

  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  const firstBody = first.json();
  assert.equal(firstBody.proxy.cache.hit, false);
  assert.equal(firstBody.query.sgg_nm, "강남구");
  assert.equal(firstBody.query.page_no, "1");
  assert.equal(firstBody.query.num_of_rows, "100");
  assert.equal(firstBody.response.body.items[0].SGG_NM, "강남구");

  assert.equal(fetchCalls.length, 1);
  const upstream = new URL(fetchCalls[0]);
  assert.equal(upstream.origin + upstream.pathname, "https://apis.data.go.kr/1741000/household_waste_info/info");
  assert.equal(upstream.searchParams.get("serviceKey"), "test-key");
  assert.equal(upstream.searchParams.get("returnType"), "json");
  assert.equal(upstream.searchParams.get("pageNo"), "1");
  assert.equal(upstream.searchParams.get("numOfRows"), "100");
  assert.equal(upstream.searchParams.get("cond[SGG_NM::LIKE]"), "강남구");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls.length, 1);
});

test("household waste info endpoint rejects user-supplied pageNo and numOfRows when not 1 and 100", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=99&numOfRows=5"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
  assert.equal(fetchCalls, 0);
});

test("household waste info endpoint accepts explicit pageNo=1 and numOfRows=100", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100"
  });

  assert.equal(response.statusCode, 200);
  const u = new URL(capturedUrl);
  assert.equal(u.searchParams.get("pageNo"), "1");
  assert.equal(u.searchParams.get("numOfRows"), "100");
});

test("household waste info endpoint rejects non-integer pageNo", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=abc&numOfRows=100"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("household waste info endpoint ignores user-supplied returnType override", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EC%88%98%EC%9B%90%EC%8B%9C&pageNo=1&numOfRows=100&returnType=xml"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(new URL(capturedUrl).searchParams.get("returnType"), "json");
});

test("household waste info endpoint surfaces upstream non-200 as 502", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("oops", { status: 500 });

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100"
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "upstream_error");
});

test("mfds drug-safety lookup endpoint returns 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/drug-safety/lookup?itemName=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("mfds drug-safety lookup endpoint proxies official drug surfaces and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("DrbEasyDrugInfoService/getDrbEasyDrugList")) {
      return new Response(
        JSON.stringify({
          body: {
            items: [
              {
                itemName: "타이레놀정160밀리그램",
                entpName: "한국얀센",
                efcyQesitm: "감기로 인한 발열 및 동통에 사용합니다.",
                intrcQesitm: "다른 해열진통제와 함께 복용하지 마십시오."
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("SafeStadDrugService/getSafeStadDrugInq")) {
      return new Response(
        JSON.stringify({
          body: {
            items: [
              {
                PRDLST_NM: "판콜에스내복액",
                BSSH_NM: "동화약품",
                EFCY_QESITM: "감기 증상 완화",
                INTRC_QESITM: "다른 감기약과 병용 주의"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "test-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url =
    "/v1/mfds/drug-safety/lookup?itemName=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80&itemName=%ED%8C%90%EC%BD%9C&limit=5";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls.length, 4);
  assert.equal(first.json().query.item_names[0], "타이레놀");
  assert.equal(first.json().items[0].source, "drug_easy_info");
  assert.equal(first.json().items[1].source, "safe_standby_medicine");
  assert.ok(fetchCalls.every((entry) => entry.includes("test-key")));
});

test("mfds drug-safety lookup endpoint still parses legacy body.items.item shape", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("DrbEasyDrugInfoService/getDrbEasyDrugList")) {
      return new Response(
        JSON.stringify({
          body: {
            items: {
              item: [
                {
                  itemName: "레거시타이레놀",
                  entpName: "레거시얀센"
                }
              ]
            }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("SafeStadDrugService/getSafeStadDrugInq")) {
      return new Response(
        JSON.stringify({
          body: {
            items: {
              item: {
                PRDLST_NM: "레거시판콜",
                BSSH_NM: "레거시동화"
              }
            }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "legacy-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/drug-safety/lookup?itemName=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80&limit=5"
  });

  assert.equal(response.statusCode, 200);
  const items = response.json().items;
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "drug_easy_info");
  assert.equal(items[0].item_name, "레거시타이레놀");
  assert.equal(items[1].source, "safe_standby_medicine");
  assert.equal(items[1].item_name, "레거시판콜");
});

test("mfds food-safety search endpoint requires query", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/search"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("mfds food-safety search endpoint uses sample recall fallback without proxy secrets and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("openapi.foodsafetykorea.go.kr/api/sample/I0490/json/1/50")) {
      return new Response(
        JSON.stringify({
          I0490: {
            row: [
              {
                PRDLST_NM: "맛있는김밥",
                BSSH_NM: "예시식품",
                RTRVLPRVNS: "대장균 기준 규격 부적합"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/mfds/food-safety/search?query=%EA%B9%80%EB%B0%A5&limit=5";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(first.json().items[0].source, "foodsafetykorea_recall");
  assert.match(first.json().warnings.join(" "), /sample feed/);
});

test("mfds food-safety search endpoint uses live recall key when configured", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("PrsecImproptFoodInfoService03/getPrsecImproptFoodList01")) {
      return new Response(
        JSON.stringify({
          body: {
            items: [
              {
                item: {
                  PRDUCT: "예시 유부초밥",
                  ENTRPS: "예시푸드",
                  IMPROPT_ITM: "황색포도상구균",
                  INSPCT_RESULT: "기준 부적합"
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("openapi.foodsafetykorea.go.kr/api/live-food-key/I0490/json/1/50")) {
      return new Response(
        JSON.stringify({
          I0490: {
            row: [
              {
                PRDLST_NM: "예시 유부초밥",
                BSSH_NM: "예시푸드",
                RTRVLPRVNS: "회수 조치"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "data-go-key",
      FOODSAFETYKOREA_API_KEY: "live-food-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/search?query=%EC%9C%A0%EB%B6%80%EC%B4%88%EB%B0%A5&limit=5"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].product_name, "예시 유부초밥");
  assert.ok(fetchCalls.some((entry) => entry.includes("data-go-key")));
  assert.ok(fetchCalls.some((entry) => entry.includes("live-food-key")));
  assert.doesNotMatch(response.json().warnings.join(" "), /sample feed/);
});

test("mfds health-food-ingredient endpoint requires query", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/health-food-ingredient"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("mfds health-food-ingredient endpoint uses sample fallback without key and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("openapi.foodsafetykorea.go.kr/api/sample/I-0040/json/1/")) {
      return new Response(
        JSON.stringify({
          "I-0040": {
            row: [
              {
                APLC_RAWMTRL_NM: "차전자피식이섬유",
                HF_FNCLTY_MTRAL_RCOGN_NO: "2010-42",
                FNCLTY_CN: "배변활동 원활에 도움",
                DAY_INTK_CN: "5.4g/일",
                IFTKN_ATNT_MATR_CN: "충분한 물과 함께 섭취",
                BSSH_NM: "예시바이오",
                PRMS_DT: "20100315"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("openapi.foodsafetykorea.go.kr/api/sample/I-0050/json/1/")) {
      return new Response(
        JSON.stringify({ "I-0050": { total_count: "0", row: [] } }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/mfds/food-safety/health-food-ingredient?query=%EC%B0%A8%EC%A0%84%EC%9E%90%ED%94%BC&limit=5";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().items[0].source, "foodsafetykorea_health_food_ingredient");
  assert.equal(first.json().items[0].ingredient_name, "차전자피식이섬유");
  assert.match((first.json().warnings || []).join(" "), /sample feed/);
});

test("mfds health-food-ingredient endpoint uses live key when configured", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("openapi.foodsafetykorea.go.kr/api/live-food-key/I-0040/json/1/")) {
      return new Response(
        JSON.stringify({
          "I-0040": {
            row: [
              {
                APLC_RAWMTRL_NM: "차전자피",
                HF_FNCLTY_MTRAL_RCOGN_NO: "2010-42",
                FNCLTY_CN: "배변활동 원활",
                DAY_INTK_CN: "5g/일",
                IFTKN_ATNT_MATR_CN: "의사 상담 권장",
                BSSH_NM: "예시바이오",
                PRMS_DT: "20100315"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("openapi.foodsafetykorea.go.kr/api/live-food-key/I-0050/json/1/")) {
      return new Response(
        JSON.stringify({ "I-0050": { total_count: "0", row: [] } }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      FOODSAFETYKOREA_API_KEY: "live-food-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/health-food-ingredient?query=%EC%B0%A8%EC%A0%84%EC%9E%90%ED%94%BC&limit=5"
  });

  assert.equal(response.statusCode, 200);
  assert.ok(fetchCalls.some((entry) => entry.includes("live-food-key")));
  assert.ok(!response.json().warnings || !response.json().warnings.some((w) => /sample feed/.test(w)));
});

test("mfds inspection-fail endpoint requires query", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/inspection-fail"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("mfds inspection-fail endpoint uses sample fallback without key and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("openapi.foodsafetykorea.go.kr/api/sample/I2620/json/1/")) {
      return new Response(
        JSON.stringify({
          I2620: {
            row: [
              {
                PRDTNM: "쪽갓",
                PRDLST_CD_NM: "쪽갓",
                BSSHNM: "박*영",
                ADDR: "경기도 고양시",
                TEST_ITMNM: "다이아지논",
                STDR_STND: "0.01 mg/kg이하(PLS)",
                TESTANALS_RSLT: "1.62 mg/kg",
                CRET_DTM: "2025.08.27",
                INSTT_NM: "강남농수산물검사소"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/mfds/food-safety/inspection-fail?query=%EC%AA%BD%EA%B0%93&limit=5";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().items[0].source, "foodsafetykorea_inspection_fail");
  assert.equal(first.json().items[0].product_name, "쪽갓");
  assert.match((first.json().warnings || []).join(" "), /sample feed/);
});

test("mfds product-report endpoint requires query", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/product-report"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("mfds product-report endpoint uses sample fallback without key and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("openapi.foodsafetykorea.go.kr/api/sample/I0030/json/1/")) {
      return new Response(
        JSON.stringify({
          I0030: {
            row: [
              {
                PRDLST_REPORT_NO: "20140017002183",
                PRDLST_NM: "차전자피 다이어트",
                BSSH_NM: "예시건강(주)",
                RAWMTRL_NM: "차전자피식이섬유",
                PRIMARY_FNCLTY: "배변활동 원활에 도움",
                IFTKN_ATNT_MATR_CN: "충분한 물과 함께 섭취",
                STDR_STND: "식이섬유: 표시량의 80% 이상",
                PRDT_SHAP_CD_NM: "분말",
                POG_DAYCNT: "제조일로부터 24개월",
                PRMS_DT: "20200101"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/mfds/food-safety/product-report?query=%EC%B0%A8%EC%A0%84%EC%9E%90%ED%94%BC&limit=5";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().items[0].source, "foodsafetykorea_product_report");
  assert.equal(first.json().items[0].product_name, "차전자피 다이어트");
  assert.equal(first.json().items[0].raw_materials, "차전자피식이섬유");
  assert.match((first.json().warnings || []).join(" "), /sample feed/);
});

test("mfds product-report endpoint uses live key with server-side filter", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("openapi.foodsafetykorea.go.kr/api/live-food-key/I0030/json/1/")) {
      return new Response(
        JSON.stringify({
          I0030: {
            row: [
              {
                PRDLST_REPORT_NO: "20200001",
                PRDLST_NM: "차전자피 솔루션",
                BSSH_NM: "예시바이오",
                RAWMTRL_NM: "차전자피식이섬유",
                PRIMARY_FNCLTY: "배변활동 원활",
                IFTKN_ATNT_MATR_CN: "의사 상담 권장",
                STDR_STND: "식이섬유 80% 이상",
                PRDT_SHAP_CD_NM: "분말",
                POG_DAYCNT: "24개월",
                PRMS_DT: "20200527"
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      FOODSAFETYKOREA_API_KEY: "live-food-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/mfds/food-safety/product-report?query=%EC%B0%A8%EC%A0%84%EC%9E%90%ED%94%BC&limit=5"
  });

  assert.equal(response.statusCode, 200);
  assert.ok(fetchCalls.some((entry) => entry.includes("live-food-key")));
  assert.ok(fetchCalls.some((entry) => entry.includes("PRDLST_NM=")));
  assert.ok(fetchCalls.some((entry) => entry.includes("RAWMTRL_NM=")));
  assert.ok(!response.json().warnings || !response.json().warnings.some((w) => /sample feed/.test(w)));
});

test("data4library book-search normalizes query aliases and bounds pagination", () => {
  const normalized = normalizeData4LibraryBookSearchQuery({
    q: "  역사  ",
    page: "2",
    limit: "250"
  });

  assert.deepEqual(normalized, {
    keyword: "역사",
    pageNo: 2,
    pageSize: 100
  });

  assert.throws(
    () => normalizeData4LibraryBookSearchQuery({ pageNo: "1" }),
    /Provide keyword/
  );
});

test("data4library remaining query normalizers preserve narrow aliases", () => {
  assert.deepEqual(
    normalizeData4LibraryBookDetailQuery({
      isbn: "978-8971998557",
      loanInfo: "y"
    }),
    {
      isbn13: "9788971998557",
      loaninfoYN: "Y"
    }
  );

  assert.deepEqual(
    normalizeData4LibraryBookDetailQuery({
      isbn: "0-306-40615-2"
    }),
    {
      isbn13: "0306406152",
      loaninfoYN: "N"
    }
  );

  assert.deepEqual(
    normalizeData4LibraryBookExistsQuery({
      libraryCode: "111001",
      isbn13: "0-306-40615-2"
    }),
    {
      libCode: "111001",
      isbn13: "9780306406157"
    }
  );

  assert.deepEqual(
    normalizeData4LibraryBookExistsQuery({
      libraryCode: "111001",
      isbn13: "0-8044-2957-X"
    }),
    {
      libCode: "111001",
      isbn13: "9780804429573"
    }
  );

  assert.deepEqual(
    normalizeData4LibraryLibrariesByBookQuery({
      isbn13: "9788971998557",
      region: "11",
      detailRegion: "11010",
      page: "2",
      limit: "250"
    }),
    {
      isbn: "9788971998557",
      region: "11",
      pageNo: 2,
      pageSize: 100,
      dtl_region: "11010"
    }
  );

  assert.deepEqual(
    normalizeData4LibraryLibrarySearchQuery({
      libraryCode: "111001",
      region: "11",
      detailRegion: "11010",
      page: "3",
      limit: "20"
    }),
    {
      pageNo: 3,
      pageSize: 20,
      libCode: "111001",
      region: "11",
      dtl_region: "11010"
    }
  );

  assert.throws(
    () => normalizeData4LibraryBookDetailQuery({ isbn13: "9788971998557", loanInfo: "maybe" }),
    /loaninfoYN must be Y or N/
  );
  assert.throws(
    () => normalizeData4LibraryBookExistsQuery({ libraryCode: "lib-1", isbn13: "9788971998557" }),
    /Provide valid libraryCode/
  );
  assert.throws(
    () => normalizeData4LibraryBookExistsQuery({ libraryCode: "111001", isbn13: "0-306-40615-3" }),
    /Provide valid isbn13/
  );
  assert.throws(
    () => normalizeData4LibraryLibrariesByBookQuery({ isbn13: "9788971998557" }),
    /Provide region/
  );
  assert.throws(
    () => normalizeData4LibraryLibrarySearchQuery({ detailRegion: "seoul" }),
    /Provide valid dtl_region/
  );
});

test("data4library proxy helper injects authKey and strips caller auth overrides", async () => {
  const fetchCalls = [];
  const upstream = await proxyData4LibraryRequest({
    operation: "srchBooks",
    params: {
      keyword: "역사",
      pageNo: 1,
      pageSize: 10,
      authKey: "caller-key",
      format: "xml"
    },
    authKey: "server-key",
    fetchImpl: async (url) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify({ response: { resultNum: 0, docs: [] } }), {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(upstream.statusCode, 200);
  assert.equal(fetchCalls.length, 1);
  const url = new URL(fetchCalls[0]);
  assert.equal(url.origin + url.pathname, "https://data4library.kr/api/srchBooks");
  assert.equal(url.searchParams.get("authKey"), "server-key");
  assert.equal(url.searchParams.get("keyword"), "역사");
  assert.equal(url.searchParams.get("format"), "json");
});

test("data4library book-search endpoint reports 503 without DATA4LIBRARY_AUTH_KEY", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-search?keyword=%EC%97%AD%EC%82%AC"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("data4library book-search endpoint proxies JSON and caches normalized query aliases", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.startsWith("https://data4library.kr/api/srchBooks")) {
      return new Response(
        JSON.stringify({
          response: {
            resultNum: 1,
            docs: [
              {
                doc: {
                  bookname: "역사의 역사",
                  authors: "유시민",
                  publisher: "돌베개",
                  publication_year: "2018",
                  isbn13: "9788971998557"
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      DATA4LIBRARY_AUTH_KEY: "server-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-search?q=%20%EC%97%AD%EC%82%AC%20&page=1&limit=10&authKey=caller-key"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-search?keyword=%EC%97%AD%EC%82%AC&pageNo=1&pageSize=10"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().query.keyword, "역사");

  const upstream = new URL(fetchCalls[0]);
  assert.equal(upstream.searchParams.get("authKey"), "server-key");
  assert.equal(upstream.searchParams.get("format"), "json");
  assert.equal(upstream.searchParams.get("authKey") === "caller-key", false);
});

test("data4library detail, libraries-by-book, and library-search endpoints proxy expected operations", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);
    return new Response(
      JSON.stringify({
        response: {
          echoedPath: new URL(text).pathname
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      DATA4LIBRARY_AUTH_KEY: "server-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const detail = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-detail?isbn=978-8971998557&loanInfo=y&authKey=caller-key&format=xml"
  });
  const librariesByBook = await app.inject({
    method: "GET",
    url: "/v1/data4library/libraries-by-book?isbn13=9788971998557&region=11&detailRegion=11010&page=2&limit=20"
  });
  const librarySearch = await app.inject({
    method: "GET",
    url: "/v1/data4library/library-search?libraryCode=111001&region=11&detailRegion=11010&page=3&pageSize=30"
  });

  assert.equal(detail.statusCode, 200);
  assert.equal(librariesByBook.statusCode, 200);
  assert.equal(librarySearch.statusCode, 200);
  assert.equal(fetchCalls.length, 3);

  const [detailUrl, librariesByBookUrl, librarySearchUrl] = fetchCalls.map((entry) => new URL(entry));
  assert.equal(detailUrl.origin + detailUrl.pathname, "https://data4library.kr/api/srchDtlList");
  assert.equal(detailUrl.searchParams.get("isbn13"), "9788971998557");
  assert.equal(detailUrl.searchParams.get("loaninfoYN"), "Y");

  assert.equal(librariesByBookUrl.origin + librariesByBookUrl.pathname, "https://data4library.kr/api/libSrchByBook");
  assert.equal(librariesByBookUrl.searchParams.get("isbn"), "9788971998557");
  assert.equal(librariesByBookUrl.searchParams.get("region"), "11");
  assert.equal(librariesByBookUrl.searchParams.get("dtl_region"), "11010");
  assert.equal(librariesByBookUrl.searchParams.get("pageNo"), "2");
  assert.equal(librariesByBookUrl.searchParams.get("pageSize"), "20");

  assert.equal(librarySearchUrl.origin + librarySearchUrl.pathname, "https://data4library.kr/api/libSrch");
  assert.equal(librarySearchUrl.searchParams.get("libCode"), "111001");
  assert.equal(librarySearchUrl.searchParams.get("region"), "11");
  assert.equal(librarySearchUrl.searchParams.get("dtl_region"), "11010");
  assert.equal(librarySearchUrl.searchParams.get("pageNo"), "3");
  assert.equal(librarySearchUrl.searchParams.get("pageSize"), "30");

  for (const upstream of [detailUrl, librariesByBookUrl, librarySearchUrl]) {
    assert.equal(upstream.searchParams.get("authKey"), "server-key");
    assert.equal(upstream.searchParams.get("format"), "json");
  }

  assert.deepEqual(detail.json().query, {
    isbn13: "9788971998557",
    loaninfoYN: "Y"
  });
  assert.deepEqual(librariesByBook.json().query, {
    isbn: "9788971998557",
    region: "11",
    pageNo: 2,
    pageSize: 20,
    dtl_region: "11010"
  });
  assert.deepEqual(librarySearch.json().query, {
    pageNo: 3,
    pageSize: 30,
    libCode: "111001",
    region: "11",
    dtl_region: "11010"
  });
});

test("data4library book-exists endpoint requires library code and isbn13 then proxies", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ response: { result: { hasBook: "Y", loanAvailable: "N" } } }), {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      DATA4LIBRARY_AUTH_KEY: "server-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const bad = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-exists?libraryCode=111001&isbn13=abc"
  });
  const invalidIsbn10 = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-exists?libraryCode=111001&isbn13=0-306-40615-3"
  });
  const ok = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-exists?libraryCode=111001&isbn13=9788971998557"
  });
  const isbn10 = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-exists?libraryCode=111001&isbn13=0-306-40615-2"
  });
  const isbn10X = await app.inject({
    method: "GET",
    url: "/v1/data4library/book-exists?libraryCode=111001&isbn13=0-8044-2957-X"
  });

  assert.equal(bad.statusCode, 400);
  assert.equal(invalidIsbn10.statusCode, 400);
  assert.equal(invalidIsbn10.json().error, "bad_request");
  assert.equal(ok.statusCode, 200);
  assert.equal(isbn10.statusCode, 200);
  assert.equal(isbn10X.statusCode, 200);
  assert.equal(fetchCalls.length, 3);
  const upstream = new URL(fetchCalls[0]);
  assert.equal(upstream.origin + upstream.pathname, "https://data4library.kr/api/bookExist");
  assert.equal(upstream.searchParams.get("libCode"), "111001");
  assert.equal(upstream.searchParams.get("isbn13"), "9788971998557");

  const isbn10Upstream = new URL(fetchCalls[1]);
  assert.equal(isbn10Upstream.origin + isbn10Upstream.pathname, "https://data4library.kr/api/bookExist");
  assert.equal(isbn10Upstream.searchParams.get("libCode"), "111001");
  assert.equal(isbn10Upstream.searchParams.get("isbn13"), "9780306406157");
  assert.deepEqual(isbn10.json().query, {
    library_code: "111001",
    isbn13: "9780306406157"
  });

  const isbn10XUpstream = new URL(fetchCalls[2]);
  assert.equal(isbn10XUpstream.origin + isbn10XUpstream.pathname, "https://data4library.kr/api/bookExist");
  assert.equal(isbn10XUpstream.searchParams.get("libCode"), "111001");
  assert.equal(isbn10XUpstream.searchParams.get("isbn13"), "9780804429573");
  assert.deepEqual(isbn10X.json().query, {
    library_code: "111001",
    isbn13: "9780804429573"
  });
});

function buildParkingDatasetFetchMock({ fetchCalls, totalCount, seoulRow, otherRows = [] }) {
  return async (url) => {
    const resolved = String(url);
    fetchCalls.push(resolved);
    const urlObject = new URL(resolved);
    assert.match(resolved, /^https:\/\/api\.data\.go\.kr\/openapi\/tn_pubr_prkplce_info_api\?/);
    assert.equal(urlObject.searchParams.get("serviceKey"), "data-key");
    assert.equal(urlObject.searchParams.get("type"), "json");
    assert.ok(!urlObject.searchParams.has("rdnmadr"));
    assert.ok(!urlObject.searchParams.has("lnmadr"));
    assert.ok(!urlObject.searchParams.has("prkplceSe"));

    const pageNo = Number(urlObject.searchParams.get("pageNo") || 1);
    const items = pageNo === 1 ? [seoulRow, ...otherRows] : [];
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: {
          pageNo,
          numOfRows: items.length,
          totalCount,
          items
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("parking lot search endpoint caches the full dataset and serves nearby queries from memory", async (t) => {
  const { resetParkingDatasetCacheForTests } = require("../src/parking-lots");
  resetParkingDatasetCacheForTests();

  const originalFetch = global.fetch;
  const fetchCalls = [];
  const seoulRow = {
    prkplceNo: "111-2-000003",
    prkplceNm: "광화문광장 공영주차장",
    prkplceSe: "공영",
    prkplceType: "노상",
    rdnmadr: "서울특별시 종로구 세종대로 172",
    prkcmprt: "20",
    parkingchrgeInfo: "무료",
    institutionNm: "서울특별시 종로구청",
    latitude: "37.57375",
    longitude: "126.97836",
    pwdbsPpkZoneYn: "N",
    referenceDate: "2026-03-01",
    insttCode: "3000000",
    insttNm: "서울특별시 종로구"
  };
  const jejuRow = {
    prkplceNo: "500-2-000001",
    prkplceNm: "제주공영주차장",
    prkplceSe: "공영",
    prkplceType: "노외",
    rdnmadr: "제주특별자치도 제주시 연동 1",
    prkcmprt: "100",
    parkingchrgeInfo: "무료",
    latitude: "33.4761",
    longitude: "126.5472",
    pwdbsPpkZoneYn: "N",
    referenceDate: "2026-03-01"
  };
  global.fetch = buildParkingDatasetFetchMock({
    fetchCalls,
    totalCount: 2,
    seoulRow,
    otherRows: [jejuRow]
  });

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "data-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    resetParkingDatasetCacheForTests();
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?latitude=37.57371315593711&longitude=126.97833785777944&limit=2&radius=1000"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?lat=37.57371315593711&lon=126.97833785777944&limit=2&radius=1000"
  });
  const third = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?latitude=37.58&longitude=126.98&limit=2&radius=2000"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(third.statusCode, 200);
  assert.equal(first.json().items.length, 1);
  assert.equal(first.json().items[0].name, "광화문광장 공영주차장");
  assert.equal(first.json().items[0].providerName, "서울특별시 종로구");
  assert.equal(first.json().meta.datasetCacheHit, false);
  assert.equal(third.json().meta.datasetCacheHit, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("parking lot search endpoint filters cached dataset by radius and excludes private lots by default", async (t) => {
  const { resetParkingDatasetCacheForTests } = require("../src/parking-lots");
  resetParkingDatasetCacheForTests();

  const originalFetch = global.fetch;
  const fetchCalls = [];
  const privateSeoulRow = {
    prkplceNo: "111-2-000002",
    prkplceNm: "세종로 민영주차장",
    prkplceSe: "민영",
    prkplceType: "노외",
    rdnmadr: "서울특별시 종로구 세종대로 170",
    prkcmprt: "100",
    parkingchrgeInfo: "유료",
    latitude: "37.573714",
    longitude: "126.978339",
    referenceDate: "2026-03-01"
  };
  const publicSeoulRow = {
    prkplceNo: "111-2-000003",
    prkplceNm: "광화문광장 공영주차장",
    prkplceSe: "공영",
    prkplceType: "노상",
    rdnmadr: "서울특별시 종로구 세종대로 172",
    prkcmprt: "20",
    parkingchrgeInfo: "무료",
    latitude: "37.57375",
    longitude: "126.97836",
    pwdbsPpkZoneYn: "N",
    referenceDate: "2026-03-01"
  };
  global.fetch = buildParkingDatasetFetchMock({
    fetchCalls,
    totalCount: 2,
    seoulRow: publicSeoulRow,
    otherRows: [privateSeoulRow]
  });

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-key" } });

  t.after(async () => {
    global.fetch = originalFetch;
    resetParkingDatasetCacheForTests();
    await app.close();
  });

  const publicOnly = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?latitude=37.57375&longitude=126.97836&limit=5&radius=500"
  });
  const includePrivate = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?latitude=37.57375&longitude=126.97836&limit=5&radius=500&public_only=false"
  });

  assert.equal(publicOnly.statusCode, 200);
  assert.equal(includePrivate.statusCode, 200);
  assert.equal(publicOnly.json().items.length, 1);
  assert.equal(publicOnly.json().items[0].name, "광화문광장 공영주차장");
  const includedCategories = includePrivate.json().items.map((item) => item.category);
  assert.equal(includePrivate.json().items.length, 2);
  assert.ok(includedCategories.includes("공영"));
  assert.ok(includedCategories.includes("민영"));
});

test("parking lot search endpoint validates coordinates before upstream calls", async (t) => {
  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "data-key"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?latitude=oops&longitude=126.9"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
  assert.match(response.json().message, /latitude and longitude/);
});

test("parking lot search endpoint reports missing Data.go.kr key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/parking-lots/search?latitude=37.57371315593711&longitude=126.97833785777944"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
  assert.match(response.json().message, /DATA_GO_KR_API_KEY/);
});
test("lh-notice search endpoint stays public and caches normalized queries", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push(String(url));
    return new Response(
      JSON.stringify([
        { CMN: { CODE: "SUCCESS", ERR_MSG: "", TOTAL_CNT: 2 } },
        {
          dsList: [
            {
              PAN_ID: "2015122300019828",
              PAN_NM: "2026년 상반기 부산광역시 영구임대주택 예비입주자 모집 공고",
              UPP_AIS_TP_CD: "06",
              AIS_TP_CD: "09",
              AIS_TP_CD_NM: "영구임대",
              CNP_CD_NM: "부산광역시",
              PAN_SS: "공고중",
              PAN_DT: "2026-04-21",
              CLSG_DT: "2026-05-06",
              SPL_INF_TP_CD: "051",
              CCR_CNNT_SYS_DS_CD: "03",
              DTL_URL: "https://apply.lh.or.kr/detail?panId=2015122300019828"
            },
            {
              PAN_ID: "2015122300019816",
              PAN_NM: "2026 전세임대형 든든주택 모집 공고",
              UPP_AIS_TP_CD: "13",
              AIS_TP_CD: "17",
              AIS_TP_CD_NM: "전세임대",
              CNP_CD_NM: "전국",
              PAN_SS: "공고중"
            }
          ]
        }
      ]),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "data-go-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/lh-notice/search?panSs=%EA%B3%B5%EA%B3%A0%EC%A4%91&limit=10"
  });
  const firstBody = first.json();
  assert.equal(first.statusCode, 200);
  assert.equal(firstBody.proxy.cache.hit, false);
  assert.equal(firstBody.items.length, 2);
  assert.equal(firstBody.items[0].pan_id, "2015122300019828");
  assert.equal(firstBody.items[0].ais_tp_cd_nm, "영구임대");
  assert.equal(firstBody.summary.returned_count, 2);
  assert.equal(firstBody.summary.total_count, 2);
  assert.equal(firstBody.query.pan_ss, "공고중");
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /PG_SZ=10/);
  assert.match(fetchCalls[0], /PAGE=1/);
  assert.match(fetchCalls[0], /serviceKey=data-go-key/);

  const second = await app.inject({
    method: "GET",
    url: "/v1/lh-notice/search?status=%EA%B3%B5%EA%B3%A0%EC%A4%91&pageSize=10"
  });
  const secondBody = second.json();
  assert.equal(second.statusCode, 200);
  assert.equal(secondBody.proxy.cache.hit, true, "alias-normalized second call must reuse cache");
  assert.equal(fetchCalls.length, 1, "cache hit must not hit upstream again");
});

test("lh-notice search returns 400 for unsupported panSs", async (t) => {
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { await app.close(); });

  const response = await app.inject({
    method: "GET",
    url: "/v1/lh-notice/search?panSs=%EB%8C%80%EA%B8%B0%EC%A4%91"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
  assert.match(response.json().message, /panSs must be one of/);
});

test("lh-notice search returns 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer();
  t.after(async () => { await app.close(); });

  const response = await app.inject({
    method: "GET",
    url: "/v1/lh-notice/search"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
  assert.match(response.json().message, /DATA_GO_KR_API_KEY/);
});

test("lh-notice search does not cache upstream XML auth errors so retries self-heal", async (t) => {
  const originalFetch = global.fetch;
  const xmlError = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<OpenAPI_ServiceResponse>
  <cmmMsgHeader>
    <errMsg>SERVICE ERROR</errMsg>
    <returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>
    <returnReasonCode>30</returnReasonCode>
  </cmmMsgHeader>
</OpenAPI_ServiceResponse>`;

  let mode = "fail";
  const successPayload = [
    { CMN: { CODE: "SUCCESS", ERR_MSG: "", TOTAL_CNT: 1 } },
    { dsList: [{ PAN_ID: "111", PAN_NM: "recovered notice" }] }
  ];

  global.fetch = async () => {
    if (mode === "fail") {
      return new Response(xmlError, { status: 200, headers: { "content-type": "text/xml" } });
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const first = await app.inject({ method: "GET", url: "/v1/lh-notice/search" });
  assert.equal(first.statusCode, 502);
  assert.equal(first.json().error, "upstream_error");
  assert.equal(first.json().upstream_code, "30");

  mode = "ok";

  const second = await app.inject({ method: "GET", url: "/v1/lh-notice/search" });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, false, "failure must not have been cached");
  assert.equal(second.json().items[0].pan_id, "111");
});

test("lh-notice detail endpoint requires all three codes and caches successful lookups", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(
      JSON.stringify([
        { CMN: { CODE: "SUCCESS", ERR_MSG: "", TOTAL_CNT: 1 } },
        {
          dsList: [
            {
              PAN_ID: "2015122300019828",
              PAN_NM: "영구임대 예비입주자 모집",
              UPP_AIS_TP_CD: "06",
              AIS_TP_CD_NM: "영구임대",
              HOUSE_TY: "29㎡",
              SPL_CNT: "120"
            }
          ]
        }
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const missing = await app.inject({ method: "GET", url: "/v1/lh-notice/detail" });
  assert.equal(missing.statusCode, 400);
  assert.match(missing.json().message, /Provide panId/);

  const first = await app.inject({
    method: "GET",
    url: "/v1/lh-notice/detail?panId=2015122300019828&ccrCnntSysDsCd=03&splInfTpCd=051"
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(first.json().notice.pan_id, "2015122300019828");
  assert.equal(first.json().notice.ais_tp_cd_nm, "영구임대");
  assert.equal(first.json().supply_infos.length, 1);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /lhLeaseNoticeDtlInfo1\/getLeaseNoticeDtlInfo1/);
  assert.match(fetchCalls[0], /PAN_ID=2015122300019828/);
  assert.match(fetchCalls[0], /CCR_CNNT_SYS_DS_CD=03/);
  assert.match(fetchCalls[0], /SPL_INF_TP_CD=051/);

  const second = await app.inject({
    method: "GET",
    url: "/v1/lh-notice/detail?panId=2015122300019828&ccrCnntSysDsCd=03&splInfTpCd=051"
  });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls.length, 1, "cached detail must not retrigger upstream");
});

// Pins the /v1/lh-notice/detail failure-not-cached contract against BOTH
// cache-protection layers:
//   (a) the early-return catch block in the route handler (no `cache.set`
//       is reached on upstream failure; see src/server.js lh-notice/detail
//       route), and
//   (b) the `isFailureResponse()` guard inside `cache.set` (refuses any
//       payload with `.error` set; see src/server.js createMemoryCache).
// Bypassing either layer alone makes the State 2 self-heal assertion
// ("detail failure must not have been cached — retry must hit upstream")
// fail — proven by independent sabotage audit in PR #158 Round 3 review.
// See the sibling /search failure-not-cached test above for symmetric
// coverage across the two lh-notice routes.
test("lh-notice detail does not cache upstream XML auth errors so retries self-heal", async (t) => {
  const originalFetch = global.fetch;
  const xmlError = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<OpenAPI_ServiceResponse>
  <cmmMsgHeader>
    <errMsg>SERVICE ERROR</errMsg>
    <returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>
    <returnReasonCode>30</returnReasonCode>
  </cmmMsgHeader>
</OpenAPI_ServiceResponse>`;

  let mode = "fail";
  const fetchCalls = [];
  const successPayload = [
    { CMN: { CODE: "SUCCESS", ERR_MSG: "", TOTAL_CNT: 1 } },
    {
      dsList: [
        {
          PAN_ID: "2015122300019828",
          PAN_NM: "영구임대 예비입주자 모집 (recovered)",
          UPP_AIS_TP_CD: "06",
          AIS_TP_CD_NM: "영구임대",
          HOUSE_TY: "29㎡",
          SPL_CNT: "120"
        }
      ]
    }
  ];

  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (mode === "fail") {
      return new Response(xmlError, { status: 200, headers: { "content-type": "text/xml" } });
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const detailUrl =
    "/v1/lh-notice/detail?panId=2015122300019828&ccrCnntSysDsCd=03&splInfTpCd=051";

  const first = await app.inject({ method: "GET", url: detailUrl });
  assert.equal(first.statusCode, 502);
  assert.equal(first.json().error, "upstream_error");
  assert.equal(first.json().upstream_code, "30");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(fetchCalls.length, 1, "first call must hit upstream exactly once");

  mode = "ok";

  const second = await app.inject({ method: "GET", url: detailUrl });
  assert.equal(second.statusCode, 200);
  assert.equal(
    second.json().proxy.cache.hit,
    false,
    "detail failure must not have been cached — retry must hit upstream"
  );
  assert.equal(second.json().notice.pan_id, "2015122300019828");
  assert.match(second.json().notice.pan_nm, /recovered/);
  assert.equal(
    fetchCalls.length,
    2,
    "second call must hit upstream again (no cache for failure)"
  );

  mode = "fail";

  const third = await app.inject({ method: "GET", url: detailUrl });
  assert.equal(
    third.statusCode,
    200,
    "third call must hit cache (success was cached)"
  );
  assert.equal(third.json().proxy.cache.hit, true);
  assert.equal(
    fetchCalls.length,
    2,
    "third call must serve from cache (no new upstream fetch)"
  );
});

test("health endpoint reports lhNoticeConfigured when DATA_GO_KR_API_KEY is set", async (t) => {
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { await app.close(); });

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().upstreams.lhNoticeConfigured, true);
});

test("K-Startup normalizer enforces enums, ranges, and date order", () => {
  const normalized = normalizeKstartupQuery("announcements", {
    page: "2",
    perPage: "20",
    supt_regin: "서울특별시",
    pbanc_rcpt_bgng_dt: "2024-01-01",
    pbanc_rcpt_end_dt: "2024-12-31",
    rcrt_prgs_yn: "y",
    biz_yr: "2024"
  });
  assert.equal(normalized.page, 2);
  assert.equal(normalized.perPage, 20);
  assert.equal(normalized.supt_regin, "서울특별시");
  assert.equal(normalized.pbanc_rcpt_bgng_dt, "20240101");
  assert.equal(normalized.pbanc_rcpt_end_dt, "20241231");
  assert.equal(normalized.rcrt_prgs_yn, "Y");
  assert.equal(normalized.returnType, "json");
  assert.equal(normalized.biz_yr, undefined, "biz_yr is not in announcements allowlist");

  const businessInfo = normalizeKstartupQuery("business-info", { biz_yr: "2024", biz_category_cd: "cmrczn_Tab3" });
  assert.equal(businessInfo.biz_yr, "2024");
  assert.equal(businessInfo.biz_category_cd, "cmrczn_Tab3");

  assert.throws(() => normalizeKstartupQuery("announcements", { rcrt_prgs_yn: "maybe" }), /rcrt_prgs_yn/);
  assert.throws(() => normalizeKstartupQuery("announcements", { pbanc_rcpt_bgng_dt: "20241301" }), /pbanc_rcpt_bgng_dt/);
  assert.throws(() => normalizeKstartupQuery("announcements", {
    pbanc_rcpt_bgng_dt: "20240601", pbanc_rcpt_end_dt: "20240101"
  }), /earlier than or equal/);
  assert.throws(() => normalizeKstartupQuery("announcements", { perPage: "0" }), /perPage/);
  assert.throws(() => normalizeKstartupQuery("announcements", { perPage: "101" }), /perPage/);
  assert.throws(() => normalizeKstartupQuery("unknown-op", {}), /Unknown K-Startup operation/);
  assert.throws(() => normalizeKstartupQuery("business-info", { biz_yr: "24" }), /biz_yr/);
});

test("K-Startup announcements route proxies GET with server-side ServiceKey", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({
        currentCount: 1,
        matchCount: 1,
        data: [{ biz_pbanc_nm: "테스트 공고", supt_regin: "서울특별시" }],
        page: 1, perPage: 10, totalCount: 1
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kstartup/announcements?supt_regin=" + encodeURIComponent("서울특별시") + "&rcrt_prgs_yn=Y"
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.data[0].biz_pbanc_nm, "테스트 공고");
  assert.equal(body.proxy.cache.hit, false);
  assert.equal(body.query.rcrt_prgs_yn, "Y");
  const upstreamUrl = new URL(calls[0].url);
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname,
    "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01");
  assert.equal(upstreamUrl.searchParams.get("ServiceKey"), "data-go-key");
  assert.equal(upstreamUrl.searchParams.get("rcrt_prgs_yn"), "Y");
  assert.equal(upstreamUrl.searchParams.get("returnType"), "json");

  const cached = await app.inject({
    method: "GET",
    url: "/v1/kstartup/announcements?supt_regin=" + encodeURIComponent("서울특별시") + "&rcrt_prgs_yn=Y"
  });
  assert.equal(cached.statusCode, 200);
  assert.equal(cached.json().proxy.cache.hit, true);
  assert.equal(calls.length, 1, "second call must come from cache, not upstream");
});

test("K-Startup route reports 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer({ env: {} });
  t.after(async () => { await app.close(); });

  const response = await app.inject({ method: "GET", url: "/v1/kstartup/business-info?page=1" });
  assert.equal(response.statusCode, 503);
  const body = response.json();
  assert.equal(body.error, "upstream_not_configured");
  assert.match(body.message, /DATA_GO_KR_API_KEY/);
});

test("K-Startup route returns 400 for invalid params before hitting upstream", async (t) => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kstartup/announcements?pbanc_rcpt_bgng_dt=2024-13-01"
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
  assert.equal(called, false, "must not call upstream on bad request");
});

test("K-Startup route surfaces data.go.kr error envelopes without caching", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const first = await app.inject({ method: "GET", url: "/v1/kstartup/contents?page=1" });
  assert.equal(first.statusCode, 502);
  assert.equal(first.json().error, "upstream_error");

  const second = await app.inject({ method: "GET", url: "/v1/kstartup/contents?page=1" });
  assert.equal(second.statusCode, 502);
  assert.equal(calls, 2, "upstream error responses must not be cached");
});

test("K-Startup unknown operation returns 404 via proxyKstartupRequest", async () => {
  const { proxyKstartupRequest } = require("../src/kstartup");
  const result = await proxyKstartupRequest({ operation: "bogus", query: {}, serviceKey: "k" });
  assert.equal(result.statusCode, 404);
  assert.match(result.body, /not_found/);
});

test("health endpoint reports kstartupConfigured when DATA_GO_KR_API_KEY is set", async (t) => {
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { await app.close(); });

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().upstreams.kstartupConfigured, true);
});

test("K-Startup cache keys partition by query so distinct filters trigger distinct upstream calls", async (t) => {
  const originalFetch = global.fetch;
  const upstreamCalls = [];
  global.fetch = async (url) => {
    upstreamCalls.push(String(url));
    return new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  await app.inject({ method: "GET", url: "/v1/kstartup/announcements?supt_regin=" + encodeURIComponent("서울특별시") });
  await app.inject({ method: "GET", url: "/v1/kstartup/announcements?supt_regin=" + encodeURIComponent("부산광역시") });
  await app.inject({ method: "GET", url: "/v1/kstartup/announcements?supt_regin=" + encodeURIComponent("서울특별시") + "&rcrt_prgs_yn=Y" });
  await app.inject({ method: "GET", url: "/v1/kstartup/announcements?supt_regin=" + encodeURIComponent("서울특별시") });

  assert.equal(upstreamCalls.length, 3,
    "3 distinct queries must call upstream 3 times; the 4th repeats query #1 and must hit the cache");
});

test("K-Startup proxy forces returnType=json even when caller asks for xml", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  const response = await app.inject({
    method: "GET",
    url: "/v1/kstartup/contents?returnType=xml&clss_cd=notice_matr"
  });
  assert.equal(response.statusCode, 200);
  const upstreamUrl = new URL(calls[0]);
  assert.equal(upstreamUrl.searchParams.get("returnType"), "json",
    "proxy must rewrite returnType to json regardless of client input");
});

test("K-Startup integer fields reject non-numeric input before upstream call", async (t) => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });

  for (const bad of ["abc", "0", "-1"]) {
    const response = await app.inject({ method: "GET", url: "/v1/kstartup/announcements?page=" + bad });
    assert.equal(response.statusCode, 400, `page=${bad} must 400`);
  }
  assert.equal(called, false, "upstream must not be called for any invalid integer input");
});
