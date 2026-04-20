const {
  extractAddressHint,
  normalizeAnchorPanel,
  normalizeParkingLotRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates
} = require("./parse");

const SEARCH_VIEW_URL = "https://m.map.kakao.com/actions/searchView";
const PLACE_PANEL_URL_BASE = "https://place-api.map.kakao.com/places/panel3";
const OFFICIAL_API_URL = "http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org";
const DEFAULT_BROWSER_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
};
const DEFAULT_PANEL_HEADERS = {
  ...DEFAULT_BROWSER_HEADERS,
  accept: "application/json, text/plain, */*",
  appVersion: "6.6.0",
  origin: "https://place.map.kakao.com",
  pf: "PC",
  referer: "https://place.map.kakao.com/"
};
const DEFAULT_JSON_HEADERS = {
  accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent": DEFAULT_BROWSER_HEADERS["user-agent"]
};

async function request(url, options = {}, responseType = "json") {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const headerSet = responseType === "json" ? options.headerSet || DEFAULT_JSON_HEADERS : options.headerSet || DEFAULT_BROWSER_HEADERS;
  const response = await fetchImpl(url, {
    headers: {
      ...headerSet,
      ...(options.headers || {})
    },
    signal: options.signal
  });

  if (!response.ok) {
    const error = new Error(`Request failed with ${response.status} for ${url}`);
    error.status = response.status;
    error.url = url;
    throw error;
  }

  return responseType === "json" ? response.json() : response.text();
}

function normalizeBoundedInteger(value, fallback, label, min, max) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return !["0", "false", "n", "no", "민영포함"].includes(String(value).trim().toLowerCase());
}

function resolveProxyBaseUrl(options = {}) {
  return options.proxyBaseUrl || process.env.KSKILL_PROXY_BASE_URL || DEFAULT_PROXY_BASE_URL;
}

function resolveApiKey(options = {}) {
  return options.apiKey || options.serviceKey || process.env.DATA_GO_KR_API_KEY || null;
}

function useDirectApi(options = {}) {
  return options.useDirectApi || !!(options.apiKey || options.serviceKey);
}

function buildOfficialParkingLotApiUrl(options = {}) {
  const serviceKey = options.serviceKey || options.apiKey;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_API_KEY or options.apiKey is required for direct official parking API lookups.");
  }

  const pageNo = normalizeBoundedInteger(options.pageNo, 1, "pageNo", 1, 100000);
  const numOfRows = normalizeBoundedInteger(options.numOfRows, 1000, "numOfRows", 1, 1000);
  const url = new URL(options.apiBaseUrl || OFFICIAL_API_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("type", "json");

  if (normalizeBoolean(options.publicOnly, true)) {
    url.searchParams.set("prkplceSe", "공영");
  }
  if (options.parkingType) {
    url.searchParams.set("prkplceType", String(options.parkingType).trim());
  }

  const addressHint = String(options.addressHint || options.address_hint || "").trim();
  if (addressHint) {
    url.searchParams.set(options.addressField || "rdnmadr", addressHint);
  }

  return url.toString();
}

async function fetchOfficialParkingLots(options = {}) {
  const url = buildOfficialParkingLotApiUrl(options);
  return request(url, options, "json");
}

async function fetchProxyParkingLots(options = {}) {
  const base = resolveProxyBaseUrl(options);
  const url = new URL(`${base}/v1/parking-lots/search`);
  url.searchParams.set("latitude", String(options.latitude));
  url.searchParams.set("longitude", String(options.longitude));
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("radius", String(options.radius));
  url.searchParams.set("public_only", String(options.publicOnly));
  if (options.addressHint) {
    url.searchParams.set("address_hint", options.addressHint);
  }
  if (options.parkingType) {
    url.searchParams.set("parking_type", options.parkingType);
  }
  if (options.numOfRows) {
    url.searchParams.set("num_of_rows", String(options.numOfRows));
  }
  if (options.maxPages) {
    url.searchParams.set("max_pages", String(options.maxPages));
  }

  return request(url.toString(), options, "json");
}

async function fetchSearchResults(query, options = {}) {
  const url = new URL(SEARCH_VIEW_URL);
  url.searchParams.set("q", String(query || "").trim());
  return request(url.toString(), options, "text");
}

async function fetchPlacePanel(confirmId, options = {}) {
  return request(`${PLACE_PANEL_URL_BASE}/${confirmId}`, { ...options, headerSet: DEFAULT_PANEL_HEADERS }, "json");
}

function isRecoverablePlacePanelError(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status < 600;
}

async function resolveAnchor(locationQuery, options = {}) {
  const anchorSearchHtml = await fetchSearchResults(locationQuery, options);
  const anchorCandidates = parseSearchResultsHtml(anchorSearchHtml);
  const rankedCandidates = rankAnchorCandidates(locationQuery, anchorCandidates);

  for (const candidate of rankedCandidates) {
    let anchorPanel;
    try {
      anchorPanel = await fetchPlacePanel(candidate.id, options);
    } catch (error) {
      if (isRecoverablePlacePanelError(error)) {
        continue;
      }
      throw error;
    }

    const anchor = normalizeAnchorPanel(anchorPanel, candidate);
    if (Number.isFinite(anchor.latitude) && Number.isFinite(anchor.longitude)) {
      return { anchor, anchorCandidates: rankedCandidates };
    }
  }

  throw new Error(`No usable Kakao Map place panel was available for ${locationQuery}.`);
}

async function searchNearbyParkingLotsByCoordinates(options = {}) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude and longitude must be finite numbers.");
  }

  const limit = normalizeBoundedInteger(options.limit, 5, "limit", 1, 50);
  const radius = normalizeBoundedInteger(options.radius ?? options.maxDistanceMeters, 2000, "radius", 1, 50000);
  const publicOnly = normalizeBoolean(options.publicOnly ?? options.public_only, true);
  const addressHint = String(options.addressHint || options.address_hint || "").trim() || null;
  const apiKey = resolveApiKey(options);

  if (!apiKey && !useDirectApi(options)) {
    return fetchProxyParkingLots({
      ...options,
      latitude,
      longitude,
      limit,
      radius,
      publicOnly,
      addressHint
    });
  }

  const payload = await fetchOfficialParkingLots({
    ...options,
    serviceKey: apiKey,
    addressHint,
    publicOnly
  });
  const allItems = normalizeParkingLotRows(payload, { latitude, longitude }, { radius, publicOnly });

  return {
    anchor: {
      name: options.anchorName || "입력 좌표",
      address: options.anchorAddress || addressHint,
      latitude,
      longitude
    },
    items: allItems.slice(0, limit),
    meta: {
      total: allItems.length,
      limit,
      radius,
      publicOnly,
      addressHint,
      source: "data.go.kr"
    }
  };
}

async function searchNearbyParkingLotsByLocationQuery(locationQuery, options = {}) {
  const query = String(locationQuery || "").trim();
  if (!query) {
    throw new Error("locationQuery is required.");
  }

  const coordinateQuery = parseCoordinateQuery(query);
  if (coordinateQuery) {
    return searchNearbyParkingLotsByCoordinates({
      ...options,
      ...coordinateQuery,
      anchorName: query
    });
  }

  const { anchor, anchorCandidates } = await resolveAnchor(query, options);
  const addressHint = options.addressHint || options.address_hint || extractAddressHint(anchor.address);
  const result = await searchNearbyParkingLotsByCoordinates({
    ...options,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    addressHint,
    anchorName: anchor.name,
    anchorAddress: anchor.address
  });

  return {
    ...result,
    anchor,
    anchorCandidates,
    meta: {
      ...result.meta,
      resolvedQuery: query,
      addressHint
    }
  };
}

module.exports = {
  DEFAULT_PROXY_BASE_URL,
  OFFICIAL_API_URL,
  PLACE_PANEL_URL_BASE,
  SEARCH_VIEW_URL,
  buildOfficialParkingLotApiUrl,
  extractAddressHint,
  fetchOfficialParkingLots,
  fetchPlacePanel,
  fetchProxyParkingLots,
  fetchSearchResults,
  normalizeAnchorPanel,
  normalizeParkingLotRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates,
  searchNearbyParkingLotsByCoordinates,
  searchNearbyParkingLotsByLocationQuery
};
