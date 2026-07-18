const test = require("node:test");
const assert = require("node:assert/strict");

const { buildServer } = require("../src/server");
const {
  RISS_OPEN_API_URL,
  fetchKerisAcademicSearch,
  normalizeKerisAcademicQuery,
  parseRissXml
} = require("../src/keris-academic");

const SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<record>
  <head><totalcount>2</totalcount><Error>0</Error><ErrorMessage>No Error</ErrorMessage></head>
  <metadata>
    <riss.type>A</riss.type>
    <riss.title>인공지능 교육 연구 &amp; 적용</riss.title>
    <riss.author>김연구 이학술</riss.author>
    <riss.publisher>한국교육학회</riss.publisher>
    <riss.pubdate>2025</riss.pubdate>
    <riss.stitle>교육정보연구</riss.stitle>
    <riss.image>Y</riss.image><riss.charge>1</riss.charge>
    <url>https://www.riss.kr/link?id=A123</url>
  </metadata>
  <metadata>
    <riss.type>U</riss.type>
    <riss.title><![CDATA[대학도서관과 AI]]></riss.title>
    <riss.author>박도서</riss.author>
    <riss.publisher>학술출판사</riss.publisher>
    <riss.pubdate>2024</riss.pubdate>
    <riss.image>N</riss.image>
    <riss.holdings>서울대학교 중앙도서관</riss.holdings>
    <riss.holdings>한국교육학술정보원</riss.holdings>
    <url>http://www.riss.kr/link?id=U456</url>
  </metadata>
</record>`;

test("KERIS academic query validates search fields, aliases, and pagination", () => {
  assert.deepEqual(normalizeKerisAcademicQuery({
    keyword: "인공지능 교육",
    resourceType: "B",
    page: "2",
    pageSize: "25"
  }), {
    keyword: "인공지능 교육",
    resourceType: "B",
    upstreamTypes: ["U"],
    page: 2,
    pageSize: 25,
    rsnum: 26
  });

  assert.deepEqual(normalizeKerisAcademicQuery({ title: "교육", author: "김연구", resource_type: "D" }), {
    title: "교육",
    author: "김연구",
    resourceType: "D",
    upstreamTypes: ["A"],
    page: 1,
    pageSize: 10,
    rsnum: 1
  });

  for (const resourceType of ["ALL", "T", "A", "D", "B"]) {
    assert.doesNotThrow(() => normalizeKerisAcademicQuery({ keyword: "교육", resourceType }));
  }
});

test("KERIS academic query rejects caller keys, unknown fields, and invalid pagination", () => {
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", key: "caller" }), /key.*proxy/i);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", serviceKey: "caller" }), /serviceKey.*proxy/i);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", version: "2" }), /version.*proxy/i);
  assert.throws(() => normalizeKerisAcademicQuery({ resourceType: "T" }), /search field/i);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", resourceType: "X" }), /resourceType/);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", page: "0" }), /page/);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", pageSize: "101" }), /pageSize/);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", extra: "no" }), /extra/);
  assert.throws(() => normalizeKerisAcademicQuery({ keyword: "교육", resourceType: "ALL", page: "2" }), /combined resourceType/i);
});

test("RISS XML parser summarizes metadata, repeated fields, and full-text availability", () => {
  const parsed = parseRissXml(SUCCESS_XML);
  assert.equal(parsed.totalCount, 2);
  assert.equal(parsed.items[0].title, "인공지능 교육 연구 & 적용");
  assert.deepEqual(parsed.items[0].authors, ["김연구", "이학술"]);
  assert.equal(parsed.items[0].publisher, "한국교육학회");
  assert.equal(parsed.items[0].year, "2025");
  assert.equal(parsed.items[0].link, "https://www.riss.kr/link?id=A123");
  assert.equal(parsed.items[0].full_text_available, true);
  assert.equal(parsed.items[0].full_text_access, "free");
  assert.deepEqual(parsed.items[1].holdings, ["서울대학교 중앙도서관", "한국교육학술정보원"]);
  assert.equal(parsed.items[1].full_text_available, false);

  const empty = parseRissXml("<record><head><totalcount>0</totalcount><Error>0</Error><ErrorMessage>No Error</ErrorMessage></head></record>");
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalCount, 0);
});

test("RISS XML parser returns typed semantic and parse errors", () => {
  assert.throws(
    () => parseRissXml("<record><head><totalcount>0</totalcount><Error>004</Error><ErrorMessage>인증 오류</ErrorMessage></head></record>"),
    (error) => error.code === "upstream_forbidden"
  );
  assert.throws(
    () => parseRissXml("<record><head><totalcount>0</totalcount><Error>005</Error><ErrorMessage>일일 호출량 초과</ErrorMessage></head></record>"),
    (error) => error.code === "upstream_quota_exceeded"
  );
  assert.throws(
    () => parseRissXml("<record><head><Error>0</Error></head><metadata>"),
    (error) => error.code === "upstream_invalid_response"
  );
  assert.throws(
    () => parseRissXml("<record><head><totalcount>0</totalcount></head></record>"),
    (error) => error.code === "upstream_invalid_response"
  );
});

test("combined RISS results are round-robin merged without exposing raw metadata", async () => {
  const xmlFor = (type) => `<record><head><totalcount>1</totalcount><Error>0</Error></head><metadata><riss.type>${type}</riss.type><riss.title>${type} result</riss.title><future.secret>hidden</future.secret></metadata></record>`;
  const result = await fetchKerisAcademicSearch({
    params: normalizeKerisAcademicQuery({ keyword: "교육", resourceType: "A", pageSize: 2 }),
    apiKey: "server-key",
    fetchImpl: async (url) => new Response(xmlFor(new URL(url).searchParams.get("type")), { status: 200 })
  });
  assert.deepEqual(result.items.map((item) => item.resource_type), ["A", "O"]);
  assert.equal("raw" in result.items[0], false);
  assert.equal(JSON.stringify(result).includes("future.secret"), false);
});

test("KERIS fetch injects only the dedicated RISS key and redacts output", async () => {
  const seen = [];
  const result = await fetchKerisAcademicSearch({
    params: normalizeKerisAcademicQuery({ keyword: "교육", resourceType: "T", page: 2, pageSize: 10 }),
    apiKey: "riss server +/==",
    fetchImpl: async (url) => {
      seen.push(String(url));
      return new Response(SUCCESS_XML, { status: 200, headers: { "content-type": "text/xml" } });
    }
  });

  assert.equal(seen.length, 1);
  const url = new URL(seen[0]);
  assert.equal(`${url.origin}${url.pathname}`, RISS_OPEN_API_URL);
  assert.equal(url.searchParams.get("key"), "riss server +/==");
  assert.equal(url.searchParams.get("version"), "1.0");
  assert.equal(url.searchParams.get("type"), "T");
  assert.equal(url.searchParams.get("rsnum"), "11");
  assert.equal(url.searchParams.get("rowcount"), "10");
  assert.equal(url.searchParams.get("serviceKey"), null);
  assert.equal(JSON.stringify(result).includes("riss server"), false);
  assert.equal(result.source.data_go_kr_dataset, null);
  assert.equal(result.source.related_catalog_dataset, "15071949");
});

test("KERIS route validates before fetch, uses dedicated env compatibility, and caches only success", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(SUCCESS_XML, { status: 200, headers: { "content-type": "text/xml" } });
  };
  const app = buildServer({ env: { KSKILL_RISS_API_KEY: "primary-riss", DATA_GO_KR_API_KEY: "must-not-use" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const invalid = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=교육&key=caller" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0);

  const route = "/v1/keris-academic/search?keyword=교육&resourceType=T&page=1&pageSize=10";
  const first = await app.inject({ method: "GET", url: route });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  const cached = await app.inject({ method: "GET", url: route });
  assert.equal(cached.statusCode, 200);
  assert.equal(cached.json().proxy.cache.hit, true);
  assert.equal(calls, 1);
  assert.equal(first.body.includes("primary-riss"), false);
  assert.equal(first.body.includes("must-not-use"), false);

  const compatible = buildServer({ env: { RISS_API_KEY: "compat-riss" } });
  t.after(() => compatible.close());
  const health = await compatible.inject({ method: "GET", url: "/health" });
  assert.equal(health.json().upstreams.kerisAcademicConfigured, true);

  const blankPrimary = buildServer({ env: { KSKILL_RISS_API_KEY: "   ", RISS_API_KEY: "compat-riss" } });
  t.after(() => blankPrimary.close());
  const blankPrimaryHealth = await blankPrimary.inject({ method: "GET", url: "/health" });
  assert.equal(blankPrimaryHealth.json().upstreams.kerisAcademicConfigured, true);
});

test("KERIS route reports missing key and does not cache auth or quota errors", async (t) => {
  const missing = buildServer({ env: { DATA_GO_KR_API_KEY: "unrelated" } });
  t.after(() => missing.close());
  const unavailable = await missing.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=교육" });
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().error, "upstream_not_configured");

  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response("<record><head><totalcount>0</totalcount><Error>004</Error><ErrorMessage>인증 오류</ErrorMessage></head></record>", { status: 200 });
  };
  const app = buildServer({ env: { KSKILL_RISS_API_KEY: "must-not-leak" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=교육&resourceType=T" });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().error, "upstream_forbidden");
    assert.equal(response.body.includes("must-not-leak"), false);
  }
  assert.equal(calls, 2);
});

test("combined RISS fan-out consumes a proportional route rate limit", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(SUCCESS_XML, { status: 200 });
  const app = buildServer({ env: {
    KSKILL_RISS_API_KEY: "server-key",
    KSKILL_PROXY_RATE_LIMIT_MAX: "6"
  } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  const first = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=first&resourceType=ALL" });
  assert.equal(first.statusCode, 200);
  const second = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=second&resourceType=ALL" });
  assert.equal(second.statusCode, 429);
  assert.equal(second.json().error, "rate_limited");
});

test("mixed RISS traffic shares one weighted rate-limit budget", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(SUCCESS_XML, { status: 200 });
  };
  const app = buildServer({ env: {
    KSKILL_RISS_API_KEY: "server-key",
    KSKILL_PROXY_RATE_LIMIT_MAX: "9"
  } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const all = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=all&resourceType=ALL" });
  assert.equal(all.statusCode, 200);
  const articles = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=articles&resourceType=A" });
  assert.equal(articles.statusCode, 200);
  const single = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=single&resourceType=T" });
  assert.equal(single.statusCode, 200);
  assert.equal(calls, 9);

  const exhausted = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=exhausted&resourceType=B" });
  assert.equal(exhausted.statusCode, 429);
  assert.equal(exhausted.json().error, "rate_limited");
  assert.equal(calls, 9);
});

test("cached composite RISS traffic charges only the normal request cost", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(SUCCESS_XML, { status: 200 });
  };
  const app = buildServer({ env: {
    KSKILL_RISS_API_KEY: "server-key",
    KSKILL_PROXY_RATE_LIMIT_MAX: "7"
  } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const route = "/v1/keris-academic/search?keyword=cached&resourceType=ALL";
  const first = await app.inject({ method: "GET", url: route });
  const cached = await app.inject({ method: "GET", url: route });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(cached.statusCode, 200);
  assert.equal(cached.json().proxy.cache.hit, true);
  assert.equal(calls, 6);

  const afterCache = await app.inject({ method: "GET", url: "/v1/keris-academic/search?keyword=after-cache&resourceType=T" });
  assert.equal(afterCache.statusCode, 429);
  assert.equal(calls, 6);
});
