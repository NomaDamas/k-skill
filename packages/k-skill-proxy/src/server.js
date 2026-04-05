const crypto = require("node:crypto");
const Fastify = require("fastify");
const { fetchFineDustReport } = require("./airkorea");
const { fetchWaterLevelReport } = require("./hrfco");
const AIR_KOREA_UPSTREAM_BASE_URL = "http://apis.data.go.kr";
const SEOUL_OPEN_API_BASE_URL = "http://swopenapi.seoul.go.kr";
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

function buildConfig(env = process.env) {
  return {
    host: env.KSKILL_PROXY_HOST || "127.0.0.1",
    port: parseInteger(env.KSKILL_PROXY_PORT, 4020),
    proxyName: env.KSKILL_PROXY_NAME || "k-skill-proxy",
    airKoreaApiKey: trimOrNull(env.AIR_KOREA_OPEN_API_KEY),
    seoulOpenApiKey: trimOrNull(env.SEOUL_OPEN_API_KEY),
    hrfcoApiKey: trimOrNull(env.HRFCO_OPEN_API_KEY),
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

function normalizeHanRiverWaterLevelQuery(query) {
  const stationName = trimOrNull(query.stationName ?? query.station_name ?? query.station);
  const stationCode = trimOrNull(query.stationCode ?? query.station_code ?? query.wlobscd);

  if (!stationName && !stationCode) {
    throw new Error("Provide stationName or stationCode.");
  }

  return {
    stationName,
    stationCode
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

  const url = new URL(`${AIR_KOREA_UPSTREAM_BASE_URL}/B552584/${service}/${operation}`);
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

async function proxyHrfcoWaterLevelRequest({
  stationName = null,
  stationCode = null,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "HRFCO_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  try {
    const report = await fetchWaterLevelReport({
      stationName,
      stationCode,
      serviceKey: apiKey,
      fetchImpl
    });

    return {
      statusCode: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(report)
    };
  } catch (error) {
    const payload = {
      error: error.code || "proxy_error",
      message: error.message
    };

    if (Array.isArray(error.candidateStations)) {
      payload.candidate_stations = error.candidateStations;
    }

    return {
      statusCode: error.statusCode && error.statusCode >= 400 ? error.statusCode : 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payload)
    };
  }
}

function buildServer({ env = process.env, provider = null } = {}) {
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
      seoulOpenApiConfigured: Boolean(config.seoulOpenApiKey),
      hrfcoConfigured: Boolean(config.hrfcoApiKey)
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

  app.get("/v1/han-river/water-level", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeHanRiverWaterLevelQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "han-river-water-level",
      stationName: normalized.stationName?.toLowerCase() || null,
      stationCode: normalized.stationCode || null
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

    const upstream = await proxyHrfcoWaterLevelRequest({
      ...normalized,
      apiKey: config.hrfcoApiKey
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
  normalizeFineDustQuery,
  normalizeHanRiverWaterLevelQuery,
  normalizeSeoulSubwayQuery,
  proxyAirKoreaRequest,
  proxyHrfcoWaterLevelRequest,
  proxySeoulSubwayRequest,
  startServer
};
