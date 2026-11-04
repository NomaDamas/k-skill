// Classifies upstream network failures so the proxy answers with an actionable
// status and code instead of an opaque 500 `proxy_error` / "fetch failed" pair.
// A bare undici TypeError from a dead upstream normalizes to
// `upstream_unreachable` (503) or `upstream_timeout` (504).
// Route adapters may wrap the original failure to add context; classification
// therefore walks the `cause` chain instead of only inspecting the top error.
"use strict";

const { redactErrorChain } = require("./redaction");

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

const SOCKET_CAUSE_CODES = new Set([...UNREACHABLE_CAUSE_CODES, ...TIMEOUT_CAUSE_CODES]);

// Route adapters that wrap a fetch error add their own application-level `code`
// (e.g. "proxy_error"), and that wrapper sits nearer the top of the chain than
// the socket code the caller needs. Report the first socket/undici code found
// anywhere in the chain instead of the wrapper's bookkeeping code.
function socketFailureCode(error) {
  return walkCauseChain(error, (current) => {
    const code = directFailureCode(current);
    return code && SOCKET_CAUSE_CODES.has(code) ? code : null;
  });
}

const GENERIC_ERROR_NAMES = new Set(["Error", "TypeError"]);

// Identity of the root failure in a wrapped chain: its own code, or its specific
// error name when it carries none (an AbortSignal.timeout DOMException exposes
// only the numeric legacy code and `name: "TimeoutError"`). The deepest node wins
// so an adapter wrapper's bookkeeping `code` cannot shadow the real cause.
function rootCauseIdentity(error) {
  let current = error;
  let identity = null;
  for (let depth = 0; current && typeof current === "object" && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const code = stringCode(current.code);
    const name = stringCode(current.name);
    if (code) {
      identity = code;
    } else if (name && !GENERIC_ERROR_NAMES.has(name)) {
      identity = name;
    }
    current = current.cause;
  }
  return identity;
}

// Label reported as `cause`: the socket/undici code that identifies the failure
// wherever it sits in the chain, else the root failure's own identity.
function failureCauseLabel(error) {
  return socketFailureCode(error) || rootCauseIdentity(error);
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

// Node wraps an unreachable upstream in a bare `TypeError: fetch failed` whose
// useful detail lives on `cause`. Route adapters may wrap that wrapper again,
// so detect the marker anywhere in the bounded chain, not just at the top.
function isFetchFailedFailure(error) {
  return walkCauseChain(error, (current) => (current?.message === "fetch failed" ? true : null)) || false;
}

function classifyUpstreamFailure(error) {
  if (!error || typeof error !== "object") {
    return null;
  }
  const cause = failureCauseLabel(error);
  if (isTimeoutFailure(error)) {
    return { error: "upstream_timeout", cause: cause || "timeout", statusCode: 504 };
  }
  if (cause && UNREACHABLE_CAUSE_CODES.has(cause)) {
    return { error: "upstream_unreachable", cause, statusCode: 503 };
  }
  if (isFetchFailedFailure(error)) {
    return { error: "upstream_unreachable", cause, statusCode: 503 };
  }
  return null;
}

// Human-readable cause detail for a failed fetch: appends the socket/undici
// cause code and the message hidden inside Node's opaque `fetch failed`
// wrapper. Reuses the same bounded chain walker as classification so wrapped
// errors from the keyed data.go.kr routes are described consistently.
function describeUpstreamFailure(error) {
  const base = String(error?.message || "unknown upstream failure");
  const code = failureCauseLabel(error);
  const causeMessage = walkCauseChain(error, (current) =>
    typeof current?.message === "string" && current.message && current.message !== base
      ? current.message
      : null
  );
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

// Route adapters call this in their catch before mapping an upstream failure to
// their own status/body: a classified network failure is rethrown (with its
// cause chain intact) so the global error handler answers 504 upstream_timeout /
// 503 upstream_unreachable including `cause`. The service key is redacted out of
// the message/stack chain first, because undici's `fetch failed` wrapper can
// carry the credential-bearing request URL all the way into the response and the
// logs. Anything that is not a network failure returns normally so the adapter
// keeps its own HTTP-status/body mapping. Adapters that fan out to several
// upstreams pass every key they may have embedded in a request URL.
function rethrowIfUpstreamNetworkFailure(error, secret) {
  if (!classifyUpstreamFailure(error)) {
    return;
  }
  const secrets = Array.isArray(secret) ? secret : [secret];
  throw secrets.reduce((current, candidate) => redactErrorChain(current, candidate), error);
}

module.exports = {
  UNREACHABLE_CAUSE_CODES,
  TIMEOUT_CAUSE_CODES,
  classifyUpstreamFailure,
  rethrowIfUpstreamNetworkFailure,
  upstreamFailureResult
};
