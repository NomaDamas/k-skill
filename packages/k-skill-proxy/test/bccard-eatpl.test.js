"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBccardEatplSearchUrl,
  createTraceNumberFactory,
  fetchBccardEatplSearch,
  formatTraceNumber,
  normalizeBccardEatplSearchQuery
} = require("../src/bccard-eatpl");
const { buildServer } = require("../src/server");

test("normalizes location and genre search inputs", () => {
  assert.deepEqual(normalizeBccardEatplSearchQuery({
    address: " 서울 중구 을지로 ",
    genre: " 카페 "
  }), { location: "서울 중구 을지로", merNm: null, merTpbuzNm: "카페" });
  assert.throws(() => normalizeBccardEatplSearchQuery({}), /at least one/);
});

test("creates documented trace number format", () => {
  assert.equal(
    formatTraceNumber("bccard", new Date("2026-08-26T00:00:00Z"), 1),
    "bccard202608260000000001"
  );
  const next = createTraceNumberFactory({
    instNm: "bccard",
    now: () => new Date("2026-08-26T00:00:00Z")
  });
  assert.match(next(), /^bccard20260826\d{10}$/);
});

test("posts server-side credentials and returns eatpl data", async () => {
  const calls = [];
  const result = await fetchBccardEatplSearch({
    query: normalizeBccardEatplSearchQuery({ location: "서울 종로구", genre: "카페" }),
    instNm: "bccard",
    baseUrl: "https://api.paybooc.ai/api/mer",
    nextTraceNumber: () => "bccard202608260000000001",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        rspCode: "00000",
        rspMessage: "Success",
        data: [{ merNm: "테스트 카페", merUrl: "https://web.paybooc.ai/mer/web/profile/test" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(calls[0].url, "https://api.paybooc.ai/api/mer/v1/search");
  assert.equal(JSON.parse(calls[0].options.body).trnsTrceNo, "bccard202608260000000001");
  assert.equal(JSON.parse(calls[0].options.body).instNm, "bccard");
  assert.equal(result.items[0].merUrl, "https://web.paybooc.ai/mer/web/profile/test");
  assert.equal(result.attribution, "eat.pl 잇플 · BC카드 결제 데이터 기반");
});

test("builds the documented upstream path", () => {
  assert.equal(
    buildBccardEatplSearchUrl("https://api.paybooc.ai/api/mer").pathname,
    "/api/mer/v1/search"
  );
});

test("can send the search through an authenticated fixed-egress relay", async () => {
  const calls = [];
  const result = await fetchBccardEatplSearch({
    query: normalizeBccardEatplSearchQuery({ location: "서울 종로구", genre: "일반한식" }),
    instNm: "kskill",
    relayUrl: "https://eatpl-relay.nomadamas.org/v1/search",
    relayToken: "relay-secret",
    nextTraceNumber: () => {
      throw new Error("relay mode must not generate caller trace numbers");
    },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        rspCode: "00000",
        rspMessage: "Success",
        data: []
      }), { status: 200 });
    }
  });
  assert.equal(calls[0].url, "https://eatpl-relay.nomadamas.org/v1/search");
  assert.equal(calls[0].options.headers.authorization, "Bearer relay-secret");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    location: "서울 종로구",
    merNm: null,
    merTpbuzNm: "일반한식"
  });
  assert.equal(result.upstream.provider, "bccard-eatpl-relay");
  assert.equal(result.upstream.url, undefined);
});

test("refuses to call upstream directly without a configured base URL", async () => {
  await assert.rejects(
    () => fetchBccardEatplSearch({
      query: normalizeBccardEatplSearchQuery({ location: "서울 종로구" }),
      instNm: "kskill",
      nextTraceNumber: () => "kskill202608260000000001",
      fetchImpl: async () => {
        throw new Error("upstream must not be called without a base URL");
      }
    }),
    (error) => error.statusCode === 503 && error.code === "upstream_not_configured"
  );
});

test("refuses to call the relay without a bearer token", async () => {
  await assert.rejects(
    () => fetchBccardEatplSearch({
      query: normalizeBccardEatplSearchQuery({ location: "서울 종로구" }),
      instNm: "kskill",
      relayUrl: "https://eatpl-relay.nomadamas.org/v1/search",
      fetchImpl: async () => {
        throw new Error("relay must not be called without a token");
      }
    }),
    (error) => error.statusCode === 503 && error.code === "upstream_not_configured"
  );
});

test("proxy route hides institution credentials, caches, and rejects invalid input", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      rspCode: "00000",
      rspMessage: "Success",
      data: [{ merNm: "프록시 맛집", merUrl: "https://web.paybooc.ai/mer/web/profile/proxy" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({
    env: {
      BCCARD_EATPL_INST_NM: "bccard-test",
      BCCARD_EATPL_API_BASE_URL: "https://api.paybooc.ai/api/mer",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    },
    now: () => new Date("2026-08-26T00:00:00Z")
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const invalid = await app.inject({ method: "GET", url: "/v1/bccard-eatpl/search" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, "bad_request");

  const first = await app.inject({
    method: "GET",
    url: "/v1/bccard-eatpl/search?location=%EC%84%9C%EC%9A%B8%20%EC%A4%91%EA%B5%AC&genre=%EC%B9%B4%ED%8E%98"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/bccard-eatpl/search?location=%EC%84%9C%EC%9A%B8%20%EC%A4%91%EA%B5%AC&genre=%EC%B9%B4%ED%8E%98"
  });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(first.json().items[0].merNm, "프록시 맛집");
  assert.equal(second.json().proxy.cache.hit, true);
  const upstreamBody = JSON.parse(calls[0].options.body);
  assert.equal(upstreamBody.instNm, "bccard-test");
  assert.match(upstreamBody.trnsTrceNo, /^bccard-test20260826\d{10}$/);
});
