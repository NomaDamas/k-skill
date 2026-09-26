// Shared classifier for data.go.kr OpenAPI result/reason codes and shared
// upstream attribution logging.
//
// Several proxy routes reuse the operator's DATA_GO_KR_API_KEY (LH, KRX,
// AirKorea, MOLIT, keyed data.go.kr lookups). Without a shared classifier the
// same operator-actionable failures collapse into generic 502/500 responses:
//
//   - reason 30 SERVICE_KEY_IS_NOT_REGISTERED_ERROR  (utilization not approved)
//   - reason 20/21/31/32/33 access/auth/deadline errors
//   - reason 22 quota exceeded
//
// Keeping the mapping in one place lets every route separate operator-actionable
// configuration/quota errors from transient upstream failures, and lets the
// route handlers attribute them with the same structured log fields.

const QUOTA_REASON_CODES = new Set(["22"]);
const CONFIGURATION_REASON_CODES = new Set(["20", "21", "30", "31", "32", "33"]);

// Error codes that are operator-actionable rather than transient. These are
// logged at error level so they surface in operations dashboards; transient
// upstream failures stay at warn level.
const OPERATIONAL_UPSTREAM_ERROR_CODES = new Set([
  "upstream_configuration_error",
  "upstream_forbidden",
  "upstream_not_authorized",
  "upstream_not_configured",
  "upstream_quota_exceeded",
  "upstream_rate_limited"
]);

function classifyDataGoKrReasonCode(code) {
  const normalized = code === undefined || code === null ? null : String(code).trim();
  if (!normalized) {
    return null;
  }

  if (QUOTA_REASON_CODES.has(normalized)) {
    return {
      error: "upstream_quota_exceeded",
      statusCode: 503,
      retryAfterSeconds: 3600
    };
  }

  if (CONFIGURATION_REASON_CODES.has(normalized)) {
    return {
      error: "upstream_configuration_error",
      statusCode: 502
    };
  }

  return null;
}

// Parse an upstream Retry-After header (delta-seconds or HTTP-date) into a
// positive number of seconds. Returns null when absent/unparseable.
function parseRetryAfterSeconds(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number.parseInt(text, 10);
    return seconds > 0 ? seconds : null;
  }
  const date = Date.parse(text);
  if (Number.isFinite(date)) {
    const seconds = Math.ceil((date - Date.now()) / 1000);
    return seconds > 0 ? seconds : null;
  }
  return null;
}

function isOperationalUpstreamError(errorCode) {
  return OPERATIONAL_UPSTREAM_ERROR_CODES.has(String(errorCode || ""));
}

// Reduce an upstream URL to origin + pathname so query values (search terms,
// service keys) never reach the logs.
function sanitizeUpstreamUrl(rawUrl) {
  if (rawUrl === undefined || rawUrl === null || rawUrl === "") {
    return null;
  }
  try {
    const url = new URL(String(rawUrl));
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

// Blank anything that looks like a credential assignment so upstream bodies or
// messages that echo a key can never reach the logs verbatim.
function redactCredentialAssignments(value) {
  return String(value || "")
    .replace(/((?:service|auth|client)[_-]?key|secret|token)(?:=|%3D)[^&\s"'<>]+/giu, "$1=[REDACTED]");
}

// Keep a short, single-line diagnostic snippet while stripping control
// characters and blanking anything that looks like a credential assignment.
function sanitizeUpstreamSnippet(value, maxLength = 200) {
  const text = redactCredentialAssignments(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function logUpstreamError(logger, {
  route,
  errorCode = null,
  message = null,
  upstreamCode = null,
  upstreamStatus = null,
  operation = null,
  upstreamUrl = null,
  bodySnippet = null
} = {}) {
  if (!logger || typeof logger !== "object") {
    return;
  }
  const level = isOperationalUpstreamError(errorCode) ? "error" : "warn";
  if (typeof logger[level] !== "function") {
    return;
  }

  const fields = {
    route,
    upstreamError: errorCode || "proxy_error"
  };
  if (message) {
    fields.upstreamMessage = redactCredentialAssignments(message).slice(0, 500);
  }
  if (upstreamCode !== undefined && upstreamCode !== null && upstreamCode !== "") {
    fields.upstreamCode = String(upstreamCode);
  }
  if (Number.isInteger(upstreamStatus)) {
    fields.upstreamStatus = upstreamStatus;
  }
  if (operation) {
    fields.upstreamOperation = String(operation);
  }
  const safeUrl = sanitizeUpstreamUrl(upstreamUrl);
  if (safeUrl) {
    fields.upstreamUrl = safeUrl;
  }
  const snippet = sanitizeUpstreamSnippet(bodySnippet);
  if (snippet) {
    fields.upstreamBodySnippet = snippet;
  }

  logger[level](fields, "upstream error");
}

module.exports = {
  CONFIGURATION_REASON_CODES,
  OPERATIONAL_UPSTREAM_ERROR_CODES,
  QUOTA_REASON_CODES,
  classifyDataGoKrReasonCode,
  isOperationalUpstreamError,
  logUpstreamError,
  parseRetryAfterSeconds,
  redactCredentialAssignments,
  sanitizeUpstreamSnippet,
  sanitizeUpstreamUrl
};