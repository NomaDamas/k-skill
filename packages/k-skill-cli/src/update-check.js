"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const PACKAGE_NAME = "@nomadamas/k-skill";
const CACHE_FILE = "update-check.json";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2500;

function compareVersions(left, right) {
  const leftParts = String(left).split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = String(right).split(".").map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const a = leftParts[index] || 0;
    const b = rightParts[index] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

function cachePath(env = process.env) {
  const base =
    env.KSKILL_UPDATE_CACHE_DIR ||
    env.XDG_CACHE_HOME ||
    path.join(os.homedir(), ".cache");
  return path.join(base, "k-skill", CACHE_FILE);
}

function registryUrl(env = process.env) {
  return (env.KSKILL_REGISTRY_URL || "https://registry.npmjs.org").replace(/\/$/, "");
}

function readCache(filePath = cachePath()) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(value, filePath = cachePath()) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value));
    fs.chmodSync(filePath, 0o600);
  } catch {
    return;
  }
}

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("fetch is unavailable");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function latestVersion(options = {}) {
  const env = options.env || process.env;
  const filePath = options.cacheFile || cachePath(env);
  const now = options.now ?? Date.now();
  const ttl = Number.parseInt(env.KSKILL_UPDATE_CHECK_TTL_MS || DEFAULT_TTL_MS, 10);
  const cached = readCache(filePath);

  if (cached && typeof cached.latest === "string" && now - (cached.checkedAt || 0) < ttl) {
    return { latest: cached.latest, source: "cache" };
  }

  try {
    const document = await fetchJson(`${registryUrl(env)}/${encodeURIComponent(PACKAGE_NAME)}`);
    const latest = document?.["dist-tags"]?.latest;
    if (typeof latest !== "string") throw new Error("missing dist-tags.latest");

    writeCache({ checkedAt: now, latest }, filePath);
    return { latest, source: "registry" };
  } catch (error) {
    if (cached && typeof cached.latest === "string") {
      return { latest: cached.latest, source: "stale-cache" };
    }
    return { error, source: "unavailable" };
  }
}

function updateNotice(currentVersion, latestVersionValue) {
  return [
    `k-skill update available: ${currentVersion} -> ${latestVersionValue}`,
    `npx users: next command automatically uses the newest compatible release.`,
    `global users: npm install -g ${PACKAGE_NAME}@${latestVersionValue.split(".")[0]}`,
  ].join("\n");
}

async function maybePrintUpdateNotice(currentVersion, options = {}) {
  const env = options.env || process.env;
  const stderr = options.stderr || process.stderr;

  if (env.KSKILL_DISABLE_UPDATE_CHECK === "1") return null;

  const result = await latestVersion(options);
  if (!result.latest || compareVersions(result.latest, currentVersion) <= 0) return null;

  const notice = updateNotice(currentVersion, result.latest);
  stderr.write(`\n${notice}\n\n`);
  return notice;
}

function installLatestGlobal(options = {}) {
  const env = options.env || process.env;
  const npm = env.KSKILL_NPM_BIN || "npm";
  const registry = env.KSKILL_REGISTRY_URL;
  const args = ["install", "-g", `${PACKAGE_NAME}@0`];
  if (registry) args.push("--registry", registry);

  const result = childProcess.spawnSync(npm, args, {
    env: process.env,
    stdio: options.stdio || "inherit",
    encoding: options.encoding,
  });

  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

module.exports = {
  PACKAGE_NAME,
  cachePath,
  compareVersions,
  installLatestGlobal,
  latestVersion,
  maybePrintUpdateNotice,
  registryUrl,
  updateNotice,
};
