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

// Only string socket codes are meaningful; DOMException timeouts/aborts carry
// numeric legacy codes (23/20) that would hide the useful `error.name`.
function stringCode(value) {
  return typeof value === "string" && value ? value : null;
}

function failureCode(error) {
  return stringCode(error?.cause?.code) || stringCode(error?.code);
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

// Human-readable cause detail for a failed fetch: appends the socket/undici
// cause code and message hidden inside Node's opaque `fetch failed` wrapper.
function describeUpstreamFailure(error) {
  const base = String(error?.message || "unknown upstream failure");
  const cause = error?.cause ?? null;
  const code = stringCode(cause?.code) || stringCode(error?.code);
  const causeMessage =
    typeof cause?.message === "string" && cause.message && cause.message !== base ? cause.message : null;
  const detail = [code, causeMessage].filter(Boolean).join("; ");
  return detail ? `${base} (${detail})` : base;
}

// Standard failure result for the keyed data.go.kr fetchers so every route in
// the family classifies and reports failures the same way (see
// docs/deploy-k-skill-proxy.md: 503 unreachable / 504 timeout / 502 other).
function upstreamFailureResult(error) {
  const classified = classifyUpstreamFailure(error);
  const message = `Upstream request failed: ${describeUpstreamFailure(error)}`;
  if (classified) {
    return { error: classified.error, cause: classified.cause, message };
  }
  return { error: "upstream_error", message };
}

module.exports = {
  UNREACHABLE_CAUSE_CODES,
  TIMEOUT_CAUSE_CODES,
  classifyUpstreamFailure,
  upstreamFailureResult
};
