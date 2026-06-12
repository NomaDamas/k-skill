// Public Procurement Service (조달청 나라장터) sanctioned-supplier API wrapper.
// Proxies data.go.kr 15129466 (UsrInfoService02/getUnptRsttCorpInfo02) and keeps
// the operator's DATA_GO_KR_API_KEY server-side.
//
// inqryDiv=1 queries by exact 10-digit business number. The upstream returns
// only sanctions that are CURRENTLY in force at query time — expired/lifted
// sanctions and sanctions against non-registered suppliers/individuals are not
// provided. This is not a historical lookup.

const G2B_SANCTION_URL =
  "https://apis.data.go.kr/1230000/ao/UsrInfoService02/getUnptRsttCorpInfo02";

function digitsOnly(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}
const AUTH_REASON_CODES = new Set(["20", "21", "30", "31", "32", "33"]);

function parseGatewayAuthError(text) {
  if (!text.includes("OpenAPI_ServiceResponse")) {
    return null;
  }
  const reasonCode = (text.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/) || [])[1]?.trim() || "";
  const authMsg = (text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || [])[1]?.trim() || "SERVICE ERROR";
  return AUTH_REASON_CODES.has(reasonCode) ? `${authMsg} (code ${reasonCode})` : null;
}

function isAuthResultCode(code) {
  return AUTH_REASON_CODES.has(String(code ?? "").trim());
}


function normalizeG2bSanctionQuery(query = {}) {
  const bizno = digitsOnly(query.bizno ?? query.b_no ?? query.bno);
  if (!/^\d{10}$/.test(bizno)) {
    throw new Error("Provide bizno as a 10-digit business registration number.");
  }
  return { bizno };
}

// Extracts the item list from the JSON envelope, tolerating the dict/empty
// variants data.go.kr returns for one or zero results.
function extractSanctionItems(payload) {
  const response = payload?.response ?? {};
  const header = response.header ?? {};
  const resultCode = String(header.resultCode ?? "");
  if (resultCode && !["00", "0"].includes(resultCode)) {
    throw new Error(`resultCode=${resultCode} ${header.resultMsg ?? "no message"}`.trim());
  }
  const body = response.body ?? {};
  let items = body.items;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    items = items.item ?? [];
  }
  if (!items) {
    items = [];
  }
  if (!Array.isArray(items)) {
    items = [items];
  }
  const totalCount = body.totalCount ?? items.length;
  return { items, totalCount };
}

async function fetchG2bSanctions({ bizno, serviceKey, fetchImpl = global.fetch }) {
  const url = new URL(G2B_SANCTION_URL);
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("bizno", bizno);

  const doFetch = fetchImpl || global.fetch;
  let response;
  try {
    response = await doFetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    return { error: "upstream_timeout", message: `Upstream request failed: ${err.message}` };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      error: "upstream_forbidden",
      message: `Procurement upstream returned ${response.status}. The proxy key may not be approved for service 15129466.`,
    };
  }
  if (!response.ok) {
    return { error: "upstream_error", message: `Upstream returned ${response.status}` };
  }

  const text = await response.text();
  const gatewayAuthError = parseGatewayAuthError(text);
  if (gatewayAuthError) {
    return {
      error: "upstream_forbidden",
      message: `Procurement upstream rejected the request (${gatewayAuthError}). The proxy key may not be approved for service 15129466.`,
    };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { error: "upstream_invalid_response", message: "Procurement upstream did not return valid JSON." };
  }
  if (isAuthResultCode(payload?.response?.header?.resultCode)) {
    return {
      error: "upstream_forbidden",
      message: `Procurement upstream rejected the request (${payload.response.header.resultMsg || "auth error"}). The proxy key may not be approved for service 15129466.`,
    };
  }

  let extracted;
  try {
    extracted = extractSanctionItems(payload);
  } catch (err) {
    return { error: "upstream_error", message: `Procurement upstream error response: ${err.message}` };
  }

  return {
    bizno,
    total_count: extracted.totalCount,
    active_sanctions: extracted.items,
    match_basis:
      "Exact business-number match (inqryDiv=1) — the list of sanctions in force at query time (first 100). Expired/lifted sanctions and non-registered suppliers are not provided by the upstream.",
  };
}

module.exports = {
  G2B_SANCTION_URL,
  normalizeG2bSanctionQuery,
  extractSanctionItems,
  fetchG2bSanctions,
};
