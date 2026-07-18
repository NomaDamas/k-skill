const BUILDING_REGISTER_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
const AUTH_RESULT_CODES = new Set(["20", "21", "22", "30", "31", "32", "33"]);
const PNU_LAND_CATEGORY_TO_PLAT_GB_CD = { 1: "0", 2: "1" };
const PLAT_GB_CD_TO_PNU_LAND_CATEGORY = { 0: "1", 1: "2" };

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseInteger(value, { defaultValue, max, label }) {
  const text = trimOrNull(value);
  if (text === null) return defaultValue;
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be an integer.`);
  const parsed = Number.parseInt(text, 10);
  if (parsed < 1 || parsed > max) throw new Error(`${label} must be between 1 and ${max}.`);
  return parsed;
}

function rejectUnsupportedQuery(query) {
  const supported = new Set([
    "pnu", "sigunguCd", "bjdongCd", "platGbCd", "bun", "ji", "pageNo", "numOfRows"
  ]);
  for (const key of Object.keys(query)) {
    if (key.toLowerCase() === "servicekey") throw new Error(`${key} is controlled by the proxy server.`);
    if (!supported.has(key)) throw new Error(`${key} is not supported for building register title lookup.`);
  }
}

function exactDigits(value, length, label) {
  const text = trimOrNull(value);
  if (text === null || !new RegExp(`^\\d{${length}}$`).test(text)) {
    throw new Error(`${label} must be exactly ${length} digits.`);
  }
  return text;
}

function parcelDigits(value, label, { required = false } = {}) {
  const text = trimOrNull(value);
  if (text === null) {
    if (required) throw new Error(`${label} is required.`);
    return "0000";
  }
  if (!/^\d{1,4}$/.test(text)) throw new Error(`${label} must be 1 to 4 digits.`);
  return text.padStart(4, "0");
}

function normalizeBuildingRegisterQuery(query = {}) {
  rejectUnsupportedQuery(query);
  const rawPnu = trimOrNull(query.pnu);
  const explicitKeys = ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"];
  const hasExplicit = explicitKeys.some((key) => trimOrNull(query[key]) !== null);
  if (rawPnu && hasExplicit) throw new Error("Provide either pnu or explicit parcel fields; do not combine them.");

  let sigunguCd;
  let bjdongCd;
  let platGbCd;
  let bun;
  let ji;
  let pnu;
  if (rawPnu) {
    pnu = exactDigits(rawPnu, 19, "pnu");
    sigunguCd = pnu.slice(0, 5);
    bjdongCd = pnu.slice(5, 10);
    const landCategory = pnu.slice(10, 11);
    platGbCd = PNU_LAND_CATEGORY_TO_PLAT_GB_CD[landCategory];
    bun = pnu.slice(11, 15);
    ji = pnu.slice(15, 19);
    if (platGbCd === undefined) throw new Error("pnu land category must be 1 or 2.");
  } else {
    if (!hasExplicit) throw new Error("Provide pnu or sigunguCd, bjdongCd, platGbCd, and bun.");
    sigunguCd = exactDigits(query.sigunguCd, 5, "sigunguCd");
    bjdongCd = exactDigits(query.bjdongCd, 5, "bjdongCd");
    platGbCd = trimOrNull(query.platGbCd);
    if (!new Set(["0", "1", "2"]).has(platGbCd)) throw new Error("platGbCd must be 0, 1, or 2.");
    bun = parcelDigits(query.bun, "bun", { required: true });
    ji = parcelDigits(query.ji, "ji");
    const landCategory = PLAT_GB_CD_TO_PNU_LAND_CATEGORY[platGbCd];
    pnu = landCategory === undefined ? null : `${sigunguCd}${bjdongCd}${landCategory}${bun}${ji}`;
  }

  return {
    pnu,
    sigunguCd,
    bjdongCd,
    platGbCd,
    bun,
    ji,
    pageNo: parseInteger(query.pageNo, { defaultValue: 1, max: 100000, label: "pageNo" }),
    numOfRows: parseInteger(query.numOfRows, { defaultValue: 10, max: 100, label: "numOfRows" })
  };
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const codePoint = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return null;
  const text = match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").replace(/<[^>]+>/g, "").trim();
  return decodeXmlEntities(text);
}

function itemFields(xml) {
  const item = {};
  const pattern = /<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  for (const match of xml.matchAll(pattern)) {
    if (/<[A-Za-z_]/.test(match[2])) continue;
    const value = match[2].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
    item[match[1]] = decodeXmlEntities(value);
  }
  return item;
}

function parseBuildingRegisterXml(xml) {
  const text = trimOrNull(xml);
  if (!text || !/^\s*(?:<\?xml[\s\S]*?\?>\s*)?</i.test(text)) {
    throw new Error("Building register upstream did not return XML.");
  }
  if (!/<response(?:\s[^>]*)?>[\s\S]*<\/response>\s*$/i.test(text)) {
    throw new Error("Building register upstream returned malformed XML.");
  }
  const resultCode = tagValue(text, "resultCode");
  const resultMsg = tagValue(text, "resultMsg") || "";
  if (resultCode && !new Set(["0", "00"]).has(resultCode)) {
    const error = new Error(resultMsg || `resultCode=${resultCode}`);
    error.resultCode = resultCode;
    error.semanticError = true;
    throw error;
  }
  const body = text.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)?.[1];
  if (body === undefined) throw new Error("Building register upstream returned an invalid response body.");
  const itemsContainer = body.match(/<items(?:\s[^>]*)?>([\s\S]*?)<\/items>/i)?.[1] ?? "";
  const items = [...itemsContainer.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((match) => itemFields(match[1]));
  const totalCount = Number.parseInt(tagValue(body, "totalCount") ?? String(items.length), 10);
  const pageNo = Number.parseInt(tagValue(body, "pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(tagValue(body, "numOfRows") ?? String(items.length), 10);
  if (![totalCount, pageNo, numOfRows].every(Number.isFinite)) {
    throw new Error("Building register upstream returned invalid pagination metadata.");
  }
  return { items, totalCount, pageNo, numOfRows };
}

function isGatewayAuthError(text) {
  return /OPENAPI_SERVICERESPONSE/i.test(text)
    && /(SERVICE[ _]?KEY|AUTH|인증키)/i.test(text);
}

function errorResult(error, message) {
  return { status_code: 502, error, message };
}

async function fetchBuildingRegisterTitle({ params, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      status_code: 503,
      error: "upstream_not_configured",
      message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
    };
  }
  const url = new URL(BUILDING_REGISTER_URL);
  url.searchParams.set("serviceKey", serviceKey);
  for (const key of ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji", "pageNo", "numOfRows"]) {
    url.searchParams.set(key, String(params[key]));
  }

  let response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch {
    return errorResult("upstream_unavailable", "Building register upstream request failed.");
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403 || isGatewayAuthError(text)) {
    return errorResult(
      "upstream_forbidden",
      "Building register upstream rejected the proxy key. Confirm separate utilization approval for data.go.kr dataset 15134735."
    );
  }
  if (!response.ok) return errorResult("upstream_error", `Building register upstream returned HTTP ${response.status}.`);
  if (!text.trim()) return errorResult("upstream_invalid_response", "Building register upstream returned an empty response.");
  if (/OPENAPI_SERVICERESPONSE/i.test(text)) {
    return errorResult(
      "upstream_error",
      `Building register upstream gateway error: ${tagValue(text, "errMsg") || tagValue(text, "returnReasonCode") || "unknown error"}`
    );
  }

  let parsed;
  try {
    parsed = parseBuildingRegisterXml(text);
  } catch (error) {
    if (AUTH_RESULT_CODES.has(error.resultCode) || /(SERVICE[ _]?KEY|AUTH|인증키)/i.test(error.message)) {
      return errorResult(
        "upstream_forbidden",
        "Building register upstream rejected the proxy key. Confirm separate utilization approval for data.go.kr dataset 15134735."
      );
    }
    if (error.semanticError) {
      return errorResult("upstream_error", `Building register upstream error response: ${error.message}`);
    }
    return errorResult("upstream_invalid_response", `Building register upstream error response: ${error.message}`);
  }
  return {
    query: { ...params },
    page: parsed.pageNo,
    page_size: parsed.numOfRows,
    total_count: parsed.totalCount,
    items: parsed.items,
    source: {
      data_go_kr_dataset: "15134735",
      operation: "getBrTitleInfo",
      upstream: BUILDING_REGISTER_URL,
      response_format: "XML"
    }
  };
}

module.exports = {
  BUILDING_REGISTER_URL,
  decodeXmlEntities,
  fetchBuildingRegisterTitle,
  normalizeBuildingRegisterQuery,
  parseBuildingRegisterXml
};
