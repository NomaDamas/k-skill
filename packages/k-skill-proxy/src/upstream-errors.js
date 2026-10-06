// Classifies upstream network failures so the proxy answers with an actionable
// status and code instead of an opaque 500 `proxy_error` / "fetch failed" pair.
// A bare undici TypeError from a dead upstream normalizes to
// `upstream_unreachable` (503) or `upstream_timeout` (504).
"use strict";

const UNREACHABLE_CAUSE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_SOCKET"
]);

const TIMEOUT_CAUSE_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT"
]);

function failureCode(error) {
  return error?.cause?.code || error?.code || null;
}

function isTimeoutFailure(error) {
  if (!error) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }
  const code = failureCode(error);
  return code === "ABORT_ERR" || code === "UND_ERR_ABORTED" || TIMEOUT_CAUSE_CODES.has(code);
}

function classifyUpstreamFailure(error) {
  if (!error || typeof error !== "object") {
    return null;
  }
  const code = failureCode(error);
  if (isTimeoutFailure(error)) {
    return { error: "upstream_timeout", cause: code || error.name || "timeout", statusCode: 504 };
  }
  if (code && UNREACHABLE_CAUSE_CODES.has(code)) {
    return { error: "upstream_unreachable", cause: code, statusCode: 503 };
  }
  if (error.message === "fetch failed") {
    return { error: "upstream_unreachable", cause: code, statusCode: 503 };
  }
  return null;
}

module.exports = {
  UNREACHABLE_CAUSE_CODES,
  TIMEOUT_CAUSE_CODES,
  classifyUpstreamFailure
};
