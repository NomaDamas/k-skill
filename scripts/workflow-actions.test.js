"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const workflowDir = path.join(repoRoot, ".github", "workflows");

// Reviewed action runtime coverage is intentionally curated, not exhaustive:
// these pins are the Node 20 deprecation migration set verified from each
// listed action ref's GitHub `action.yml` metadata on the review date below.
const actionRuntimeGuardScope = {
  coverage: "curated migration set; not exhaustive for every external workflow action",
  reviewedAt: "2026-05-22",
  sourceUrls: new Map([
    ["actions/checkout", "https://github.com/actions/checkout/blob/v5/action.yml"],
    ["actions/setup-node", "https://github.com/actions/setup-node/blob/v5/action.yml"],
    [
      "google-github-actions/setup-gcloud",
      "https://github.com/google-github-actions/setup-gcloud/blob/v3/action.yml",
    ],
    [
      "googleapis/release-please-action",
      "https://github.com/googleapis/release-please-action/blob/v5/action.yml",
    ],
  ]),
};

const expectedNode24ActionPins = new Map([
  ["actions/checkout", "v5"],
  ["actions/setup-node", "v5"],
  ["google-github-actions/setup-gcloud", "v3"],
  ["googleapis/release-please-action", "v5"],
]);

const knownNode20ActionPins = new Map([
  ["actions/checkout", new Set(["v4"])],
  ["actions/setup-node", new Set(["v4"])],
  ["google-github-actions/setup-gcloud", new Set(["v2"])],
  ["googleapis/release-please-action", new Set(["v4"])],
]);

const usesLinePattern = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?(?:\s*#.*)?\s*$/gm;

function readWorkflow(name) {
  return fs.readFileSync(path.join(workflowDir, name), "utf8");
}

function listWorkflowFiles() {
  return fs
    .readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function usesFromWorkflowBody(name, body) {
  return [...body.matchAll(usesLinePattern)].map((match) => {
    const spec = match[1];
    const at = spec.lastIndexOf("@");
    assert.notEqual(at, -1, `${name} action use must be pinned with @ref: ${spec}`);
    return { file: name, action: spec.slice(0, at), ref: spec.slice(at + 1), spec };
  });
}

function workflowUses() {
  return listWorkflowFiles().flatMap((name) => {
    const body = readWorkflow(name);
    return usesFromWorkflowBody(name, body);
  });
}

test("workflow action extractor includes uses lines with inline comments", () => {
  const uses = usesFromWorkflowBody(
    "inline-comment.yml",
    [
      "jobs:",
      "  validate:",
      "    steps:",
      "      - uses: actions/checkout@v4 # intentionally stale fixture",
      "      - uses: 'actions/setup-node@v5' # quoted fixture",
      '      - uses: "google-github-actions/setup-gcloud@v3"',
    ].join("\n"),
  );

  assert.deepEqual(
    uses.map((use) => use.spec),
    ["actions/checkout@v4", "actions/setup-node@v5", "google-github-actions/setup-gcloud@v3"],
  );
});

test("workflow action runtime guard documents its reviewed coverage scope", () => {
  assert.match(actionRuntimeGuardScope.coverage, /curated/i);
  assert.match(actionRuntimeGuardScope.coverage, /not exhaustive/i);
  assert.match(actionRuntimeGuardScope.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);

  for (const action of expectedNode24ActionPins.keys()) {
    assert.match(actionRuntimeGuardScope.sourceUrls.get(action), /^https:\/\/github\.com\/.+\/action\.yml$/);
  }
});

test("workflow action pins avoid reviewed Node 20 action majors", () => {
  for (const use of workflowUses()) {
    const bannedRefs = knownNode20ActionPins.get(use.action);
    if (!bannedRefs) continue;

    assert.ok(
      !bannedRefs.has(use.ref),
      `${use.file} must not use ${use.spec}; this action major is known to run on Node 20`,
    );
  }
});

test("workflow action pins use the selected Node 24 runtime majors", () => {
  const uses = workflowUses();

  for (const [action, expectedRef] of expectedNode24ActionPins) {
    const refs = uses.filter((use) => use.action === action).map((use) => `${use.file}:${use.ref}`);
    assert.ok(refs.length > 0, `expected at least one workflow use of ${action}`);
    assert.deepEqual(
      [...new Set(refs.map((entry) => entry.split(":").at(-1)))],
      [expectedRef],
      `${action} should be pinned to ${expectedRef} everywhere it appears (${refs.join(", ")})`,
    );
  }
});
