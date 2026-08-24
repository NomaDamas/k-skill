const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeKoroadQuery, fetchKoroad } = require("../src/koroad");
const { buildServer } = require("../src/server");

test("KOROAD normalizes allowlisted hotspot queries", () => {
  assert.equal(normalizeKoroadQuery("child", { year: "2024", sido: "11", gugun: "680" }).kind, "child");
  assert.throws(() => normalizeKoroadQuery("unknown", {}), /Unsupported category/);
  assert.throws(() => normalizeKoroadQuery("child", { year: "2024", sido: "11" }), /sido and gugun/);
});
test("KOROAD fetch injects server key and normalizes rows", async () => {
  let url;
  const result = await fetchKoroad({
    apiKey: "secret",
    ...normalizeKoroadQuery("child", { year: "2024", sido: "11", gugun: "680" }),
    fetchImpl: async (value) => {
      url = new URL(value);
      return new Response(JSON.stringify({ resultCode: "00", totalCount: 1, items: { item: [{ spot_nm: "테스트", lo_crd: "127", la_crd: "37" }] } }), { status: 200 });
    }
  });
  assert.equal(url.searchParams.get("authKey"), "secret");
  assert.equal(result.items[0].spot_name, "테스트");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test("KOROAD route handles missing key and cache", async (t) => {
  const app = buildServer({ env: {} });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/koroad/traffic-accident/hotspots?category=child&year=2024&sido=11&gugun=680" });
  assert.equal(response.statusCode, 503);
});
