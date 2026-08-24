const CAREERNET_BASE_URL = "https://www.career.go.kr/cnet/openapi";
function text(value) { const v = String(value ?? "").trim(); return v || undefined; }
function positive(value, fallback, max, label) {
  const v = text(value);
  if (v === undefined) return String(fallback);
  if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) throw new Error(`${label} must be between 1 and ${max}.`);
  return v;
}
function normalizeCareernetQuery(operation, query = {}) {
  if (!["search", "detail"].includes(operation)) throw new Error(`Unsupported operation: ${operation}.`);
  if (operation === "detail") {
    const seq = text(query.seq ?? query.jobCode);
    if (!seq || !/^\d+$/.test(seq)) throw new Error("seq must be a numeric job code.");
    return { operation, seq };
  }
  return {
    operation,
    searchJobNm: text(query.searchJobNm ?? query.query ?? query.keyword),
    gubun: text(query.gubun) || "job_dic_list",
    thisPage: positive(query.thisPage ?? query.page, 1, 1000, "page"),
    perPage: positive(query.perPage ?? query.limit, 10, 100, "limit")
  };
}
async function fetchCareernet({ apiKey, fetchImpl = global.fetch, ...query }) {
  if (!apiKey) return { error: "upstream_not_configured", message: "CAREERNET_API_KEY is not configured on the proxy server." };
  const url = new URL(query.operation === "detail" ? `${CAREERNET_BASE_URL}/job.json` : `${CAREERNET_BASE_URL}/getOpenApi.json`);
  url.searchParams.set("apiKey", apiKey);
  if (query.operation === "detail") url.searchParams.set("seq", query.seq);
  else {
    url.searchParams.set("svcType", "api");
    url.searchParams.set("svcCode", "JOB");
    url.searchParams.set("contentType", "json");
    for (const key of ["searchJobNm", "gubun", "thisPage", "perPage"]) if (query[key]) url.searchParams.set(key, query[key]);
  }
  let response;
  try { response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) }); }
  catch (error) { return { error: "upstream_timeout", message: `CareerNet request failed: ${error.message}` }; }
  if (!response.ok) return { error: "upstream_error", message: `CareerNet returned HTTP ${response.status}.` };
  let payload;
  try { payload = await response.json(); } catch { return { error: "upstream_invalid_response", message: "CareerNet returned invalid JSON." }; }
  const serialized = JSON.stringify(payload);
  if (/인증키 실패|apiKey|인증키/i.test(serialized) && !payload?.dataSearch) return { error: "upstream_forbidden", message: "CareerNet rejected the configured API key or request." };
  return { query, data: payload, source: { upstream: url.origin + url.pathname } };
}
module.exports = { CAREERNET_BASE_URL, normalizeCareernetQuery, fetchCareernet };
