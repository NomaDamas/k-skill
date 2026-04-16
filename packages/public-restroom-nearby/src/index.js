const {
  buildDatasetDownloadUrl,
  decodeDatasetBuffer,
  extractDistrict,
  inferRegion,
  normalizeAnchorPanel,
  normalizePublicRestroomRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates
} = require("./parse");

const SEARCH_VIEW_URL = "https://m.map.kakao.com/actions/searchView";
const PLACE_PANEL_URL_BASE = "https://place-api.map.kakao.com/places/panel3";
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

async function request(url, options = {}, responseType = "text") {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(url, {
    headers: {
      ...(options.headerSet || DEFAULT_BROWSER_HEADERS),
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

  if (responseType === "json") {
    return response.json();
  }

  if (responseType === "buffer") {
    return Buffer.from(await response.arrayBuffer());
  }

  return response.text();
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
      return {
        anchor,
        candidates: rankedCandidates
      };
    }
  }

  throw new Error(`No usable Kakao Map place panel was available for ${locationQuery}.`);
}

async function fetchDatasetCsv(options = {}) {
  const datasetUrl = buildDatasetDownloadUrl(options);
  const buffer = await request(
    datasetUrl,
    {
      ...options,
      headers: {
        referer: "https://file.localdata.go.kr/file/public_restroom_info/info",
        ...(options.headers || {})
      }
    },
    "buffer",
  );

  return {
    datasetUrl,
    csvText: decodeDatasetBuffer(buffer)
  };
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null) {
    return 5;
  }

  const parsed = Number(limit);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("limit must be a positive number.");
  }

  return parsed;
}

async function searchNearbyPublicRestroomsByCoordinates(options = {}) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  const limit = normalizeLimit(options.limit);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude and longitude must be finite numbers.");
  }

  const dataset = await fetchDatasetCsv(options);
  const allItems = normalizePublicRestroomRows(dataset.csvText, { latitude, longitude }, {
    maxDistanceMeters: options.maxDistanceMeters,
    preferredDistrict: options.preferredDistrict
  });

  return {
    anchor: {
      name: options.anchorName || "입력 좌표",
      address: options.anchorAddress || null,
      latitude,
      longitude
    },
    items: allItems.slice(0, limit),
    meta: {
      total: allItems.length,
      limit,
      datasetUrl: dataset.datasetUrl,
      region: options.region || null
    }
  };
}

async function searchNearbyPublicRestroomsByLocationQuery(locationQuery, options = {}) {
  const coordinateQuery = parseCoordinateQuery(locationQuery);

  if (coordinateQuery) {
    return searchNearbyPublicRestroomsByCoordinates({
      ...options,
      ...coordinateQuery,
      anchorName: String(locationQuery || "").trim()
    });
  }

  const { anchor, candidates } = await resolveAnchor(locationQuery, options);
  const region = inferRegion(anchor.address);

  const result = await searchNearbyPublicRestroomsByCoordinates({
    ...options,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    orgCode: options.orgCode || region?.orgCode,
    region,
    preferredDistrict: options.preferredDistrict || extractDistrict(anchor.address),
    anchorName: anchor.name,
    anchorAddress: anchor.address
  });

  return {
    ...result,
    anchor,
    candidates,
    meta: {
      ...result.meta,
      region
    }
  };
}

module.exports = {
  buildDatasetDownloadUrl,
  inferRegion,
  normalizePublicRestroomRows,
  parseCoordinateQuery,
  searchNearbyPublicRestroomsByCoordinates,
  searchNearbyPublicRestroomsByLocationQuery
};
