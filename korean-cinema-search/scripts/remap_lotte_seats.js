#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isLotteSeatRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isFiniteNumber(value.totalSeats) &&
    isFiniteNumber(value.bookedSeats) &&
    isFiniteNumber(value.remainingSeats)
  );
}

function remapLotteSeatRecord(record) {
  if (!isLotteSeatRecord(record)) {
    return record;
  }

  return {
    ...record,
    bookedSeats: record.remainingSeats,
    remainingSeats: record.bookedSeats,
    seatFieldsRemapped: true,
  };
}

function remapLotteSeatsPayload(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => remapLotteSeatsPayload(item, seen));
  }

  if (isLotteSeatRecord(value)) {
    const remapped = remapLotteSeatRecord(value);
    const nested = {};
    for (const [key, child] of Object.entries(remapped)) {
      if (key === "bookedSeats" || key === "remainingSeats" || key === "seatFieldsRemapped") {
        nested[key] = child;
        continue;
      }
      nested[key] = remapLotteSeatsPayload(child, seen);
    }
    return nested;
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = remapLotteSeatsPayload(child, seen);
  }
  return out;
}

function readInput(argv) {
  const fileFlag = argv.indexOf("--file");
  if (fileFlag !== -1) {
    const filePath = argv[fileFlag + 1];
    if (!filePath) {
      throw new Error("Missing value after --file");
    }
    return fs.readFileSync(filePath, "utf8");
  }

  return fs.readFileSync(0, "utf8");
}

function main(argv = process.argv.slice(2)) {
  const raw = readInput(argv).trim();
  if (!raw) {
    throw new Error("Provide daiso lottecinema JSON on stdin or with --file <path>.");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`);
  }

  process.stdout.write(`${JSON.stringify(remapLotteSeatsPayload(payload), null, 2)}\n`);
}

module.exports = {
  isLotteSeatRecord,
  remapLotteSeatRecord,
  remapLotteSeatsPayload,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
