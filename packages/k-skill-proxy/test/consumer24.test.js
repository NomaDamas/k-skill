const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildServer,
  normalizeConsumer24GoodsQuery,
  normalizeConsumer24RecallQuery
} = require("../src/server");

test("consumer24 maps service catalog IDs to public recall menu IDs", () => {
  assert.deepEqual(normalizeConsumer24RecallQuery({
    service_id: "00000010",
    productNm: "전기장판"
  }), {
    serviceId: "00000010",
    pageNo: 1,
    cntPerPage: 10,
    cntntsId: "0101",
    productNm: "전기장판"
  });
});

test("consumer24 goods uses its separate goodsCd contract", () => {
  assert.deepEqual(normalizeConsumer24GoodsQuery({
    goodsCd: "02_33",
    perPage: 5
  }), {
    goodsCd: "02_33",
    pageNo: 1,
    cntPerPage: 5
  });
});

test("consumer24 proxy route keeps service keys server-side and parses XML", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      "<response><code>00</code><codeMsg>NORMAL</codeMsg><allCnt>1</allCnt><content><cntntsId>0101</cntntsId><recallSn>R1</recallSn><productNm>전기장판</productNm></content></response>",
      { status: 200, headers: { "content-type": "application/xml" } }
    );
  };
  const app = buildServer({
    env: {
      CONSUMER24_SERVICE_KEY_00000010: "consumer-secret"
    }
  });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  const response = await app.inject({
    method: "GET",
    url: "/v1/consumer24/recalls?service_id=00000010&productNm=%EC%A0%84%EA%B8%B0%EC%9E%A5%ED%8C%90"
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().cntnts_id, "0101");
  assert.equal(response.json().items[0].recallSn, "R1");
  assert.match(calls[0], /cntntsId=0101/);
  assert.doesNotMatch(JSON.stringify(response.json()), /consumer-secret/);
});

test("consumer24 route reports missing service-specific key", async (t) => {
  const app = buildServer({ env: {} });
  t.after(async () => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/v1/consumer24/recalls?service_id=00000010"
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("consumer24 live E2E probes every configured service when enabled", { skip: !process.env.KSKILL_LIVE_E2E }, async (t) => {
  const serviceIds = Object.keys(process.env)
    .filter((key) => /^CONSUMER24_SERVICE_KEY_000000(0[6-9]|1[0-4]|2[89]|3[01])$/.test(key))
    .map((key) => key.replace("CONSUMER24_SERVICE_KEY_", ""));
  if (!serviceIds.length) {
    t.skip("no consumer24 service keys configured");
    return;
  }
  const env = {};
  for (const serviceId of serviceIds) {
    env[`CONSUMER24_SERVICE_KEY_${serviceId}`] = process.env[`CONSUMER24_SERVICE_KEY_${serviceId}`];
  }
  const app = buildServer({ env });
  try {
    for (const serviceId of serviceIds) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/consumer24/recalls?service_id=${serviceId}&perPage=1`
      });
      assert.equal(response.statusCode, 200, serviceId);
      assert.equal(response.json().service_id, serviceId);
    }
  } finally {
    await app.close();
  }
});
