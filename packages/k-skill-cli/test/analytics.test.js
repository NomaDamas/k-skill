const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const childProcess = require("node:child_process");
const { deriveUsageMetrics } = require("../src/metrics");
const { analyticsConfig } = require("../src/analytics");

const packageRoot = path.join(__dirname, "..");
const binPath = path.join(packageRoot, "bin", "k-skill.js");
const packageVersion = require("../package.json").version;
const DEFAULT_PROJECT_API_KEY =
  "phc_xlJYWKplsT2UNHng9eDULTGddlq0RoTuE8Dh64nrpmL";

function startCaptureServer() {
  let resolveRequest;
  const request = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolveRequest({ method: req.method, url: req.url, body: JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: 1 }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}`,
        request,
      });
    });
  });
}

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [binPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("CLI captures privacy-bounded invocation events for PostHog metrics", { timeout: 5000 }, async (t) => {
  const capture = await startCaptureServer();
  t.after(() => capture.server.close());

  const eventRequest = capture.request;
  const resultPromise = runCli(["instruct", "railway-timetable"], {
    POSTHOG_API_KEY: "phc_test",
    POSTHOG_HOST: capture.url,
    KSKILL_ANALYTICS_ID: "test-user-1",
  });
  const result = await resultPromise;
  const request = await eventRequest;

  assert.equal(result.status, 0);
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/i/v0/e/");
  assert.equal(request.body.api_key, "phc_test");
  assert.equal(request.body.event, "cli_invocation");
  assert.equal(request.body.distinct_id, "test-user-1");
  assert.equal(request.body.properties.command, "instruct");
  assert.equal(request.body.properties.skill_name, "railway-timetable");
  assert.equal(request.body.properties.cli_version, packageVersion);
  assert.equal(request.body.properties.runtime_mode, "generic");
  assert.equal(request.body.properties.$process_person_profile, false);
  assert.equal(request.body.properties.disable_geoip, true);
  assert.equal("args" in request.body.properties, false);
  assert.equal("input" in request.body.properties, false);
});

test("analytics uses the built-in public project token and still honors an override", () => {
  const defaultConfig = analyticsConfig({
    POSTHOG_API_KEY: "",
    POSTHOG_HOST: "",
    KSKILL_ANALYTICS_DISABLED: "",
    KSKILL_ANALYTICS_ID: "test-user-1",
  });
  const overrideConfig = analyticsConfig({
    POSTHOG_API_KEY: "phc_override",
    POSTHOG_HOST: "https://example.test",
    KSKILL_ANALYTICS_DISABLED: "",
    KSKILL_ANALYTICS_ID: "test-user-1",
  });

  assert.equal(defaultConfig.apiKey, DEFAULT_PROJECT_API_KEY);
  assert.equal(defaultConfig.host, "https://us.i.posthog.com");
  assert.equal(overrideConfig.apiKey, "phc_override");
  assert.equal(overrideConfig.host, "https://example.test");
});

test("same distinct_id and stable event properties support daily, weekly, monthly, and recurrent metrics", { timeout: 5000 }, async (t) => {
  const capture = await startCaptureServer();
  t.after(() => capture.server.close());

  const resultPromise = runCli(["version"], {
    POSTHOG_API_KEY: "phc_test",
    POSTHOG_HOST: capture.url,
    KSKILL_ANALYTICS_ID: "test-user-1",
  });
  const result = await resultPromise;
  const request = await capture.request;

  assert.equal(result.status, 0);
  assert.equal(request.body.distinct_id, "test-user-1");
  assert.equal(request.body.event, "cli_invocation");
  assert.ok(request.body.properties.analytics_schema_version >= 1);
  assert.equal(typeof request.body.properties.success, "boolean");
});

test("captured event identity supports daily, weekly, monthly, and recurrent aggregation", () => {
  const end = Date.parse("2026-09-19T00:00:00.000Z");
  const events = [
    { distinct_id: "user-a", timestamp: "2026-09-18T12:00:00.000Z" },
    { distinct_id: "user-a", timestamp: "2026-09-17T12:00:00.000Z" },
    { distinct_id: "user-b", timestamp: "2026-09-15T12:00:00.000Z" },
    { distinct_id: "user-a", timestamp: "2026-09-10T12:00:00.000Z" },
    { distinct_id: "user-c", timestamp: "2026-08-25T12:00:00.000Z" },
  ];

  assert.deepEqual(deriveUsageMetrics(events, end), {
    daily: { calls: 1, uniqueUsers: 1, executionsPerUniqueUser: 1 },
    weekly: { calls: 3, uniqueUsers: 2, executionsPerUniqueUser: 1.5 },
    monthly: { calls: 5, uniqueUsers: 3, executionsPerUniqueUser: 5 / 3 },
    recurrentUsers: 1,
  });
});

test("CLI remains usable when analytics delivery fails or is disabled", async () => {
  const isolatedEnv = {
    POSTHOG_API_KEY: "phc_test",
    POSTHOG_HOST: "http://127.0.0.1:1",
    KSKILL_ANALYTICS_ID: "",
    KSKILL_ANALYTICS_DISABLED: "",
  };

  const unavailable = await runCli(["version"], isolatedEnv);
  const disabled = await runCli(["version"], {
    ...isolatedEnv,
    KSKILL_ANALYTICS_ID: "test-user-1",
    KSKILL_ANALYTICS_DISABLED: "1",
  });

  assert.equal(unavailable.status, 0);
  assert.equal(unavailable.stdout, `${packageVersion}\n`);
  assert.equal(unavailable.stderr, "");
  assert.equal(disabled.status, 0);
  assert.equal(disabled.stdout, `${packageVersion}\n`);
  assert.equal(disabled.stderr, "");
});

test("analytics policy exposes a machine-readable usage-statistics boundary", () => {
  const policy = require("../src/analytics-policy.json");

  assert.equal(policy.purpose, "usage_statistics_only");
  assert.deepEqual(policy.collected_properties, [
    "command",
    "skill_name",
    "cli_version",
    "runtime_mode",
    "success",
    "analytics_schema_version",
  ]);
  assert.deepEqual(policy.excluded_data, ["command_arguments", "command_input", "file_contents"]);
  assert.equal(policy.opt_out_environment_variable, "KSKILL_ANALYTICS_DISABLED");
});
