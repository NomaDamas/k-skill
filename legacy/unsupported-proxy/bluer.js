const BLUER_BASE_URL = "https://www.bluer.co.kr";
const RESTAURANTS_MAP_URL = `${BLUER_BASE_URL}/restaurants/map`;
const CSRF_SOURCE_URL = `${BLUER_BASE_URL}/search/zone`;

const BROWSER_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
};

const JSON_HEADERS = {
  ...BROWSER_HEADERS,
  accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
  "x-requested-with": "XMLHttpRequest"
};

const CSRF_META_PATTERN = /<meta\s+name="_csrf"\s+content="([^"]+)"/;

function generateApiToken(csrf) {
  const prefix = "k7x9m2";
  const suffix = "2m9x7k";
  const raw = `${prefix}${csrf.substring(0, 8)}:${Date.now()}:${suffix}`;
  return Buffer.from(raw).toString("base64");
}

async function fetchCsrfToken(sessionId, fetchImpl = global.fetch) {
  const response = await fetchImpl(CSRF_SOURCE_URL, {
    headers: {
      ...BROWSER_HEADERS,
      cookie: `JSESSIONID=${sessionId}`
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const error = new Error(`Failed to fetch CSRF token: HTTP ${response.status}`);
    error.code = "csrf_fetch_failed";
    error.statusCode = response.status;
    throw error;
  }

  const html = await response.text();
  const match = html.match(CSRF_META_PATTERN);

  if (!match) {
    const error = new Error(
      "CSRF token not found in page. The session may have expired — re-login and update BLUE_RIBBON_SESSION_ID."
    );
    error.code = "csrf_not_found";
    throw error;
  }

  return match[1];
}

function buildBoundingBox(latitude, longitude, distanceMeters) {
  const latDelta = distanceMeters / 111320;
  const lngDelta = distanceMeters / (111320 * Math.cos((latitude * Math.PI) / 180));

  return {
    latitude1: String(latitude - latDelta),
    latitude2: String(latitude + latDelta),
    longitude1: String(longitude - lngDelta),
    longitude2: String(longitude + lngDelta)
  };
}

async function proxyBlueRibbonNearbyRequest({
  latitude,
  longitude,
  distanceMeters = 1000,
  limit = 10,
  sessionId,
  fetchImpl = global.fetch
}) {
  const csrf = await fetchCsrfToken(sessionId, fetchImpl);
  const apiToken = generateApiToken(csrf);

  const url = new URL(RESTAURANTS_MAP_URL);
  const bbox = buildBoundingBox(latitude, longitude, distanceMeters);

  for (const [key, value] of Object.entries(bbox)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("distance", String(distanceMeters));
  url.searchParams.set("isAround", "true");
  url.searchParams.set("ribbon", "true");
  url.searchParams.set("ribbonType", "RIBBON_THREE,RIBBON_TWO,RIBBON_ONE");
  url.searchParams.set("sort", "distance");

  const response = await fetchImpl(url.toString(), {
    headers: {
      ...JSON_HEADERS,
      cookie: `JSESSIONID=${sessionId}`,
      "x-csrf-token": csrf,
      "x-api-token": apiToken
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    let payload = null;

    try {
      payload = await response.json();
    } catch {
      // ignore parse errors
    }

    if (response.status === 403 && payload?.error === "PREMIUM_REQUIRED") {
      const error = new Error(
        "Blue Ribbon session does not have premium access. Check BLUE_RIBBON_SESSION_ID."
      );
      error.code = "premium_required";
      error.statusCode = 403;
      throw error;
    }

    const error = new Error(`Blue Ribbon upstream returned HTTP ${response.status}`);
    error.code = "upstream_error";
    error.statusCode = response.status;
    throw error;
  }

  const payload = await response.json();
  const items = (payload.items || []).slice(0, limit);

  return {
    items,
    total: Number(payload.total || items.length),
    capped: Boolean(payload.capped)
  };
}

module.exports = {
  BLUER_BASE_URL,
  CSRF_SOURCE_URL,
  RESTAURANTS_MAP_URL,
  buildBoundingBox,
  fetchCsrfToken,
  generateApiToken,
  proxyBlueRibbonNearbyRequest
};
