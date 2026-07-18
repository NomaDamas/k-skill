const RISS_OPEN_API_URL = "https://www.riss.kr/openApi";
const RESOURCE_TYPE_MAP = Object.freeze({
  ALL: ["T", "A", "O", "U", "F", "S"],
  T: ["T"],
  A: ["A", "O"],
  D: ["A"],
  B: ["U"]
});
const SEARCH_FIELDS = ["keyword", "title", "author", "subject", "publisher"];
const { parseRissXml } = require("./keris-academic-xml");

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseBoundedInteger(value, { defaultValue, max, label }) {
  const text = trimOrNull(value);
  if (text === null) return defaultValue;
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be an integer.`);
  const parsed = Number.parseInt(text, 10);
  if (parsed < 1 || parsed > max) throw new Error(`${label} must be between 1 and ${max}.`);
  return parsed;
}

function validateSearchText(value, label) {
  const text = trimOrNull(value);
  if (text === null) return null;
  if (text.length > 200 || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`Provide valid ${label} (1-200 characters).`);
  }
  return text;
}

function rejectUnsupportedQuery(query) {
  const supported = new Set([
    ...SEARCH_FIELDS,
    "resourceType", "resource_type", "type", "page", "pageSize", "page_size"
  ]);
  const controlled = new Set(["key", "servicekey", "version", "rsnum", "rowcount"]);
  for (const key of Object.keys(query)) {
    if (controlled.has(key.toLowerCase())) throw new Error(`${key} is controlled by the proxy server.`);
    if (!supported.has(key)) throw new Error(`${key} is not supported for KERIS academic search.`);
  }
}

function normalizeKerisAcademicQuery(query = {}) {
  rejectUnsupportedQuery(query);
  const normalized = {};
  for (const field of SEARCH_FIELDS) {
    const value = validateSearchText(query[field], field);
    if (value !== null) normalized[field] = value;
  }
  if (!SEARCH_FIELDS.some((field) => normalized[field])) {
    throw new Error("Provide at least one search field: keyword, title, author, subject, or publisher.");
  }
  const resourceType = (trimOrNull(query.resourceType ?? query.resource_type ?? query.type) || "ALL").toUpperCase();
  const upstreamTypes = RESOURCE_TYPE_MAP[resourceType];
  if (!upstreamTypes) throw new Error(`resourceType must be one of: ${Object.keys(RESOURCE_TYPE_MAP).join(", ")}.`);
  const page = parseBoundedInteger(query.page, { defaultValue: 1, max: 100000, label: "page" });
  const pageSize = parseBoundedInteger(query.pageSize ?? query.page_size, {
    defaultValue: 10,
    max: 100,
    label: "pageSize"
  });
  if (upstreamTypes.length > 1 && page > 1) {
    throw new Error("Combined resourceType searches support page 1 only; choose a single type for later pages.");
  }
  return {
    ...normalized,
    resourceType,
    upstreamTypes: [...upstreamTypes],
    page,
    pageSize,
    rsnum: ((page - 1) * pageSize) + 1
  };
}

function errorResult(error, message) {
  return { status_code: 502, error, message };
}

async function fetchOneRissType({ params, upstreamType, apiKey, fetchImpl }) {
  const url = new URL(RISS_OPEN_API_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("version", "1.0");
  url.searchParams.set("type", upstreamType);
  for (const field of SEARCH_FIELDS) if (params[field]) url.searchParams.set(field, params[field]);
  url.searchParams.set("rsnum", String(params.rsnum));
  url.searchParams.set("rowcount", String(params.pageSize));
  let response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch {
    return errorResult("upstream_unavailable", "RISS upstream request failed.");
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403) return errorResult("upstream_forbidden", "RISS upstream rejected the proxy key.");
  if (response.status === 429) return errorResult("upstream_quota_exceeded", "RISS upstream quota was exceeded.");
  if (!response.ok) return errorResult("upstream_error", `RISS upstream returned HTTP ${response.status}.`);
  if (!text.trim()) return errorResult("upstream_invalid_response", "RISS upstream returned an empty response.");
  try {
    return parseRissXml(text);
  } catch (error) {
    return errorResult(error.code || "upstream_invalid_response", `RISS upstream error response: ${error.message}`);
  }
}

async function fetchKerisAcademicSearch({ params, apiKey, fetchImpl = global.fetch }) {
  if (!apiKey) {
    return {
      status_code: 503,
      error: "upstream_not_configured",
      message: "KSKILL_RISS_API_KEY is not configured on the proxy server. RISS_API_KEY is accepted as a compatibility fallback."
    };
  }
  const results = await Promise.all(params.upstreamTypes.map((upstreamType) => fetchOneRissType({
    params, upstreamType, apiKey, fetchImpl
  })));
  const failed = results.find((result) => result.error);
  if (failed) return failed;
  const query = Object.fromEntries(Object.entries(params).filter(([key]) => !new Set(["upstreamTypes", "rsnum"]).has(key)));
  const queues = results.map((result) => [...result.items]);
  const items = [];
  while (items.length < params.pageSize && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (queue.length > 0) items.push(queue.shift());
      if (items.length >= params.pageSize) break;
    }
  }
  return {
    query,
    page: params.page,
    page_size: params.pageSize,
    total_count: results.reduce((sum, result) => sum + result.totalCount, 0),
    items,
    source: {
      provider: "KERIS RISS Open API",
      upstream: RISS_OPEN_API_URL,
      upstream_types: params.upstreamTypes,
      response_format: "XML",
      data_go_kr_dataset: null,
      related_catalog_dataset: "15071949"
    }
  };
}

module.exports = {
  RESOURCE_TYPE_MAP,
  RISS_OPEN_API_URL,
  fetchKerisAcademicSearch,
  normalizeKerisAcademicQuery,
  parseRissXml
};
