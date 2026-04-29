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
const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local";
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

function normalizeKakaoApiKey(options = {}) {
  return String(options.kakaoRestApiKey || process.env.KAKAO_REST_API_KEY || "").trim();
}

async function requestKakaoLocal(pathname, params, options = {}) {
  const apiKey = normalizeKakaoApiKey(options);
  if (!apiKey) {
    throw new Error("KAKAO_REST_API_KEY is required for Kakao Local supplemental restroom search.");
  }

  const url = new URL(`${KAKAO_LOCAL_BASE}${pathname}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return request(
    url.toString(),
    {
      ...options,
      headerSet: {
        accept: "application/json",
        Authorization: `KakaoAK ${apiKey}`
      }
    },
    "json"
  );
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function haversineDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusMeters = 6371008.8;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const originLatitude = toRadians(latitudeA);
  const targetLatitude = toRadians(latitudeB);

  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(targetLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function buildMapUrl(name, latitude, longitude) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${latitude},${longitude}`;
}

function normalizeKakaoCandidate(document, sourceType, origin) {
  const latitude = toNumber(document.y);
  const longitude = toNumber(document.x);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const name = String(document.place_name || document.address_name || "").trim();
  const roadAddress = String(document.road_address_name || "").trim() || null;
  const lotAddress = String(document.address_name || "").trim() || null;
  const address = roadAddress || lotAddress || null;

  return {
    id: `kakao:${sourceType}:${document.id || name}:${latitude}:${longitude}`,
    name: name || "이름없음",
    type: sourceType === "category-ol7" ? "주유소(OL7)" : "공중화장실",
    address,
    roadAddress,
    lotAddress,
    latitude,
    longitude,
    distanceMeters: haversineDistanceMeters(origin.latitude, origin.longitude, latitude, longitude),
    phone: String(document.phone || "").trim() || null,
    managementAgency: null,
    openTimeCategory: null,
    openTimeDetail: null,
    hasEmergencyBell: false,
    hasBabyChangingTable: false,
    hasAccessibleFacility: false,
    mapUrl: buildMapUrl(name || "지도", latitude, longitude),
    source: `kakao-${sourceType}`
  };
}

function mergeCandidates(csvItems, kakaoItems) {
  const merged = [...csvItems.map((item) => ({ ...item, source: "localdata-csv" }))];

  for (const candidate of kakaoItems) {
    const duplicate = merged.find((existing) => {
      const distance = haversineDistanceMeters(
        existing.latitude,
        existing.longitude,
        candidate.latitude,
        candidate.longitude
      );
      return distance <= 50;
    });

    if (!duplicate) {
      merged.push(candidate);
    }
  }

  return merged.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

async function fetchKakaoSupplemental(origin, options = {}) {
  if (!options.includeKakaoSupplemental) {
    return [];
  }

  const radius = Number(options.maxDistanceMeters) > 0
    ? Math.min(Math.floor(Number(options.maxDistanceMeters)), 20000)
    : 1000;

  const commonParams = {
    x: origin.longitude,
    y: origin.latitude,
    radius,
    sort: "distance",
    size: 15
  };

  const [publicResp, openResp, ol7Resp] = await Promise.all([
    requestKakaoLocal("/search/keyword.json", { ...commonParams, query: "공중화장실" }, options),
    requestKakaoLocal("/search/keyword.json", { ...commonParams, query: "개방화장실" }, options),
    requestKakaoLocal("/search/category.json", { ...commonParams, category_group_code: "OL7" }, options)
  ]);

  const docs = [
    ...(publicResp.documents || []).map((doc) => normalizeKakaoCandidate(doc, "keyword-public", origin)),
    ...(openResp.documents || []).map((doc) => normalizeKakaoCandidate(doc, "keyword-open", origin)),
    ...(ol7Resp.documents || []).map((doc) => normalizeKakaoCandidate(doc, "category-ol7", origin))
  ].filter(Boolean);

  return docs;
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
  const csvItems = normalizePublicRestroomRows(dataset.csvText, { latitude, longitude }, {
    maxDistanceMeters: options.maxDistanceMeters,
    preferredDistrict: options.preferredDistrict
  });

  const kakaoItems = await fetchKakaoSupplemental({ latitude, longitude }, options);
  const mergedItems = mergeCandidates(csvItems, kakaoItems);

  return {
    anchor: {
      name: options.anchorName || "입력 좌표",
      address: options.anchorAddress || null,
      latitude,
      longitude
    },
    items: mergedItems.slice(0, limit),
    meta: {
      total: mergedItems.length,
      limit,
      datasetUrl: dataset.datasetUrl,
      region: options.region || null,
      sources: {
        csv: csvItems.length,
        kakaoSupplemental: kakaoItems.length
      }
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
