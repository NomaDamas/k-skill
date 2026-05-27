const {
  isValidLatitude,
  isValidLongitude,
  normalizeAnchorPanel,
  normalizeEmergencyRoomRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates
} = require("./parse");

const SEARCH_VIEW_URL = "https://m.map.kakao.com/actions/searchView";
const PLACE_PANEL_URL_BASE = "https://place-api.map.kakao.com/places/panel3";
const EGEN_EMERGENCY_ROOM_LIST_URL = "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do";
const EGEN_REFERER_URL = "https://www.e-gen.or.kr/egen/search_emergency_room.do";
const BED_COUNT_LIMITATION = "E-Gen nearby ER list exposes operation flags, not exact real-time remaining bed counts.";
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
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  origin: "https://www.e-gen.or.kr",
  referer: EGEN_REFERER_URL,
  "user-agent": DEFAULT_BROWSER_HEADERS["user-agent"],
  "x-requested-with": "XMLHttpRequest"
};

async function request(url, options = {}, responseType = "json") {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(url, {
    method: options.method,
    body: options.body,
    headers: {
      ...(options.headerSet || (responseType === "json" ? DEFAULT_JSON_HEADERS : DEFAULT_BROWSER_HEADERS)),
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

function normalizeBoundedInteger(value, defaultValue, label, min, max) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function normalizeCoordinate(value, label, isValid) {
  const parsed = Number(value);

  if (!isValid(parsed)) {
    throw new Error(`${label} must be between ${label === "latitude" ? "-90 and 90" : "-180 and 180"}.`);
  }

  return parsed;
}

function normalizeCoordinates(options = {}) {
  const latitude = Number(options.latitude ?? options.lat);
  const longitude = Number(options.longitude ?? options.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude and longitude must be finite numbers.");
  }

  return {
    latitude: normalizeCoordinate(latitude, "latitude", isValidLatitude),
    longitude: normalizeCoordinate(longitude, "longitude", isValidLongitude)
  };
}

function normalizeOrder(order) {
  const value = String(order || "distance").trim();

  if (!["distance", "accuracy"].includes(value)) {
    throw new Error("order must be one of: distance, accuracy.");
  }

  return value;
}

function normalizeEmergencyGradeCodes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean).join(",");
  }

  return String(value || "").trim();
}

function buildEmergencyRoomListRequest(options = {}) {
  const { latitude, longitude } = normalizeCoordinates(options);

  const radius = normalizeBoundedInteger(options.radius ?? options.maxDistanceKm, 3, "radius", 1, 50);
  const currentPageNum = normalizeBoundedInteger(options.currentPageNum ?? options.pageNo, 1, "currentPageNum", 1, 1000);
  const body = new URLSearchParams();
  body.set("lat", String(latitude));
  body.set("lon", String(longitude));
  body.set("emoggrdcStr", normalizeEmergencyGradeCodes(options.emergencyGradeCodes ?? options.emoggrdcStr));
  body.set("silson24", options.silson24 ? "Y" : "N");
  body.set("emogdesc", String(options.hospitalName || options.emogdesc || "").trim());
  body.set("radius", String(radius));
  body.set("order", normalizeOrder(options.order));
  body.set("currentPageNum", String(currentPageNum));

  return {
    url: options.apiBaseUrl || EGEN_EMERGENCY_ROOM_LIST_URL,
    method: "POST",
    body
  };
}

async function fetchEmergencyRoomList(options = {}) {
  const requestOptions = buildEmergencyRoomListRequest(options);

  return request(
    requestOptions.url,
    {
      ...options,
      method: requestOptions.method,
      body: requestOptions.body,
      headerSet: DEFAULT_JSON_HEADERS
    },
    "json",
  );
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
  return status === 404 || status === 410;
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

function buildMeta(payload, options, total) {
  const limit = normalizeBoundedInteger(options.limit, 5, "limit", 1, 50);
  const radius = normalizeBoundedInteger(options.radius ?? options.maxDistanceKm, 3, "radius", 1, 50);

  return {
    total,
    upstreamTotal: payload?.paging?.totalCount ?? null,
    limit,
    radius,
    source: "e-gen",
    sourceUrl: EGEN_REFERER_URL,
    dashboardUrl: "https://dw.nemc.or.kr/nemcMonitoring/mainmgr/Main.do",
    bedCountLimitation: BED_COUNT_LIMITATION
  };
}

async function searchNearbyEmergencyRoomsByCoordinates(options = {}) {
  const { latitude, longitude } = normalizeCoordinates(options);

  const limit = normalizeBoundedInteger(options.limit, 5, "limit", 1, 50);
  const payload = await fetchEmergencyRoomList({ ...options, latitude, longitude });
  const allItems = normalizeEmergencyRoomRows(payload, { latitude, longitude }, options);

  return {
    anchor: {
      name: options.anchorName || "입력 좌표",
      address: options.anchorAddress || null,
      latitude,
      longitude
    },
    items: allItems.slice(0, limit),
    meta: buildMeta(payload, { ...options, limit }, allItems.length)
  };
}

async function searchNearbyEmergencyRoomsByLocationQuery(locationQuery, options = {}) {
  const coordinateQuery = parseCoordinateQuery(locationQuery);

  if (coordinateQuery) {
    return searchNearbyEmergencyRoomsByCoordinates({
      ...options,
      ...coordinateQuery,
      anchorName: "입력 좌표"
    });
  }

  const { anchor, anchorCandidates } = await resolveAnchor(locationQuery, options);
  const result = await searchNearbyEmergencyRoomsByCoordinates({
    ...options,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    anchorName: anchor.name,
    anchorAddress: anchor.address
  });

  return {
    ...result,
    anchor,
    meta: {
      ...result.meta,
      anchorCandidates: anchorCandidates.length
    }
  };
}

module.exports = {
  BED_COUNT_LIMITATION,
  DEFAULT_JSON_HEADERS,
  EGEN_EMERGENCY_ROOM_LIST_URL,
  buildEmergencyRoomListRequest,
  fetchEmergencyRoomList,
  normalizeEmergencyRoomRows,
  parseCoordinateQuery,
  searchNearbyEmergencyRoomsByCoordinates,
  searchNearbyEmergencyRoomsByLocationQuery
};
