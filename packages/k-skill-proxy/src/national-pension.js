// National Pension Service (NPS) workplace-coverage API wrapper.
// Proxies data.go.kr 3046071 (NpsBplcInfoInqireServiceV2) XML endpoints and
// keeps the operator's DATA_GO_KR_API_KEY server-side.
//
// The upstream returns business registration numbers masked to the first 6
// digits, so identity is established by (workplace name + 6-digit prefix) only.
// When more than one candidate matches we return the candidate list as-is and
// do not assert which one is the queried business.

const NPS_BASE_URL = "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2";

// data.go.kr gateway-level auth/quota reason codes (OpenAPI_ServiceResponse).
const AUTH_REASON_CODES = new Set(["20", "21", "30", "31", "32", "33"]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function digitsOnly(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

// Accepts wkplNm (workplace/business name) and an optional business
// registration number whose first 6 digits are used as a prefix filter.
function normalizeNationalPensionQuery(query = {}) {
  const wkplNm = trimOrNull(query.wkplNm ?? query.name ?? query.b_nm);
  if (!wkplNm) {
    throw new Error(
      "Provide wkplNm (workplace/business name). The NPS API only discloses the first 6 digits of the business number, so a name is required."
    );
  }
  const rawBno = trimOrNull(query.b_no ?? query.bno ?? query.bzowrRgstNo);
  const bnoDigits = rawBno ? digitsOnly(rawBno) : "";
  if (rawBno && !/^\d{10}$/.test(bnoDigits)) {
    throw new Error("Provide b_no as a 10-digit business registration number.");
  }
  const bnoPrefix = bnoDigits ? bnoDigits.slice(0, 6) : "";
  return { wkplNm, bnoPrefix };
}

// Regex-based parser for the flat <item> structure data.go.kr returns.
// Not a general-purpose XML parser — sufficient for NPS responses.
function parseNationalPensionXml(xmlText) {
  const text = String(xmlText ?? "");

  if (text.includes("<OpenAPI_ServiceResponse")) {
    const reasonCode = (text.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/) || [])[1]?.trim() || "";
    const authMsg = (text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || [])[1]?.trim() || "";
    const kind = AUTH_REASON_CODES.has(reasonCode) ? "auth-error" : "error";
    return { kind, reason: `${authMsg || "SERVICE ERROR"} (code ${reasonCode})`.trim() };
  }

  const resultCode = (text.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1]?.trim() || "";
  const resultMsg = (text.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1]?.trim() || "";
  if (resultCode && !["00", "0"].includes(resultCode)) {
    return { kind: "error", reason: `resultCode=${resultCode} ${resultMsg}`.trim() };
  }

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(text)) !== null) {
    const obj = {};
    const fieldRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(itemMatch[1])) !== null) {
      obj[fieldMatch[1]] = fieldMatch[2].trim();
    }
    items.push(obj);
  }

  const totalCount = (text.match(/<totalCount>([^<]*)<\/totalCount>/) || [])[1]?.trim() || "";
  return { kind: "items", items, totalCount };
}

async function callOperation(operation, params, serviceKey, fetchImpl) {
  const url = new URL(`${NPS_BASE_URL}/${operation}`);
  url.searchParams.set("serviceKey", serviceKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const doFetch = fetchImpl || global.fetch;
  let response;
  try {
    response = await doFetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    return { kind: "error", reason: `Upstream request failed: ${err.message}` };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "auth-error", reason: `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 80).trim();
    return { kind: "error", reason: `upstream HTTP ${response.status} ${body}`.trim() };
  }
  return parseNationalPensionXml(await response.text());
}

// Orchestrates the three NPS operations: basic search → dedup → (when a single
// candidate is identified) detail + monthly-status. Mirrors the reference Python
// provider so the proxy returns a clean, structured result with the key never
// leaving the server.
async function fetchNationalPensionWorkplace({ wkplNm, bnoPrefix = "", serviceKey, fetchImpl = global.fetch }) {
  const basic = await callOperation(
    "getBassInfoSearchV2",
    { wkplNm, bzowrRgstNo: bnoPrefix, pageNo: 1, numOfRows: 100 },
    serviceKey,
    fetchImpl
  );

  if (basic.kind === "auth-error") {
    return { error: "upstream_forbidden", message: `NPS upstream rejected the request (${basic.reason}). The proxy key may not be approved for service 3046071.` };
  }
  if (basic.kind === "error") {
    return { error: "upstream_error", message: basic.reason };
  }

  // Defensive re-filter by the 6-digit prefix (trust upstream but verify).
  let candidates = basic.items;
  if (bnoPrefix) {
    candidates = candidates.filter((it) => digitsOnly(it.bzowrRgstNo).startsWith(bnoPrefix) || !it.bzowrRgstNo);
  }

  // The same workplace repeats per dataCrtYm; keep the latest month per
  // (wkplNm + road address).
  const grouped = new Map();
  for (const it of candidates) {
    const key = `${(it.wkplNm || "").trim()}\u001f${(it.wkplRoadNmDtlAddr || "").trim()}`;
    const prev = grouped.get(key);
    if (!prev || (it.dataCrtYm || "") > (prev.dataCrtYm || "")) {
      grouped.set(key, it);
    }
  }
  const deduped = [...grouped.values()].sort((a, b) => (b.dataCrtYm || "").localeCompare(a.dataCrtYm || ""));

  const exact = deduped.filter((it) => (it.wkplNm || "").trim() === wkplNm.trim());
  const chosen = deduped.length === 1 ? deduped[0] : (exact.length === 1 ? exact[0] : null);

  let detail = null;
  let monthly = null;
  if (chosen && chosen.seq) {
    const detailResult = await callOperation(
      "getDetailInfoSearchV2",
      { seq: chosen.seq, dataCrtYm: chosen.dataCrtYm || "" },
      serviceKey,
      fetchImpl
    );
    if (detailResult.kind === "items") {
      detail = detailResult.items.length ? detailResult.items : null;
    } else if (detailResult.kind === "auth-error") {
      return { error: "upstream_forbidden", message: `NPS detail lookup rejected the request (${detailResult.reason}). The proxy key may not be approved for service 3046071.` };
    } else {
      return { error: "upstream_error", message: `NPS detail lookup failed (${detailResult.reason}).` };
    }

    const periodResult = await callOperation(
      "getPdAcctoSttusInfoSearchV2",
      { seq: chosen.seq },
      serviceKey,
      fetchImpl
    );
    if (periodResult.kind === "items") {
      monthly = periodResult.items.length
        ? [...periodResult.items].sort((a, b) => (a.dataCrtYm || "").localeCompare(b.dataCrtYm || ""))
        : null;
    } else if (periodResult.kind === "auth-error") {
      return { error: "upstream_forbidden", message: `NPS monthly status lookup rejected the request (${periodResult.reason}). The proxy key may not be approved for service 3046071.` };
    } else {
      return { error: "upstream_error", message: `NPS monthly status lookup failed (${periodResult.reason}).` };
    }
  }

  return {
    query: { wkplNm, bzowrRgstNo_prefix: bnoPrefix || null },
    candidate_count: deduped.length,
    candidates: deduped,
    raw_row_count: candidates.length,
    selected_candidate: chosen,
    detail,
    monthly_status: monthly,
    disclosure_note:
      "The business number is disclosed only to its first 6 digits (the rest is masked), so an exact-number match is impossible. Candidates matching name + 6-digit prefix are listed; when several match, identification is left to the caller."
  };
}

module.exports = {
  NPS_BASE_URL,
  normalizeNationalPensionQuery,
  parseNationalPensionXml,
  fetchNationalPensionWorkplace,
};
