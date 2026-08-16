#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const STORE_LONGEVITY_MIRROR_TEST = "test_store_longevity_mirror.py";

const SKIP_DIR_NAMES = new Set([
  ".cache",
  ".git",
  ".venv",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

function toPosix(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

function walkFiles(startDir, predicate) {
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (entry.isFile() && predicate(full, entry.name)) {
        results.push(full);
      }
    }
  }

  if (fs.existsSync(startDir)) {
    walk(startDir);
  }
  return results.sort();
}

function listSkillDirs() {
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(repoRoot, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "skill.json")))
    .sort();
}

function hasTestPy(dir) {
  if (!fs.existsSync(dir)) {
    return false;
  }
  return fs.readdirSync(dir).some((name) => /^test_.*\.py$/.test(name));
}

function listJsSyntaxCheckFiles() {
  const files = walkFiles(path.join(repoRoot, "scripts"), (_full, name) => name.endsWith(".js"));
  for (const skillDir of listSkillDirs()) {
    files.push(
      ...walkFiles(path.join(skillDir, "scripts"), (_full, name) => /\.(js|cjs|mjs)$/.test(name)),
    );
  }
  return [...new Set(files)].sort();
}

function listPythonCompileFiles() {
  const files = walkFiles(path.join(repoRoot, "scripts"), (_full, name) => name.endsWith(".py"));
  for (const skillDir of listSkillDirs()) {
    files.push(...walkFiles(skillDir, (_full, name) => name.endsWith(".py")));
  }
  return [...new Set(files)].sort();
}

function listNodeTestFiles() {
  const rootTests = walkFiles(path.join(repoRoot, "scripts"), (_full, name) => {
    return name.endsWith(".test.js") || /^test_.*\.js$/.test(name);
  });
  const cliTests = walkFiles(path.join(repoRoot, "packages", "k-skill-cli", "test"), (_full, name) =>
    name.endsWith(".js"),
  );
  return [...rootTests, ...cliTests];
}

function listRootPythonTestModules() {
  return fs
    .readdirSync(path.join(repoRoot, "scripts"))
    .filter((name) => /^test_.*\.py$/.test(name) && name !== STORE_LONGEVITY_MIRROR_TEST)
    .map((name) => `scripts.${name.slice(0, -3)}`)
    .sort();
}

function listPythonTestJobs() {
  const jobs = [];
  const rootScripts = path.join(repoRoot, "scripts");
  const rootModules = listRootPythonTestModules();
  if (rootModules.length > 0) {
    jobs.push({
      label: "scripts/test_*.py",
      pythonPath: [repoRoot, rootScripts],
      args: ["-m", "unittest", ...rootModules],
    });
  }

  for (const skillDir of listSkillDirs()) {
    const scriptsDir = path.join(skillDir, "scripts");
    const testsDir = path.join(skillDir, "tests");
    const runTests = path.join(testsDir, "run_tests.py");
    const rel = toPosix(skillDir);

    if (fs.existsSync(runTests)) {
      jobs.push({
        label: `${rel}/tests/run_tests.py`,
        pythonPath: [repoRoot, scriptsDir, testsDir],
        args: [runTests],
      });
    } else if (hasTestPy(testsDir)) {
      jobs.push({
        label: `${rel}/tests`,
        pythonPath: [repoRoot, rootScripts, scriptsDir, testsDir],
        args: ["-m", "unittest", "discover", "-s", testsDir, "-p", "test_*.py"],
      });
    }

    const skillScriptTests = hasTestPy(scriptsDir)
      ? fs.readdirSync(scriptsDir).filter((name) => /^test_.*\.py$/.test(name))
      : [];
    if (skillScriptTests.length > 0) {
      jobs.push({
        label: `${rel}/scripts`,
        pythonPath: [repoRoot, scriptsDir],
        args: ["-m", "unittest", "discover", "-s", scriptsDir, "-p", "test_*.py"],
      });
    }
  }

  return jobs;
}

function listPublishableWorkspaces() {
  const packagesDir = path.join(repoRoot, "packages");
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, "package.json"))
    .filter((packagePath) => fs.existsSync(packagePath))
    .map((packagePath) => JSON.parse(fs.readFileSync(packagePath, "utf8")))
    .filter((workspacePackage) => workspacePackage.private !== true)
    .map((workspacePackage) => workspacePackage.name)
    .sort();
}

module.exports = {
  STORE_LONGEVITY_MIRROR_TEST,
  listJsSyntaxCheckFiles,
  listNodeTestFiles,
  listPublishableWorkspaces,
  listPythonCompileFiles,
  listPythonTestJobs,
  listRootPythonTestModules,
  listSkillDirs,
  repoRoot,
  toPosix,
  walkFiles,
};
