const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildReadOnlyCommand,
  checkSession,
  getAccountSummary,
  getPortfolioPositions,
  getQuote,
  listWatchlist,
  TossSessionExpiredError
} = require("../src/index");
const {
  assertReadOnlyCommandName,
  parseJsonOutput
} = require("../src/parse");

test("buildReadOnlyCommand assembles tossctl args for supported read-only commands", () => {
  const command = buildReadOnlyCommand("quoteGet", {
    symbol: "TSLA",
    configDir: "/tmp/toss",
    sessionFile: "/tmp/toss/session.json"
  });

  assert.equal(command.bin, "tossctl");
  assert.deepEqual(command.args, [
    "--output",
    "json",
    "--config-dir",
    "/tmp/toss",
    "--session-file",
    "/tmp/toss/session.json",
    "quote",
    "get",
    "TSLA"
  ]);
});

test("read-only command validation rejects unsupported or dangerous command names", () => {
  assert.equal(assertReadOnlyCommandName("accountSummary"), "accountSummary");
  assert.throws(() => assertReadOnlyCommandName("orderPlace"), /Unsupported read-only tossctl command/);
});

test("parseJsonOutput annotates JSON payloads with the originating command", () => {
  const result = parseJsonOutput('{"ok":true,"items":[1,2]}', "watchlistList");

  assert.equal(result.commandName, "watchlistList");
  assert.deepEqual(result.data, {
    ok: true,
    items: [1, 2]
  });
});

test("buildReadOnlyCommand adds the completed-orders market filter", () => {
  const command = buildReadOnlyCommand("ordersCompleted", {
    market: "us"
  });

  assert.deepEqual(command.args.slice(-4), [
    "orders",
    "completed",
    "--market",
    "us"
  ]);
});

test("public helpers execute a mock tossctl binary and parse its JSON output", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-"));
  const binDir = path.join(tempDir, "bin");
  const logFile = path.join(tempDir, "invocation.json");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
printf '%s\\n' "$@" > "${logFile}"
if [ "$7" = "account" ] && [ "$8" = "summary" ]; then
  printf '{"accountNo":"123-45","totalAssetAmount":1500000}\\n'
  exit 0
fi
if [ "$3" = "quote" ] && [ "$4" = "get" ]; then
  printf '{"symbol":"%s","price":123.45}\\n' "$5"
  exit 0
fi
printf '{"args":"%s"}\\n' "$*"
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`
  };
  const account = await getAccountSummary({
    configDir: "/tmp/toss-config",
    sessionFile: "/tmp/toss-session.json",
    env
  });
  const quote = await getQuote("005930", { env });

  assert.equal(account.commandName, "accountSummary");
  assert.equal(account.data.totalAssetAmount, 1500000);
  assert.equal(quote.data.symbol, "005930");
  assert.match(fs.readFileSync(logFile, "utf8"), /quote|get/);
});

test("account summary invalid session throws TossSessionExpiredError", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-expire-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
if [ "$3" = "account" ] && [ "$4" = "summary" ]; then
  echo "Error: stored session is no longer valid; run \\\`tossctl auth login\\\`" 1>&2
  exit 1
fi
printf '{"ok":true}\\n'
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(
    getAccountSummary({ env }),
    (error) => error instanceof TossSessionExpiredError && /stored session is no longer valid/.test(error.message)
  );
});

test("portfolio empty array with invalid auth doctor is promoted to TossSessionExpiredError", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-empty-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
if [ "$3" = "portfolio" ] && [ "$4" = "positions" ]; then
  printf '[]\\n'
  exit 0
fi
if [ "$3" = "auth" ] && [ "$4" = "doctor" ]; then
  printf '{"session":{"valid":false,"validation_error":"401"}}\\n'
  exit 0
fi
printf '{"ok":true}\\n'
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(getPortfolioPositions({ env }), TossSessionExpiredError);
  const passthrough = await getPortfolioPositions({ env, verifySessionOnEmpty: false });
  assert.deepEqual(passthrough.data, []);
});

test("portfolio blank stdout with invalid auth doctor is promoted to TossSessionExpiredError", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-blank-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
if [ "$3" = "portfolio" ] && [ "$4" = "positions" ]; then
  exit 0
fi
if [ "$3" = "auth" ] && [ "$4" = "doctor" ]; then
  printf '{"session":{"valid":false,"validation_error":"401"}}\\n'
  exit 0
fi
printf '{"ok":true}\\n'
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(
    getPortfolioPositions({ env }),
    (error) =>
      error instanceof TossSessionExpiredError &&
      /returned empty output while session is invalid/.test(error.message)
  );
  await assert.rejects(
    getPortfolioPositions({ env, verifySessionOnEmpty: false }),
    /returned empty output/
  );
});

test("portfolio blank stdout keeps auth doctor failures inconclusive", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-doctor-fail-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
if [ "$3" = "portfolio" ] && [ "$4" = "positions" ]; then
  exit 0
fi
if [ "$3" = "auth" ] && [ "$4" = "doctor" ]; then
  echo "validation_error: transport failure" 1>&2
  exit 1
fi
printf '{"ok":true}\\n'
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(
    getPortfolioPositions({ env }),
    (error) =>
      !(error instanceof TossSessionExpiredError) &&
      /returned empty output/.test(error.message)
  );
});

test("watchlist empty array with invalid auth doctor is promoted to TossSessionExpiredError", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-watchlist-empty-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
if [ "$3" = "watchlist" ] && [ "$4" = "list" ]; then
  printf '[]\\n'
  exit 0
fi
if [ "$3" = "auth" ] && [ "$4" = "doctor" ]; then
  printf '{"session":{"valid":false,"validation_error":"401"}}\\n'
  exit 0
fi
printf '{"ok":true}\\n'
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(listWatchlist({ env }), TossSessionExpiredError);
  const passthrough = await listWatchlist({ env, verifySessionOnEmpty: false });
  assert.deepEqual(passthrough.data, []);
});

test("quote 403 includes upstream hint", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-403-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
echo "status 403 at search/stocks" 1>&2
exit 1
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(
    getQuote("ALM", { env }),
    (error) =>
      !(error instanceof TossSessionExpiredError) &&
      /issues\/15/.test(error.message)
  );
});

test("checkSession treats auth doctor validation_error failures as inconclusive command errors", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-check-session-fail-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
if [ "$3" = "auth" ] && [ "$4" = "doctor" ]; then
  echo "validation_error: transport failure" 1>&2
  exit 1
fi
printf '{"ok":true}\n'
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(
    checkSession({ env }),
    (error) =>
      !(error instanceof TossSessionExpiredError) &&
      /validation_error: transport failure/.test(error.message)
  );
});

test("quote search stocks 403 with validation_error remains a non-session upstream error", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toss-securities-403-validation-error-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/sh
echo "validation_error: status 403 at search/stocks" 1>&2
exit 1
`;

  const binPath = path.join(binDir, "tossctl");
  fs.writeFileSync(binPath, script, { mode: 0o755 });

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH || ""}` };

  await assert.rejects(
    getQuote("ALM", { env }),
    (error) =>
      !(error instanceof TossSessionExpiredError) &&
      /validation_error: status 403 at search\/stocks/.test(error.message) &&
      /issues\/15/.test(error.message)
  );
});
