// MOLIT (Ministry of Land, Infrastructure and Transport) real estate API wrapper.
// Proxies data.go.kr XML endpoints for Korean real estate transaction data.

const MOLIT_BASE_URL = "http://apis.data.go.kr/1613000";

const ENDPOINT_MAP = new Map([
  ["apartment/trade", "RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"],
  ["apartment/rent", "RTMSDataSvcAptRent/getRTMSDataSvcAptRent"],
  ["officetel/trade", "RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade"],
  ["officetel/rent", "RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent"],
  ["villa/trade", "RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade"],
  ["villa/rent", "RTMSDataSvcRHRent/getRTMSDataSvcRHRent"],
  ["single-house/trade", "RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade"],
  ["single-house/rent", "RTMSDataSvcSHRent/getRTMSDataSvcSHRent"],
  ["commercial/trade", "RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade"],
]);

const VALID_ASSET_TYPES = new Set(["apartment", "officetel", "villa", "single-house", "commercial"]);
const VALID_DEAL_TYPES = new Set(["trade", "rent"]);

// XML tag → JSON key mapping per asset type for trade responses.
// name_tag: XML tag for the property name
// area_tag: XML tag for the area field
// cancel_tag: XML tag for cancellation marker
// extra_fields: additional fields specific to the asset type
const TRADE_SCHEMA = {
  apartment: { name_tag: "aptNm", area_tag: "excluUseAr", cancel_tag: "cdealType", extra_fields: [] },
  officetel: { name_tag: "offiNm", area_tag: "excluUseAr", cancel_tag: "cdealType", extra_fields: [] },
  villa: { name_tag: "mhouseNm", area_tag: "excluUseAr", cancel_tag: "cdealType", extra_fields: ["houseType"] },
  "single-house": { name_tag: null, area_tag: "totalFloorAr", cancel_tag: "cdealType", extra_fields: ["houseType"], floor_fixed: 0 },
  commercial: { name_tag: null, area_tag: "buildingAr", cancel_tag: "cdealtype", extra_fields: ["buildingType", "buildingUse", "landUse", "shareDealingType"] },
};

const RENT_SCHEMA = {
  apartment: { name_tag: "aptNm", area_tag: "excluUseAr", extra_fields: [] },
  officetel: { name_tag: "offiNm", area_tag: "excluUseAr", extra_fields: [] },
  villa: { name_tag: "mhouseNm", area_tag: "excluUseAr", extra_fields: ["houseType"] },
  "single-house": { name_tag: null, area_tag: "totalFloorAr", extra_fields: ["houseType"] },
};

function extractTag(itemXml, tagName) {
  const re = new RegExp(`<${tagName}>\\s*([^<]*)\\s*</${tagName}>`);
  const m = itemXml.match(re);
  return m ? m[1].trim() : "";
}

function parseAmount(raw) {
  const cleaned = raw.replace(/,/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatValue(raw) {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseIntValue(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function makeDate(itemXml) {
  const year = extractTag(itemXml, "dealYear");
  const month = extractTag(itemXml, "dealMonth").padStart(2, "0");
  const day = extractTag(itemXml, "dealDay").padStart(2, "0");
  return year ? `${year}-${month}-${day}` : "";
}

// Regex-based XML parser for MOLIT's flat <item> structure.
// Not a general-purpose XML parser — sufficient for data.go.kr MOLIT responses.
function parseXmlItems(xmlText) {
  const codeMatch = xmlText.match(/<resultCode>(\d+)<\/resultCode>/);
  if (!codeMatch) {
    return { error: "parse_error", message: "No resultCode in response" };
  }
  const resultCode = codeMatch[1];
  if (resultCode !== "000") {
    const msgMatch = xmlText.match(/<resultMsg>([^<]*)<\/resultMsg>/);
    const resultMsg = msgMatch ? msgMatch[1].trim() : `API error code ${resultCode}`;
    return { error: `molit_api_${resultCode}`, message: resultMsg };
  }

  const totalMatch = xmlText.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    items.push(match[1]);
  }

  return { totalCount, items };
}

function normalizeTradeItem(itemXml, assetType) {
  const schema = TRADE_SCHEMA[assetType];
  if (!schema) return null;

  const cancelVal = extractTag(itemXml, schema.cancel_tag);
  if (cancelVal === "O") return null;

  const price = parseAmount(extractTag(itemXml, "dealAmount"));
  if (price === null) return null;

  const result = {
    name: schema.name_tag ? extractTag(itemXml, schema.name_tag) : "",
    district: extractTag(itemXml, "umdNm"),
    area_m2: parseFloatValue(extractTag(itemXml, schema.area_tag)),
    floor: schema.floor_fixed !== undefined ? schema.floor_fixed : parseIntValue(extractTag(itemXml, "floor")),
    price_10k: price,
    deal_date: makeDate(itemXml),
    build_year: parseIntValue(extractTag(itemXml, "buildYear")),
    deal_type: extractTag(itemXml, "dealingGbn"),
  };

  for (const field of schema.extra_fields) {
    result[field] = extractTag(itemXml, field);
  }

  return result;
}

function normalizeRentItem(itemXml, assetType) {
  const schema = RENT_SCHEMA[assetType];
  if (!schema) return null;

  const cancelVal = extractTag(itemXml, "cdealType");
  if (cancelVal === "O") return null;

  const deposit = parseAmount(extractTag(itemXml, "deposit"));
  if (deposit === null) return null;

  const monthlyRentRaw = extractTag(itemXml, "monthlyRent");
  const monthlyRent = monthlyRentRaw ? (parseAmount(monthlyRentRaw) || 0) : 0;

  const result = {
    name: schema.name_tag ? extractTag(itemXml, schema.name_tag) : "",
    district: extractTag(itemXml, "umdNm"),
    area_m2: parseFloatValue(extractTag(itemXml, schema.area_tag)),
    floor: parseIntValue(extractTag(itemXml, "floor")),
    deposit_10k: deposit,
    monthly_rent_10k: monthlyRent,
    contract_type: extractTag(itemXml, "contractType"),
    deal_date: makeDate(itemXml),
    build_year: parseIntValue(extractTag(itemXml, "buildYear")),
  };

  for (const field of schema.extra_fields) {
    result[field] = extractTag(itemXml, field);
  }

  return result;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return Math.floor(arr.reduce((s, v) => s + v, 0) / arr.length);
}

function computeTradeSummary(items) {
  if (items.length === 0) {
    return { median_price_10k: 0, min_price_10k: 0, max_price_10k: 0, sample_count: 0 };
  }
  const prices = items.map((it) => it.price_10k);
  return {
    median_price_10k: median(prices),
    min_price_10k: Math.min(...prices),
    max_price_10k: Math.max(...prices),
    sample_count: prices.length,
  };
}

function computeRentSummary(items) {
  if (items.length === 0) {
    return { median_deposit_10k: 0, min_deposit_10k: 0, max_deposit_10k: 0, monthly_rent_avg_10k: 0, sample_count: 0 };
  }
  const deposits = items.map((it) => it.deposit_10k);
  const rents = items.map((it) => it.monthly_rent_10k);
  return {
    median_deposit_10k: median(deposits),
    min_deposit_10k: Math.min(...deposits),
    max_deposit_10k: Math.max(...deposits),
    monthly_rent_avg_10k: mean(rents),
    sample_count: deposits.length,
  };
}

async function fetchTransactions({ assetType, dealType, lawdCd, dealYmd, numOfRows = 100, serviceKey, fetchImpl }) {
  const endpointKey = `${assetType}/${dealType}`;
  const path = ENDPOINT_MAP.get(endpointKey);
  if (!path) {
    return { error: "invalid_endpoint", message: `Unknown endpoint: ${endpointKey}` };
  }

  const url = new URL(`${MOLIT_BASE_URL}/${path}`);
  url.searchParams.set("LAWD_CD", lawdCd);
  url.searchParams.set("DEAL_YMD", dealYmd);
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("serviceKey", serviceKey);

  const doFetch = fetchImpl || globalThis.fetch;
  let response;
  try {
    response = await doFetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    return { error: "upstream_timeout", message: `Upstream request failed: ${err.message}` };
  }

  if (!response.ok) {
    return { error: "upstream_error", message: `Upstream returned ${response.status}` };
  }

  const xmlText = await response.text();
  const parsed = parseXmlItems(xmlText);
  if (parsed.error) {
    return parsed;
  }

  const normalize = dealType === "trade" ? normalizeTradeItem : normalizeRentItem;
  const items = [];
  for (const rawItem of parsed.items) {
    const normalized = normalize(rawItem, assetType);
    if (normalized) items.push(normalized);
  }

  const summary = dealType === "trade" ? computeTradeSummary(items) : computeRentSummary(items);

  return {
    items,
    summary,
    total_count: parsed.totalCount,
    filtered_count: items.length,
  };
}

module.exports = {
  ENDPOINT_MAP,
  VALID_ASSET_TYPES,
  VALID_DEAL_TYPES,
  parseXmlItems,
  extractTag,
  normalizeTradeItem,
  normalizeRentItem,
  computeTradeSummary,
  computeRentSummary,
  fetchTransactions,
  median,
};
