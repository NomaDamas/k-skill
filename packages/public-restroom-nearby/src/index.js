const {
  buildDatasetDownloadUrl,
  buildMapUrl,
  decodeDatasetBuffer,
  extractDistrict,
  inferRegion,
  haversineDistanceMeters,
  normalizeAnchorPanel,
  normalizePublicRestroomRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates
} = require("./parse");

const SEARCH_VIEW_URL = "https://m.map.kakao.com/actions/searchView";
const PLACE_PANEL_URL_BASE = "https://place-api.map.kakao.com/places/panel3";
const KAKAO_LOCAL_API_BASE = "https://dapi.kakao.com/v2/local";
const KAKAO_RESTROOM_KEYWORDS = ["공중화장실", "개방화장실"];
const KAKAO_GAS_STATION_CATEGORY = "OL7";
const SOURCE_CSV = "csv";
const SOURCE_KAKAO_KEYWORD = "kakao_keyword";
const SOURCE_KAKAO_GAS_STATION = "kakao_category_gas_station";
const SOURCE_KAKAO_COORD2ADDRESS = "kakao_coord2address";
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


function resolveKakaoRestApiKey(options = {}) {
  return (
    options.kakaoRestApiKey ||
    options.kakaoApiKey ||
    process.env.KAKAO_REST_API_KEY ||
    process.env.KAKAO_REST_APIKEY ||
    null
  );
}

function buildKakaoUrl(pathname, params = {}) {
  const url = new URL(`${KAKAO_LOCAL_API_BASE}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function fetchKakaoJson(pathname, params, options = {}) {
  const kakaoRestApiKey = resolveKakaoRestApiKey(options);

  if (!kakaoRestApiKey) {
    return null;
  }

  return request(
    buildKakaoUrl(pathname, params),
    {
      ...options,
      headers: {
        Authorization: `KakaoAK ${kakaoRestApiKey}`,
        ...(options.headers || {})
      }
    },
    "json",
  );
}

function normalizeRadius(radius) {
  const parsed = Number(radius ?? 1000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("radius must be a positive number.");
  }

  return Math.min(Math.round(parsed), 20000);
}

function normalizeKakaoSize(size) {
  const parsed = Number(size ?? 15);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("kakao size must be a positive number.");
  }

  return Math.min(Math.round(parsed), 15);
}

function normalizeKakaoPoi(document, origin, { source, sourceLayer, type }) {
  const latitude = Number(document?.y);
  const longitude = Number(document?.x);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const name = String(document.place_name || "").trim();

  if (!name) {
    return null;
  }

  const address = String(document.road_address_name || document.address_name || "").trim();

  return {
    id: `kakao:${document.id || source}:${latitude},${longitude}`,
    name,
    type,
    address,
    roadAddress: String(document.road_address_name || "").trim() || null,
    lotAddress: String(document.address_name || "").trim() || null,
    latitude,
    longitude,
    distanceMeters: haversineDistanceMeters(origin.latitude, origin.longitude, latitude, longitude),
    source,
    sourceLayer,
    category: String(document.category_name || "").trim() || null,
    phone: String(document.phone || "").trim() || null,
    managementAgency: null,
    openTimeCategory: null,
    openTimeDetail: source === SOURCE_KAKAO_GAS_STATION ? "주유소는 공중화장실법 시행령상 개방 의무 시설입니다." : null,
    hasEmergencyBell: false,
    hasBabyChangingTable: false,
    hasAccessibleFacility: false,
    mapUrl: buildMapUrl(name, latitude, longitude)
  };
}

async function fetchKakaoLayerItems(origin, options = {}) {
  const kakaoRestApiKey = resolveKakaoRestApiKey(options);

  if (!kakaoRestApiKey || options.includeKakaoSources === false) {
    return {
      items: [],
      errors: []
    };
  }

  const radius = normalizeRadius(options.radiusMeters ?? 1000);
  const size = normalizeKakaoSize(options.kakaoSize);
  const requests = [];

  for (const keyword of KAKAO_RESTROOM_KEYWORDS) {
    requests.push({
      source: SOURCE_KAKAO_KEYWORD,
      sourceLayer: 2,
      type: keyword,
      promise: fetchKakaoJson("/search/keyword.json", {
        query: keyword,
        x: origin.longitude,
        y: origin.latitude,
        radius,
        sort: "distance",
        size
      }, options)
    });
  }

  requests.push({
    source: SOURCE_KAKAO_GAS_STATION,
    sourceLayer: 3,
    type: "주유소 화장실",
    promise: fetchKakaoJson("/search/category.json", {
      category_group_code: KAKAO_GAS_STATION_CATEGORY,
      x: origin.longitude,
      y: origin.latitude,
      radius,
      sort: "distance",
      size
    }, options)
  });

  const settled = await Promise.allSettled(requests.map((layer) => layer.promise));
  const items = [];
  const errors = [];

  for (const [index, result] of settled.entries()) {
    const layer = requests[index];

    if (result.status === "rejected") {
      errors.push(normalizeKakaoLayerError(result.reason, layer));
      continue;
    }

    items.push(...(result.value?.documents || [])
      .map((document) => normalizeKakaoPoi(document, origin, layer))
      .filter(Boolean));
  }

  return {
    items,
    errors
  };
}

function normalizeKakaoLayerError(error, layer) {
  return {
    source: layer.source,
    type: layer.type,
    status: Number.isInteger(Number(error?.status)) ? Number(error.status) : null,
    message: String(error?.message || "Kakao layer request failed."),
    url: error?.url ? String(error.url) : null
  };
}

async function fetchKakaoCoord2Address(latitude, longitude, options = {}) {
  return fetchKakaoJson("/geo/coord2address.json", {
    x: longitude,
    y: latitude,
    input_coord: "WGS84"
  }, options);
}

function applyKakaoAddressCorrection(item, payload) {
  const firstDocument = payload?.documents?.[0];
  const roadAddress = firstDocument?.road_address;
  const lotAddress = firstDocument?.address;
  const buildingName = String(roadAddress?.building_name || "").trim();
  const correctedRoadAddress = String(roadAddress?.address_name || "").trim();
  const correctedLotAddress = String(lotAddress?.address_name || "").trim();
  const correctedAddress = correctedRoadAddress || correctedLotAddress;

  if (!buildingName && !correctedAddress) {
    return item;
  }

  const correctedName = buildingName || item.name;

  return {
    ...item,
    originalName: item.originalName || item.name,
    originalAddress: item.originalAddress || item.address,
    name: correctedName,
    address: correctedAddress || item.address,
    roadAddress: correctedRoadAddress || item.roadAddress,
    lotAddress: correctedLotAddress || item.lotAddress,
    mapUrl: buildMapUrl(correctedName, item.latitude, item.longitude)
  };
}

async function correctCsvItemsWithKakao(items, options = {}) {
  if (!resolveKakaoRestApiKey(options) || options.correctCsvWithKakao !== true) {
    return {
      items,
      errors: []
    };
  }

  const limit = Math.max(0, Math.min(Number(options.csvCorrectionLimit ?? options.limit) || 0, items.length));
  const corrected = [...items];
  const errors = [];

  for (let index = 0; index < limit; index += 1) {
    const item = corrected[index];

    try {
      const payload = await fetchKakaoCoord2Address(item.latitude, item.longitude, options);
      corrected[index] = applyKakaoAddressCorrection(item, payload);
    } catch (error) {
      errors.push(normalizeKakaoLayerError(error, {
        source: SOURCE_KAKAO_COORD2ADDRESS,
        type: "CSV address correction"
      }));
    }
  }

  return {
    items: corrected,
    errors
  };
}

function areSameFacility(left, right, thresholdMeters = 50) {
  return haversineDistanceMeters(left.latitude, left.longitude, right.latitude, right.longitude) <= thresholdMeters;
}

function mergeAndDeduplicateSources(sourceItems, options = {}) {
  const thresholdMeters = Number(options.deduplicateDistanceMeters ?? 50);
  const maxDistanceMeters = Number.isFinite(Number(options.maxDistanceMeters))
    ? Number(options.maxDistanceMeters)
    : null;
  const sortedForPriority = sourceItems
    .filter((item) => (maxDistanceMeters === null ? true : item.distanceMeters <= maxDistanceMeters))
    .sort((left, right) => {
      if (left.sourceLayer !== right.sourceLayer) {
        return left.sourceLayer - right.sourceLayer;
      }

      return left.distanceMeters - right.distanceMeters;
    });
  const kept = [];

  for (const item of sortedForPriority) {
    if (kept.some((candidate) => areSameFacility(candidate, item, thresholdMeters))) {
      continue;
    }

    kept.push(item);
  }

  return kept.sort((left, right) => {
    if (left.distanceMeters !== right.distanceMeters) {
      return left.distanceMeters - right.distanceMeters;
    }

    if (left.sourceLayer !== right.sourceLayer) {
      return left.sourceLayer - right.sourceLayer;
    }

    return left.name.localeCompare(right.name, "ko");
  });
}

function summarizeSources(items) {
  return {
    csv: items.filter((item) => item.source === SOURCE_CSV).length,
    kakaoKeyword: items.filter((item) => item.source === SOURCE_KAKAO_KEYWORD).length,
    kakaoGasStation: items.filter((item) => item.source === SOURCE_KAKAO_GAS_STATION).length
  };
}

async function searchNearbyPublicRestroomsByCoordinates(options = {}) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  const limit = normalizeLimit(options.limit);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude and longitude must be finite numbers.");
  }

  const origin = { latitude, longitude };
  const dataset = await fetchDatasetCsv(options);
  const csvResult = await correctCsvItemsWithKakao(normalizePublicRestroomRows(dataset.csvText, origin, {
    maxDistanceMeters: options.maxDistanceMeters,
    preferredDistrict: options.preferredDistrict
  }), {
    ...options,
    limit
  });
  const csvItems = csvResult.items;
  const kakaoResult = await fetchKakaoLayerItems(origin, options);
  const kakaoItems = kakaoResult.items;
  const allItems = mergeAndDeduplicateSources([...csvItems, ...kakaoItems], options);

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
      region: options.region || null,
      sources: summarizeSources(allItems),
      kakaoEnabled: Boolean(resolveKakaoRestApiKey(options)) && options.includeKakaoSources !== false,
      kakaoErrors: [...csvResult.errors, ...kakaoResult.errors]
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
