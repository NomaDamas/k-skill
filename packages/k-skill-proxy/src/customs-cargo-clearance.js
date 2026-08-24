const UNI_PASS_URL = "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";

function text(value) { const v = String(value ?? "").trim(); return v || undefined; }
function normalizeCustomsQuery(query = {}) {
  const cargo = text(query.cargMtNo ?? query.cargo_management_number);
  const hbl = text(query.hblNo ?? query.hbl_no);
  const mbl = text(query.mblNo ?? query.mbl_no);
  const year = text(query.blYy ?? query.blYear ?? query.bl_year);
  if (!cargo && !((hbl || mbl) && year)) throw new Error("Provide cargMtNo or B/L number with blYear.");
  if ((hbl || mbl) && !year) throw new Error("blYear is required with B/L numbers.");
  if (year && !/^\d{4}$/.test(year)) throw new Error("blYear must be YYYY.");
  return { cargMtNo: cargo, hblNo: hbl, mblNo: mbl, blYy: year };
}
function xmlValue(xml, tag) { return text((String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")) || [])[1]); }
function parseCustomsXml(xml, query) {
  const resultCode = xmlValue(xml, "tCnt") ? "00" : xmlValue(xml, "resultCode");
  const events = [...String(xml).matchAll(/<cargCsclPrgsInfoDtlQryVo>([\s\S]*?)<\/cargCsclPrgsInfoDtlQryVo>/gi)].map((match) => {
    const body = match[1];
    return {
      timestamp: xmlValue(body, "prcsDttm"),
      status: xmlValue(body, "prgsStts"),
      location: xmlValue(body, "shedNm"),
      customs_office: xmlValue(body, "csclPrgsStts"),
      raw: body
    };
  });
  return {
    query,
    current_status: xmlValue(xml, "prgsStts"),
    clearance_progress_status: xmlValue(xml, "csclPrgsStts"),
    cargo_management_number: xmlValue(xml, "cargMtNo"),
    arrival_date: xmlValue(xml, "shipCallSgn"),
    customs_office: xmlValue(xml, "shedNm"),
    events,
    total_count: events.length,
    source: { upstream: UNI_PASS_URL },
    warnings: resultCode === "00" ? [] : [xmlValue(xml, "resultMsg") || "No clearance result."]
  };
}
async function fetchCustomsCargo({ serviceKey, fetchImpl = global.fetch, ...query }) {
  if (!serviceKey) return { error: "upstream_not_configured", message: "DATA_GO_KR_API_KEY is not configured on the proxy server." };
  const url = new URL(UNI_PASS_URL);
  url.searchParams.set("crkyCn", serviceKey);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  let response;
  try { response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) }); }
  catch (error) { return { error: "upstream_timeout", message: `UNI-PASS request failed: ${error.message}` }; }
  if (!response.ok) return { error: "upstream_error", message: `UNI-PASS returned HTTP ${response.status}.` };
  const xml = await response.text();
  if (/ERROR|AUTH|인증키|SERVICE_KEY/i.test(xml) && !/<cargCsclPrgsInfoDtlQryVo>/i.test(xml)) {
    return { error: "upstream_forbidden", message: "UNI-PASS rejected the configured service key or request." };
  }
  return parseCustomsXml(xml, query);
}
module.exports = { UNI_PASS_URL, normalizeCustomsQuery, fetchCustomsCargo, parseCustomsXml };
