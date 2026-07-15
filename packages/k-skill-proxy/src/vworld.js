const VWORLD_API_BASE_URL = "https://api.vworld.kr";
const VWORLD_CREDENTIAL_HEADER = "x-k-skill-vworld-api-key";
const MAX_QUERY_LENGTH = 200;
const MAX_DOMAIN_LENGTH = 253;
const MAX_PAGE = 10000;
const MAX_SEARCH_SIZE = 100;
const MAX_PRICE_ROWS = 1000;
const MIN_PRICE_YEAR = 2005;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CREDENTIAL_DECODE_DEPTH = 16;

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
  for (let depth = 0; depth < MAX_CREDENTIAL_DECODE_DEPTH; depth += 1) {
    if (candidate.includes(apiKey)) {
      return true;
    }
    const unicodeDecoded = candidate
      .replace(/\\u([0-9a-f]{4})/giu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/%u([0-9a-f]{4})/giu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    const percentDecoded = unicodeDecoded.replace(/(?:%[0-9a-f]{2})+/giu, (sequence) => {
      try {
        return decodeURIComponent(sequence);
      } catch {
        return sequence.replace(/%([0-9a-f]{2})/giu, (_, hex) => (
          String.fromCharCode(Number.parseInt(hex, 16))
        ));
      }
    });
    if (
      percentDecoded.includes(apiKey) ||
      percentDecoded.replace(/\+/g, " ").includes(apiKey)
    ) {
      return true;
    }
    if (percentDecoded === candidate) {
      return false;
    }
    candidate = percentDecoded;
  }
  return (
    candidate.includes(apiKey) ||
    /(?:%[0-9a-f]{2}|%u[0-9a-f]{4}|\\u[0-9a-f]{4})/iu.test(candidate)
  );
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

function projectUntruncatedString(value, apiKey) {
  if (typeof value !== "string") {
    return "";
  }
  if (containsCredentialEncoding(value, apiKey)) {
    return "[REDACTED]";
  }
  return redactCredential(value, apiKey);
}

function projectVWorldBody(operation, body, apiKey, params = null) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    const error = new Error("VWorld upstream returned invalid JSON.");
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }

  if (params) {
    assertMatchingRequestIdentity(operation, payload, params);
  }

  if (operation === "search") {
    const response = payload?.response;
    if (response?.status !== "OK") {
      return JSON.stringify({
        response: {
          status: "ERROR",
          error: {
            code: "UPSTREAM_ERROR",
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
      id: projectUntruncatedString(item?.id, apiKey),
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
    const resultCode = prices?.resultCode === "" ? "" : "UPSTREAM_ERROR";
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
      pnu: projectUntruncatedString(record?.pnu, apiKey),
      stdrYear: projectUntruncatedString(record?.stdrYear, apiKey),
      aphusNm: projectString(record?.aphusNm, apiKey, 300),
      dongNm: projectUntruncatedString(record?.dongNm, apiKey),
      hoNm: projectUntruncatedString(record?.hoNm, apiKey),
      floorNm: projectUntruncatedString(record?.floorNm, apiKey),
      prvuseAr: projectUntruncatedString(record?.prvuseAr, apiKey),
      pblntfPc: projectUntruncatedString(record?.pblntfPc, apiKey),
      lastUpdtDt: projectString(record?.lastUpdtDt, apiKey, 100)
    }));
    return JSON.stringify({
      apartHousingPrices: {
        resultCode: "",
        resultMsg: "",
        totalCount: projectUntruncatedString(prices?.totalCount, apiKey),
        pageNo: projectUntruncatedString(prices?.pageNo, apiKey),
        numOfRows: projectUntruncatedString(prices?.numOfRows, apiKey),
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

function parseStrictPositiveIntegerString(value) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1) {
    return null;
  }
  return number;
}

function parseStrictNonNegativeIntegerString(value) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }
  return number;
}

function assertMatchingRequestIdentity(operation, payload, params) {
  if (!params) {
    return;
  }

  if (operation === "search") {
    const response = payload?.response;
    // Non-OK search envelopes are projected into a fixed ERROR body by
    // projectVWorldBody. Only successful identities need fail-closed checks.
    if (response?.status !== "OK") {
      return;
    }
    if (!Array.isArray(response?.result?.items)) {
      const error = new Error("VWorld upstream returned an invalid search payload.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }

    const pageCandidates = [
      response?.page,
      response?.result?.page,
      response?.record?.page,
      response?.result?.record?.page
    ];
    const sizeCandidates = [
      response?.size,
      response?.result?.size,
      response?.record?.size,
      response?.result?.record?.size
    ];
    const queryCandidates = [
      response?.result?.query,
      response?.query,
      response?.record?.query,
      response?.result?.record?.query
    ];
    const typeCandidates = [
      response?.result?.type,
      response?.type,
      response?.record?.type,
      response?.result?.record?.type
    ];
    const categoryCandidates = [
      response?.result?.category,
      response?.category,
      response?.record?.category,
      response?.result?.record?.category
    ];

    for (const candidate of pageCandidates) {
      if (candidate == null || candidate === "") {
        continue;
      }
      const page = parseStrictPositiveIntegerString(candidate);
      if (page == null || page !== params.page) {
        const error = new Error("VWorld upstream returned a mismatched search page.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
    }
    for (const candidate of sizeCandidates) {
      if (candidate == null || candidate === "") {
        continue;
      }
      const size = parseStrictPositiveIntegerString(candidate);
      if (size == null || size !== params.size) {
        const error = new Error("VWorld upstream returned a mismatched search size.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
    }
    for (const candidate of queryCandidates) {
      if (candidate == null || candidate === "") {
        continue;
      }
      if (String(candidate) !== params.query) {
        const error = new Error("VWorld upstream returned a mismatched search query.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
    }
    for (const candidate of typeCandidates) {
      if (candidate == null || candidate === "") {
        continue;
      }
      if (String(candidate) !== params.type) {
        const error = new Error("VWorld upstream returned a mismatched search type.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
    }
    if (params.category) {
      for (const candidate of categoryCandidates) {
        if (candidate == null || candidate === "") {
          continue;
        }
        if (String(candidate) !== params.category) {
          const error = new Error("VWorld upstream returned a mismatched search category.");
          error.code = "upstream_error";
          error.statusCode = 502;
          throw error;
        }
      }
    }
    return;
  }

  if (operation === "prices") {
    const prices = payload?.apartHousingPrices;
    // Non-empty resultCode is a semantic upstream failure projected as
    // UPSTREAM_ERROR. Only successful result envelopes must match identity.
    if (!prices || prices.resultCode !== "") {
      return;
    }
    if (!Array.isArray(prices.field)) {
      const error = new Error("VWorld upstream returned an invalid apartment-price payload.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }

    const totalCount = parseStrictNonNegativeIntegerString(prices.totalCount);
    const pageNo = parseStrictPositiveIntegerString(prices.pageNo);
    const numOfRows = parseStrictPositiveIntegerString(prices.numOfRows);
    if (totalCount == null || pageNo == null || numOfRows == null) {
      const error = new Error("VWorld upstream returned an invalid apartment-price payload.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }
    if (pageNo !== params.pageNo || numOfRows !== params.numOfRows) {
      const error = new Error("VWorld upstream returned a mismatched apartment-price page.");
      error.code = "upstream_error";
      error.statusCode = 502;
      throw error;
    }

    for (const record of prices.field) {
      if (record == null || typeof record !== "object") {
        const error = new Error("VWorld upstream returned an invalid apartment-price row.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
      if (record.pnu != null && String(record.pnu) !== "" && String(record.pnu) !== params.pnu) {
        const error = new Error("VWorld upstream returned a mismatched apartment-price pnu.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
      if (
        record.stdrYear != null &&
        String(record.stdrYear) !== "" &&
        String(record.stdrYear) !== params.stdrYear
      ) {
        const error = new Error("VWorld upstream returned a mismatched apartment-price year.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
      if (
        params.dongNm &&
        record.dongNm != null &&
        String(record.dongNm) !== "" &&
        String(record.dongNm) !== params.dongNm
      ) {
        const error = new Error("VWorld upstream returned a mismatched apartment-price dong.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
      if (
        params.hoNm &&
        record.hoNm != null &&
        String(record.hoNm) !== "" &&
        String(record.hoNm) !== params.hoNm
      ) {
        const error = new Error("VWorld upstream returned a mismatched apartment-price unit.");
        error.code = "upstream_error";
        error.statusCode = 502;
        throw error;
      }
    }
    return;
  }

  const error = new Error("Unsupported VWorld operation.");
  error.code = "proxy_error";
  error.statusCode = 500;
  throw error;
}

function isVWorldSuccessBody(operation, body, params = null) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }
  try {
    assertMatchingRequestIdentity(operation, payload, params);
  } catch {
    return false;
  }
  if (operation === "search") {
    return payload?.response?.status === "OK" && Array.isArray(payload?.response?.result?.items);
  }
  if (operation === "prices") {
    const prices = payload?.apartHousingPrices;
    const totalCount = parseStrictNonNegativeIntegerString(prices?.totalCount);
    const pageNo = parseStrictPositiveIntegerString(prices?.pageNo);
    const numOfRows = parseStrictPositiveIntegerString(prices?.numOfRows);
    return (
      prices?.resultCode === "" &&
      totalCount != null &&
      pageNo != null &&
      numOfRows != null &&
      Array.isArray(prices?.field)
    );
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

  const body = projectVWorldBody(operation, responseBody, credential, params);
  return {
    statusCode: response.status,
    contentType: "application/json; charset=utf-8",
    body
  };
}

module.exports = {
  VWORLD_API_BASE_URL,
  VWORLD_CREDENTIAL_HEADER,
  assertMatchingRequestIdentity,
  buildVWorldUrl,
  projectVWorldBody,
  isVWorldSuccessBody,
  normalizeVWorldPriceQuery,
  normalizeVWorldSearchQuery,
  proxyVWorldRequest
};
