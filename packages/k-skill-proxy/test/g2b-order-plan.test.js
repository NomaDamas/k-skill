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

test("g2b order-plan normalizer defaults to a rolling KST month window around now", () => {
  const normalized = normalizeG2bOrderPlanQuery({ kind: "service" }, new Date("2026-11-02T12:00:00Z"));
  assert.equal(normalized.orderBgnYm, "202610");
  assert.equal(normalized.orderEndYm, "202612");
  assert.equal(normalized.inqryBgnDt, "202610010000");
  assert.equal(normalized.inqryEndDt, "202612312359");
});

test("g2b order-plan default window follows the KST month across month and year boundaries", () => {
  // 2026-11-30T16:00Z is already 2026-12-01 01:00 in KST.
  const december = normalizeG2bOrderPlanQuery({ kind: "goods" }, new Date("2026-11-30T16:00:00Z"));
  assert.equal(december.orderBgnYm, "202611");
  assert.equal(december.orderEndYm, "202701");
  assert.equal(december.inqryBgnDt, "202611010000");
  assert.equal(december.inqryEndDt, "202701312359");

  const february = normalizeG2bOrderPlanQuery({ kind: "goods" }, new Date("2026-01-15T00:00:00Z"));
  assert.equal(february.orderBgnYm, "202512");
  assert.equal(february.orderEndYm, "202602");
  assert.equal(february.inqryEndDt, "202602282359");
});

test("g2b order-plan normalizer defaults every kind of an all-kinds request to the rolling window", () => {
  const normalized = normalizeG2bOrderPlanQuery({ kind: "all" }, new Date("2026-11-02T12:00:00Z"));
  for (const operation of Object.values(normalized.operations)) {
    assert.equal(operation.orderBgnYm, "202610");
    assert.equal(operation.orderEndYm, "202612");
    assert.equal(operation.inqryEndDt, "202612312359");
  }
});

test("g2b order-plan default posted window follows the effective order months", () => {
  const explicitOrder = normalizeG2bOrderPlanQuery({ kind: "service", orderFrom: "2025-01", orderTo: "2025-03" });
  assert.equal(explicitOrder.orderBgnYm, "202501");
  assert.equal(explicitOrder.orderEndYm, "202503");
  assert.equal(explicitOrder.inqryBgnDt, "202501010000");
  assert.equal(explicitOrder.inqryEndDt, "202503312359");

  const explicitPosted = normalizeG2bOrderPlanQuery(
    { kind: "service", postedFrom: "2025-01-01", postedTo: "2025-01-31" },
    new Date("2026-11-02T12:00:00Z")
  );
  assert.equal(explicitPosted.orderBgnYm, "202610");
  assert.equal(explicitPosted.orderEndYm, "202612");
  assert.equal(explicitPosted.inqryBgnDt, "202501010000");
  assert.equal(explicitPosted.inqryEndDt, "202501312359");
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


const KST_NOVEMBER_2026 = new Date("2026-11-02T12:00:00Z");

function stubOrderPlanUpstream(items = [{ orderPlanUntyNo: "2026-001", bizNm: "청소 용역" }]) {
  const originalFetch = global.fetch;
  const seenUrls = [];
  global.fetch = async (url) => {
    seenUrls.push(String(url));
    return new Response(
      JSON.stringify({
        response: {
          header: { resultCode: "00" },
          body: { pageNo: 1, numOfRows: items.length, totalCount: items.length, items: { item: items } }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  return { originalFetch, seenUrls };
}

test("g2b order-plans route sends a rolling default window when the caller omits dates", async (t) => {
  const { originalFetch, seenUrls } = stubOrderPlanUpstream();
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" }, now: () => KST_NOVEMBER_2026 });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const res = await app.inject({ method: "GET", url: "/v1/g2b/order-plans?kind=service&limit=2" });
  const body = res.json();

  assert.equal(res.statusCode, 200);
  assert.equal(body.query.orderBgnYm, "202610");
  assert.equal(body.query.orderEndYm, "202612");
  assert.equal(body.query.inqryBgnDt, "202610010000");
  assert.equal(body.query.inqryEndDt, "202612312359");

  const upstream = new URL(seenUrls[0]).searchParams;
  assert.equal(upstream.get("orderBgnYm"), "202610");
  assert.equal(upstream.get("orderEndYm"), "202612");
  assert.equal(upstream.get("inqryBgnDt"), "202610010000");
  assert.equal(upstream.get("inqryEndDt"), "202612312359");
});

test("g2b order-plans route keeps caller-supplied date ranges unchanged", async (t) => {
  const { originalFetch, seenUrls } = stubOrderPlanUpstream();
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" }, now: () => KST_NOVEMBER_2026 });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const res = await app.inject({
    method: "GET",
    url: "/v1/g2b/order-plans?kind=service&orderFrom=2025-01&orderTo=2025-03"
      + "&postedFrom=2025-01-01&postedTo=2025-01-31"
  });
  const body = res.json();

  assert.equal(res.statusCode, 200);
  assert.equal(body.query.orderBgnYm, "202501");
  assert.equal(body.query.orderEndYm, "202503");
  assert.equal(body.query.inqryBgnDt, "202501010000");
  assert.equal(body.query.inqryEndDt, "202501312359");

  const upstream = new URL(seenUrls[0]).searchParams;
  assert.equal(upstream.get("orderBgnYm"), "202501");
  assert.equal(upstream.get("orderEndYm"), "202503");
});

test("g2b order-plans route queries every kind with the rolling default window for kind=all", async (t) => {
  const { originalFetch, seenUrls } = stubOrderPlanUpstream();
  const app = buildServer({ env: { DATA_GO_KR_API_KEY: "data-go-key" }, now: () => KST_NOVEMBER_2026 });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const res = await app.inject({ method: "GET", url: "/v1/g2b/order-plans?kind=all&limit=1" });
  const body = res.json();

  assert.equal(res.statusCode, 200);
  assert.equal(seenUrls.length, 4);
  for (const seen of seenUrls) {
    const upstream = new URL(seen).searchParams;
    assert.equal(upstream.get("orderBgnYm"), "202610");
    assert.equal(upstream.get("orderEndYm"), "202612");
    assert.equal(upstream.get("inqryBgnDt"), "202610010000");
    assert.equal(upstream.get("inqryEndDt"), "202612312359");
  }
  assert.deepEqual(
    Object.keys(body.query.operations).sort(),
    ["construction", "foreign", "goods", "service"]
  );
  assert.equal(body.groups.length, 4);
  assert.equal(body.total_count, 4);
});
