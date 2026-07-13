const VWORLD_API_BASE_URL = "https://api.vworld.kr";
const VWORLD_CREDENTIAL_HEADER = "x-k-skill-vworld-api-key";
const MAX_QUERY_LENGTH = 200;
const MAX_DOMAIN_LENGTH = 253;
const MAX_PAGE = 10000;
const MAX_SEARCH_SIZE = 100;
const MAX_PRICE_ROWS = 1000;
const MIN_PRICE_YEAR = 2005;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

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

function containsCredentialEncoding(value, apiKey) {
  let candidate = String(value);
  for (let depth = 0; depth < 6; depth += 1) {
    if (candidate.includes(apiKey)) {
      return true;
    }
    const unicodeDecoded = candidate
      .replace(/\\u([0-9a-f]{4})/giu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/%u([0-9a-f]{4})/giu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    let urlDecoded = unicodeDecoded;
    try {
      urlDecoded = decodeURIComponent(unicodeDecoded);
    } catch {}
    if (urlDecoded === candidate) {
      return false;
    }
    candidate = urlDecoded;
  }
  return candidate.includes(apiKey);
}

function projectString(value, apiKey, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  if (containsCredentialEncoding(value, apiKey)) {
    return "[REDACTED]";
  }
  return [...redactCredential(value, apiKey)].slice(0, maxLength).join("");
}

function projectCode(value, fallback, { allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    return fallback;
  }
  if (allowEmpty && value === "") {
    return "";
  }
  return /^[A-Z0-9_-]{1,64}$/i.test(value) ? value : fallback;
}

function projectVWorldBody(operation, body, apiKey) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    const error = new Error("VWorld upstream returned invalid JSON.");
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }

  if (operation === "search") {
    const response = payload?.response;
    if (response?.status !== "OK") {
      return JSON.stringify({
        response: {
          status: projectCode(response?.status, "ERROR"),
          error: {
            code: projectCode(response?.error?.code, "UPSTREAM_ERROR"),
            text: "VWorld search request failed."
          }
        }
      });
    }
    if (!Array.isArray(response?.result?.items)) {
      const error = new Error("VWorld upstream returned an invalid search payload.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }
    const items = response.result.items.slice(0, MAX_SEARCH_SIZE).map((item) => ({
      id: projectString(item?.id, apiKey, 64),
      title: projectString(item?.title, apiKey, 300),
      address: {
        parcel: projectString(item?.address?.parcel, apiKey, 300),
        road: projectString(item?.address?.road, apiKey, 300)
      }
    }));
    return JSON.stringify({ response: { status: "OK", result: { items } } });
  }

  if (operation === "prices") {
    const prices = payload?.apartHousingPrices;
    const resultCode = projectCode(prices?.resultCode, "UPSTREAM_ERROR", { allowEmpty: true });
    if (resultCode !== "") {
      return JSON.stringify({
        apartHousingPrices: {
          resultCode,
          resultMsg: "VWorld apartment-price request failed."
        }
      });
    }
    if (!Array.isArray(prices?.field)) {
      const error = new Error("VWorld upstream returned an invalid apartment-price payload.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }
    const field = prices.field.slice(0, MAX_PRICE_ROWS).map((record) => ({
      pnu: projectString(record?.pnu, apiKey, 19),
      stdrYear: projectString(record?.stdrYear, apiKey, 4),
      aphusNm: projectString(record?.aphusNm, apiKey, 300),
      dongNm: projectString(record?.dongNm, apiKey, 100),
      hoNm: projectString(record?.hoNm, apiKey, 100),
      floorNm: projectString(record?.floorNm, apiKey, 100),
      prvuseAr: projectString(record?.prvuseAr, apiKey, 100),
      pblntfPc: projectString(record?.pblntfPc, apiKey, 100),
      lastUpdtDt: projectString(record?.lastUpdtDt, apiKey, 100)
    }));
    return JSON.stringify({
      apartHousingPrices: {
        resultCode: "",
        resultMsg: "",
        totalCount: projectString(prices?.totalCount, apiKey, 32),
        pageNo: projectString(prices?.pageNo, apiKey, 32),
        numOfRows: projectString(prices?.numOfRows, apiKey, 32),
        field
      }
    });
  }

  const error = new Error("Unsupported VWorld operation.");
  error.code = "proxy_error";
  error.statusCode = 500;
  throw error;
}

async function readBoundedResponseBody(response, maxBytes = MAX_RESPONSE_BYTES) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new Error("response_too_large");
    }
    return body;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return body + decoder.decode();
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw new Error("response_too_large");
    }
    body += decoder.decode(value, { stream: true });
  }
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
    responseBody = await readBoundedResponseBody(response);
  } catch {
    const error = new Error("VWorld upstream response body failed.");
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }

  const body = projectVWorldBody(operation, responseBody, credential);
  return {
    statusCode: response.status,
    contentType: "application/json; charset=utf-8",
    body
  };
}

module.exports = {
  VWORLD_API_BASE_URL,
  VWORLD_CREDENTIAL_HEADER,
  buildVWorldUrl,
  projectVWorldBody,
  isVWorldSuccessBody,
  normalizeVWorldPriceQuery,
  normalizeVWorldSearchQuery,
  proxyVWorldRequest
};
