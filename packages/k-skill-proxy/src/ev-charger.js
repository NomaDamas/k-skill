const { searchRegionCode } = require("./region-lookup");

const EV_CHARGER_BASE_URL = "https://apis.data.go.kr/B552584/EvCharger";
const EV_CHARGER_OPERATIONS = Object.freeze({
  info: "getChargerInfo",
  status: "getChargerStatus"
});
const AUTH_RESULT_CODES = new Set(["20", "21", "22", "30", "31", "32", "33"]);
const EV_CHARGER_UPSTREAM_TIMEOUT_MS = 90000;

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseInteger(value, { defaultValue, min = 1, max, label }) {
  const text = trimOrNull(value);
  if (text === null) return defaultValue;
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be an integer.`);
  const parsed = Number.parseInt(text, 10);
  if (parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return parsed;
}

function validateCode(value, { label, pattern, maxLength }) {
  const text = trimOrNull(value);
  if (text === null) return null;
  if (text.length > maxLength || !pattern.test(text)) throw new Error(`Provide valid ${label}.`);
  return text;
}

function validateText(value, { label, maxLength }) {
  const text = trimOrNull(value);
  if (text === null) return null;
  if (text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`Provide valid ${label}.`);
  return text;
}

function rejectUnsupportedQuery(operation, query) {
  const common = new Set(["pageNo", "page", "numOfRows", "limit", "zcode", "zscode", "statId", "chgerId"]);
  const operationFields = operation === "info" ? new Set(["location"]) : new Set(["limitYn", "period"]);
  for (const key of Object.keys(query)) {
    const lower = key.toLowerCase();
    if (lower === "servicekey" || lower === "datatype") {
      throw new Error(`${key} is controlled by the proxy server.`);
    }
    if (!common.has(key) && !operationFields.has(key)) {
      throw new Error(`${key} is not supported for EV charger ${operation}.`);
    }
  }
}

function normalizeEvChargerQuery(operation, query = {}) {
  const upstreamOperation = EV_CHARGER_OPERATIONS[operation];
  if (!upstreamOperation) throw new Error("operation must be info or status.");
  rejectUnsupportedQuery(operation, query);

  const normalized = {
    operation,
    upstreamOperation,
    pageNo: parseInteger(query.pageNo ?? query.page, { defaultValue: 1, max: 100000, label: "pageNo" }),
    numOfRows: parseInteger(query.numOfRows ?? query.limit, {
      defaultValue: 10,
      min: 10,
      max: 9999,
      label: "numOfRows"
    })
  };
  const filters = {
    zcode: validateCode(query.zcode, { label: "zcode", pattern: /^\d{2}$/, maxLength: 2 }),
    zscode: validateCode(query.zscode, { label: "zscode", pattern: /^\d{5}$/, maxLength: 5 }),
    statId: validateCode(query.statId, { label: "statId", pattern: /^[A-Za-z0-9_-]+$/, maxLength: 40 }),
    chgerId: validateCode(query.chgerId, { label: "chgerId", pattern: /^[A-Za-z0-9_-]+$/, maxLength: 10 })
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null) normalized[key] = value;
  }

  if (operation === "info") {
    const location = validateText(query.location, { label: "location", maxLength: 100 });
    if (location !== null) {
      const matches = searchRegionCode(location);
      if (matches.length === 0) throw new Error("location must resolve to a supported region.");
      if (matches.length > 1) throw new Error("location must resolve to exactly one region.");

      const zscode = matches[0].lawd_cd;
      const zcode = zscode.slice(0, 2);
      if (normalized.zcode !== undefined && normalized.zcode !== zcode) {
        throw new Error("location conflicts with zcode.");
      }
      if (normalized.zscode !== undefined && normalized.zscode !== zscode) {
        throw new Error("location conflicts with zscode.");
      }
      normalized.zcode = zcode;
      normalized.zscode = zscode;
    }
  } else {
    const limitYn = trimOrNull(query.limitYn);
    if (limitYn !== null) {
      const upper = limitYn.toUpperCase();
      if (!new Set(["Y", "N"]).has(upper)) throw new Error("limitYn must be Y or N.");
      normalized.limitYn = upper;
    }
    if (trimOrNull(query.period) !== null) {
      normalized.period = parseInteger(query.period, { defaultValue: 10, max: 10, label: "period" });
    }
  }
  return normalized;
}

function semanticHeader(payload) {
  return payload?.response?.header ?? payload?.header ?? null;
}

function extractEvChargerPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("EV charger upstream returned an invalid response envelope.");
  }
  const header = semanticHeader(payload);
  const resultCode = trimOrNull(header?.resultCode ?? payload.resultCode);
  if (resultCode && !new Set(["0", "00", "03"]).has(resultCode)) {
    const error = new Error(trimOrNull(header?.resultMsg ?? payload.resultMsg) || `resultCode=${resultCode}`);
    error.resultCode = resultCode;
    throw error;
  }
  const body = payload.response?.body ?? payload.body ?? payload;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("EV charger upstream returned an invalid response body.");
  }
  if (!["items", "totalCount", "pageNo", "numOfRows"].some((key) => Object.hasOwn(body, key))) {
    throw new Error("EV charger upstream returned an incomplete response body.");
  }
  let items = body.items;
  if (items && typeof items === "object" && !Array.isArray(items)) items = items.item;
  if (items === "" || items === null || items === undefined) items = [];
  if (!Array.isArray(items)) items = [items];
  const totalCount = Number.parseInt(String(body.totalCount ?? items.length), 10);
  const pageNo = Number.parseInt(String(body.pageNo ?? 1), 10);
  const numOfRows = Number.parseInt(String(body.numOfRows ?? items.length), 10);
  if (![totalCount, pageNo, numOfRows].every(Number.isFinite)) {
    throw new Error("EV charger upstream returned invalid pagination metadata.");
  }
  return {
    items,
    totalCount,
    pageNo,
    numOfRows
  };
}

function isGatewayAuthError(text) {
  const upper = text.toUpperCase();
  return upper.includes("OPENAPI_SERVICERESPONSE")
    && (upper.includes("SERVICE KEY") || upper.includes("SERVICE_KEY") || upper.includes("RETURNREASONCODE"));
}

function errorResult(error, message) {
  return { status_code: 502, error, message };
}

async function fetchEvCharger({ params, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      status_code: 503,
      error: "upstream_not_configured",
      message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
    };
  }
  const url = new URL(`${EV_CHARGER_BASE_URL}/${params.upstreamOperation}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("dataType", "JSON");
  for (const [key, value] of Object.entries(params)) {
    if (key === "operation" || key === "upstreamOperation" || key === "location") continue;
    url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(EV_CHARGER_UPSTREAM_TIMEOUT_MS) });
  } catch {
    return errorResult("upstream_unavailable", "EV charger upstream request failed.");
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403 || isGatewayAuthError(text)) {
    return errorResult(
      "upstream_forbidden",
      "EV charger upstream rejected the proxy key. Confirm separate utilization approval for data.go.kr dataset 15076352."
    );
  }
  if (!response.ok) return errorResult("upstream_error", `EV charger upstream returned HTTP ${response.status}.`);
  if (!text.trim()) return errorResult("upstream_invalid_response", "EV charger upstream returned an empty response.");
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("xml") || text.trimStart().startsWith("<")) {
    return errorResult("upstream_invalid_response", "EV charger upstream returned XML instead of JSON.");
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return errorResult("upstream_invalid_response", "EV charger upstream did not return valid JSON.");
  }
  const header = semanticHeader(payload);
  const resultCode = trimOrNull(header?.resultCode ?? payload.resultCode);
  const resultMessage = trimOrNull(header?.resultMsg ?? payload.resultMsg) || "";
  if (AUTH_RESULT_CODES.has(resultCode) || /SERVICE[ _]?KEY|AUTH/i.test(resultMessage)) {
    return errorResult(
      "upstream_forbidden",
      "EV charger upstream rejected the proxy key. Confirm separate utilization approval for data.go.kr dataset 15076352."
    );
  }

  let extracted;
  try {
    extracted = extractEvChargerPayload(payload);
  } catch (error) {
    return errorResult("upstream_error", `EV charger upstream error response: ${error.message}`);
  }
  return {
    operation: params.operation,
    query: Object.fromEntries(Object.entries(params).filter(([key]) => key !== "upstreamOperation")),
    page: extracted.pageNo,
    page_size: extracted.numOfRows,
    total_count: extracted.totalCount,
    items: extracted.items,
    source: {
      data_go_kr_dataset: "15076352",
      upstream: `${EV_CHARGER_BASE_URL}/${params.upstreamOperation}`
    }
  };
}

module.exports = {
  EV_CHARGER_BASE_URL,
  EV_CHARGER_UPSTREAM_TIMEOUT_MS,
  EV_CHARGER_OPERATIONS,
  extractEvChargerPayload,
  fetchEvCharger,
  normalizeEvChargerQuery
};
