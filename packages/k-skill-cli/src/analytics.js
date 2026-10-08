"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { version: cliVersion } = require("../package.json");
const policy = require("./analytics-policy.json");

const DEFAULT_HOST = "https://us.i.posthog.com";
const DEFAULT_PROJECT_API_KEY =
  "phc_xlJYWKplsT2UNHng9eDULTGddlq0RoTuE8Dh64nrpmL";
const ANALYTICS_SCHEMA_VERSION = 1;
const DISABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function isDisabled(env) {
  return DISABLED_VALUES.has(String(env.KSKILL_ANALYTICS_DISABLED || "").toLowerCase());
}

function analyticsIdPath(env) {
  return (
    env.KSKILL_ANALYTICS_ID_FILE ||
    path.join(env.KSKILL_CONFIG_DIR || path.join(os.homedir(), ".config", "k-skill"), "analytics-id")
  );
}

function readOrCreateAnalyticsId(env, randomUUID = crypto.randomUUID) {
  if (env.KSKILL_ANALYTICS_ID) return env.KSKILL_ANALYTICS_ID;

  const idPath = analyticsIdPath(env);
  try {
    const existing = fs.readFileSync(idPath, "utf8").trim();
    if (existing) return existing;
  } catch (error) {
    if (error.code !== "ENOENT") return randomUUID();
  }

  const generated = randomUUID();
  try {
    fs.mkdirSync(path.dirname(idPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(idPath, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Analytics must never make the CLI command fail.
  }
  return generated;
}

function analyticsConfig(env = process.env) {
  if (isDisabled(env)) return null;

  return {
    apiKey: env.POSTHOG_API_KEY || DEFAULT_PROJECT_API_KEY,
    host: (env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/+$/, ""),
    distinctId: readOrCreateAnalyticsId(env),
  };
}

function buildInvocationEvent({ command, skillName, runtimeMode, success }) {
  return {
    event: policy.event,
    properties: {
      command: command || null,
      skill_name: skillName || null,
      cli_version: cliVersion,
      runtime_mode: runtimeMode,
      success: Boolean(success),
      analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
      $process_person_profile: false,
      disable_geoip: true,
    },
  };
}

async function captureInvocation(details, env = process.env, fetchImpl = fetch) {
  const config = analyticsConfig(env);
  if (!config) return false;

  const event = buildInvocationEvent(details);
  const payload = JSON.stringify({
    api_key: config.apiKey,
    distinct_id: config.distinctId,
    event: event.event,
    properties: event.properties,
  });

  try {
    const response = await fetchImpl(`${config.host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = {
  ANALYTICS_SCHEMA_VERSION,
  DEFAULT_PROJECT_API_KEY,
  analyticsConfig,
  buildInvocationEvent,
  captureInvocation,
  readOrCreateAnalyticsId,
};
