const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCustomsQuery, fetchCustomsCargo } = require("../src/customs-cargo-clearance");
const { buildServer } = require("../src/server");

test("customs query requires a safe supported identifier", () => {
  assert.deepEqual(normalizeCustomsQuery({ hbl_no: "HBL123", bl_year: "2024" }), { cargMtNo: undefined, hblNo: "HBL123", mblNo: undefined, blYy: "2024" });
  assert.throws(() => normalizeCustomsQuery({ hbl_no: "HBL123" }), /blYear/);
  assert.throws(() => normalizeCustomsQuery({}), /cargMtNo/);
});
test("customs fetch injects crkyCn and redacts it", async () => {
  let url;
  const result = await fetchCustomsCargo({
    serviceKey: "secret",
    ...normalizeCustomsQuery({ hbl_no: "HBL123", bl_year: "2024" }),
    fetchImpl: async (value) => {
      url = new URL(value);
      return new Response("<response><cargCsclPrgsInfoDtlQryVo><prcsDttm>20240101</prcsDttm><prgsStts>반입</prgsStts></cargCsclPrgsInfoDtlQryVo></response>", { status: 200 });
    }
  });
  assert.equal(url.searchParams.get("crkyCn"), "secret");
  assert.equal(result.events[0].status, "반입");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test("customs route returns missing-key 503", async (t) => {
  const app = buildServer({ env: {} });
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/customs/cargo-clearance?hblNo=HBL123&blYear=2024" });
  assert.equal(response.statusCode, 503);
});
