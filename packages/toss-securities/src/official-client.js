"use strict";

// Official Toss Securities Open API client (read-only).
//
// Source of truth: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
// (title "토스증권 Open API", version 1.0.3, server https://openapi.tossinvest.com).
//
// Security posture:
// - Credentials (client id/secret, account) are read from the user's environment
//   and sent directly to the official API. They are NEVER routed through any
//   shared proxy (k-skill-proxy is free-API-only).
// - client_secret and access tokens are redacted from thrown error messages.
// - This module is read-only: it implements GET endpoints plus the OAuth token
//   issuance required to call them. It deliberately exposes NO order mutation
//   (no place/modify/cancel order) functions.

const OFFICIAL_BASE_URL = "https://openapi.tossinvest.com";
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;

// Endpoint registry. `requiresAccount` marks the account/asset/order surfaces
// that additionally need the `X-Tossinvest-Account` header. Note `/api/v1/accounts`
// is bearer-only: it is the entry point used to discover the accountSeq.
const ENDPOINTS = Object.freeze({
  // Market data (bearer only)
  getOrderbook: { path: "/api/v1/orderbook", requiresAccount: false, rateLimitGroup: "MARKET_DATA" },
  getPrices: { path: "/api/v1/prices", requiresAccount: false, rateLimitGroup: "MARKET_DATA" },
  getTrades: { path: "/api/v1/trades", requiresAccount: false, rateLimitGroup: "MARKET_DATA" },
  getPriceLimits: { path: "/api/v1/price-limits", requiresAccount: false, rateLimitGroup: "MARKET_DATA" },
  getCandles: { path: "/api/v1/candles", requiresAccount: false, rateLimitGroup: "MARKET_DATA_CHART" },
  // Stock info (bearer only)
  getStocks: { path: "/api/v1/stocks", requiresAccount: false, rateLimitGroup: "STOCK" },
  getStockWarnings: { path: "/api/v1/stocks/{symbol}/warnings", requiresAccount: false, rateLimitGroup: "STOCK" },
  // Market info (bearer only)
  getExchangeRate: { path: "/api/v1/exchange-rate", requiresAccount: false, rateLimitGroup: "MARKET_INFO" },
  getMarketCalendarKR: { path: "/api/v1/market-calendar/KR", requiresAccount: false, rateLimitGroup: "MARKET_INFO" },
  getMarketCalendarUS: { path: "/api/v1/market-calendar/US", requiresAccount: false, rateLimitGroup: "MARKET_INFO" },
  // Account / asset
  listOfficialAccounts: { path: "/api/v1/accounts", requiresAccount: false, rateLimitGroup: "ACCOUNT" },
  getHoldings: { path: "/api/v1/holdings", requiresAccount: true, rateLimitGroup: "ASSET" },
  // Order history (read-only)
  listOpenOrders: { path: "/api/v1/orders", requiresAccount: true, rateLimitGroup: "ORDER_HISTORY" },
  getOrderDetail: { path: "/api/v1/orders/{orderId}", requiresAccount: true, rateLimitGroup: "ORDER_HISTORY" },
  // Order info (read-only)
  getBuyingPower: { path: "/api/v1/buying-power", requiresAccount: true, rateLimitGroup: "ORDER_INFO" },
  getSellableQuantity: { path: "/api/v1/sellable-quantity", requiresAccount: true, rateLimitGroup: "ORDER_INFO" },
  getCommissions: { path: "/api/v1/commissions", requiresAccount: true, rateLimitGroup: "ORDER_INFO" }
});

// Process-global token cache, keyed by `${clientId}::${baseUrl}`. By design the
// cache is shared across all callers in a single Node process; call
// `clearTokenCache()` to reset it (tests do this between cases).
const tokenCache = new Map();

class TossApiError extends Error {
  constructor({ code, message, requestId, httpStatus, data } = {}, secrets = []) {
    super(redact(`[${code}] ${message}`, secrets));
    this.name = "TossApiError";
    this.code = code;
    this.requestId = requestId || null;
    this.httpStatus = httpStatus;
    this.data = redactDeep(data ?? null, secrets);
  }
}

class TossCredentialsError extends Error {
  constructor(message) {
    super(message);
    this.name = "TossCredentialsError";
  }
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function redact(text, secrets = []) {
  let out = String(text);
  for (const secret of secrets) {
    if (secret) {
      out = out.split(String(secret)).join("[REDACTED]");
    }
  }
  return out;
}

function redactDeep(value, secrets = []) {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return JSON.parse(redact(JSON.stringify(value), secrets));
  } catch {
    return value;
  }
}

function resolveConfig(options = {}) {
  const env = options.env || process.env;
  const baseUrl = String(
    options.baseUrl ?? env.TOSSINVEST_API_BASE_URL ?? OFFICIAL_BASE_URL
  ).replace(/\/+$/u, "");

  return {
    clientId: options.clientId ?? env.TOSSINVEST_CLIENT_ID,
    clientSecret: options.clientSecret ?? env.TOSSINVEST_CLIENT_SECRET,
    account: options.account ?? env.TOSSINVEST_ACCOUNT,
    baseUrl,
    fetchImpl: options.fetch || globalThis.fetch,
    now: options.now || Date.now,
    sleep: options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    maxRetries: Number.isInteger(options.maxRetries) ? options.maxRetries : DEFAULT_MAX_RETRIES,
    backoffBaseMs: Number.isFinite(options.backoffBaseMs) ? options.backoffBaseMs : DEFAULT_BACKOFF_BASE_MS,
    jitter: typeof options.jitter === "function" ? options.jitter : Math.random
  };
}

function collectSecrets(cfg, token) {
  return [cfg && cfg.clientSecret, token].filter(Boolean);
}

function assertClientCredentials(cfg) {
  if (isBlank(cfg.clientId) || isBlank(cfg.clientSecret)) {
    throw new TossCredentialsError(
      "Toss official API credentials are missing. Set TOSSINVEST_CLIENT_ID and TOSSINVEST_CLIENT_SECRET (or pass clientId/clientSecret)."
    );
  }
}

function assertFetch(cfg) {
  if (typeof cfg.fetchImpl !== "function") {
    throw new Error("A fetch implementation is required (Node 18+ global fetch or options.fetch).");
  }
}

function tokenCacheKey(clientId, baseUrl) {
  return `${clientId}::${baseUrl}`;
}

function clearTokenCache() {
  tokenCache.clear();
}

async function readJson(response) {
  if (response && typeof response.json === "function") {
    try {
      return await response.json();
    } catch {
      // fall through to text parsing
    }
  }
  if (response && typeof response.text === "function") {
    try {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function headerValue(response, name) {
  const headers = response && response.headers;
  if (headers && typeof headers.get === "function") {
    return headers.get(name);
  }
  return null;
}

function readRateLimit(response) {
  const toNumber = (value) => (value === null || value === undefined || value === "" ? null : Number(value));
  return {
    limit: toNumber(headerValue(response, "x-ratelimit-limit")),
    remaining: toNumber(headerValue(response, "x-ratelimit-remaining")),
    reset: toNumber(headerValue(response, "x-ratelimit-reset"))
  };
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function applyPathParams(path, params) {
  if (!params) {
    return path;
  }
  return path.replace(/\{(\w+)\}/gu, (_match, key) => {
    const value = params[key];
    if (isBlank(value)) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
}

function normalizeSymbols(symbols) {
  const list = Array.isArray(symbols) ? symbols : String(symbols ?? "").split(",");
  const cleaned = list.map((symbol) => String(symbol).trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error("symbols is required (one or more).");
  }
  return cleaned.join(",");
}

function requireSymbol(symbol) {
  const value = String(symbol ?? "").trim();
  if (!value) {
    throw new Error("symbol is required.");
  }
  return value;
}

function buildAuthHeaders(token) {
  if (isBlank(token)) {
    throw new TossCredentialsError("An access token is required to build authorization headers.");
  }
  return { Authorization: `Bearer ${token}` };
}

function buildAccountHeaders(token, account) {
  const headers = buildAuthHeaders(token);
  if (isBlank(account)) {
    throw new TossCredentialsError(
      "X-Tossinvest-Account is required for account, asset, and order APIs. Set TOSSINVEST_ACCOUNT or pass options.account."
    );
  }
  headers["X-Tossinvest-Account"] = String(account);
  return headers;
}

async function issueAccessToken(options = {}) {
  const cfg = resolveConfig(options);
  assertClientCredentials(cfg);
  assertFetch(cfg);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const response = await cfg.fetchImpl(`${cfg.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: body.toString()
  });

  const payload = await readJson(response);

  if (!response.ok) {
    // The token endpoint uses the OAuth2 standard error shape, not the BFF envelope.
    throw new TossApiError(
      {
        code: (payload && payload.error) || `http-${response.status}`,
        message: (payload && payload.error_description) || "OAuth2 token request failed.",
        requestId: headerValue(response, "x-request-id"),
        httpStatus: response.status,
        data: null
      },
      collectSecrets(cfg)
    );
  }

  return {
    accessToken: payload && payload.access_token,
    tokenType: payload && payload.token_type,
    expiresIn: payload && payload.expires_in,
    raw: payload
  };
}

async function getAccessToken(options = {}) {
  const cfg = resolveConfig(options);
  assertClientCredentials(cfg);

  const key = tokenCacheKey(cfg.clientId, cfg.baseUrl);

  if (options.forceRefresh !== true) {
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > cfg.now()) {
      return cached.accessToken;
    }
  }

  const token = await issueAccessToken(options);
  if (isBlank(token.accessToken)) {
    throw new TossApiError(
      { code: "invalid-token-response", message: "Token endpoint did not return an access_token.", httpStatus: 200 },
      collectSecrets(cfg)
    );
  }

  const expiresInSeconds = Number(token.expiresIn);
  const ttlMs = Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 0;
  tokenCache.set(key, {
    accessToken: token.accessToken,
    expiresAt: cfg.now() + ttlMs - TOKEN_EXPIRY_SKEW_MS
  });

  return token.accessToken;
}

function buildApiError(response, payload, secrets) {
  const envelope = payload && payload.error;
  const code = (envelope && envelope.code) || `http-${response.status}`;
  const message =
    (envelope && envelope.message) || `Toss official API request failed with status ${response.status}.`;
  const requestId = (envelope && envelope.requestId) || headerValue(response, "x-request-id");
  const data = (envelope && envelope.data) || null;
  return new TossApiError({ code, message, requestId, httpStatus: response.status, data }, secrets);
}

function computeRetryDelayMs(response, cfg, attempt) {
  const retryAfter = Number(headerValue(response, "retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return retryAfter * 1000;
  }
  const reset = Number(headerValue(response, "x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset >= 0) {
    return reset * 1000;
  }
  const base = cfg.backoffBaseMs * 2 ** attempt;
  return base + Math.floor(cfg.jitter() * cfg.backoffBaseMs);
}

async function tossApiRequest(endpointKey, requestOptions = {}, options = {}) {
  const endpoint = ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(`Unknown Toss official endpoint: ${endpointKey}`);
  }

  const cfg = resolveConfig(options);
  assertClientCredentials(cfg);
  assertFetch(cfg);

  // Enforce the account-header requirement locally before any network call.
  if (endpoint.requiresAccount && isBlank(cfg.account)) {
    throw new TossCredentialsError(
      `${endpointKey} requires the X-Tossinvest-Account header. Set TOSSINVEST_ACCOUNT or pass options.account.`
    );
  }

  const path = applyPathParams(endpoint.path, requestOptions.pathParams);
  const url = buildUrl(cfg.baseUrl, path, requestOptions.query);

  let attempt = 0;
  let tokenRetried = false;

  for (;;) {
    const token = await getAccessToken(options);
    const headers = endpoint.requiresAccount
      ? buildAccountHeaders(token, cfg.account)
      : buildAuthHeaders(token);
    headers.Accept = "application/json";

    const response = await cfg.fetchImpl(url, { method: "GET", headers });
    const payload = await readJson(response);

    if (response.ok) {
      return {
        data: payload,
        rateLimit: readRateLimit(response),
        requestId: headerValue(response, "x-request-id") || (payload && payload.error && payload.error.requestId) || null,
        status: response.status
      };
    }

    // Expired/invalid token: clear the cache and re-issue exactly once.
    if (response.status === 401 && !tokenRetried) {
      tokenRetried = true;
      tokenCache.delete(tokenCacheKey(cfg.clientId, cfg.baseUrl));
      continue;
    }

    // Rate limited: honor Retry-After / reset, then exponential backoff + jitter.
    if (response.status === 429 && attempt < cfg.maxRetries) {
      const delayMs = computeRetryDelayMs(response, cfg, attempt);
      attempt += 1;
      await cfg.sleep(delayMs);
      continue;
    }

    throw buildApiError(response, payload, collectSecrets(cfg, token));
  }
}

// --- Read-only helpers (1:1 with GET endpoints) ---

// Market data (bearer only)
function getOrderbook(symbol, options = {}) {
  return tossApiRequest("getOrderbook", { query: { symbol: requireSymbol(symbol) } }, options);
}

function getPrices(symbols, options = {}) {
  return tossApiRequest("getPrices", { query: { symbols: normalizeSymbols(symbols) } }, options);
}

function getTrades(symbol, options = {}) {
  return tossApiRequest("getTrades", { query: { symbol: requireSymbol(symbol), count: options.count } }, options);
}

function getPriceLimits(symbol, options = {}) {
  return tossApiRequest("getPriceLimits", { query: { symbol: requireSymbol(symbol) } }, options);
}

function getCandles(symbol, options = {}) {
  if (isBlank(options.interval)) {
    throw new Error("interval is required for getCandles ('1m' or '1d').");
  }
  return tossApiRequest(
    "getCandles",
    {
      query: {
        symbol: requireSymbol(symbol),
        interval: options.interval,
        count: options.count,
        before: options.before,
        adjusted: options.adjusted
      }
    },
    options
  );
}

// Stock info (bearer only)
function getStocks(symbols, options = {}) {
  return tossApiRequest("getStocks", { query: { symbols: normalizeSymbols(symbols) } }, options);
}

function getStockWarnings(symbol, options = {}) {
  return tossApiRequest("getStockWarnings", { pathParams: { symbol: requireSymbol(symbol) } }, options);
}

// Market info (bearer only)
function getExchangeRate(options = {}) {
  return tossApiRequest(
    "getExchangeRate",
    { query: { from: options.from, to: options.to, dateTime: options.dateTime } },
    options
  );
}

function getMarketCalendarKR(options = {}) {
  return tossApiRequest("getMarketCalendarKR", { query: { date: options.date } }, options);
}

function getMarketCalendarUS(options = {}) {
  return tossApiRequest("getMarketCalendarUS", { query: { date: options.date } }, options);
}

// Account / asset
function listOfficialAccounts(options = {}) {
  return tossApiRequest("listOfficialAccounts", {}, options);
}

function getHoldings(options = {}) {
  return tossApiRequest("getHoldings", { query: { symbol: options.symbol } }, options);
}

// Order history (read-only)
function listOpenOrders(options = {}) {
  return tossApiRequest("listOpenOrders", { query: { status: options.status || "OPEN" } }, options);
}

function getOrderDetail(orderId, options = {}) {
  const id = String(orderId ?? "").trim();
  if (!id) {
    throw new Error("orderId is required.");
  }
  return tossApiRequest("getOrderDetail", { pathParams: { orderId: id } }, options);
}

// Order info (read-only)
function getBuyingPower(options = {}) {
  return tossApiRequest("getBuyingPower", { query: { currency: options.currency } }, options);
}

function getSellableQuantity(symbol, options = {}) {
  return tossApiRequest("getSellableQuantity", { query: { symbol: requireSymbol(symbol) } }, options);
}

function getCommissions(options = {}) {
  return tossApiRequest("getCommissions", {}, options);
}

module.exports = {
  OFFICIAL_BASE_URL,
  ENDPOINTS,
  TossApiError,
  TossCredentialsError,
  resolveConfig,
  clearTokenCache,
  issueAccessToken,
  getAccessToken,
  buildAuthHeaders,
  buildAccountHeaders,
  tossApiRequest,
  // read-only helpers
  getOrderbook,
  getPrices,
  getTrades,
  getPriceLimits,
  getCandles,
  getStocks,
  getStockWarnings,
  getExchangeRate,
  getMarketCalendarKR,
  getMarketCalendarUS,
  listOfficialAccounts,
  getHoldings,
  listOpenOrders,
  getOrderDetail,
  getBuyingPower,
  getSellableQuantity,
  getCommissions
};
