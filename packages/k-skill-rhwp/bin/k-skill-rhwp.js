#!/usr/bin/env node
"use strict";

const { main } = require("../src/cli");

main(process.argv.slice(2)).then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    process.stderr.write(`k-skill-rhwp: ${err && err.stack ? err.stack : err}\n`);
    process.exit(2);
  }
);
