#!/usr/bin/env node
// One-time script: convert upstream region_codes.txt to a deduplicated
// 5-digit LAWD_CD JSON lookup used by k-skill-proxy.
//
// Usage:
//   node scripts/build-region-codes.js <path-to-region_codes.txt>
//
// Output: packages/k-skill-proxy/src/region-codes.json

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-region-codes.js <region_codes.txt>");
  process.exit(1);
}

const raw = readFileSync(resolve(inputPath), "utf-8");
const lines = raw.split("\n").slice(1); // skip header

const codes = new Map();

for (const line of lines) {
  const parts = line.split("\t");
  if (parts.length < 3) continue;

  const [fullCode, name, status] = parts;
  if (status.trim() !== "존재") continue;

  const lawdCd = fullCode.slice(0, 5);
  if (codes.has(lawdCd)) continue; // keep first (gu/gun-level) occurrence
  codes.set(lawdCd, name.trim());
}

const sorted = Object.fromEntries(
  [...codes.entries()].sort(([a], [b]) => a.localeCompare(b))
);

const outPath = resolve(__dirname, "../packages/k-skill-proxy/src/region-codes.json");
writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");

console.log(`Wrote ${Object.keys(sorted).length} entries to ${outPath}`);
