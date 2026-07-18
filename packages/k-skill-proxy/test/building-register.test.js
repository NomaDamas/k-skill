const test = require("node:test");
const assert = require("node:assert/strict");

const { buildServer } = require("../src/server");
const {
  BUILDING_REGISTER_URL,
  fetchBuildingRegisterTitle,
  normalizeBuildingRegisterQuery,
  parseBuildingRegisterXml
} = require("../src/building-register");

const SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <mgmBldrgstPk>11680-100263223</mgmBldrgstPk>
        <regstrKindCdNm>일반건축물</regstrKindCdNm>
        <platPlc>서울특별시 강남구 역삼동 123-4</platPlc>
        <newPlatPlc>서울특별시 강남구 테헤란로 1</newPlatPlc>
        <sigunguCd>11680</sigunguCd><bjdongCd>10100</bjdongCd>
        <platGbCd>0</platGbCd><bun>0123</bun><ji>0004</ji>
        <mainPurpsCdNm>업무시설 &amp; 근린생활시설</mainPurpsCdNm>
        <totArea>1234.56</totArea><grndFlrCnt>12</grndFlrCnt><ugrndFlrCnt>3</ugrndFlrCnt>
        <useAprDay>20240131</useAprDay><etcPurps>사무소 &lt;업무&gt;</etcPurps>
      </item>
    </items>
    <numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount>
  </body>
</response>`;

test("building register query maps PNU land categories and preserves explicit API values", () => {
  assert.deepEqual(normalizeBuildingRegisterQuery({ pnu: "1168010100101230004" }), {
    pnu: "1168010100101230004",
    sigunguCd: "11680",
    bjdongCd: "10100",
    platGbCd: "0",
    bun: "0123",
    ji: "0004",
    pageNo: 1,
    numOfRows: 10
  });
  assert.equal(normalizeBuildingRegisterQuery({ pnu: "1168010100201230004" }).platGbCd, "1");

  for (const platGbCd of ["0", "1", "2"]) {
    const normalized = normalizeBuildingRegisterQuery({
      sigunguCd: "11680", bjdongCd: "10100", platGbCd, bun: "7", ji: "2", pageNo: "3", numOfRows: "100"
    });
    assert.equal(normalized.platGbCd, platGbCd);
    assert.equal(normalized.bun, "0007");
    assert.equal(normalized.ji, "0002");
    assert.equal(normalized.pnu, { 0: "1168010100100070002", 1: "1168010100200070002", 2: null }[platGbCd]);
  }
});

test("building register query rejects conflicting, missing, malformed, and caller-key inputs", () => {
  assert.throws(() => normalizeBuildingRegisterQuery({}), /pnu|sigunguCd/i);
  assert.throws(() => normalizeBuildingRegisterQuery({ pnu: "1168010100101230004", sigunguCd: "11680" }), /either|같이|combine/i);
  assert.throws(() => normalizeBuildingRegisterQuery({ pnu: "123" }), /19/);
  assert.throws(() => normalizeBuildingRegisterQuery({ pnu: "1168010100001230004" }), /pnu|land|category/i);
  assert.throws(() => normalizeBuildingRegisterQuery({ pnu: "1168010100301230004" }), /pnu|land|category/i);
  assert.throws(() => normalizeBuildingRegisterQuery({ sigunguCd: "11680", bjdongCd: "10100", platGbCd: "0" }), /bun/);
  assert.throws(() => normalizeBuildingRegisterQuery({ sigunguCd: "11680", bjdongCd: "10100", platGbCd: "3", bun: "1" }), /platGbCd/);
  assert.throws(() => normalizeBuildingRegisterQuery({ sigunguCd: "11680", bjdongCd: "10100", platGbCd: "0", bun: "12345" }), /bun/);
  assert.throws(() => normalizeBuildingRegisterQuery({ pnu: "1168010100101230004", numOfRows: "101" }), /numOfRows/);
  assert.throws(() => normalizeBuildingRegisterQuery({ pnu: "1168010100101230004", serviceKey: "caller-key" }), /serviceKey/);
});

test("building register XML parser handles singleton, entities, and empty items", () => {
  const parsed = parseBuildingRegisterXml(SUCCESS_XML);
  assert.equal(parsed.totalCount, 1);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].mainPurpsCdNm, "업무시설 & 근린생활시설");
  assert.equal(parsed.items[0].etcPurps, "사무소 <업무>");
  assert.equal(parsed.items[0].totArea, "1234.56");

  const empty = parseBuildingRegisterXml(`
    <response><header><resultCode>00</resultCode><resultMsg>NORMAL</resultMsg></header>
    <body><items></items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body></response>`);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalCount, 0);
});

test("building register fetch uses the exact official URL and server key", async () => {
  let seenUrl = "";
  const result = await fetchBuildingRegisterTitle({
    params: normalizeBuildingRegisterQuery({ pnu: "1168010100101230004" }),
    serviceKey: "server secret +/==",
    fetchImpl: async (url) => {
      seenUrl = String(url);
      return new Response(SUCCESS_XML, { status: 200, headers: { "content-type": "application/xml" } });
    }
  });
  const url = new URL(seenUrl);
  assert.equal(`${url.origin}${url.pathname}`, BUILDING_REGISTER_URL);
  assert.equal(url.searchParams.get("serviceKey"), "server secret +/==");
  assert.equal(url.searchParams.get("sigunguCd"), "11680");
  assert.equal(url.searchParams.get("bjdongCd"), "10100");
  assert.equal(url.searchParams.get("platGbCd"), "0");
  assert.equal(url.searchParams.get("bun"), "0123");
  assert.equal(url.searchParams.get("ji"), "0004");
  assert.equal(url.searchParams.get("_type"), null);
  assert.equal(result.items[0].platPlc.includes("역삼동"), true);
  assert.equal(result.source.data_go_kr_dataset, "15134735");
  assert.equal(JSON.stringify(result).includes("server secret"), false);
});

test("building register fetch classifies missing key, HTTP auth, semantic auth, empty, and invalid XML", async () => {
  const params = normalizeBuildingRegisterQuery({ pnu: "1168010100101230004" });
  const missing = await fetchBuildingRegisterTitle({ params, serviceKey: null, fetchImpl: async () => assert.fail("no fetch") });
  assert.equal(missing.status_code, 503);
  assert.equal(missing.error, "upstream_not_configured");

  const responses = [
    new Response("forbidden", { status: 401 }),
    new Response("forbidden", { status: 403 }),
    new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", { status: 200 }),
    new Response("<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED</resultMsg></header></response>", { status: 200 }),
    new Response("", { status: 200 }),
    new Response("not xml", { status: 200 }),
    new Response("<response><header><resultCode>00</resultCode></header><body>", { status: 200 })
  ];
  for (const response of responses) {
    const result = await fetchBuildingRegisterTitle({ params, serviceKey: "secret", fetchImpl: async () => response });
    assert.equal(result.status_code, 502);
    assert.match(result.error, /^upstream_/);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("building register fetch classifies non-auth semantic and gateway XML as upstream errors", async () => {
  const params = normalizeBuildingRegisterQuery({ pnu: "1168010100101230004" });
  const responses = [
    new Response("<response><header><resultCode>99</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</resultMsg></header></response>", { status: 200 }),
    new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>99</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>", { status: 200 })
  ];
  for (const response of responses) {
    const result = await fetchBuildingRegisterTitle({ params, serviceKey: "secret", fetchImpl: async () => response });
    assert.equal(result.status_code, 502);
    assert.equal(result.error, "upstream_error");
  }
});

test("building register route validates, caches semantic successes only, and does not cache auth errors", async (t) => {
  const originalFetch = global.fetch;
  let mode = "success";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (mode === "auth") {
      return new Response("<response><header><resultCode>30</resultCode><resultMsg>AUTH ERROR</resultMsg></header></response>", { status: 200 });
    }
    return new Response(SUCCESS_XML, { status: 200, headers: { "content-type": "application/xml" } });
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "proxy-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const invalid = await app.inject({ method: "GET", url: "/v1/building-register/title?serviceKey=caller" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0);

  const route = "/v1/building-register/title?pnu=1168010100101230004";
  const first = await app.inject({ method: "GET", url: route });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().proxy.cache.hit, false);
  const cached = await app.inject({ method: "GET", url: route });
  assert.equal(cached.statusCode, 200);
  assert.equal(cached.json().proxy.cache.hit, true);
  assert.equal(calls, 1);

  mode = "auth";
  const authRoute = "/v1/building-register/title?pnu=1168010100109990001";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({ method: "GET", url: authRoute });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().error, "upstream_forbidden");
  }
  assert.equal(calls, 3);
});

test("building register route returns 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer({ env: {} });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/building-register/title?pnu=1168010100101230004" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("building register route maps PNU land categories without changing explicit API values", async (t) => {
  const originalFetch = global.fetch;
  const upstreamUrls = [];
  global.fetch = async (url) => {
    upstreamUrls.push(new URL(String(url)));
    return new Response(
      "<response><header><resultCode>00</resultCode></header><body><items></items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body></response>",
      { status: 200, headers: { "content-type": "application/xml" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "server-key" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const normal = await app.inject({ method: "GET", url: "/v1/building-register/title?pnu=1168010100101230004" });
  const mountain = await app.inject({ method: "GET", url: "/v1/building-register/title?pnu=1168010100201230004" });
  assert.equal(normal.statusCode, 200);
  assert.equal(mountain.statusCode, 200);
  assert.equal(upstreamUrls[0].searchParams.get("platGbCd"), "0");
  assert.equal(upstreamUrls[1].searchParams.get("platGbCd"), "1");

  const invalid = await app.inject({ method: "GET", url: "/v1/building-register/title?pnu=1168010100001230004" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(upstreamUrls.length, 2);

  for (const platGbCd of ["0", "1", "2"]) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/building-register/title?sigunguCd=11680&bjdongCd=10100&platGbCd=${platGbCd}&bun=${platGbCd}7`
    });
    assert.equal(response.statusCode, 200);
    assert.equal(upstreamUrls.at(-1).searchParams.get("platGbCd"), platGbCd);
  }
});
