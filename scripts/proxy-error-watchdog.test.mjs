import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  actionableAlerts,
  aggregateRouteUsage,
  findAlerts,
  fingerprint,
  mergeState,
  parseRouteUsageLine,
  renderIssueBody,
  run,
  shouldComment,
  thresholdFor
} from "./proxy-error-watchdog.mjs";

test("parses only structured error route usage lines", () => {
  assert.deepEqual(parseRouteUsageLine(JSON.stringify({
    routeUsage: true,
    route: "/v1/example",
    statusCode: 503,
    errorCode: "upstream_error",
    msg: "upstream failed"
  })), {
    route: "/v1/example",
    statusCode: 503,
    errorCode: "upstream_error",
    message: "upstream failed"
  });
  assert.equal(parseRouteUsageLine("not json"), null);
  assert.equal(parseRouteUsageLine(JSON.stringify({ routeUsage: true, route: "/health", statusCode: 200 })), null);
});

test("aggregates route and status fingerprints", () => {
  const lines = [
    ...Array.from({ length: 501 }, () => JSON.stringify({ routeUsage: true, route: "/v1/a", statusCode: 502, errorCode: "upstream_error" })),
    ...Array.from({ length: 301 }, () => JSON.stringify({ routeUsage: true, route: "/v1/b", statusCode: 400, errorCode: "bad_request" }))
  ];
  const entries = aggregateRouteUsage(lines);
  assert.equal(entries[0].count, 501);
  assert.equal(findAlerts(entries).length, 2);
  assert.equal(thresholdFor(404), Infinity);
  assert.equal(fingerprint(entries[0]), "/v1/a|502|upstream_error");
});

test("requires two consecutive windows before action", () => {
  const alert = { route: "/v1/a", statusCode: 502, errorCode: "upstream_error", count: 501 };
  const first = mergeState({}, [alert], 10);
  assert.deepEqual(actionableAlerts(first, [alert], 10), []);
  const second = mergeState(first, [alert], 11);
  assert.equal(actionableAlerts(second, [alert], 11).length, 1);
});

test("renders actionable issue body with fingerprint details", () => {
  const body = renderIssueBody([
    { route: "/v1/a", statusCode: 502, errorCode: "upstream_error", count: 501 }
  ], "2026-08-21T00:00:00.000Z", "2026-08-21T01:00:00.000Z");
  assert.match(body, /Proxy error watchdog alert/);
  assert.match(body, /upstream_error/);
  assert.match(body, /501/);
});

test("dedupe comments are limited to once per UTC day", () => {
  assert.equal(shouldComment(null, "2026-08-21T01:00:00.000Z"), true);
  assert.equal(shouldComment("2026-08-21T00:10:00.000Z", "2026-08-21T23:00:00.000Z"), false);
  assert.equal(shouldComment("2026-08-21T23:00:00.000Z", "2026-08-22T00:00:00.000Z"), true);
});

test("log rotation resets a stale byte offset", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-watchdog-"));
  const logFile = path.join(directory, "proxy.log");
  const stateFile = path.join(directory, "state.json");
  fs.writeFileSync(logFile, `${JSON.stringify({
    routeUsage: true,
    route: "/v1/a",
    statusCode: 502,
    errorCode: "upstream_error"
  })}\n`);
  fs.writeFileSync(stateFile, JSON.stringify({ logOffset: 99999 }));

  const result = run({
    logFile,
    stateFile,
    windowId: 10,
    now: new Date("2026-08-21T10:00:00.000Z")
  });

  assert.equal(result.entries.length, 1);
});
