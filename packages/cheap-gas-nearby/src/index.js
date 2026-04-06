const {
  buildAroundSearchParams,
  normalizeAnchorPanel,
  normalizeDetailItem,
  parseAroundResponse,
  parseSearchResultsHtml,
  rankAnchorCandidates,
  selectAnchorCandidate,
  sortStationsByPriceAndDistance,
  wgs84ToKatec
} = require("./parse");

const SEARCH_VIEW_URL = "https://m.map.kakao.com/actions/searchView";
const PLACE_PANEL_URL_BASE = "https://place-api.map.kakao.com/places/panel3";
const OPINET_BASE_URL = "https://www.opinet.co.kr/api";
const AROUND_ALL_URL = `${OPINET_BASE_URL}/aroundAll.do`;
const DETAIL_BY_ID_URL = `${OPINET_BASE_URL}/detailById.do`;
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
  referer: "https://place.map.kakao.com/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site"
};
const DEFAULT_JSON_HEADERS = {
  accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent": DEFAULT_BROWSER_HEADERS["user-agent"]
};

async function request(url, options = {}, responseType = "text") {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const headerSet =
    responseType === "json"
      ? options.headerSet || DEFAULT_JSON_HEADERS
      : options.headerSet || DEFAULT_BROWSER_HEADERS;

  const response = await fetchImpl(url, {
    headers: {
      ...headerSet,
      ...(options.headers || {})
    },
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return responseType === "json" ? response.json() : response.text();
}

function resolveProxyBaseUrl(options = {}) {
  return options.proxyBaseUrl || process.env.KSKILL_PROXY_BASE_URL || DEFAULT_PROXY_BASE_URL;
}

function resolveApiKey(options = {}) {
  const apiKey = options.apiKey || options.certKey || process.env.OPINET_API_KEY;

  if (!apiKey && options.useDirectApi) {
    throw new Error("OPINET_API_KEY or options.apiKey is required for official Opinet lookups.");
  }

  return apiKey;
}

function useDirectApi(options = {}) {
  return options.useDirectApi || !!(options.apiKey || options.certKey);
}

function parseCoordinateQuery(locationQuery) {
  const match = String(locationQuery || "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,/ ]\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  return {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
}

async function fetchSearchResults(query, options = {}) {
  const url = new URL(SEARCH_VIEW_URL);
  url.searchParams.set("q", String(query || "").trim());

  return request(url.toString(), options, "text");
}

async function fetchPlacePanel(confirmId, options = {}) {
  return request(`${PLACE_PANEL_URL_BASE}/${confirmId}`, { ...options, headerSet: DEFAULT_PANEL_HEADERS }, "json");
}

async function fetchOpinetJson(url, options = {}) {
  return request(url, { ...options, headerSet: DEFAULT_JSON_HEADERS }, "json");
}

function hasFiniteAnchorCoordinates(anchor) {
  return Number.isFinite(anchor?.latitude) && Number.isFinite(anchor?.longitude);
}

async function resolveAnchor(locationQuery, options = {}) {
  const anchorSearchHtml = await fetchSearchResults(locationQuery, options);
  const anchorCandidates = parseSearchResultsHtml(anchorSearchHtml);
  const rankedCandidates = rankAnchorCandidates(locationQuery, anchorCandidates);

  for (const candidate of rankedCandidates) {
    try {
      const anchorPanel = await fetchPlacePanel(candidate.id, options);
      const anchor = normalizeAnchorPanel(anchorPanel, candidate);

      if (hasFiniteAnchorCoordinates(anchor)) {
        return {
          anchor,
          anchorCandidates
        };
      }
    } catch (error) {
      if (!/404/.test(String(error.message || error))) {
        throw error;
      }
    }
  }

  throw new Error(`No usable Kakao Map place panel was available for ${locationQuery}.`);
}

function normalizeCountOption(value, fallback, label, minimum = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return Math.max(minimum, parsed);
}

async function fetchAroundStations({ x, y, radius, productCode, apiKey, sort = 1 }, options = {}) {
  if (apiKey || useDirectApi(options)) {
    const url = new URL(AROUND_ALL_URL);
    const params = buildAroundSearchParams({ x, y, radius, productCode, sort });

    for (const [key, value] of Object.entries({ ...params, certkey: apiKey })) {
      url.searchParams.set(key, value);
    }

    return parseAroundResponse(await fetchOpinetJson(url.toString(), options));
  }

  const base = resolveProxyBaseUrl(options);
  const url = new URL(`${base}/v1/opinet/around`);
  url.searchParams.set("x", x);
  url.searchParams.set("y", y);
  url.searchParams.set("radius", radius);
  url.searchParams.set("prodcd", productCode);
  url.searchParams.set("sort", sort);

  return parseAroundResponse(await fetchOpinetJson(url.toString(), options));
}

async function fetchDetailById(id, apiKey, options = {}) {
  if (apiKey || useDirectApi(options)) {
    const url = new URL(DETAIL_BY_ID_URL);
    url.searchParams.set("out", "json");
    url.searchParams.set("id", id);
    url.searchParams.set("certkey", apiKey);

    return normalizeDetailItem(await fetchOpinetJson(url.toString(), options));
  }

  const base = resolveProxyBaseUrl(options);
  const url = new URL(`${base}/v1/opinet/detail`);
  url.searchParams.set("id", id);

  return normalizeDetailItem(await fetchOpinetJson(url.toString(), options));
}

function mergeStationDetail(aroundItem, detailItem) {
  if (!detailItem) {
    return aroundItem;
  }

  return {
    ...aroundItem,
    ...detailItem,
    price: aroundItem.price,
    distanceMeters: aroundItem.distanceMeters,
    name: detailItem.name || aroundItem.name,
    brandCode: detailItem.brandCode || aroundItem.brandCode,
    brandName: detailItem.brandName || aroundItem.brandName
  };
}

async function searchCheapGasStationsByCoordinates(options = {}) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  const radius = Number(options.radius ?? 1000);
  const productCode = options.productCode || "B027";
  const limit = normalizeCountOption(options.limit, 5, "limit", 1);
  const detailLimit = normalizeCountOption(options.detailLimit, limit, "detailLimit", 0);
  const apiKey = resolveApiKey(options);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude and longitude must be finite numbers.");
  }

  const katec = wgs84ToKatec(latitude, longitude);
  const aroundItems = await fetchAroundStations(
    {
      x: katec.x,
      y: katec.y,
      radius,
      productCode,
      apiKey: apiKey || undefined,
      sort: options.sort ?? 1
    },
    options,
  );
  const rankedItems = sortStationsByPriceAndDistance(aroundItems);
  const detailTargets = rankedItems.slice(0, detailLimit);
  const detailEntries = await Promise.all(
    detailTargets.map(async (item) => {
      try {
        return [item.id, await fetchDetailById(item.id, apiKey || undefined, options)];
      } catch (error) {
        return [item.id, { error: String(error.message || error) }];
      }
    }),
  );
  const detailMap = new Map(detailEntries);

  return {
    anchor: {
      latitude,
      longitude,
      katecX: katec.x,
      katecY: katec.y
    },
    items: rankedItems.slice(0, limit).map((item) => mergeStationDetail(item, detailMap.get(item.id))),
    meta: {
      productCode,
      radius,
      total: rankedItems.length
    }
  };
}

async function searchCheapGasStationsByLocationQuery(locationQuery, options = {}) {
  const query = String(locationQuery || "").trim();

  if (!query) {
    throw new Error("locationQuery is required.");
  }

  const coordinateQuery = parseCoordinateQuery(query);
  if (coordinateQuery) {
    return searchCheapGasStationsByCoordinates({
      ...options,
      ...coordinateQuery
    });
  }

  const { anchor, anchorCandidates } = await resolveAnchor(query, options);
  const result = await searchCheapGasStationsByCoordinates({
    ...options,
    latitude: anchor.latitude,
    longitude: anchor.longitude
  });

  return {
    ...result,
    anchor,
    anchorCandidates,
    meta: {
      ...result.meta,
      resolvedQuery: query
    }
  };
}

module.exports = {
  AROUND_ALL_URL,
  DEFAULT_PROXY_BASE_URL,
  DETAIL_BY_ID_URL,
  PLACE_PANEL_URL_BASE,
  SEARCH_VIEW_URL,
  buildAroundSearchParams,
  fetchDetailById,
  fetchPlacePanel,
  fetchSearchResults,
  normalizeAnchorPanel,
  normalizeDetailItem,
  parseAroundResponse,
  parseSearchResultsHtml,
  searchCheapGasStationsByCoordinates,
  searchCheapGasStationsByLocationQuery,
  selectAnchorCandidate,
  wgs84ToKatec
};
