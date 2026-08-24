const KOROAD_BASE_URL = "https://opendata.koroad.or.kr/data/rest";
const HOTSPOT_CATEGORIES = Object.freeze({
  child: "frequentzone/child",
  bicycle: "frequentzone/bicycle",
  oldman: "frequentzone/oldman",
  pedstrians: "frequentzone/pedstrians",
  "school-child": "frequentzone/schoolchild",
  motorcycle: "frequentzone/motorcycle",
  "risk-area": "accident/riskArea"
});

function text(value) { const v = String(value ?? "").trim(); return v || undefined; }
function integer(value, fallback, max, name) {
  const v = text(value);
  if (v === undefined) return String(fallback);
  if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) throw new Error(`${name} must be between 1 and ${max}.`);
  return v;
}
function normalizeKoroadQuery(kind, query = {}) {
  if (kind !== "stats" && !HOTSPOT_CATEGORIES[kind]) throw new Error(`Unsupported category: ${kind}.`);
  const year = text(query.searchYearCd ?? query.year);
  if (!year || !/^\d{4}$/.test(year)) throw new Error("year must be YYYY.");
  const sido = text(query.sido ?? query.siDo);
  const gugun = text(query.gugun ?? query.guGun);
  if (!sido || !/^\d{1,2}$/.test(sido) || !gugun || !/^\d{1,3}$/.test(gugun)) {
    throw new Error("sido and gugun are required numeric region codes.");
  }
  return {
    kind, year, sido, gugun,
    pageNo: integer(query.pageNo ?? query.page, 1, 1000, "pageNo"),
    numOfRows: integer(query.numOfRows ?? query.limit, 10, 100, "numOfRows"),
    type: "json"
  };
}
function rows(payload) {
  const items = payload?.items?.item ?? payload?.items ?? [];
  return Array.isArray(items) ? items : items ? [items] : [];
}
function normalizeKoroadResult(payload, query) {
  const code = String(payload?.resultCode ?? "").trim();
  if (code && !["00", "03"].includes(code)) return { error: "upstream_error", message: `KOROAD returned ${code}: ${payload.resultMsg || "error"}.` };
  const items = rows(payload).map((item) => ({
    source: "KOROAD TAAS",
    category: query.kind,
    year: query.year,
    sido_sgg_nm: item.sido_sgg_nm,
    spot_name: item.spot_nm,
    occurrence_count: item.occrrnc_cnt,
    casualty_count: item.caslt_cnt,
    death_count: item.dth_dnv_cnt,
    serious_injury_count: item.se_dnv_cnt,
    minor_injury_count: item.sl_dnv_cnt,
    reported_injury_count: item.wnd_dnv_cnt,
    longitude: item.lo_crd,
    latitude: item.la_crd,
    geometry: item.geom_json,
    raw: item
  }));
  return { query, total_count: Number(payload.totalCount ?? items.length), page: Number(payload.pageNo ?? 1), page_size: Number(payload.numOfRows ?? items.length), items, source: { upstream: `${KOROAD_BASE_URL}/${query.kind === "stats" ? "stt" : HOTSPOT_CATEGORIES[query.kind]}` } };
}
async function fetchKoroad({ apiKey, fetchImpl = global.fetch, ...query }) {
  if (!apiKey) return { error: "upstream_not_configured", message: "KOROAD_API_KEY is not configured on the proxy server." };
  const url = new URL(`${KOROAD_BASE_URL}/${query.kind === "stats" ? "stt" : HOTSPOT_CATEGORIES[query.kind]}`);
  url.searchParams.set("authKey", apiKey);
  url.searchParams.set("searchYearCd", query.year);
  url.searchParams.set("sido", query.sido);
  url.searchParams.set("gugun", query.gugun);
  url.searchParams.set("siDo", query.sido);
  url.searchParams.set("guGun", query.gugun);
  for (const key of ["pageNo", "numOfRows", "type"]) url.searchParams.set(key, query[key]);
  let response;
  try { response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) }); }
  catch (error) { return { error: "upstream_timeout", message: `KOROAD request failed: ${error.message}` }; }
  if (!response.ok) return { error: "upstream_error", message: `KOROAD returned HTTP ${response.status}.` };
  let payload;
  try { payload = await response.json(); } catch { return { error: "upstream_invalid_response", message: "KOROAD returned invalid JSON." }; }
  return normalizeKoroadResult(payload, query);
}
module.exports = { KOROAD_BASE_URL, HOTSPOT_CATEGORIES, normalizeKoroadQuery, fetchKoroad };
