"use strict";

const path = require("node:path");
const fs = require("node:fs");

const bidTypesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "bid-types.json"), "utf8")
);
const usageCodesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "usage-codes.json"), "utf8")
);
const regionCodesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "region-codes.json"), "utf8")
);

const BID_TYPES = Object.freeze(
  bidTypesData.bidTypes.map((entry) => Object.freeze({ ...entry }))
);

const BID_TYPE_BY_ALIAS = new Map();
const BID_TYPE_BY_CODE = new Map();
const BID_TYPE_BY_NAME = new Map();
const USAGE_BY_NAME = new Map();
const USAGE_BY_CODE = new Map();

const USAGE_CODES = Object.freeze(
  usageCodesData.items.map((entry) => Object.freeze({ ...entry }))
);
const REGION_CODES = Object.freeze(
  regionCodesData.items.map((entry) => Object.freeze({ ...entry }))
);

for (const entry of BID_TYPES) {
  BID_TYPE_BY_ALIAS.set(entry.alias, entry);
  BID_TYPE_BY_CODE.set(entry.code, entry);
  BID_TYPE_BY_NAME.set(entry.name, entry);
}

for (const entry of USAGE_CODES) {
  USAGE_BY_CODE.set(entry.code, entry);
  USAGE_BY_NAME.set(entry.name, entry);
}

function resolveUsageCode(input, level) {
  if (input === undefined || input === null || input === "") return "";
  const value = String(input).trim();
  if (value === "") return "";
  const codeMatch = USAGE_BY_CODE.get(value);
  if (codeMatch) return codeMatch.code;
  const nameMatch = USAGE_CODES.find((entry) => {
    if (entry.name !== value) return false;
    return !level || entry.level === level;
  }) || USAGE_BY_NAME.get(value);
  if (nameMatch) return nameMatch.code;
  return value;
}

function resolveRegionCodes(input = {}) {
  if (!input || typeof input !== "object") {
    return { sido: "", sigungu: "", dong: "" };
  }
  const sido = input.sido === undefined || input.sido === null ? "" : String(input.sido).trim();
  const sigungu = input.sigungu === undefined || input.sigungu === null ? "" : String(input.sigungu).trim();
  const dong = input.dong === undefined || input.dong === null ? "" : String(input.dong).trim();

  const match = REGION_CODES.find((entry) => {
    const sidoMatches = !sido || sido === entry.sidoCode || sido === entry.sidoName;
    const sigunguMatches = !sigungu || sigungu === entry.sigunguCode || sigungu === entry.sigunguName;
    const dongMatches = !dong || dong === entry.dongCode || dong === entry.dongName;
    return sidoMatches && sigunguMatches && dongMatches;
  });

  return {
    sido: match ? match.sidoCode : sido,
    sigungu: sigungu && match ? match.sigunguCode : sigungu,
    dong: dong && match ? match.dongCode : dong
  };
}

function listUsageCodes() {
  return USAGE_CODES.map((entry) => ({ ...entry }));
}

function listRegionCodes() {
  return REGION_CODES.map((entry) => ({ ...entry }));
}

/**
 * Resolve a bid type input (alias / code / korean name) to its raw `bidDvsCd`.
 * Returns "" if the input is empty/undefined (meaning "all types").
 * Pass-through (fail-open) on unknown codes — keeps API resilient if the
 * upstream adds new types we have not seen yet.
 */
function resolveBidTypeCode(input) {
  if (input === undefined || input === null || input === "") {
    return "";
  }
  const value = String(input).trim();
  if (value === "") {
    return "";
  }

  const aliasMatch = BID_TYPE_BY_ALIAS.get(value.toLowerCase());
  if (aliasMatch) return aliasMatch.code;

  const codeMatch = BID_TYPE_BY_CODE.get(value);
  if (codeMatch) return codeMatch.code;

  const nameMatch = BID_TYPE_BY_NAME.get(value);
  if (nameMatch) return nameMatch.code;

  // Fail-open: pass raw value through. If the user supplied an unknown
  // code (e.g. a future "기간/기일혼합입찰") the upstream will reject or
  // return empty. We do not silently rewrite it.
  return value;
}

/**
 * Resolve raw `bidDvsCd` to the human-readable Korean name.
 * Returns the input unchanged if not recognized (fail-open).
 */
function describeBidTypeCode(code) {
  if (code === undefined || code === null || code === "") {
    return "";
  }
  const value = String(code).trim();
  const match = BID_TYPE_BY_CODE.get(value);
  return match ? match.name : value;
}

function listBidTypes() {
  return BID_TYPES.map((entry) => ({ ...entry }));
}

module.exports = {
  BID_TYPES,
  USAGE_CODES,
  REGION_CODES,
  resolveBidTypeCode,
  describeBidTypeCode,
  listBidTypes,
  resolveUsageCode,
  resolveRegionCodes,
  listUsageCodes,
  listRegionCodes
};
