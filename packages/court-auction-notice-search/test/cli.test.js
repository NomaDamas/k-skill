"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { parseArgs, USAGE, main } = require("../src/cli");

const binPath = path.join(__dirname, "..", "bin", "court-auction-notice-search.js");

test("parseArgs handles --key value, --key=value, and -h", () => {
  const result = parseArgs([
    "notices",
    "--date",
    "2026-04-27",
    "--court-code=B000210",
    "--bid-type",
    "date",
    "--pretty",
    "-h"
  ]);
  assert.deepEqual(result._, ["notices"]);
  assert.equal(result.flags.date, "2026-04-27");
  assert.equal(result.flags["court-code"], "B000210");
  assert.equal(result.flags["bid-type"], "date");
  assert.equal(result.flags.pretty, true);
  assert.equal(result.flags.help, true);
});

test("USAGE describes the supported subcommands", () => {
  assert.match(USAGE, /notices --date/);
  assert.match(USAGE, /notice-detail/);
  assert.match(USAGE, /case --court-code/);
  assert.match(USAGE, /search \[--region <시도\[:시군구raw\[:읍면동raw\]\]>/);
  assert.match(USAGE, /\[--usage /);
  assert.match(USAGE, /\[--sido <code\|name>\]/);
  assert.match(USAGE, /\[--sigungu <raw-code>\]/);
  assert.match(USAGE, /\[--dong <raw-code>\]/);
  assert.match(USAGE, /\[--page-size 10\|20\|50\|100\]/);
  assert.match(USAGE, /\[--usage-large /);
  assert.match(USAGE, /codes courts/);
  assert.match(USAGE, /codes usages/);
  assert.match(USAGE, /codes regions/);
  assert.match(USAGE, /codes bid-types/);
  assert.match(USAGE, /BLOCKED/);
});

test("main returns 0 and prints help when invoked with no args", async () => {
  const writes = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    const code = await main([]);
    assert.equal(code, 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.match(writes.join(""), /USAGE/);
});

test("CLI codes bid-types subcommand returns 기일입찰 + 기간입찰 from the static codetable", () => {
  const result = spawnSync(process.execPath, [binPath, "codes", "bid-types", "--pretty"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.items.length, 2);
  assert.deepEqual(
    parsed.items.map((item) => item.code).sort(),
    ["000331", "000332"]
  );
});

test("CLI codes usages and regions expose Workflow C frozen codetables", () => {
  const usages = spawnSync(process.execPath, [binPath, "codes", "usages"], {
    encoding: "utf8"
  });
  assert.equal(usages.status, 0, `stderr: ${usages.stderr}`);
  const usagesParsed = JSON.parse(usages.stdout);
  assert.ok(
    usagesParsed.items.some((item) => item.name === "건물" && item.code === "20000"),
    "expected 건물=20000 to come from upstream selectLclLst.on capture"
  );
  assert.ok(
    usagesParsed.items.some((item) => item.name === "토지" && item.code === "10000")
  );

  const regions = spawnSync(process.execPath, [binPath, "codes", "regions"], {
    encoding: "utf8"
  });
  assert.equal(regions.status, 0, `stderr: ${regions.stderr}`);
  const regionsParsed = JSON.parse(regions.stdout);
  assert.ok(
    regionsParsed.items.some((item) => item.sidoName === "서울특별시" && item.sidoCode === "11"),
    "expected 서울특별시=11 to come from upstream selectAdongSdLst.on capture"
  );
  assert.equal(
    regionsParsed.items.length,
    19,
    "expected all 19 시도 from upstream"
  );
});

test("CLI search supports --region and --usage colon-form parsing (Issue #184 Q3)", () => {
  const { parseArgs: pa } = require("../src/cli");
  const result = pa([
    "search",
    "--region",
    "서울특별시:강남구:역삼동",
    "--usage",
    "건물:공동주택:아파트",
    "--bid-type",
    "date"
  ]);
  assert.equal(result.flags.region, "서울특별시:강남구:역삼동");
  assert.equal(result.flags.usage, "건물:공동주택:아파트");
});

test("CLI rejects --date with an obviously invalid format", () => {
  const result = spawnSync(
    process.execPath,
    [binPath, "notices", "--date", "not-a-date"],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be YYYY-MM, YYYYMM, YYYY-MM-DD or YYYYMMDD/);
});

test("CLI prints usage and exits non-zero on unknown command", () => {
  const result = spawnSync(process.execPath, [binPath, "bogus-command"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown command/);
});

test("CLI -h prints help with exit 0", () => {
  const result = spawnSync(process.execPath, [binPath, "-h"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /USAGE/);
});
