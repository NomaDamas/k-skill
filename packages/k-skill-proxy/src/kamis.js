const KAMIS_UPSTREAM_BASE_URL = "https://www.kamis.or.kr/service/price/xml.do";
const KAMIS_ACTION = "dailyPriceByCategoryList";

const KAMIS_ALLOWED_FIELDS = new Set([
  "p_product_cls_code",
  "p_country_code",
  "p_regday",
  "p_convert_kg_yn",
  "p_item_category_code"
]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function firstTrimmed(...values) {
  for (const value of values) {
    const trimmed = trimOrNull(value);
    if (trimmed !== null) {
      return trimmed;
    }
  }
  return null;
}

function normalizeKamisDate(value) {
  const raw = trimOrNull(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\//g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("p_regday must be YYYY-MM-DD.");
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("p_regday must be a valid date.");
  }
  return normalized;
}

function normalizeKamisEnum(value, field, allowed) {
  const raw = trimOrNull(value);
  if (!raw) {
    return null;
  }
  if (!allowed.has(raw)) {
    throw new Error(`${field} must be one of ${[...allowed].join(", ")}.`);
  }
  return raw;
}

function normalizeKamisQuery(query = {}) {
  const normalized = {
    p_product_cls_code: normalizeKamisEnum(
      firstTrimmed(query.p_product_cls_code, query.p_productclscode),
      "p_product_cls_code",
      new Set(["01", "02"])
    ) || "01",
    p_item_category_code: normalizeKamisEnum(
      firstTrimmed(query.p_item_category_code, query.p_itemcategorycode),
      "p_item_category_code",
      new Set(["100", "200", "300", "400", "500", "600"])
    ) || "100",
    p_country_code: firstTrimmed(query.p_country_code, query.p_countycode),
    p_regday: normalizeKamisDate(query.p_regday),
    p_convert_kg_yn: normalizeKamisEnum(
      query.p_convert_kg_yn,
      "p_convert_kg_yn",
      new Set(["Y", "N"])
    ) || "N"
  };

  if (normalized.p_country_code && !/^\d{4}$/.test(normalized.p_country_code)) {
    throw new Error("p_country_code must be a four-digit KAMIS region code.");
  }

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== null)
  );
}

// KAMIS echoes the filters it actually applied in `condition[0]` (for example
// `p_category_code` and `p_product_cls_code`). Compare that echo against the
// requested query so a silently ignored filter fails closed. Unexpected echo
// shapes (`[]`, a bare object, a missing envelope) are treated as unverifiable
// rather than crashing the route, and only a present-but-contradicting echo is
// rejected.
function kamisEchoedCondition(condition) {
  const echo = Array.isArray(condition) ? condition[0] : condition;
  return echo && typeof echo === "object" ? echo : null;
}

function isKamisConditionConsistent(condition, query) {
  const echo = kamisEchoedCondition(condition);
  if (!echo) {
    return true;
  }
  const checks = [
    [trimOrNull(echo.p_category_code ?? echo.p_item_category_code), trimOrNull(query?.p_item_category_code)],
    [trimOrNull(echo.p_product_cls_code ?? echo.p_productclscode), trimOrNull(query?.p_product_cls_code)]
  ];
  return checks.every(
    ([applied, requested]) => requested === null || applied === null || applied === requested
  );
}

function kamisErrorCode(body) {
  try {
    const payload = JSON.parse(String(body || ""));
    return payload?.data?.error_code || null;
  } catch {
    return null;
  }
}

function isKamisSuccessBody(body) {
  return kamisErrorCode(body) === "000";
}

function isKamisFailureBody(body) {
  const code = kamisErrorCode(body);
  return code !== null && code !== "000" && code !== "001";
}

async function proxyKamisRequest({
  query,
  apiKey,
  certId = "TEST",
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KAMIS_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(KAMIS_UPSTREAM_BASE_URL);
  url.searchParams.set("action", KAMIS_ACTION);
  url.searchParams.set("p_cert_key", apiKey);
  url.searchParams.set("p_cert_id", certId || "TEST");
  url.searchParams.set("p_returntype", "json");
  for (const [key, value] of Object.entries(query || {})) {
    if (KAMIS_ALLOWED_FIELDS.has(key) && value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "k-skill-proxy/kamis"
    },
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

module.exports = {
  KAMIS_ACTION,
  KAMIS_UPSTREAM_BASE_URL,
  isKamisFailureBody,
  isKamisConditionConsistent,
  isKamisSuccessBody,
  kamisErrorCode,
  normalizeKamisQuery,
  proxyKamisRequest
};
