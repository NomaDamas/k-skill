const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCareernetQuery, fetchCareernet } = require("../src/careernet");
const { buildServer } = require("../src/server");
test("CareerNet normalizes search and detail inputs", () => {
  assert.deepEqual(normalizeCareernetQuery("search", { keyword: "개발자", page: "2", limit: "5" }), { operation: "search", searchJobNm: "개발자", gubun: "job_dic_list", thisPage: "2", perPage: "5" });
  assert.deepEqual(normalizeCareernetQuery("detail", { jobCode: "123" }), { operation: "detail", seq: "123" });
  assert.throws(() => normalizeCareernetQuery("detail", {}), /seq/);
});
test("CareerNet fetch injects API key and redacts it", async () => {
  let url;
  const result = await fetchCareernet({
    apiKey: "secret",
    ...normalizeCareernetQuery("search", { keyword: "개발자" }),
    fetchImpl: async (value) => { url = new URL(value); return new Response(JSON.stringify({ dataSearch: { content: [{ job_nm: "개발자" }] } }), { status: 200 }); }
  });
  assert.equal(url.searchParams.get("apiKey"), "secret");
  assert.equal(result.data.dataSearch.content[0].job_nm, "개발자");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test("CareerNet route returns missing-key 503", async (t) => {
  const app = buildServer({ env: {} }); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/careernet/career/search?keyword=개발자" });
  assert.equal(response.statusCode, 503);
});
