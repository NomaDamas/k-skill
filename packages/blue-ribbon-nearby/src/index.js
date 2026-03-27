const {
  BASE_URL,
  buildBoundingBox,
  findZoneMatches,
  normalizeNearbyItem,
  parseZoneCatalogHtml
} = require("./parse");

const DEFAULT_BROWSER_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
};
const DEFAULT_JSON_HEADERS = {
  ...DEFAULT_BROWSER_HEADERS,
  accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
  "x-requested-with": "XMLHttpRequest"
};
const SEARCH_ZONE_URL = `${BASE_URL}/search/zone`;
const RESTAURANTS_MAP_URL = `${BASE_URL}/restaurants/map`;
const DEFAULT_DISTANCE_METERS = 1000;
const DEFAULT_RIBBON_TYPES = "RIBBON_THREE,RIBBON_TWO,RIBBON_ONE";

async function request(url, options = {}, responseType = "text") {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const headerSet = responseType === "json" ? DEFAULT_JSON_HEADERS : DEFAULT_BROWSER_HEADERS;
  const response = await fetchImpl(url, {
    headers: {
      ...headerSet,
      ...(options.headers || {})
    },
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Blue Ribbon request failed with ${response.status} for ${url}`);
  }

  return responseType === "json" ? response.json() : response.text();
}

async function fetchText(url, options = {}) {
  return request(url, options, "text");
}

async function fetchJson(url, options = {}) {
  return request(url, options, "json");
}

function assertDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new Error("distanceMeters must be a positive number.");
  }
}

function buildNearbySearchParams(options = {}) {
  const distanceMeters = Number(options.distanceMeters ?? DEFAULT_DISTANCE_METERS);
  const sort = options.sort || "distance";

  assertDistanceMeters(distanceMeters);

  const params = {
    distance: String(distanceMeters),
    isAround: "true",
    ribbon: "true",
    ribbonType: options.ribbonType || DEFAULT_RIBBON_TYPES,
    sort
  };

  if (options.zone) {
    params.zone1 = options.zone.zone1;
    params.zone2 = options.zone.zone2;
    params.zone2Lat = String(options.zone.latitude);
    params.zone2Lng = String(options.zone.longitude);
    return params;
  }

  if (Number.isFinite(options.latitude) && Number.isFinite(options.longitude)) {
    return {
      ...params,
      ...buildBoundingBox(Number(options.latitude), Number(options.longitude), distanceMeters)
    };
  }

  throw new Error("buildNearbySearchParams requires either a zone or explicit coordinates.");
}

async function fetchZoneCatalog(options = {}) {
  const html = await fetchText(SEARCH_ZONE_URL, options);
  return parseZoneCatalogHtml(html);
}

async function fetchNearbyMap(params, options = {}) {
  const url = new URL(RESTAURANTS_MAP_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return fetchJson(url.toString(), options);
}

function sortNearbyItems(items) {
  return [...items].sort((left, right) => {
    const leftDistance = left.distanceMeters ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distanceMeters ?? Number.POSITIVE_INFINITY;

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    if (right.ribbonCount !== left.ribbonCount) {
      return right.ribbonCount - left.ribbonCount;
    }

    return left.name.localeCompare(right.name, "ko");
  });
}

function isCertifiedRibbonItem(item) {
  return (
    item.ribbonCount > 0 &&
    typeof item.ribbonType === "string" &&
    item.ribbonType.startsWith("RIBBON_")
  );
}

function normalizeNearbyResults(payload, origin, limit) {
  return sortNearbyItems(
    (payload.items || [])
      .map((item) => normalizeNearbyItem(item, origin))
      .filter(isCertifiedRibbonItem),
  ).slice(0, limit);
}

async function searchNearbyByCoordinates(options) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  const distanceMeters = Number(options.distanceMeters ?? DEFAULT_DISTANCE_METERS);
  const limit = options.limit ?? 10;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude and longitude must be finite numbers.");
  }

  const params = buildNearbySearchParams({
    latitude,
    longitude,
    distanceMeters,
    sort: options.sort
  });
  const payload = await fetchNearbyMap(params, options);
  const items = normalizeNearbyResults(payload, { latitude, longitude }, limit);

  return {
    anchor: {
      latitude,
      longitude
    },
    items,
    meta: {
      total: Number(payload.total || items.length),
      capped: Boolean(payload.capped)
    }
  };
}

function parseCoordinateQuery(locationQuery) {
  const match = String(locationQuery || "")
    .trim()
    .match(
      /^(-?\d+(?:\.\d+)?)\s*[,/ ]\s*(-?\d+(?:\.\d+)?)$/,
    );

  if (!match) {
    return null;
  }

  return {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
}

async function searchNearbyByLocationQuery(locationQuery, options = {}) {
  const coordinateQuery = parseCoordinateQuery(locationQuery);
  if (coordinateQuery) {
    return searchNearbyByCoordinates({
      ...options,
      ...coordinateQuery
    });
  }

  const zones = await fetchZoneCatalog(options);
  const matches = findZoneMatches(locationQuery, zones, {
    limit: options.candidateLimit ?? 5
  });

  if (matches.length === 0) {
    throw new Error(
      "No official Blue Ribbon zone matched that location query. Ask the user for a nearby 동네, 역명, 랜드마크, or lat/lng.",
    );
  }

  const anchor = matches[0].zone;
  const distanceMeters = Number(options.distanceMeters ?? DEFAULT_DISTANCE_METERS);
  const limit = options.limit ?? 10;
  const params = buildNearbySearchParams({
    zone: anchor,
    distanceMeters,
    sort: options.sort
  });
  const payload = await fetchNearbyMap(params, options);
  const items = normalizeNearbyResults(
    payload,
    {
      latitude: anchor.latitude,
      longitude: anchor.longitude
    },
    limit,
  );

  return {
    anchor,
    candidates: matches,
    items,
    meta: {
      total: Number(payload.total || items.length),
      capped: Boolean(payload.capped)
    }
  };
}

module.exports = {
  BASE_URL,
  DEFAULT_DISTANCE_METERS,
  DEFAULT_RIBBON_TYPES,
  RESTAURANTS_MAP_URL,
  SEARCH_ZONE_URL,
  buildNearbySearchParams,
  fetchZoneCatalog,
  findZoneMatches,
  normalizeNearbyItem,
  parseZoneCatalogHtml,
  searchNearbyByCoordinates,
  searchNearbyByLocationQuery
};
