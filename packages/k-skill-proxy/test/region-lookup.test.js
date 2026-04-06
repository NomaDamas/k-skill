const test = require("node:test");
const assert = require("node:assert/strict");

const { searchRegionCode } = require("../src/region-lookup");

test("searchRegionCode finds by single token", () => {
  const results = searchRegionCode("강남구");
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.lawd_cd === "11680"));
  assert.ok(results.every((r) => r.name.includes("강남구")));
});

test("searchRegionCode finds by multiple tokens", () => {
  const results = searchRegionCode("서울 강남구");
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.name.includes("서울") && r.name.includes("강남구")));
});

test("searchRegionCode returns empty for no match", () => {
  const results = searchRegionCode("존재하지않는지역");
  assert.equal(results.length, 0);
});

test("searchRegionCode returns empty for empty/null input", () => {
  assert.equal(searchRegionCode("").length, 0);
  assert.equal(searchRegionCode(null).length, 0);
  assert.equal(searchRegionCode(undefined).length, 0);
});

test("searchRegionCode returns at most 10 results", () => {
  const results = searchRegionCode("시");
  assert.ok(results.length <= 10);
});

test("searchRegionCode finds 세종특별자치시", () => {
  const results = searchRegionCode("세종");
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.name.includes("세종")));
});
