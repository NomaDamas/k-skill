const crypto = require("node:crypto");
const Fastify = require("fastify");
const { fetchFineDustReport } = require("./airkorea");
const DATA_GO_KR_UPSTREAM_BASE_URL = "http://apis.data.go.kr";
const SEOUL_OPEN_API_BASE_URL = "http://swopenapi.seoul.go.kr";
const KMA_FORECAST_BASE_TIMES = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KMA_FORECAST_READY_MINUTE = 10;
const ALLOWED_AIRKOREA_ROUTES = new Map([
  ["MsrstnInfoInqireSvc", new Set(["getMsrstnList", "getNearbyMsrstnList", "getTMStdrCrdnt"])],
  ["ArpltnInforInqireSvc", new Set(["getMsrstnAcctoRltmMesureDnsty", "getCtprvnRltmMesureDnsty"])],
  ["UserSportSvc", new Set(["getSvckeyDalyStats"])],
]);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

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

function padNumber(value, length) {
  return String(value).padStart(length, "0");
}

function formatKstDate(date) {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);
  return `${padNumber(kstDate.getUTCFullYear(), 4)}${padNumber(kstDate.getUTCMonth() + 1, 2)}${padNumber(kstDate.getUTCDate(), 2)}`;
}

function resolveLatestKmaForecastBase(now = new Date()) {
  const kstDate = new Date(now.getTime() + KST_OFFSET_MS);
  const currentMinutes = (kstDate.getUTCHours() * 60) + kstDate.getUTCMinutes();

  for (let index = KMA_FORECAST_BASE_TIMES.length - 1; index >= 0; index -= 1) {
    const baseTime = KMA_FORECAST_BASE_TIMES[index];
    const baseHour = Number.parseInt(baseTime.slice(0, 2), 10);
    const baseMinute = Number.parseInt(baseTime.slice(2, 4), 10);
    const readyMinutes = (baseHour * 60) + baseMinute + KMA_FORECAST_READY_MINUTE;

    if (currentMinutes >= readyMinutes) {
      return {
        baseDate: formatKstDate(now),
        baseTime
      };
    }
  }

  return {
    baseDate: formatKstDate(new Date(now.getTime() - (24 * 60 * 60 * 1000))),
    baseTime: KMA_FORECAST_BASE_TIMES[KMA_FORECAST_BASE_TIMES.length - 1]
  };
}

function convertLatLonToKmaGrid(latitude, longitude) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan((Math.PI * 0.25) + (slat2 * 0.5)) / Math.tan((Math.PI * 0.25) + (slat1 * 0.5));
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan((Math.PI * 0.25) + (slat1 * 0.5));
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;

  let ro = Math.tan((Math.PI * 0.25) + (olat * 0.5));
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan((Math.PI * 0.25) + ((latitude * DEGRAD) * 0.5));
  ra = (re * sf) / Math.pow(ra, sn);

  let theta = (longitude * DEGRAD) - olon;
  if (theta > Math.PI) {
    theta -= 2.0 * Math.PI;
  }
  if (theta < -Math.PI) {
    theta += 2.0 * Math.PI;
  }
  theta *= sn;

  return {
    nx: Math.floor((ra * Math.sin(theta)) + XO + 0.5),
    ny: Math.floor(ro - (ra * Math.cos(theta)) + YO + 0.5)
  };
}

function buildConfig(env = process.env) {
  return {
    host: env.KSKILL_PROXY_HOST || "127.0.0.1",
    port: parseInteger(env.KSKILL_PROXY_PORT, 4020),
    proxyName: env.KSKILL_PROXY_NAME || "k-skill-proxy",
    airKoreaApiKey: trimOrNull(env.AIR_KOREA_OPEN_API_KEY),
    kmaOpenApiKey: trimOrNull(env.KMA_OPEN_API_KEY),
    seoulOpenApiKey: trimOrNull(env.SEOUL_OPEN_API_KEY),
    cacheTtlMs: parseInteger(env.KSKILL_PROXY_CACHE_TTL_MS, 300000),
    rateLimitWindowMs: parseInteger(env.KSKILL_PROXY_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMax: parseInteger(env.KSKILL_PROXY_RATE_LIMIT_MAX, 60)
  };
}

function makeCacheKey(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function createMemoryCache() {
  const entries = new Map();

  return {
    get(key) {
      const cached = entries.get(key);
      if (!cached) {
        return null;
      }

      if (cached.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }

      return cached.value;
    },
    set(key, value, ttlMs) {
      entries.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
    }
  };
}

function buildRateLimiter(config) {
  const state = new Map();

  return function rateLimit(request, reply) {
    const key = trimOrNull(request.headers["cf-connecting-ip"]) || request.ip || "unknown";
    const now = Date.now();
    const current = state.get(key);

    if (!current || current.resetAt <= now) {
      state.set(key, {
        count: 1,
        resetAt: now + config.rateLimitWindowMs
      });
      return true;
    }

    if (current.count >= config.rateLimitMax) {
      reply.code(429).send({
        error: "rate_limited",
        message: "Too many requests.",
        retry_after_ms: current.resetAt - now
      });
      return false;
    }

    current.count += 1;
    return true;
  };
}

function normalizeFineDustQuery(query) {
  const regionHint = trimOrNull(query.regionHint ?? query.region_hint);
  const stationName = trimOrNull(query.stationName ?? query.station_name);

  if (!regionHint && !stationName) {
    throw new Error("Provide regionHint or stationName.");
  }

  return {
    regionHint,
    stationName
  };
}

function normalizeSeoulSubwayQuery(query) {
  const stationName = trimOrNull(query.stationName ?? query.station_name ?? query.station);
  if (!stationName) {
    throw new Error("Provide stationName.");
  }

  const startIndex = parseInteger(query.startIndex ?? query.start_index, 0);
  const endIndex = parseInteger(query.endIndex ?? query.end_index, 8);

  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error("Provide valid startIndex and endIndex.");
  }

  return {
    stationName,
    startIndex,
    endIndex
  };
}

function normalizeKmaForecastQuery(query, now = new Date()) {
  const rawNx = parseInteger(query.nx, Number.NaN);
  const rawNy = parseInteger(query.ny, Number.NaN);
  const latitude = parseFloatValue(query.lat ?? query.latitude);
  const longitude = parseFloatValue(query.lon ?? query.longitude ?? query.lng);
  const hasGrid = Number.isFinite(rawNx) && Number.isFinite(rawNy);
  const hasLatLon = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!hasGrid && !hasLatLon) {
    throw new Error("Provide nx/ny or lat/lon.");
  }

  if ((Number.isFinite(rawNx) && !Number.isFinite(rawNy)) || (!Number.isFinite(rawNx) && Number.isFinite(rawNy))) {
    throw new Error("Provide both nx and ny.");
  }

  if ((Number.isFinite(latitude) && !Number.isFinite(longitude)) || (!Number.isFinite(latitude) && Number.isFinite(longitude))) {
    throw new Error("Provide both lat and lon.");
  }

  if (hasLatLon && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
    throw new Error("Provide valid lat and lon.");
  }

  const pageNo = parseInteger(query.pageNo ?? query.page_no, 1);
  const numOfRows = parseInteger(query.numOfRows ?? query.num_of_rows, 1000);
  const dataType = trimOrNull(query.dataType ?? query.data_type)?.toUpperCase() || "JSON";
  const rawBaseDate = trimOrNull(query.baseDate ?? query.base_date);
  const rawBaseTime = trimOrNull(query.baseTime ?? query.base_time);

  if ((rawBaseDate && !rawBaseTime) || (!rawBaseDate && rawBaseTime)) {
    throw new Error("Provide both baseDate and baseTime.");
  }

  if (pageNo < 1 || numOfRows < 1) {
    throw new Error("Provide valid pageNo and numOfRows.");
  }

  if (!["JSON", "XML"].includes(dataType)) {
    throw new Error("Provide dataType as JSON or XML.");
  }

  const { baseDate, baseTime } = rawBaseDate && rawBaseTime
    ? {
        baseDate: rawBaseDate,
        baseTime: rawBaseTime
      }
    : resolveLatestKmaForecastBase(now);

  if (!/^\d{8}$/.test(baseDate) || !/^\d{4}$/.test(baseTime)) {
    throw new Error("Provide baseDate as YYYYMMDD and baseTime as HHMM.");
  }

  const grid = hasGrid ? { nx: rawNx, ny: rawNy } : convertLatLonToKmaGrid(latitude, longitude);

  if (!Number.isFinite(grid.nx) || !Number.isFinite(grid.ny)) {
    throw new Error(hasGrid ? "Provide valid nx and ny." : "Provide valid lat and lon.");
  }

  return {
    baseDate,
    baseTime,
    nx: grid.nx,
    ny: grid.ny,
    pageNo,
    numOfRows,
    dataType
  };
}

function isAllowedAirKoreaRoute(service, operation) {
  return ALLOWED_AIRKOREA_ROUTES.get(service)?.has(operation) || false;
}

async function proxyAirKoreaRequest({ service, operation, query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "AIR_KOREA_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  if (!isAllowedAirKoreaRoute(service, operation)) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That AirKorea route is not exposed by this proxy."
      })
    };
  }

  const url = new URL(`${DATA_GO_KR_UPSTREAM_BASE_URL}/B552584/${service}/${operation}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "" || key === "serviceKey") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("serviceKey", serviceKey);

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxySeoulSubwayRequest({
  stationName,
  startIndex = 0,
  endIndex = 8,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "SEOUL_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  const encodedStationName = encodeURIComponent(stationName);
  const url = new URL(
    `${SEOUL_OPEN_API_BASE_URL}/api/subway/${apiKey}/json/realtimeStationArrival/${startIndex}/${endIndex}/${encodedStationName}`
  );

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxyKmaWeatherRequest({
  baseDate,
  baseTime,
  nx,
  ny,
  pageNo = 1,
  numOfRows = 1000,
  dataType = "JSON",
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KMA_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${DATA_GO_KR_UPSTREAM_BASE_URL}/1360000/VilageFcstInfoService_2.0/getVilageFcst`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("dataType", dataType);
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

function buildServer({ env = process.env, provider = null, now = () => new Date() } = {}) {
  const config = buildConfig(env);
  const cache = createMemoryCache();
  const rateLimit = buildRateLimiter(config);
  const app = Fastify({
    logger: true,
    disableRequestLogging: true
  });

  app.decorate("configValues", config);
  app.decorate("provider", provider || ((params) => fetchFineDustReport({
    ...params,
    serviceKey: config.airKoreaApiKey
  })));

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    if (!rateLimit(request, reply)) {
      return reply;
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: config.proxyName,
    port: config.port,
    upstreams: {
      airKoreaConfigured: Boolean(config.airKoreaApiKey),
      kmaOpenApiConfigured: Boolean(config.kmaOpenApiKey),
      seoulOpenApiConfigured: Boolean(config.seoulOpenApiKey)
    },
    auth: {
      tokenRequired: false
    },
    timestamp: new Date().toISOString()
  }));

  app.get("/B552584/:service/:operation", async (request, reply) => {
    const { service, operation } = request.params;
    const upstream = await proxyAirKoreaRequest({
      service,
      operation,
      query: request.query,
      serviceKey: config.airKoreaApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    return upstream.body;
  });

  app.get("/v1/fine-dust/report", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeFineDustQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey(normalized);
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.airKoreaApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "AIR_KOREA_OPEN_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const report = await app.provider(normalized);
    const payload = {
      ...report,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/seoul-subway/arrival", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeSeoulSubwayQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "seoul-subway-arrival",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxySeoulSubwayRequest({
      ...normalized,
      apiKey: config.seoulOpenApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/korea-weather/forecast", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeKmaForecastQuery(request.query || {}, now());
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "korea-weather-forecast",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxyKmaWeatherRequest({
      ...normalized,
      apiKey: config.kmaOpenApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.query = { ...normalized };
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const payload = {
      error: error.code || (statusCode >= 500 ? "proxy_error" : "request_error"),
      message: error.message
    };

    if (Array.isArray(error.candidateStations)) {
      payload.candidate_stations = error.candidateStations;
    }

    if (error.sidoName) {
      payload.sido_name = error.sidoName;
    }

    reply.code(statusCode).send(payload);
  });

  return app;
}

async function startServer() {
  const app = buildServer();
  const { host, port } = app.configValues;
  await app.listen({ host, port });
  return app;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildConfig,
  buildServer,
  convertLatLonToKmaGrid,
  normalizeFineDustQuery,
  normalizeKmaForecastQuery,
  normalizeSeoulSubwayQuery,
  proxyAirKoreaRequest,
  proxyKmaWeatherRequest,
  proxySeoulSubwayRequest,
  resolveLatestKmaForecastBase,
  startServer
};
