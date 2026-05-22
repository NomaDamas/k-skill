"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const workflowDir = path.join(repoRoot, ".github", "workflows");

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

function readWorkflow(name) {
  return fs.readFileSync(path.join(workflowDir, name), "utf8");
}

function listWorkflowFiles() {
  return fs
    .readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function workflowUses() {
  return listWorkflowFiles().flatMap((name) => {
    const body = readWorkflow(name);
    return [...body.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*$/gm)].map((match) => {
      const spec = match[1];
      const at = spec.lastIndexOf("@");
      assert.notEqual(at, -1, `${name} action use must be pinned with @ref: ${spec}`);
      return { file: name, action: spec.slice(0, at), ref: spec.slice(at + 1), spec };
    });
  });
}

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
