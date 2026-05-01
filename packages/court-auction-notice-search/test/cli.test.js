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

test("USAGE describes the four subcommands", () => {
  assert.match(USAGE, /notices --date/);
  assert.match(USAGE, /notice-detail/);
  assert.match(USAGE, /case --court-code/);
  assert.match(USAGE, /codes courts/);
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
