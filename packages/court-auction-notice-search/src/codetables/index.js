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

/**
 * Resolve a usage classification name/code to its upstream `lcl/mcl/sclDspslGdsLstUsgCd`.
 *
 * Strict-level matching: when `level` is supplied (`"large"`, `"medium"`, `"small"`),
 * the function only returns a code that is registered at that exact level. If the
 * input name exists at a different level we fail open (return the raw input) instead
 * of silently mapping to a wrong-level code — same-name codes (e.g. `"아파트"`) exist
 * at multiple levels and a wrong-level mapping would silently corrupt the request.
 *
 * Codes (5-digit, e.g. `"20000"`) are accepted as-is regardless of `level`.
 *
 * Returns `""` for empty input.
 */
function resolveUsageCode(input, level) {
  if (input === undefined || input === null || input === "") return "";
  const value = String(input).trim();
  if (value === "") return "";

  // Direct code match — accepted at any level (the upstream determines validity).
  const codeMatch = USAGE_BY_CODE.get(value);
  if (codeMatch) return codeMatch.code;

  if (level) {
    // Strict-level match. Do NOT fall back to USAGE_BY_NAME because that would
    // ignore the level constraint and return a wrong-level code for ambiguous names.
    const nameMatch = USAGE_CODES.find(
      (entry) => entry.name === value && entry.level === level
    );
    if (nameMatch) return nameMatch.code;
    // Fail open: pass the raw input through so the user sees an upstream error
    // instead of a silently wrong code.
    return value;
  }

  // No level specified — match the first registered name (any level).
  const nameMatch = USAGE_BY_NAME.get(value);
  if (nameMatch) return nameMatch.code;
  return value;
}

/**
 * Resolve a region (sido/sigungu/dong) input to upstream `rprsAdong*Cd` codes.
 *
 * - Each component is independently resolved against the static sido table by
 *   exact code or Korean name match. Sigungu/dong are NOT in the static table
 *   (the upstream cascading XHRs are not consistently exposed) so they pass
 *   through unchanged when supplied as raw codes.
 * - When ALL three inputs are empty, returns `{ "", "", "" }` — this is the
 *   correct "no region filter" state (cortStDvs:"1" branch in the search body).
 * - When any input is non-empty, it is returned (resolved-or-passthrough);
 *   empty inputs stay empty. There is no first-row fallback.
 */
function resolveRegionCodes(input = {}) {
  if (!input || typeof input !== "object") {
    return { sido: "", sigungu: "", dong: "" };
  }
  const rawSido = input.sido === undefined || input.sido === null ? "" : String(input.sido).trim();
  const rawSigungu = input.sigungu === undefined || input.sigungu === null ? "" : String(input.sigungu).trim();
  const rawDong = input.dong === undefined || input.dong === null ? "" : String(input.dong).trim();

  let sido = rawSido;
  if (sido) {
    const sidoMatch = REGION_CODES.find(
      (entry) => entry.sidoCode === sido || entry.sidoName === sido
    );
    if (sidoMatch) sido = sidoMatch.sidoCode;
  }

  // Sigungu/dong: pass through raw codes / names. The upstream expects 5-digit
  // sigungu codes (e.g. "11680" 강남구) and 8-digit dong codes (e.g. "11680101"
  // 역삼동) observed in dlt_srchResult.srchHjguSiguCd/srchHjguDongCd. Names
  // without code mapping are passed through unchanged (fail-open).
  return { sido, sigungu: rawSigungu, dong: rawDong };
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
