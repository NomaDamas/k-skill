#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { repoRoot } = require("./ci-paths");
const { resolvePython, run } = require("./ci-run");

const python = resolvePython();
const compileFiles = [
  "scripts/store_longevity_source.py",
  "scripts/store_longevity_mirror.py",
  "scripts/test_store_longevity_mirror.py",
  "store-longevity-radar/scripts/store_longevity_download.py",
  "packages/k-skill-cli/skills/store-longevity-radar/scripts/store_longevity_download.py",
];

run(python, ["-m", "py_compile", ...compileFiles]);
run(python, ["-m", "unittest", "scripts.test_store_longevity_mirror"], {
  env: {
    ...process.env,
    PYTHONPATH: [repoRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  },
});
