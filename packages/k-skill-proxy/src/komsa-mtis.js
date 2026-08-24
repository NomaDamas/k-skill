const KOMSA_MTIS_BASE_URL = "https://mtisopenapi.komsa.or.kr/eopt/api";

const DATASETS = Object.freeze({
  schedules: "oprt-schd-info",
  vessels: "psnshp-spec",
  ports: "port-info",
  "license-routes": "lcns-seawy-info",
  "operation-routes": "oprt-line-info",
  status: "oprt-stts-info"
});

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function positive(value, fallback, max, label) {
  const raw = text(value);
  if (raw === undefined) return String(fallback);
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
    throw new Error(`${label} must be between 1 and ${max}.`);
  }
  return raw;
}

function date(value, label) {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const compact = raw.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) throw new Error(`${label} must be YYYYMMDD.`);
  const parsed = new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10).replaceAll("-", "") !== compact) {
    throw new Error(`${label} must be a valid date.`);
  }
  return compact;
}

function normalizeKomsaFerryQuery(dataset, query = {}) {
  const endpoint = DATASETS[dataset];
  if (!endpoint) throw new Error(`Unsupported dataset: ${dataset}.`);
  const normalized = {
    dataset,
    endpoint,
    pageNo: positive(query.pageNo ?? query.page, 1, 1000, "pageNo"),
    numOfRows: positive(query.numOfRows ?? query.limit, 10, 100, "numOfRows")
  };
  const aliases = {
    rlvt_ymd: ["rlvt_ymd", "date"],
    psnshp_nm: ["psnshp_nm", "vessel", "vesselName"],
    psnshp_cd: ["psnshp_cd", "vesselCode"],
    lcns_seawy_nm: ["lcns_seawy_nm", "route", "routeName"],
    lcns_seawy_cd: ["lcns_seawy_cd", "routeCode"],
    oport_nm: ["oport_nm", "port", "portName"],
    oport_cd: ["oport_cd", "portCode"]
  };
  for (const [target, keys] of Object.entries(aliases)) {
    const value = keys.map((key) => text(query[key])).find(Boolean);
    if (value) normalized[target] = target === "rlvt_ymd" ? date(value, "date") : value;
  }
  return normalized;
}

function extractItems(payload) {
  const header = payload?.response?.header || {};
  const code = String(header.resultCode ?? "").trim();
  if (code && !["00", "0", "03"].includes(code)) {
    return { error: "upstream_error", message: `KOMSA MTIS returned ${code}: ${header.resultMsg || "unknown error"}.` };
  }
  const body = payload?.response?.body || {};
  let items = body.items?.item ?? body.items ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  return {
    query: payload.query,
    page: Number(body.pageNo ?? 1),
    page_size: Number(body.numOfRows ?? items.length),
    total_count: Number(body.totalCount ?? items.length),
    items,
    source: { upstream: `${KOMSA_MTIS_BASE_URL}/${payload.endpoint}` }
  };
}

async function fetchKomsaFerryInfo({ serviceKey, fetchImpl = global.fetch, ...normalized }) {
  if (!serviceKey) {
    return { error: "upstream_not_configured", message: "KOMSA_MTIS_API_KEY is not configured on the proxy server." };
  }
  const url = new URL(`${KOMSA_MTIS_BASE_URL}/${normalized.endpoint}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("type", "json");
  for (const [key, value] of Object.entries(normalized)) {
    if (!["dataset", "endpoint"].includes(key) && value !== undefined) url.searchParams.set(key, value);
  }
  let response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch (error) {
    return { error: "upstream_timeout", message: `KOMSA MTIS request failed: ${error.message}` };
  }
  if (!response.ok) return { error: "upstream_error", message: `KOMSA MTIS returned HTTP ${response.status}.` };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { error: "upstream_invalid_response", message: "KOMSA MTIS returned invalid JSON." };
  }
  return extractItems({ ...payload, query: normalized, endpoint: normalized.endpoint });
}

module.exports = {
  DATASETS,
  KOMSA_MTIS_BASE_URL,
  normalizeKomsaFerryQuery,
  fetchKomsaFerryInfo
};
