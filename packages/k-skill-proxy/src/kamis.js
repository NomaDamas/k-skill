const KAMIS_UPSTREAM_BASE_URL = "https://www.kamis.or.kr/service/price/xml.do";
const KAMIS_ACTION = "dailyPriceByCategoryList";
const KAMIS_DEFAULT_LOOKBACK_DAYS = 7;

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

function kamisKstToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function shiftKamisDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${mm}-${dd}`;
}

function kamisItemCount(body) {
  try {
    const item = JSON.parse(String(body ?? ""))?.data?.item;
    return Array.isArray(item) ? item.length : 0;
  } catch {
    return 0;
  }
}

// KAMIS answers code `001` (or an empty `item` list) when it has no survey for
// the requested day, and it does not fall back to the last published day on
// its own: a request without `p_regday` gets no rows even on a day with prices.
// When the caller omits `p_regday`, walk back day by day from today in KST
// until a survey day answers with rows, so the documented default ("최근
// 조사일") actually returns data. Hard upstream failures short-circuit so the
// existing error mapping still applies, and the walk-back is bounded.
async function resolveKamisRegday({
  query,
  apiKey,
  now = () => new Date(),
  maxLookbackDays = KAMIS_DEFAULT_LOOKBACK_DAYS,
  fetchImpl = global.fetch
}) {
  const firstDay = kamisKstToday(now());
  const attempts = apiKey ? maxLookbackDays + 1 : 1;
  let fallback = null;
  for (let offset = 0; offset < attempts; offset += 1) {
    const probeQuery = { ...query, p_regday: shiftKamisDate(firstDay, -offset) };
    const upstream = await proxyKamisRequest({ query: probeQuery, apiKey, fetchImpl });
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return { query: probeQuery, upstream };
    }
    if (isKamisFailureBody(upstream.body)) {
      return { query: probeQuery, upstream };
    }
    if (kamisItemCount(upstream.body) > 0) {
      return { query: probeQuery, upstream };
    }
    if (fallback === null) {
      fallback = { query: probeQuery, upstream };
    }
  }
  // Nothing in the look-back window has data: report today rather than the
  // oldest probed day so the response date stays meaningful.
  return fallback;
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
  proxyKamisRequest,
  resolveKamisRegday
};
