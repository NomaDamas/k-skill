const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_REFERER,
  DEFAULT_USER_AGENT,
  buildKoreanLawUrl,
  fetchKoreanLaw,
  isUserVerificationFailure,
  normalizeKoreanLawDetailQuery,
  normalizeKoreanLawSearchQuery,
  proxyKoreanLawRequest
} = require("../src/korean-law");

const noopSleep = async () => {};

function jsonResponse(body, { status = 200, contentType = "application/json; charset=utf-8" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

test("normalizeKoreanLawSearchQuery requires a target", () => {
  assert.throws(() => normalizeKoreanLawSearchQuery({ query: "관세법" }), /target is required/);
});

test("normalizeKoreanLawSearchQuery rejects an unsupported target", () => {
  assert.throws(() => normalizeKoreanLawSearchQuery({ target: "evil", query: "x" }), /Unsupported target/);
});

test("normalizeKoreanLawSearchQuery requires a search query", () => {
  assert.throws(() => normalizeKoreanLawSearchQuery({ target: "law" }), /search query is required/);
});

test("normalizeKoreanLawSearchQuery keeps only allowlisted params and defaults type to JSON", () => {
  const normalized = normalizeKoreanLawSearchQuery({
    target: "prec",
    query: "부당해고",
    display: "5",
    curt: "대법원",
    evil: "drop-me"
  });

  assert.equal(normalized.target, "prec");
  assert.equal(normalized.type, "JSON");
  assert.deepEqual(normalized.params, { query: "부당해고", display: "5", curt: "대법원" });
});

test("normalizeKoreanLawDetailQuery requires an identifier", () => {
  assert.throws(() => normalizeKoreanLawDetailQuery({ target: "prec" }), /detail identifier is required/);
});

test("normalizeKoreanLawDetailQuery accepts ID and passthrough params", () => {
  const normalized = normalizeKoreanLawDetailQuery({ target: "prec", ID: "228541", JO: "0002", evil: "x" });
  assert.deepEqual(normalized.params, { ID: "228541", JO: "0002" });
});

test("normalizeType rejects unsupported types", () => {
  assert.throws(() => normalizeKoreanLawSearchQuery({ target: "law", query: "x", type: "csv" }), /Unsupported type/);
});

test("buildKoreanLawUrl injects OC, target, type and routes search vs detail", () => {
  const searchUrl = buildKoreanLawUrl({
    endpoint: "search",
    target: "prec",
    type: "JSON",
    params: { query: "부당해고" },
    oc: "secret-oc"
  });
  assert.match(searchUrl, /\/DRF\/lawSearch\.do\?/);
  assert.match(searchUrl, /OC=secret-oc/);
  assert.match(searchUrl, /target=prec/);
  assert.match(searchUrl, /type=JSON/);
  assert.match(searchUrl, /query=%EB%B6%80%EB%8B%B9%ED%95%B4%EA%B3%A0/);

  const detailUrl = buildKoreanLawUrl({
    endpoint: "detail",
    target: "prec",
    type: "JSON",
    params: { ID: "228541" },
    oc: "secret-oc"
  });
  assert.match(detailUrl, /\/DRF\/lawService\.do\?/);
  assert.match(detailUrl, /ID=228541/);
});

test("isUserVerificationFailure detects the law.go.kr rejection body", () => {
  assert.equal(isUserVerificationFailure('{"result":"사용자 정보 검증에 실패하였습니다."}'), true);
  assert.equal(isUserVerificationFailure('{"PrecSearch":{}}'), false);
});

test("fetchKoreanLaw sends browser User-Agent and Referer headers", async () => {
  let sentHeaders = null;
  const fetchImpl = async (_url, options) => {
    sentHeaders = options.headers;
    return jsonResponse({ PrecSearch: { prec: [] } });
  };

  await fetchKoreanLaw("https://www.law.go.kr/DRF/lawSearch.do", { fetchImpl, sleep: noopSleep });

  assert.equal(sentHeaders["User-Agent"], DEFAULT_USER_AGENT);
  assert.equal(sentHeaders.Referer, DEFAULT_REFERER);
});

test("fetchKoreanLaw honors custom User-Agent and Referer overrides", async () => {
  let sentHeaders = null;
  const fetchImpl = async (_url, options) => {
    sentHeaders = options.headers;
    return jsonResponse({ ok: true });
  };

  await fetchKoreanLaw("https://www.law.go.kr/DRF/lawSearch.do", {
    fetchImpl,
    sleep: noopSleep,
    userAgent: "custom-ua",
    referer: "https://example.test/"
  });

  assert.equal(sentHeaders["User-Agent"], "custom-ua");
  assert.equal(sentHeaders.Referer, "https://example.test/");
});

test("fetchKoreanLaw retries empty/HTML responses then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse("", { contentType: "application/json" });
    }
    if (calls === 2) {
      return jsonResponse("<html><body>maintenance</body></html>", { contentType: "text/html" });
    }
    return jsonResponse({ LawSearch: { law: [{ id: "1" }] } });
  };

  const result = await fetchKoreanLaw("https://www.law.go.kr/DRF/lawSearch.do", { fetchImpl, sleep: noopSleep });
  assert.equal(calls, 3);
  assert.match(result.body, /LawSearch/);
});

test("fetchKoreanLaw throws after exhausting retries on persistent empty bodies", async () => {
  const fetchImpl = async () => jsonResponse("", { contentType: "application/json" });
  await assert.rejects(
    () => fetchKoreanLaw("https://www.law.go.kr/DRF/lawSearch.do", { fetchImpl, sleep: noopSleep }),
    /empty or HTML/
  );
});

test("proxyKoreanLawRequest returns 503 when LAW_OC is not configured", async () => {
  const result = await proxyKoreanLawRequest({
    endpoint: "search",
    normalized: { target: "law", type: "JSON", params: { query: "관세법" } },
    oc: null,
    sleep: noopSleep
  });
  assert.equal(result.statusCode, 503);
  assert.match(result.body, /upstream_not_configured/);
});

test("proxyKoreanLawRequest passes the OC through to the upstream URL", async () => {
  let calledUrl = null;
  const fetchImpl = async (url) => {
    calledUrl = String(url);
    return jsonResponse({ LawSearch: { law: [] } });
  };

  const result = await proxyKoreanLawRequest({
    endpoint: "search",
    normalized: { target: "law", type: "JSON", params: { query: "관세법" } },
    oc: "secret-oc",
    fetchImpl,
    sleep: noopSleep
  });

  assert.equal(result.statusCode, 200);
  assert.match(calledUrl, /OC=secret-oc/);
  assert.match(calledUrl, /\/lawSearch\.do\?/);
});

test("proxyKoreanLawRequest maps a user-verification body to a 502 error", async () => {
  const fetchImpl = async () => jsonResponse({ result: "사용자 정보 검증에 실패하였습니다." });
  const result = await proxyKoreanLawRequest({
    endpoint: "search",
    normalized: { target: "law", type: "JSON", params: { query: "관세법" } },
    oc: "secret-oc",
    fetchImpl,
    sleep: noopSleep
  });

  assert.equal(result.statusCode, 502);
  assert.match(result.body, /law_user_verification_failed/);
});

test("proxyKoreanLawRequest surfaces upstream non-2xx responses verbatim", async () => {
  const fetchImpl = async () => jsonResponse("server error", { status: 500, contentType: "text/plain" });
  const result = await proxyKoreanLawRequest({
    endpoint: "detail",
    normalized: { target: "prec", type: "JSON", params: { ID: "228541" } },
    oc: "secret-oc",
    fetchImpl,
    sleep: noopSleep
  });

  assert.equal(result.statusCode, 500);
});
