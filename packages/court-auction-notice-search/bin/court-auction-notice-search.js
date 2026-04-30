#!/usr/bin/env node
"use strict";

const { main } = require("../src/cli");

main(process.argv.slice(2)).then(
  (code) => {
    process.exit(typeof code === "number" ? code : 0);
  },
  (err) => {
    const detail = err && err.code ? `[${err.code}] ` : "";
    const message = err && err.message ? err.message : String(err);
    process.stderr.write(`court-auction-notice-search: ${detail}${message}\n`);
    if (err && err.upstreamMessage && err.upstreamMessage !== message) {
      process.stderr.write(`  upstream: ${err.upstreamMessage}\n`);
    }
    process.exit(1);
  }
);
