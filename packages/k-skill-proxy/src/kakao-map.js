const KAKAO_LOCAL_API_BASE_URL = "https://dapi.kakao.com/v2/local";
const KAKAO_MOBILITY_API_BASE_URL = "https://apis-navi.kakaomobility.com/v1";

// Kakao Local category group codes (공식)
const KAKAO_CATEGORY_GROUP_CODES = new Set([
  "MT1", // 대형마트
  "CS2", // 편의점
  "PS3", // 어린이집, 유치원
  "SC4", // 학교
  "AC5", // 학원
  "PK6", // 주차장
  "OL7", // 주유소, 충전소
  "SW8", // 지하철역
  "BK9", // 은행
  "CT1", // 문화시설
  "AG2", // 중개업소
  "PO3", // 공공기관
  "AT4", // 관광명소
  "AD5", // 숙박
  "FD6", // 음식점
  "CE7", // 카페
  "HP8", // 병원
  "PM9"  // 약국
]);

const KAKAO_MOBILITY_PRIORITY = new Set(["RECOMMEND", "TIME", "DISTANCE"]);
const KAKAO_MOBILITY_CAR_FUEL = new Set(["GASOLINE", "DIESEL", "LPG"]);
const KAKAO_MOBILITY_ROAD_DETAILS = new Set(["true", "false"]);
const KAKAO_MOBILITY_AVOID = new Set(["ferries", "toll", "motorway", "schoolzone", "uturn"]);

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

function parseFloatOrNaN(value) {
  if (value === undefined || value === null || value === "") {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseBoundedPositiveInteger(value, { defaultValue, min, max, label }) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== String(value).trim()) {
    throw new Error(`Provide ${label} as a positive integer.`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`Provide ${label} between ${min} and ${max}.`);
  }
  return parsed;
}

function normalizeKakaoKeywordSearchQuery(query) {
  const q = trimOrNull(query.q ?? query.query);
  if (!q) {
    throw new Error("Provide query.");
  }

  const result = {
    query: q,
    size: parseBoundedPositiveInteger(query.size ?? query.limit, {
      defaultValue: 15,
      min: 1,
      max: 15,
      label: "size"
    }),
    page: parseBoundedPositiveInteger(query.page, {
      defaultValue: 1,
      min: 1,
      max: 45,
      label: "page"
    })
  };

  const xRaw = query.x ?? query.lng ?? query.longitude;
  const yRaw = query.y ?? query.lat ?? query.latitude;
  const hasX = xRaw !== undefined && xRaw !== null && xRaw !== "";
  const hasY = yRaw !== undefined && yRaw !== null && yRaw !== "";
  if (hasX !== hasY) {
    throw new Error("Provide both x (lng) and y (lat) for coordinate-centered search.");
  }
  if (hasX && hasY) {
    const x = parseFloatOrNaN(xRaw);
    const y = parseFloatOrNaN(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("Provide x and y as numeric coordinates.");
    }
    if (x < -180 || x > 180 || y < -90 || y > 90) {
      throw new Error("Provide valid x and y coordinates.");
    }
    result.x = String(x);
    result.y = String(y);
  }

  const radius = query.radius;
  if (radius !== undefined && radius !== null && radius !== "") {
    if (!result.x || !result.y) {
      throw new Error("Provide both x (lng) and y (lat) when using radius.");
    }
    result.radius = parseBoundedPositiveInteger(radius, {
      defaultValue: undefined,
      min: 0,
      max: 20000,
      label: "radius"
    });
    if (result.radius === undefined) {
      delete result.radius;
    }
  }

  const categoryGroupCode = trimOrNull(query.category_group_code ?? query.categoryGroupCode);
  if (categoryGroupCode) {
    if (!KAKAO_CATEGORY_GROUP_CODES.has(categoryGroupCode)) {
      throw new Error(`Provide category_group_code from documented Kakao Local codes.`);
    }
    result.category_group_code = categoryGroupCode;
  }

  const sort = trimOrNull(query.sort);
  if (sort) {
    if (sort !== "distance" && sort !== "accuracy") {
      throw new Error("Provide sort as 'distance' or 'accuracy'.");
    }
    if (sort === "distance" && (!result.x || !result.y)) {
      throw new Error("Provide both x (lng) and y (lat) when using sort=distance.");
    }
    result.sort = sort;
  }

  return result;
}

function normalizeKakaoCategorySearchQuery(query) {
  const categoryGroupCode = trimOrNull(query.category_group_code ?? query.categoryGroupCode);
  if (!categoryGroupCode || !KAKAO_CATEGORY_GROUP_CODES.has(categoryGroupCode)) {
    throw new Error("Provide category_group_code from documented Kakao Local codes.");
  }

  const xRaw = query.x ?? query.lng ?? query.longitude;
  const yRaw = query.y ?? query.lat ?? query.latitude;
  if (xRaw === undefined || yRaw === undefined || xRaw === "" || yRaw === "") {
    throw new Error("Provide both x (lng) and y (lat).");
  }
  const x = parseFloatOrNaN(xRaw);
  const y = parseFloatOrNaN(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Provide x and y as numeric coordinates.");
  }
  if (x < -180 || x > 180 || y < -90 || y > 90) {
    throw new Error("Provide valid x and y coordinates.");
  }

  const result = {
    category_group_code: categoryGroupCode,
    x: String(x),
    y: String(y),
    radius: parseBoundedPositiveInteger(query.radius, {
      defaultValue: 500,
      min: 0,
      max: 20000,
      label: "radius"
    }),
    page: parseBoundedPositiveInteger(query.page, {
      defaultValue: 1,
      min: 1,
      max: 45,
      label: "page"
    }),
    size: parseBoundedPositiveInteger(query.size ?? query.limit, {
      defaultValue: 15,
      min: 1,
      max: 15,
      label: "size"
    })
  };

  const sort = trimOrNull(query.sort);
  if (sort) {
    if (sort !== "distance" && sort !== "accuracy") {
      throw new Error("Provide sort as 'distance' or 'accuracy'.");
    }
    result.sort = sort;
  }

  return result;
}

function normalizeKakaoCoordToAddressQuery(query) {
  const xRaw = query.x ?? query.lng ?? query.longitude;
  const yRaw = query.y ?? query.lat ?? query.latitude;
  if (xRaw === undefined || yRaw === undefined || xRaw === "" || yRaw === "") {
    throw new Error("Provide both x (lng) and y (lat).");
  }
  const x = parseFloatOrNaN(xRaw);
  const y = parseFloatOrNaN(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Provide x and y as numeric coordinates.");
  }
  if (x < -180 || x > 180 || y < -90 || y > 90) {
    throw new Error("Provide valid x and y coordinates.");
  }
  const result = { x: String(x), y: String(y) };
  const inputCoord = trimOrNull(query.input_coord ?? query.inputCoord);
  if (inputCoord) {
    if (!["WGS84", "WCONGNAMUL", "CONGNAMUL", "WTM", "TM"].includes(inputCoord)) {
      throw new Error("Provide input_coord as one of WGS84, WCONGNAMUL, CONGNAMUL, WTM, TM.");
    }
    result.input_coord = inputCoord;
  }
  return result;
}

function normalizeKakaoMobilityDirectionsQuery(query) {
  const originRaw = trimOrNull(query.origin);
  const destinationRaw = trimOrNull(query.destination);
  if (!originRaw || !destinationRaw) {
    throw new Error("Provide origin and destination as 'x,y'.");
  }
  for (const [label, value] of [["origin", originRaw], ["destination", destinationRaw]]) {
    const parts = value.split(",").map((p) => p.trim());
    if (parts.length !== 2) {
      throw new Error(`Provide ${label} as 'x,y'.`);
    }
    const x = parseFloatOrNaN(parts[0]);
    const y = parseFloatOrNaN(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Provide ${label} as numeric 'x,y'.`);
    }
    if (x < -180 || x > 180 || y < -90 || y > 90) {
      throw new Error(`Provide valid ${label} coordinates.`);
    }
  }

  const rawWaypoints = query.waypoints ?? query.waypoint;
  let waypoints = null;
  if (rawWaypoints !== undefined && rawWaypoints !== null && rawWaypoints !== "") {
    const entries = Array.isArray(rawWaypoints) ? rawWaypoints : String(rawWaypoints).split("|");
    if (entries.length > 5) {
      throw new Error("Provide at most 5 waypoints.");
    }
    for (const [index, entry] of entries.entries()) {
      const parts = entry.split(",").map((p) => p.trim());
      if (parts.length !== 2) {
        throw new Error(`Provide waypoint[${index}] as numeric 'x,y'.`);
      }
      const x = parseFloatOrNaN(parts[0]);
      const y = parseFloatOrNaN(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Provide waypoint[${index}] as numeric 'x,y'.`);
      }
      if (x < -180 || x > 180 || y < -90 || y > 90) {
        throw new Error(`Provide valid waypoint[${index}] coordinates.`);
      }
    }
    waypoints = entries.join("|");
  }

  const priority = (trimOrNull(query.priority) || "RECOMMEND").toUpperCase();
  if (!KAKAO_MOBILITY_PRIORITY.has(priority)) {
    throw new Error(`Provide priority as one of ${[...KAKAO_MOBILITY_PRIORITY].join(", ")}.`);
  }

  const carFuelRaw = trimOrNull(query.car_fuel ?? query.carFuel);
  let carFuel = null;
  if (carFuelRaw) {
    const upper = carFuelRaw.toUpperCase();
    if (!KAKAO_MOBILITY_CAR_FUEL.has(upper)) {
      throw new Error(`Provide car_fuel as one of ${[...KAKAO_MOBILITY_CAR_FUEL].join(", ")}.`);
    }
    carFuel = upper;
  }

  const carHipassRaw = trimOrNull(query.car_hipass ?? query.carHipass);
  let carHipass = null;
  if (carHipassRaw) {
    const lower = carHipassRaw.toLowerCase();
    if (!KAKAO_MOBILITY_ROAD_DETAILS.has(lower)) {
      throw new Error("Provide car_hipass as 'true' or 'false'.");
    }
    carHipass = lower === "true";
  }

  const alternativesRaw = trimOrNull(query.alternatives);
  let alternatives = null;
  if (alternativesRaw) {
    const lower = alternativesRaw.toLowerCase();
    if (!KAKAO_MOBILITY_ROAD_DETAILS.has(lower)) {
      throw new Error("Provide alternatives as 'true' or 'false'.");
    }
    alternatives = lower === "true";
  }

  const avoidRaw = trimOrNull(query.avoid);
  let avoid = null;
  if (avoidRaw) {
    const values = avoidRaw.split("|").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (values.length === 0 || values.some((entry) => !KAKAO_MOBILITY_AVOID.has(entry))) {
      throw new Error(`Provide avoid as pipe-separated values from ${[...KAKAO_MOBILITY_AVOID].join(", ")}.`);
    }
    avoid = values.join("|");
  }

  return {
    origin: originRaw,
    destination: destinationRaw,
    waypoints,
    priority,
    car_fuel: carFuel,
    car_hipass: carHipass,
    alternatives,
    avoid
  };
}

async function fetchKakaoLocalEndpoint({
  endpoint,
  params = {},
  apiKey,
  fetchImpl = global.fetch
}) {
  const paths = {
    keyword: "search/keyword.json",
    category: "search/category.json",
    address: "search/address.json",
    coord2address: "geo/coord2address.json",
    coord2region: "geo/coord2regioncode.json"
  };
  const path = paths[endpoint];
  if (!path) {
    const error = new Error("That Kakao Local endpoint is not exposed by this proxy.");
    error.code = "not_found";
    error.statusCode = 404;
    throw error;
  }

  if (!apiKey) {
    const error = new Error("KAKAO_REST_API_KEY is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(`${KAKAO_LOCAL_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "" || key === "apiKey") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        authorization: `KakaoAK ${apiKey}`,
        "user-agent": "k-skill-proxy/kakao-map"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (fetchError) {
    const error = new Error("Failed to reach Kakao Local upstream.");
    error.code = "upstream_error";
    error.statusCode = 502;
    error.cause = fetchError;
    throw error;
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("Kakao Local upstream returned an error.");
    error.code = "upstream_error";
    error.statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
    error.upstreamStatusCode = response.status;
    error.upstreamBodySnippet = text.slice(0, 200);
    throw error;
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    const error = new Error("Kakao Local upstream returned non-JSON.");
    error.code = "upstream_parse_error";
    error.statusCode = 502;
    error.cause = parseError;
    throw error;
  }

  return { statusCode: response.status, contentType, body };
}

async function fetchKakaoMobilityDirections({
  origin,
  destination,
  waypoints,
  priority,
  car_fuel,
  car_hipass,
  alternatives,
  avoid,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    const error = new Error("KAKAO_REST_API_KEY is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(`${KAKAO_MOBILITY_API_BASE_URL}/directions`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  if (waypoints) {
    url.searchParams.set("waypoints", waypoints);
  }
  url.searchParams.set("priority", priority);
  if (car_fuel !== null && car_fuel !== undefined) {
    url.searchParams.set("car_fuel", car_fuel);
  }
  if (car_hipass !== null && car_hipass !== undefined) {
    url.searchParams.set("car_hipass", String(car_hipass));
  }
  if (alternatives !== null && alternatives !== undefined) {
    url.searchParams.set("alternatives", String(alternatives));
  }
  if (avoid) {
    url.searchParams.set("avoid", avoid);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        authorization: `KakaoAK ${apiKey}`,
        accept: "application/json",
        "user-agent": "k-skill-proxy/kakao-mobility"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (fetchError) {
    const error = new Error("Failed to reach Kakao Mobility directions upstream.");
    error.code = "upstream_error";
    error.statusCode = 502;
    error.cause = fetchError;
    throw error;
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

  if (response.status < 200 || response.status >= 300) {
    const error = new Error("Kakao Mobility directions upstream returned an error.");
    error.code = "upstream_error";
    error.statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
    error.upstreamStatusCode = response.status;
    error.upstreamBodySnippet = text.slice(0, 200);
    throw error;
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (parseError) {
    const error = new Error("Kakao Mobility directions upstream returned non-JSON.");
    error.code = "upstream_parse_error";
    error.statusCode = 502;
    error.cause = parseError;
    throw error;
  }

  // Kakao Mobility returns routes[].result_code !== 0 for semantic failures.
  if (body && Array.isArray(body.routes) && body.routes.length > 0) {
    const firstRoute = body.routes[0];
    const code = firstRoute && firstRoute.result_code;
    if (typeof code === "number" && code !== 0) {
      const error = new Error(firstRoute.result_msg || `Kakao Mobility reported result_code ${code}.`);
      error.code = "upstream_semantic_error";
      error.statusCode = 502;
      error.upstreamStatusCode = response.status;
      error.upstreamCode = code;
      throw error;
    }
  }

  return { statusCode: response.status, contentType, body };
}

module.exports = {
  KAKAO_LOCAL_API_BASE_URL,
  KAKAO_MOBILITY_API_BASE_URL,
  KAKAO_CATEGORY_GROUP_CODES,
  KAKAO_MOBILITY_PRIORITY,
  KAKAO_MOBILITY_CAR_FUEL,
  KAKAO_MOBILITY_AVOID,
  fetchKakaoLocalEndpoint,
  fetchKakaoMobilityDirections,
  normalizeKakaoKeywordSearchQuery,
  normalizeKakaoCategorySearchQuery,
  normalizeKakaoCoordToAddressQuery,
  normalizeKakaoMobilityDirectionsQuery
};
