#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function parseRouteUsageLine(line) {
  try {
    const value = JSON.parse(line);
    if (!value.routeUsage || !value.route || Number(value.statusCode) < 400) return null;
    return {
      route: value.route,
      statusCode: Number(value.statusCode),
      errorCode: value.errorCode || null,
      message: value.msg || null
    };
  } catch {
    return null;
  }
}

export function aggregateRouteUsage(lines) {
  const counts = new Map();
  for (const line of lines) {
    const entry = parseRouteUsageLine(line);
    if (!entry) continue;
    const key = `${entry.route}|${entry.statusCode}|${entry.errorCode || ""}`;
    const current = counts.get(key) || {
      route: entry.route,
      statusCode: entry.statusCode,
      errorCode: entry.errorCode,
      count: 0
    };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
}

export function fingerprint(entry) {
  return `${entry.route}|${entry.statusCode}|${entry.errorCode || ""}`;
}

export function thresholdFor(statusCode) {
  if (statusCode >= 500) return 500;
  if (statusCode === 400) return 300;
  return Number.POSITIVE_INFINITY;
}

export function findAlerts(entries) {
  return entries.filter((entry) => entry.count > thresholdFor(entry.statusCode));
}

export function mergeState(state, alerts, windowId) {
  const next = { ...state, fingerprints: { ...(state.fingerprints || {}) } };
  for (const alert of alerts) {
    const key = fingerprint(alert);
    const previous = next.fingerprints[key] || { consecutiveWindows: 0, lastWindow: null };
    next.fingerprints[key] = {
      consecutiveWindows: previous.lastWindow === windowId - 1 ? previous.consecutiveWindows + 1 : 1,
      lastWindow: windowId
    };
  }
  next.lastWindow = windowId;
  return next;
}

export function actionableAlerts(state, alerts, windowId) {
  return alerts.filter((alert) => {
    const record = state.fingerprints?.[fingerprint(alert)];
    return record && record.lastWindow === windowId && record.consecutiveWindows >= 2;
  });
}

export function shouldComment(lastCommentAt, nowIso) {
  if (!lastCommentAt) return true;
  return lastCommentAt.slice(0, 10) !== nowIso.slice(0, 10);
}

export function renderIssueBody(alerts, windowStart, windowEnd) {
  const rows = alerts
    .map((entry) => `| \`${entry.route}\` | ${entry.statusCode} | ${entry.errorCode || "-"} | ${entry.count} |`)
    .join("\n");
  return [
    "## Proxy error watchdog alert",
    "",
    `Window: ${windowStart} - ${windowEnd}`,
    "",
    "| Route | Status | Error code | Count |",
    "| --- | ---: | --- | ---: |",
    rows,
    "",
    "This issue was generated after the same fingerprint exceeded its threshold in two consecutive windows."
  ].join("\n");
}

function readLinesSince(file, offset) {
  if (!fs.existsSync(file)) return { lines: [], offset: 0 };
  const buffer = fs.readFileSync(file);
  const nextOffset = buffer.length;
  const safeOffset = offset > buffer.length ? 0 : offset;
  return { lines: buffer.subarray(safeOffset).toString("utf8").split(/\r?\n/), offset: nextOffset };
}

function runGh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function applyAlerts(alerts, body, label, state, nowIso) {
  for (const alert of alerts) {
    const title = `[proxy-watchdog] ${fingerprint(alert)}`;
    const existing = runGh(["issue", "list", "--state", "open", "--label", label, "--search", `"${title}" in:title`, "--json", "number,title"]);
    const issues = existing ? JSON.parse(existing) : [];
    if (issues.length > 0) {
      const key = fingerprint(alert);
      const lastCommentAt = state.comments?.[key] || null;
      if (shouldComment(lastCommentAt, nowIso)) {
        runGh(["issue", "comment", String(issues[0].number), "--body", body]);
        state.comments = { ...(state.comments || {}), [key]: nowIso };
      }
    } else {
      runGh(["issue", "create", "--title", title, "--label", label, "--body", body]);
    }
  }
}

export function run({ logFile, stateFile, windowId, dryRun = true, now = new Date() }) {
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
  const offset = Number(state.logOffset || 0);
  const read = readLinesSince(logFile, offset);
  const entries = aggregateRouteUsage(read.lines);
  const alerts = findAlerts(entries);
  const nextState = mergeState(state, alerts, windowId);
  const actionable = actionableAlerts(nextState, alerts, windowId);
  nextState.logOffset = read.offset;
  nextState.updatedAt = now.toISOString();
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(nextState, null, 2)}\n`);
  const body = renderIssueBody(actionable, new Date(windowId * 3600000).toISOString(), now.toISOString());
  if (!dryRun && actionable.length > 0) {
    applyAlerts(actionable, body, "auto-proxy-watchdog", nextState, now.toISOString());
    fs.writeFileSync(stateFile, `${JSON.stringify(nextState, null, 2)}\n`);
  }
  return { entries, alerts, actionable, body, state: nextState };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Set(process.argv.slice(2));
  const logFile = process.env.KSKILL_PROXY_LOG_FILE || `${os.homedir()}/apps/k-skill-proxy/proxy.log`;
  const stateFile = process.env.KSKILL_PROXY_WATCHDOG_STATE || `${os.homedir()}/apps/k-skill-proxy/watchdog-state.json`;
  const windowId = Math.floor(Date.now() / 3600000);
  const result = run({ logFile, stateFile, windowId, dryRun: !args.has("--apply") });
  process.stdout.write(`${JSON.stringify({ alerts: result.alerts, actionable: result.actionable, dryRun: !args.has("--apply") })}\n`);
}
