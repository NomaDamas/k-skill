#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { listJsSyntaxCheckFiles, listPythonCompileFiles, repoRoot } = require("./ci-paths");
const {
  bashCommand,
  npmCommand,
  resolvePython,
  run,
  runBatched,
  runNodeSyntaxChecks,
} = require("./ci-run");

const jsFiles = listJsSyntaxCheckFiles();
if (jsFiles.length === 0) {
  console.error("run-lint: no JavaScript files found");
  process.exit(1);
}
runNodeSyntaxChecks(jsFiles);

const pyFiles = listPythonCompileFiles();
if (pyFiles.length === 0) {
  console.error("run-lint: no Python files found");
  process.exit(1);
}
runBatched(resolvePython(), ["-m", "py_compile"], pyFiles);

run(npmCommand(), ["run", "lint", "--workspaces", "--if-present"]);
run(bashCommand(), [path.join(repoRoot, "scripts", "validate-skills.sh")]);
run(process.execPath, [path.join(repoRoot, "scripts", "generate-plugin-manifest.js"), "--check"]);
