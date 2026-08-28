const HRD_BASE_URL = "https://apis.data.go.kr";
const OPERATIONS = Object.freeze({
  "exam-schedule": {
    path: "/B490007/qualExamSchd/getQualExamSchdList",
    params: ["implYy", "qualgbCd", "jmCd"]
  },
  "qualification-items": {
    path: "/B490007/qualExamSchd/getQualExamSchdList",
    params: ["implYy", "qualgbCd", "jmCd"]
  }
});
function text(value) { const v = String(value ?? "").trim(); return v || undefined; }
function positive(value, fallback, max, label) {
  const v = text(value);
  if (v === undefined) return String(fallback);
  if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) throw new Error(`${label} must be between 1 and ${max}.`);
  return v;
}
function normalizeHrdQuery(operation, query = {}) {
  const config = OPERATIONS[operation];
  if (!config) throw new Error(`Unsupported operation: ${operation}.`);
  const year = text(query.implYy ?? query.year);
  if (!year || !/^\d{4}$/.test(year)) throw new Error("year must be YYYY.");
  const normalized = {
    operation, implYy: year, pageNo: positive(query.pageNo ?? query.page, 1, 1000, "pageNo"),
    numOfRows: positive(query.numOfRows ?? query.limit, 10, 100)
  };
  for (const key of ["qualgbCd", "jmCd"]) {
    const value = text(query[key]);
    if (value) normalized[key] = value;
  }
  return normalized;
}
async function fetchHrdKorea({ serviceKey, fetchImpl = global.fetch, ...query }) {
  if (!serviceKey) return { error: "upstream_not_configured", message: "DATA_GO_KR_API_KEY is not configured on the proxy server." };
  const url = new URL(`${HRD_BASE_URL}${OPERATIONS[query.operation].path}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("dataFormat", "json");
  for (const [key, value] of Object.entries(query)) if (key !== "operation" && value) url.searchParams.set(key, value);
  let response;
  try { response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) }); }
  catch (error) { return { error: "upstream_timeout", message: `HRDKorea request failed: ${error.message}` }; }
  if (!response.ok) return { error: "upstream_error", message: `HRDKorea returned HTTP ${response.status}.` };
  let payload;
  try { payload = await response.json(); } catch { return { error: "upstream_invalid_response", message: "HRDKorea returned invalid JSON." }; }
  const header = payload?.response?.header || payload?.header || {};
  const body = payload?.response?.body || payload?.body || {};
  const code = String(header.resultCode ?? payload?.resultCode ?? "").trim();
  if (code && !["00", "03"].includes(code)) return { error: "upstream_error", message: `HRDKorea returned ${code}: ${header.resultMsg || payload.resultMsg || "error"}.` };
  let items = body.items?.item ?? body.items ?? payload.items ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  return { query, total_count: Number(body.totalCount ?? payload.totalCount ?? items.length), page: Number(body.pageNo ?? query.pageNo), page_size: Number(body.numOfRows ?? query.numOfRows), items, source: { upstream: url.origin + url.pathname } };
}
module.exports = { HRD_BASE_URL, OPERATIONS, normalizeHrdQuery, fetchHrdKorea };
