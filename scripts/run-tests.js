#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { listNodeTestFiles, listPythonTestJobs, repoRoot } = require("./ci-paths");
const { bashCommand, npmCommand, run, venvPython } = require("./ci-run");

run(npmCommand(), ["run", "prepare:python-test-env"]);

const nodeTests = listNodeTestFiles();
if (nodeTests.length === 0) {
  console.error("run-tests: no Node test files found");
  process.exit(1);
}
run(process.execPath, ["--test", ...nodeTests]);

const python = venvPython();
for (const job of listPythonTestJobs()) {
  console.log(`# python tests: ${job.label}`);
  run(python, job.args, {
    env: {
      PYTHONNOUSERSITE: "1",
      PYTHONPATH: job.pythonPath.join(path.delimiter),
    },
  });
}

run(npmCommand(), ["run", "test", "--workspaces", "--if-present"]);
run(bashCommand(), [path.join(repoRoot, "scripts", "validate-skills.sh")]);
