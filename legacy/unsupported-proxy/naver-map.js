const NAVER_MAP_DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving";
const NAVER_MAP_GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const NAVER_MAP_REVERSE_GEOCODE_URL = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc";

const ALLOWED_DRIVING_OPTIONS = new Set([
  "trafast",
  "tracomfort",
  "traoptimal",
  "traavoidtoll",
  "traavoidcaronly"
]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "replace-me") {
    return null;
  }
  return trimmed;
}

function parseFloatValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCoordPair(value, label) {
  const trimmed = trimOrNull(value);
  if (!trimmed) {
    throw new Error(`Provide ${label} as "lng,lat".`);
  }
  const parts = trimmed.split(",").map((part) => part.trim());
  if (parts.length !== 2) {
    throw new Error(`Provide ${label} as "lng,lat".`);
  }
  const lng = parseFloatValue(parts[0]);
  const lat = parseFloatValue(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`Provide ${label} as numeric "lng,lat".`);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Provide valid ${label} coordinates.`);
  }
  return `${lng},${lat}`;
}

function createNaverMapHttpError(serviceName, responseStatus, bodyText) {
  const error = new Error(`Naver Maps ${serviceName} upstream returned an error.`);
  error.code = "upstream_error";
  const isAuthError = responseStatus === 401 || responseStatus === 403;
  error.statusCode = isAuthError ? 503 : responseStatus === 429 ? 429 : 502;
  error.upstreamStatusCode = responseStatus;
  if (!isAuthError) {
    error.upstreamBodySnippet = bodyText.slice(0, 200);
  }
  return error;
}

function normalizeNaverMapDirectionsQuery(query) {
  const start = parseCoordPair(query.start ?? query.from ?? query.origin, "start");
  const goal = parseCoordPair(query.goal ?? query.to ?? query.destination, "goal");

  const rawWaypoints = query.waypoints ?? query.waypoint;
  let waypoints = null;
  if (rawWaypoints !== undefined && rawWaypoints !== null && rawWaypoints !== "") {
    const entries = Array.isArray(rawWaypoints) ? rawWaypoints : String(rawWaypoints).split("|");
    if (entries.length > 5) {
      throw new Error("Provide at most 5 waypoints.");
    }
    waypoints = entries.map((entry, index) => parseCoordPair(entry, `waypoint[${index}]`)).join("|");
  }

  const rawOption = trimOrNull(query.option);
  let option = "trafast";
  if (rawOption) {
    const candidate = rawOption.toLowerCase();
    if (!ALLOWED_DRIVING_OPTIONS.has(candidate)) {
      throw new Error(
        `Provide option as one of ${[...ALLOWED_DRIVING_OPTIONS].join(", ")}.`
      );
    }
    option = candidate;
  }

  const lang = trimOrNull(query.lang) || "ko";

  return { start, goal, waypoints, option, lang };
}

function normalizeNaverMapGeocodeQuery(query) {
  const q = trimOrNull(query.q ?? query.query);
  if (!q) {
    throw new Error("Provide query.");
  }

  const coordinate = trimOrNull(query.coordinate);
  if (coordinate) {
    // validate format only; pass through to upstream
    parseCoordPair(coordinate, "coordinate");
  }

  const filter = trimOrNull(query.filter);
  const language = trimOrNull(query.language) || "kor";

  const rawPage = trimOrNull(query.page);
  const page = rawPage ? Number.parseInt(rawPage, 10) : 1;
  if (!Number.isFinite(page) || page < 1 || page > 50) {
    throw new Error("Provide page between 1 and 50.");
  }

  const rawCount = trimOrNull(query.count);
  const count = rawCount ? Number.parseInt(rawCount, 10) : 10;
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    throw new Error("Provide count between 1 and 100.");
  }

  return { q, coordinate, filter, language, page, count };
}

function normalizeNaverMapReverseGeocodeQuery(query) {
  const coords = parseCoordPair(query.coords ?? query.coordinate ?? query.coord, "coords");

  const rawOrders = trimOrNull(query.orders);
  const orders = rawOrders || "roadaddr,addr";
  // basic allowlist guard
  const allowed = new Set(["roadaddr", "addr", "legalcode", "admcode"]);
  for (const order of orders.split(",")) {
    if (!allowed.has(order.trim())) {
      throw new Error(`Provide orders from ${[...allowed].join(", ")}.`);
    }
  }

  const output = trimOrNull(query.output) || "json";
  if (output !== "json") {
    throw new Error("Provide output as json. XML passthrough is not supported by this proxy.");
  }

  return { coords, orders, output };
}

async function fetchNaverMapDirections({
  start,
  goal,
  waypoints,
  option,
  lang,
  clientId,
  clientSecret,
  fetchImpl = global.fetch
}) {
  if (!clientId || !clientSecret) {
    const error = new Error("NAVER_MAP_CLIENT_ID or NAVER_MAP_CLIENT_SECRET is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(NAVER_MAP_DIRECTIONS_URL);
  url.searchParams.set("start", start);
  url.searchParams.set("goal", goal);
  if (waypoints) {
    url.searchParams.set("waypoints", waypoints);
  }
  url.searchParams.set("option", option);
  url.searchParams.set("lang", lang);

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
        accept: "application/json",
        "user-agent": "k-skill-proxy/naver-map"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (fetchError) {
    const error = new Error("Failed to reach Naver Maps directions upstream.");
    error.code = "upstream_error";
    error.statusCode = 502;
    error.cause = fetchError;
    throw error;
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

  if (response.status < 200 || response.status >= 300) {
    throw createNaverMapHttpError("directions", response.status, text);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    const error = new Error("Naver Maps directions upstream returned non-JSON.");
    error.code = "upstream_parse_error";
    error.statusCode = 502;
    error.cause = parseError;
    error.upstreamStatusCode = response.status;
    throw error;
  }

  // Naver returns code !== 0 inside 2xx for semantic failures.
  if (body && typeof body.code === "number" && body.code !== 0) {
    const error = new Error(body.message || "Naver Maps directions reported a semantic failure.");
    error.code = "upstream_semantic_error";
    error.statusCode = 502;
    error.upstreamStatusCode = response.status;
    error.upstreamCode = body.code;
    throw error;
  }

  return { statusCode: response.status, contentType, body };
}

async function fetchNaverMapGeocode({
  q,
  coordinate,
  filter,
  language,
  page,
  count,
  clientId,
  clientSecret,
  fetchImpl = global.fetch
}) {
  if (!clientId || !clientSecret) {
    const error = new Error("NAVER_MAP_CLIENT_ID or NAVER_MAP_CLIENT_SECRET is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(NAVER_MAP_GEOCODE_URL);
  url.searchParams.set("query", q);
  if (coordinate) {
    url.searchParams.set("coordinate", coordinate);
  }
  if (filter) {
    url.searchParams.set("filter", filter);
  }
  url.searchParams.set("language", language);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(count));

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
        accept: "application/json",
        "user-agent": "k-skill-proxy/naver-map"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (fetchError) {
    const error = new Error("Failed to reach Naver Maps geocode upstream.");
    error.code = "upstream_error";
    error.statusCode = 502;
    error.cause = fetchError;
    throw error;
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

  if (response.status < 200 || response.status >= 300) {
    throw createNaverMapHttpError("geocode", response.status, text);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    const error = new Error("Naver Maps geocode upstream returned non-JSON.");
    error.code = "upstream_parse_error";
    error.statusCode = 502;
    error.cause = parseError;
    throw error;
  }

  if (body && body.status && body.status !== "OK") {
    const error = new Error(body.errorMessage || `Naver Maps geocode reported status ${body.status}.`);
    error.code = "upstream_semantic_error";
    error.statusCode = 502;
    error.upstreamStatusCode = response.status;
    error.upstreamStatus = body.status;
    throw error;
  }

  return { statusCode: response.status, contentType, body };
}

async function fetchNaverMapReverseGeocode({
  coords,
  orders,
  output,
  clientId,
  clientSecret,
  fetchImpl = global.fetch
}) {
  if (!clientId || !clientSecret) {
    const error = new Error("NAVER_MAP_CLIENT_ID or NAVER_MAP_CLIENT_SECRET is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(NAVER_MAP_REVERSE_GEOCODE_URL);
  url.searchParams.set("coords", coords);
  url.searchParams.set("orders", orders);
  url.searchParams.set("output", output);

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
        accept: "application/json",
        "user-agent": "k-skill-proxy/naver-map"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (fetchError) {
    const error = new Error("Failed to reach Naver Maps reverse-geocode upstream.");
    error.code = "upstream_error";
    error.statusCode = 502;
    error.cause = fetchError;
    throw error;
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

  if (response.status < 200 || response.status >= 300) {
    throw createNaverMapHttpError("reverse-geocode", response.status, text);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    const error = new Error("Naver Maps reverse-geocode upstream returned non-JSON.");
    error.code = "upstream_parse_error";
    error.statusCode = 502;
    error.cause = parseError;
    throw error;
  }

  if (body && body.status && body.status.code !== undefined && body.status.code !== 0) {
    const error = new Error(body.status.message || `Naver Maps reverse-geocode reported code ${body.status.code}.`);
    error.code = "upstream_semantic_error";
    error.statusCode = 502;
    error.upstreamStatusCode = response.status;
    error.upstreamCode = body.status.code;
    throw error;
  }

  return { statusCode: response.status, contentType, body };
}

module.exports = {
  NAVER_MAP_DIRECTIONS_URL,
  NAVER_MAP_GEOCODE_URL,
  NAVER_MAP_REVERSE_GEOCODE_URL,
  ALLOWED_DRIVING_OPTIONS,
  fetchNaverMapDirections,
  fetchNaverMapGeocode,
  fetchNaverMapReverseGeocode,
  normalizeNaverMapDirectionsQuery,
  normalizeNaverMapGeocodeQuery,
  normalizeNaverMapReverseGeocodeQuery
};
