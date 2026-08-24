const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeHrdQuery, fetchHrdKorea } = require("../src/hrdkorea");
const { buildServer } = require("../src/server");
test("HRDKorea normalizes exam schedule input", () => {
  assert.deepEqual(normalizeHrdQuery("exam-schedule", { year: "2026", qualgbCd: "T", limit: "5" }), { operation: "exam-schedule", implYy: "2026", pageNo: "1", numOfRows: "5", qualgbCd: "T" });
  assert.throws(() => normalizeHrdQuery("unknown", {}), /Unsupported operation/);
  assert.throws(() => normalizeHrdQuery("exam-schedule", { year: "26" }), /year/);
});
test("HRDKorea fetch injects serviceKey and redacts it", async () => {
  let url;
  const result = await fetchHrdKorea({
    serviceKey: "secret",
    ...normalizeHrdQuery("exam-schedule", { year: "2026" }),
    fetchImpl: async (value) => {
      url = new URL(value);
      return new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { totalCount: 1, items: { item: [{ description: "시험" }] } } } }), { status: 200 });
    }
  });
  assert.equal(url.searchParams.get("serviceKey"), "secret");
  assert.equal(result.items[0].description, "시험");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test("HRDKorea route returns missing-key 503", async (t) => {
  const app = buildServer({ env: {} });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/hrdkorea/qualification/exam-schedule?year=2026" });
  assert.equal(response.statusCode, 503);
});
