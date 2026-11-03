const test = require("node:test");
const assert = require("node:assert/strict");

const { buildServer } = require("../src/server");
const {
  normalizeG2bOrderPlanQuery,
  extractOrderPlanItems
} = require("../src/g2b-order-plan");

test("g2b order-plan normalizer maps Korean aliases, dates, and keyword search params", () => {
  assert.deepEqual(
    normalizeG2bOrderPlanQuery({
      kind: "용역",
      keyword: "청소",
      orderFrom: "2025-01",
      orderTo: "2025.03",
      postedFrom: "2025-01-01",
      postedTo: "2025-01-31",
      institution: "조달청",
      page: "2",
      limit: "20"
    }),
    {
      kind: "service",
      operation: "getOrderPlanSttusListServcPPSSrch",
      pageNo: "2",
      numOfRows: "20",
      orderBgnYm: "202501",
      orderEndYm: "202503",
      inqryBgnDt: "202501010000",
      inqryEndDt: "202501312359",
      orderInsttNm: "조달청",
      bizNm: "청소"
    }
  );
});

test("g2b order-plan normalizer expands all kinds into four operation queries", () => {
  const normalized = normalizeG2bOrderPlanQuery({ kind: "전체", orderFrom: "2025-01", orderTo: "2025-01" });
  assert.equal(normalized.kind, "all");
  assert.deepEqual(Object.keys(normalized.operations).sort(), ["construction", "foreign", "goods", "service"]);
  assert.equal(normalized.operations.goods.operation, "getOrderPlanSttusListThngPPSSrch");
  assert.equal(normalized.operations.construction.operation, "getOrderPlanSttusListCnstwkPPSSrch");
  assert.equal(normalized.operations.service.operation, "getOrderPlanSttusListServcPPSSrch");
  assert.equal(normalized.operations.foreign.operation, "getOrderPlanSttusListFrgcptPPSSrch");
});

test("g2b order-plan normalizer validates kind, ranges, and page bounds", () => {
  assert.throws(() => normalizeG2bOrderPlanQuery({ kind: "unknown" }), /kind/);
  assert.throws(() => normalizeG2bOrderPlanQuery({ orderFrom: "2025-13" }), /orderFrom/);
  assert.throws(() => normalizeG2bOrderPlanQuery({ postedFrom: "2025-02-30" }), /postedFrom/);
  assert.throws(() => normalizeG2bOrderPlanQuery({ limit: "1000" }), /numOfRows/);
});

test("g2b extractOrderPlanItems tolerates empty, single, and list item envelopes", () => {
  assert.deepEqual(
    extractOrderPlanItems({ response: { header: { resultCode: "00" }, body: { items: "", totalCount: 0 } } }).items,
    []
  );
  const single = extractOrderPlanItems({
    response: { header: { resultCode: "00" }, body: { items: { item: { bizNm: "청소 용역" } }, totalCount: 1 } }
  });
  assert.equal(single.items.length, 1);
  assert.equal(single.totalCount, 1);
});

test("g2b order-plans route proxies search to the selected PPS operation and caches successes", async (t) => {
  const originalFetch = global.fetch;
  const seenUrls = [];
  global.fetch = async (url) => {
    seenUrls.push(String(url));
    return new Response(
      JSON.stringify({
        response: {
          header: { resultCode: "00" },
          body: {
            pageNo: 1,
            numOfRows: 10,
            totalCount: 1,
            items: { item: [{ orderPlanUntyNo: "2025-001", bizNm: "청소 용역", orderInsttNm: "조달청" }] }
          }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key-example" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/g2b/order-plans?kind=service&keyword=" + encodeURIComponent("청소")
    + "&orderFrom=2025-01&orderTo=2025-01&postedFrom=2025-01-01&postedTo=2025-01-31";
  const res = await app.inject({ method: "GET", url });
  const body = res.json();

  assert.equal(res.statusCode, 200);
  assert.equal(body.total_count, 1);
  assert.equal(body.items[0].bizNm, "청소 용역");
  assert.equal(body.query.operation, "getOrderPlanSttusListServcPPSSrch");
  assert.match(seenUrls[0], /OrderPlanSttusService\/getOrderPlanSttusListServcPPSSrch/);
  assert.match(seenUrls[0], /ServiceKey=data-go-key-example/);
  assert.doesNotMatch(seenUrls[0], /[?&]serviceKey=/);
  assert.match(seenUrls[0], /bizNm=%EC%B2%AD%EC%86%8C/);

  const cached = await app.inject({ method: "GET", url });
  assert.equal(cached.json().proxy.cache.hit, true);
  assert.equal(seenUrls.length, 1);
});
test("g2b order-plans route treats upstream no-data as an empty result", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({
      response: {
        header: { resultCode: "03", resultMsg: "NODATA_ERROR" },
        body: { pageNo: 1, numOfRows: 10, totalCount: 0, items: "" }
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key-example" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const res = await app.inject({
    method: "GET",
    url: "/v1/g2b/order-plans?kind=service&keyword=" + encodeURIComponent("존재하지않는검색어")
      + "&orderFrom=2025-01&orderTo=2025-01&postedFrom=2025-01-01&postedTo=2025-01-31"
  });
  const body = res.json();

  assert.equal(res.statusCode, 200);
  assert.equal(body.total_count, 0);
  assert.deepEqual(body.items, []);
  assert.equal(body.query.operation, "getOrderPlanSttusListServcPPSSrch");
});


test("g2b order-plans route reports missing proxy key", async (t) => {
  const app = buildServer();
  t.after(async () => {
    await app.close();
  });
  const res = await app.inject({
    method: "GET",
    url: "/v1/g2b/order-plans?orderFrom=2025-01&orderTo=2025-01&postedFrom=2025-01-01&postedTo=2025-01-31"
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "upstream_not_configured");
});
