// Classifies upstream network failures so the proxy answers with an actionable
// status and code instead of an opaque 500 `proxy_error` / "fetch failed" pair.
// A bare undici TypeError from a dead upstream normalizes to
// `upstream_unreachable` (503) or `upstream_timeout` (504).
// Route adapters may wrap the original failure to add context; classification
// therefore walks the `cause` chain instead of only inspecting the top error.
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

const MAX_CAUSE_DEPTH = 5;

// Only string socket codes are meaningful; DOMException timeouts/aborts carry
// numeric legacy codes (23/20) that would hide the useful `error.name`.
function stringCode(value) {
  return typeof value === "string" && value ? value : null;
}

function directFailureCode(error) {
  return stringCode(error?.cause?.code) || stringCode(error?.code);
}

function walkCauseChain(error, visit) {
  let current = error;
  for (let depth = 0; current && typeof current === "object" && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const result = visit(current);
    if (result) {
      return result;
    }
    current = current.cause;
  }
  return null;
}

function failureCode(error) {
  return walkCauseChain(error, directFailureCode);
}

const GENERIC_ERROR_NAMES = new Set(["Error", "TypeError"]);

function failureName(error) {
  return walkCauseChain(error, (current) =>
    typeof current?.name === "string" && current.name && !GENERIC_ERROR_NAMES.has(current.name)
      ? current.name
      : null
  );
}

function isTimeoutFailure(error) {
  return Boolean(walkCauseChain(error, (current) => {
    if (current.name === "AbortError" || current.name === "TimeoutError") {
      return true;
    }
    const code = directFailureCode(current);
    return code === "ABORT_ERR" || code === "UND_ERR_ABORTED" || TIMEOUT_CAUSE_CODES.has(code)
      ? true
      : null;
  }));
}

function classifyUpstreamFailure(error) {
  if (!error || typeof error !== "object") {
    return null;
  }
  const code = failureCode(error);
  if (isTimeoutFailure(error)) {
    return { error: "upstream_timeout", cause: code || failureName(error) || "timeout", statusCode: 504 };
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
