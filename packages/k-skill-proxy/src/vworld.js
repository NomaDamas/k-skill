const VWORLD_API_BASE_URL = "https://api.vworld.kr";
const VWORLD_CREDENTIAL_HEADER = "x-k-skill-vworld-api-key";
const MAX_QUERY_LENGTH = 200;
const MAX_DOMAIN_LENGTH = 253;
const MAX_PAGE = 10000;
const MAX_SEARCH_SIZE = 100;
const MAX_PRICE_ROWS = 1000;
const MIN_PRICE_YEAR = 2005;

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}

function requireString(value, field, maxLength) {
  const normalized = trimOrNull(value);
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  if ([...normalized].length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function parseBoundedInteger(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function normalizeDomain(value) {
  const domain = trimOrNull(value);
  if (!domain) {
    return null;
  }
  if (
    domain.length > MAX_DOMAIN_LENGTH ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(domain)
  ) {
    throw new Error("domain must be a hostname without a scheme, port, path, or query.");
  }
  return domain.toLowerCase();
}

function rejectQueryCredential(query) {
  if (Object.prototype.hasOwnProperty.call(query || {}, "key")) {
    throw new Error(`key must be supplied in the ${VWORLD_CREDENTIAL_HEADER} header, not the query string.`);
  }
}

function normalizeVWorldSearchQuery(query = {}) {
  rejectQueryCredential(query);
  const normalizedQuery = requireString(query.query, "query", MAX_QUERY_LENGTH);
  const type = trimOrNull(query.type) || "place";
  if (type !== "place" && type !== "address") {
    throw new Error("type must be place or address.");
  }
  const category = trimOrNull(query.category);
  if (category !== null && category !== "parcel") {
    throw new Error("category must be parcel when provided.");
  }
  if (category === "parcel" && type !== "address") {
    throw new Error("category=parcel requires type=address.");
  }
  return {
    query: normalizedQuery,
    type,
    category,
    size: parseBoundedInteger(query.size, "size", MAX_SEARCH_SIZE, 1, MAX_SEARCH_SIZE),
    page: parseBoundedInteger(query.page, "page", 1, 1, MAX_PAGE),
    domain: normalizeDomain(query.domain)
  };
}

function normalizeVWorldPriceQuery(query = {}) {
  rejectQueryCredential(query);
  const pnu = requireString(query.pnu, "pnu", 19);
  if (!/^\d{19}$/.test(pnu)) {
    throw new Error("pnu must contain exactly 19 digits.");
  }
  const stdrYear = requireString(query.stdrYear ?? query.year, "stdrYear", 4);
  const currentYear = Number.parseInt(
    new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()),
    10
  );
  const numericYear = Number.parseInt(stdrYear, 10);
  if (
    !/^\d{4}$/.test(stdrYear) ||
    numericYear < MIN_PRICE_YEAR ||
    numericYear > currentYear
  ) {
    throw new Error(`stdrYear must be between ${MIN_PRICE_YEAR} and ${currentYear}.`);
  }
  const dongNm = trimOrNull(query.dongNm ?? query.building);
  const hoNm = trimOrNull(query.hoNm ?? query.unit);
  if (Boolean(dongNm) !== Boolean(hoNm)) {
    throw new Error("dongNm and hoNm must be provided together.");
  }
  if ((dongNm && [...dongNm].length > 40) || (hoNm && [...hoNm].length > 40)) {
    throw new Error("dongNm and hoNm must each be at most 40 characters.");
  }
  return {
    pnu,
    stdrYear,
    pageNo: parseBoundedInteger(query.pageNo ?? query.page, "pageNo", 1, 1, MAX_PAGE),
    numOfRows: parseBoundedInteger(
      query.numOfRows ?? query.limit,
      "numOfRows",
      MAX_PRICE_ROWS,
      1,
      MAX_PRICE_ROWS
    ),
    dongNm,
    hoNm,
    domain: normalizeDomain(query.domain)
  };
}

function buildVWorldUrl(operation, params, apiKey) {
  let url;
  if (operation === "search") {
    url = new URL("/req/search", VWORLD_API_BASE_URL);
    url.searchParams.set("service", "search");
    url.searchParams.set("request", "search");
    url.searchParams.set("version", "2.0");
    url.searchParams.set("crs", "EPSG:4326");
    url.searchParams.set("size", String(params.size));
    url.searchParams.set("page", String(params.page));
    url.searchParams.set("query", params.query);
    url.searchParams.set("type", params.type);
    url.searchParams.set("format", "json");
    url.searchParams.set("errorformat", "json");
    if (params.category) {
      url.searchParams.set("category", params.category);
    }
  } else if (operation === "prices") {
    url = new URL("/ned/data/getApartHousingPriceAttr", VWORLD_API_BASE_URL);
    url.searchParams.set("pnu", params.pnu);
    url.searchParams.set("stdrYear", params.stdrYear);
    url.searchParams.set("format", "json");
    url.searchParams.set("numOfRows", String(params.numOfRows));
    url.searchParams.set("pageNo", String(params.pageNo));
    if (params.dongNm && params.hoNm) {
      url.searchParams.set("dongNm", params.dongNm);
      url.searchParams.set("hoNm", params.hoNm);
    }
  } else {
    throw new Error("Unsupported VWorld operation.");
  }
  url.searchParams.set("key", apiKey);
  if (params.domain) {
    url.searchParams.set("domain", params.domain);
  }
  return url;
}

function redactCredential(body, apiKey) {
  let redacted = String(body);
  if (!apiKey) {
    return redacted;
  }
  const raw = String(apiKey);
  const serialized = new URLSearchParams({ key: raw }).toString().slice("key=".length);
  const jsonEscaped = JSON.stringify(raw).slice(1, -1);
  redacted = redacted.split(raw).join("[REDACTED]");
  for (const candidate of [encodeURIComponent(raw), serialized, jsonEscaped]) {
    if (candidate) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      redacted = redacted.replace(new RegExp(escaped, "giu"), "[REDACTED]");
    }
  }
  return redacted.replace(/(?:^|[?&])key(?:=|%3D)[^&\s"'<>\\]+/giu, (match) => {
    const prefix = match.startsWith("?") || match.startsWith("&") ? match[0] : "";
    return `${prefix}key=[REDACTED]`;
  });
}

function isVWorldSuccessBody(operation, body, params = null) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }
  if (operation === "search") {
    return payload?.response?.status === "OK" && Array.isArray(payload?.response?.result?.items);
  }
  if (operation === "prices") {
    const prices = payload?.apartHousingPrices;
    const totalCount = Number(prices?.totalCount);
    const pageNo = Number(prices?.pageNo);
    const numOfRows = Number(prices?.numOfRows);
    const structurallyComplete = (
      prices?.resultCode === "" &&
      /^\d+$/.test(prices?.totalCount || "") &&
      /^\d+$/.test(prices?.pageNo || "") &&
      /^\d+$/.test(prices?.numOfRows || "") &&
      Number.isSafeInteger(totalCount) &&
      totalCount >= 0 &&
      Number.isSafeInteger(pageNo) &&
      pageNo >= 1 &&
      Number.isSafeInteger(numOfRows) &&
      numOfRows >= 1 &&
      Array.isArray(prices?.field)
    );
    if (!structurallyComplete) {
      return false;
    }
    if (params) {
      return pageNo === params.pageNo && numOfRows === params.numOfRows;
    }
    return true;
  }
  return false;
}

async function proxyVWorldRequest({
  operation,
  params,
  apiKey,
  fetchImpl = global.fetch
} = {}) {
  const credential = trimOrNull(apiKey);
  if (!credential) {
    const error = new Error(`Provide the VWorld credential in the ${VWORLD_CREDENTIAL_HEADER} header.`);
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }
  if (typeof fetchImpl !== "function") {
    const error = new Error("fetch is not available in this Node runtime.");
    error.code = "proxy_error";
    error.statusCode = 500;
    throw error;
  }

  const url = buildVWorldUrl(operation, params, credential);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    const error = new Error("VWorld upstream request failed.");
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }

  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    const error = new Error("VWorld upstream redirect was rejected.");
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }
  if (response.url) {
    let finalUrl;
    try {
      finalUrl = new URL(response.url);
    } catch {
      const error = new Error("VWorld upstream returned an invalid final URL.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }
    if (finalUrl.origin !== url.origin || finalUrl.pathname !== url.pathname) {
      const error = new Error("VWorld upstream final URL was rejected.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }
  }

  let responseBody;
  try {
    responseBody = await response.text();
  } catch {
    const error = new Error("VWorld upstream response body failed.");
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }

  const body = redactCredential(responseBody, credential);
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body
  };
}

module.exports = {
  VWORLD_API_BASE_URL,
  VWORLD_CREDENTIAL_HEADER,
  buildVWorldUrl,
  isVWorldSuccessBody,
  normalizeVWorldPriceQuery,
  normalizeVWorldSearchQuery,
  proxyVWorldRequest
};
