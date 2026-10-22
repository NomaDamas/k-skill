// Public Procurement Service (조달청 나라장터) order-plan search API wrapper.
// Proxies data.go.kr 15129462 (OrderPlanSttusService) and keeps the
// operator's DATA_GO_KR_API_KEY server-side.

const { upstreamFailureResult } = require("./upstream-errors");

const G2B_ORDER_PLAN_BASE_URL = "https://apis.data.go.kr/1230000/ao/OrderPlanSttusService";

const ORDER_PLAN_KINDS = Object.freeze({
  goods: Object.freeze({
    key: "goods",
    name: "물품",
    listOperation: "getOrderPlanSttusListThng",
    searchOperation: "getOrderPlanSttusListThngPPSSrch",
    aliases: ["goods", "thing", "things", "product", "products", "item", "items", "thng", "물품", "물건", "제품"]
  }),
  construction: Object.freeze({
    key: "construction",
    name: "공사",
    listOperation: "getOrderPlanSttusListCnstwk",
    searchOperation: "getOrderPlanSttusListCnstwkPPSSrch",
    aliases: ["construction", "work", "works", "cnstwk", "공사", "건설"]
  }),
  service: Object.freeze({
    key: "service",
    name: "용역",
    listOperation: "getOrderPlanSttusListServc",
    searchOperation: "getOrderPlanSttusListServcPPSSrch",
    aliases: ["service", "services", "servc", "용역", "서비스"]
  }),
  foreign: Object.freeze({
    key: "foreign",
    name: "외자",
    listOperation: "getOrderPlanSttusListFrgcpt",
    searchOperation: "getOrderPlanSttusListFrgcptPPSSrch",
    aliases: ["foreign", "frgcpt", "overseas", "외자", "외국"]
  })
});

const KIND_ALIASES = new Map();
for (const config of Object.values(ORDER_PLAN_KINDS)) {
  KIND_ALIASES.set(config.key, config);
  KIND_ALIASES.set(config.name, config);
  for (const alias of config.aliases) KIND_ALIASES.set(alias.toLowerCase(), config);
}
KIND_ALIASES.set("all", null);
KIND_ALIASES.set("전체", null);

const AUTH_REASON_CODES = new Set(["20", "21", "30", "31", "32", "33"]);
const DEFAULT_ORDER_MONTH_FROM = "200412";
const DEFAULT_ORDER_MONTH_TO = "202501";
const DEFAULT_POSTED_FROM = "200412010000";
const DEFAULT_POSTED_TO = "202501312359";

function trimOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function parseGatewayAuthError(text) {
  if (!text.includes("OpenAPI_ServiceResponse")) return null;
  const reasonCode = (text.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/) || [])[1]?.trim() || "";
  const authMsg = (text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || [])[1]?.trim() || "SERVICE ERROR";
  return AUTH_REASON_CODES.has(reasonCode) ? `${authMsg} (code ${reasonCode})` : null;
}

function isAuthResultCode(code) {
  return AUTH_REASON_CODES.has(String(code ?? "").trim());
}

function normalizeKind(value) {
  const raw = trimOrUndefined(value ?? "goods");
  if (!KIND_ALIASES.has(raw.toLowerCase()) && !KIND_ALIASES.has(raw)) {
    throw new Error(`Unsupported kind: ${raw}. Use goods, construction, service, foreign, or all.`);
  }
  const match = KIND_ALIASES.get(raw.toLowerCase()) ?? KIND_ALIASES.get(raw);
  return match ? match.key : "all";
}

function parsePositiveInteger(value, { defaultValue, min = 1, max, label }) {
  const raw = trimOrUndefined(value);
  if (raw === undefined) return String(defaultValue);
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be a positive integer.`);
  const parsed = Number.parseInt(raw, 10);
  if (parsed < min || (max !== undefined && parsed > max)) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return String(parsed);
}

function isValidCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeOrderMonth(value, label, defaultValue) {
  const raw = trimOrUndefined(value);
  if (raw === undefined) return defaultValue;
  const compact = raw.replace(/[^0-9]/g, "");
  if (!/^\d{6}$/.test(compact)) throw new Error(`${label} must be YYYYMM or YYYY-MM.`);
  const month = Number.parseInt(compact.slice(4, 6), 10);
  if (month < 1 || month > 12) throw new Error(`${label} must contain a valid month.`);
  return compact;
}

function normalizePostedDate(value, label, defaultValue, endOfDay = false) {
  const raw = trimOrUndefined(value);
  if (raw === undefined) return defaultValue;
  const compact = raw.replace(/[^0-9]/g, "");
  if (!/^\d{8}(\d{4})?$/.test(compact)) {
    throw new Error(`${label} must be YYYYMMDD, YYYY-MM-DD, or YYYYMMDDHHMM.`);
  }
  const year = Number.parseInt(compact.slice(0, 4), 10);
  const month = Number.parseInt(compact.slice(4, 6), 10);
  const day = Number.parseInt(compact.slice(6, 8), 10);
  if (!isValidCalendarDate(year, month, day)) throw new Error(`${label} must contain a valid calendar date.`);
  if (compact.length === 12) return compact;
  return compact + (endOfDay ? "2359" : "0000");
}

function ensureRange(from, to, label) {
  if (from > to) throw new Error(`${label} start must be earlier than or equal to end.`);
}

function copyOptionalString(target, source, outputName, inputNames) {
  for (const name of inputNames) {
    const value = trimOrUndefined(source[name]);
    if (value !== undefined) {
      target[outputName] = value;
      return;
    }
  }
}

function buildNormalizedQuery(query, kindConfig, useSearchOperation) {
  const normalized = {
    kind: kindConfig.key,
    operation: useSearchOperation ? kindConfig.searchOperation : kindConfig.listOperation,
    pageNo: parsePositiveInteger(query.pageNo ?? query.page, { defaultValue: 1, min: 1, max: 1000, label: "pageNo" }),
    numOfRows: parsePositiveInteger(query.numOfRows ?? query.limit, { defaultValue: 10, min: 1, max: 100, label: "numOfRows" })
  };

  const orderBgnYm = normalizeOrderMonth(query.orderBgnYm ?? query.orderFrom ?? query.order_from, "orderFrom", DEFAULT_ORDER_MONTH_FROM);
  const orderEndYm = normalizeOrderMonth(query.orderEndYm ?? query.orderTo ?? query.order_to, "orderTo", DEFAULT_ORDER_MONTH_TO);
  ensureRange(orderBgnYm, orderEndYm, "order month");
  normalized.orderBgnYm = orderBgnYm;
  normalized.orderEndYm = orderEndYm;

  const inqryBgnDt = normalizePostedDate(query.inqryBgnDt ?? query.postedFrom ?? query.posted_from, "postedFrom", DEFAULT_POSTED_FROM);
  const inqryEndDt = normalizePostedDate(query.inqryEndDt ?? query.postedTo ?? query.posted_to, "postedTo", DEFAULT_POSTED_TO, true);
  ensureRange(inqryBgnDt, inqryEndDt, "posted date");
  normalized.inqryBgnDt = inqryBgnDt;
  normalized.inqryEndDt = inqryEndDt;

  if (!useSearchOperation) {
    normalized.inqryDiv = trimOrUndefined(query.inqryDiv ?? query.queryDiv) || "1";
  }

  copyOptionalString(normalized, query, "orderPlanUntyNo", ["orderPlanUntyNo", "planNo", "plan_no"]);
  copyOptionalString(normalized, query, "orderInsttCd", ["orderInsttCd", "institutionCode", "institution_code"]);
  copyOptionalString(normalized, query, "orderInsttNm", ["orderInsttNm", "institution", "institutionName", "institution_name"]);
  copyOptionalString(normalized, query, "agrmntYn", ["agrmntYn", "agreement"]);
  copyOptionalString(normalized, query, "prcrmntMethd", ["prcrmntMethd", "procurementMethod", "procurement_method"]);
  copyOptionalString(normalized, query, "insttLctNm", ["insttLctNm", "region", "location"]);
  copyOptionalString(normalized, query, "dtilPrdctClsfcNo", ["dtilPrdctClsfcNo", "productCode", "product_code"]);
  copyOptionalString(normalized, query, "bsnsTyCd", ["bsnsTyCd", "businessTypeCode", "business_type_code"]);
  copyOptionalString(normalized, query, "bsnsTyNm", ["bsnsTyNm", "businessType", "business_type"]);
  copyOptionalString(normalized, query, "cnsttyDivNm", ["cnsttyDivNm", "constructionType", "construction_type"]);
  copyOptionalString(normalized, query, "bizNm", ["bizNm", "keyword", "q", "businessName", "business_name"]);

  return normalized;
}

function hasSearchOnlyFilter(query) {
  return [
    "agrmntYn", "agreement", "prcrmntMethd", "procurementMethod", "procurement_method",
    "insttLctNm", "region", "location", "dtilPrdctClsfcNo", "productCode", "product_code",
    "bsnsTyCd", "businessTypeCode", "business_type_code", "bsnsTyNm", "businessType", "business_type",
    "cnsttyDivNm", "constructionType", "construction_type", "bizNm", "keyword", "q", "businessName", "business_name"
  ].some((name) => trimOrUndefined(query[name]) !== undefined);
}

function normalizeG2bOrderPlanQuery(query = {}) {
  const kind = normalizeKind(query.kind ?? query.type ?? query.category);
  const useSearchOperation = trimOrUndefined(query.search) !== "false" || hasSearchOnlyFilter(query);
  if (kind === "all") {
    return {
      kind,
      operations: Object.fromEntries(Object.values(ORDER_PLAN_KINDS).map((config) => [
        config.key,
        buildNormalizedQuery(query, config, useSearchOperation)
      ]))
    };
  }
  return buildNormalizedQuery(query, ORDER_PLAN_KINDS[kind], useSearchOperation);
}

function extractOrderPlanItems(payload) {
  const response = payload?.response ?? {};
  const header = response.header ?? {};
  const resultCode = String(header.resultCode ?? "");
  if (resultCode && !["00", "0", "03"].includes(resultCode)) {
    throw new Error(`resultCode=${resultCode} ${header.resultMsg ?? "no message"}`.trim());
  }
  const body = response.body ?? {};
  let items = body.items;
  if (items && typeof items === "object" && !Array.isArray(items)) items = items.item ?? [];
  if (!items) items = [];
  if (!Array.isArray(items)) items = [items];
  const totalCount = Number.parseInt(String(body.totalCount ?? items.length), 10);
  return {
    items,
    totalCount: Number.isFinite(totalCount) ? totalCount : items.length,
    pageNo: Number.parseInt(String(body.pageNo ?? 1), 10) || 1,
    numOfRows: Number.parseInt(String(body.numOfRows ?? items.length), 10) || items.length
  };
}

function appendParams(url, params, serviceKey) {
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("type", "json");
  for (const [key, value] of Object.entries(params)) {
    if (["kind", "operation"].includes(key)) continue;
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
}

async function fetchOneOrderPlanQuery(normalized, serviceKey, fetchImpl) {
  const url = new URL(`${G2B_ORDER_PLAN_BASE_URL}/${normalized.operation}`);
  appendParams(url, normalized, serviceKey);

  const doFetch = fetchImpl || global.fetch;
  let response;
  try {
    response = await doFetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    return upstreamFailureResult(err);
  }

  if (response.status === 401 || response.status === 403) {
    return {
      error: "upstream_forbidden",
      message: `Procurement order-plan upstream returned ${response.status}. The proxy key may not be approved for service 15129462.`
    };
  }
  if (!response.ok) return { error: "upstream_error", message: `Upstream returned ${response.status}` };

  const text = await response.text();
  const gatewayAuthError = parseGatewayAuthError(text);
  if (gatewayAuthError) {
    return {
      error: "upstream_forbidden",
      message: `Procurement order-plan upstream rejected the request (${gatewayAuthError}). The proxy key may not be approved for service 15129462.`
    };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { error: "upstream_invalid_response", message: "Procurement order-plan upstream did not return valid JSON." };
  }
  if (isAuthResultCode(payload?.response?.header?.resultCode)) {
    return {
      error: "upstream_forbidden",
      message: `Procurement order-plan upstream rejected the request (${payload.response.header.resultMsg || "auth error"}). The proxy key may not be approved for service 15129462.`
    };
  }

  let extracted;
  try {
    extracted = extractOrderPlanItems(payload);
  } catch (err) {
    return { error: "upstream_error", message: `Procurement order-plan upstream error response: ${err.message}` };
  }

  return {
    query: normalized,
    page: extracted.pageNo,
    page_size: extracted.numOfRows,
    total_count: extracted.totalCount,
    items: extracted.items,
    source: {
      data_go_kr_dataset: "15129462",
      upstream: `${G2B_ORDER_PLAN_BASE_URL}/${normalized.operation}`
    }
  };
}

async function fetchG2bOrderPlans({ serviceKey, fetchImpl = global.fetch, ...normalized }) {
  if (normalized.kind === "all") {
    const groups = [];
    for (const operationQuery of Object.values(normalized.operations)) {
      const result = await fetchOneOrderPlanQuery(operationQuery, serviceKey, fetchImpl);
      if (result.error) return result;
      groups.push({ kind: operationQuery.kind, total_count: result.total_count, items: result.items });
    }
    return {
      query: normalized,
      total_count: groups.reduce((sum, group) => sum + group.total_count, 0),
      items: groups.flatMap((group) => group.items.map((item) => ({ ...item, _order_plan_kind: group.kind }))),
      groups,
      source: {
        data_go_kr_dataset: "15129462",
        upstream: G2B_ORDER_PLAN_BASE_URL
      }
    };
  }
  return fetchOneOrderPlanQuery(normalized, serviceKey, fetchImpl);
}

module.exports = {
  G2B_ORDER_PLAN_BASE_URL,
  ORDER_PLAN_KINDS,
  normalizeG2bOrderPlanQuery,
  extractOrderPlanItems,
  fetchG2bOrderPlans
};
