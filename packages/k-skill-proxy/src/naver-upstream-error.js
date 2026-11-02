// Naver Search API upstreams (openapi.naver.com and the shopping BFF) answer
// failures with their own 4xx/5xx status. Forwarding that status verbatim made
// clients read an upstream 404 as "the proxy route does not exist" (`SE05`:
// missing Shopping search permission) and an upstream 401 as if the proxy
// itself rejected the credentials. Every upstream failure except rate limiting
// is therefore reported as a proxy 502 `upstream_error`; the real status, body
// snippet and Naver `errorCode` stay in `upstream` for diagnosis.
"use strict";

const UPSTREAM_RATE_LIMIT_STATUS = 429;
const PROXY_UPSTREAM_FAILURE_STATUS = 502;
const BODY_SNIPPET_LENGTH = 200;

// Naver error bodies are JSON (`{"errorCode":"SE05"}`), but edge/BFF failures
// can be plain text, so parsing is best effort.
function parseUpstreamErrorCode(body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const raw = payload.errorCode ?? payload.error_code;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

// Retry-After is either an integer second count or an HTTP date; only the
// second form is carried over as a number so consumers never get a bogus
// numeric delay parsed out of a date string.
function parseRetryAfterSeconds(headers) {
  const raw = headers?.get?.("retry-after");
  if (!raw) {
    return null;
  }
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function createUpstreamHttpError({ apiLabel, status, body, headers }) {
  const error = new Error(`${apiLabel} responded with ${status}.`);
  error.upstreamStatusCode = status;
  error.upstreamBodySnippet = body.slice(0, BODY_SNIPPET_LENGTH);
  error.upstreamErrorCode = parseUpstreamErrorCode(body);

  if (status === UPSTREAM_RATE_LIMIT_STATUS) {
    error.code = "upstream_rate_limited";
    error.statusCode = UPSTREAM_RATE_LIMIT_STATUS;
    error.retryAfterSeconds = parseRetryAfterSeconds(headers);
    return error;
  }

  error.code = "upstream_error";
  error.statusCode = PROXY_UPSTREAM_FAILURE_STATUS;
  return error;
}

module.exports = { createUpstreamHttpError };
