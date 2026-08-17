const test = require("node:test");
const assert = require("node:assert/strict");

const publicClient = require("../src");
const officialClient = require("../src/official-client");

test("package entry point exposes only the official Open API client", () => {
  assert.deepEqual(
    Object.keys(publicClient).sort(),
    Object.keys(officialClient).sort()
  );

  assert.equal(publicClient.buildReadOnlyCommand, undefined);
  assert.equal(publicClient.runReadOnlyCommand, undefined);
  assert.equal(publicClient.getAccountSummary, undefined);
  assert.equal(publicClient.getPortfolioPositions, undefined);
  assert.equal(publicClient.getQuote, undefined);
  assert.equal(publicClient.listWatchlist, undefined);
  assert.equal(publicClient.TossSessionExpiredError, undefined);
});
