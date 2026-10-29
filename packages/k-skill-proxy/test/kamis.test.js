const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildServer,
  normalizeKamisQuery
} = require("../src/server");

test("KAMIS normalizer emits the official underscored upstream parameter names", () => {
  assert.deepEqual(normalizeKamisQuery({
    p_product_cls_code: "02",
    p_country_code: "1101",
    p_item_category_code: "200",
    p_regday: "2026-08-24",
    p_convert_kg_yn: "N"
  }), {
    p_product_cls_code: "02",
    p_item_category_code: "200",
    p_country_code: "1101",
    p_regday: "2026-08-24",
    p_convert_kg_yn: "N"
  });
});

test("KAMIS route injects key, normalizes success, and caches", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      condition: [{ p_cert_key: "secret-must-not-return" }],
      data: {
        error_code: "000",
        item: [{ item_code: "245", item_name: "양파", dpr1: "18,800", unit: "15kg" }]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const app = buildServer({ env: { KAMIS_API_KEY: "kamis-secret" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/kamis/food-price/daily-category?p_product_cls_code=01&p_country_code=1101&p_item_category_code=200";
  const first = await app.inject({ method: "GET", url });
  const second = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().items[0].item_name, "양파");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.match(calls[0], /p_product_cls_code=01/);
  assert.match(calls[0], /p_country_code=1101/);
  assert.match(calls[0], /p_item_category_code=200/);
  assert.doesNotMatch(calls[0], /p_productclscode|p_countycode|p_itemcategorycode/);
  assert.doesNotMatch(JSON.stringify(first.json()), /kamis-secret|secret-must-not-return/);
});

test("KAMIS route fails closed when upstream silently returns another category", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ data: { error_code: "000", item: [{ item_code: "111", item_name: "쌀" }] } }), { status: 200 });
  const app = buildServer({ env: { KAMIS_API_KEY: "kamis-secret" } });
  t.after(async () => { global.fetch = originalFetch; await app.close(); });
  const response = await app.inject({ method: "GET", url: "/v1/kamis/food-price/daily-category?p_item_category_code=400" });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "upstream_category_mismatch");
});

test("KAMIS route reports missing key", async (t) => {
  const app = buildServer({ env: {} });
  t.after(async () => app.close());
  const missing = await app.inject({
    method: "GET",
    url: "/v1/kamis/food-price/daily-category"
  });
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.json().error, "upstream_not_configured");
});

test("KAMIS live E2E reaches the official endpoint when explicitly enabled", { skip: !process.env.KSKILL_LIVE_E2E }, async () => {
  const app = buildServer({
    env: {
      KAMIS_API_KEY: process.env.KAMIS_API_KEY
    }
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/kamis/food-price/daily-category?p_product_cls_code=01&p_country_code=1101&p_item_category_code=200&p_regday=2026-08-24"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().upstream.error_code, "000");
    assert.ok(response.json().items.length > 0);
  } finally {
    await app.close();
  }
});
