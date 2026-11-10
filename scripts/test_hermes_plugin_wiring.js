"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const ci = require("./ci-paths.js");

test("hermes-plugin is not mistaken for a skill by any skill-directory scanner", () => {
  assert.ok(!ci.listSkillDirs().some((d) => path.basename(d) === "hermes-plugin"));
  const { discoverSkillPaths } = require("./generate-plugin-manifest.js");
  assert.ok(!discoverSkillPaths(repoRoot).includes("./hermes-plugin"));
  const { EXCLUDED_DIRS } = require("./build-manus-bundle.js");
  assert.ok(EXCLUDED_DIRS.has("hermes-plugin"));
  const validator = fs.readFileSync(path.join(__dirname, "validate-skills.sh"), "utf8");
  assert.ok(validator.includes("! -name hermes-plugin"));
});

test("validate-skills.sh still passes with hermes-plugin present", () => {
  const { spawnSync } = require("node:child_process");
  const res = spawnSync("bash", [path.join(__dirname, "validate-skills.sh")], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test("CI runs the hermes-plugin python tests and compiles its sources", () => {
  const jobs = ci.listPythonTestJobs();
  const job = jobs.find((j) => j.label.startsWith("hermes-plugin"));
  assert.ok(job, "no python test job for hermes-plugin");
  assert.ok(job.pythonPath.some((p) => p.endsWith(path.join("hermes-plugin", "tests"))));
  const compiled = ci.listPythonCompileFiles().map((f) => ci.toPosix(f));
  assert.ok(compiled.includes("hermes-plugin/__init__.py"));
  assert.ok(compiled.includes("hermes-plugin/tools.py"));
});

test("plugin ships everything Hermes needs when installed via owner/repo/hermes-plugin", () => {
  for (const f of ["plugin.yaml", "__init__.py", "catalog.json", "LICENSE", "README.md",
                   path.join("skills", "k-skill", "SKILL.md")]) {
    assert.ok(fs.existsSync(path.join(repoRoot, "hermes-plugin", f)), `missing hermes-plugin/${f}`);
  }
});
