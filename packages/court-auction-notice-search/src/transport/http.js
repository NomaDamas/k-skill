"use strict";

const DEFAULT_BASE_URL = "https://www.courtauction.go.kr";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const WARMUP_PATH =
  "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01";

const ENDPOINT_PATHS = Object.freeze({
  notices: "/pgj/pgj143/selectRletDspslPbanc.on",
  noticeDetail: "/pgj/pgj143/selectRletDspslPbancDtl.on",
  caseDetail: "/pgj/pgj15A/selectAuctnCsSrchRslt.on",
  courts: "/pgj/pgjComm/selectCortOfcCdLst.on"
});

const ENDPOINT_REFERER_HINT = Object.freeze({
  notices: "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01",
  noticeDetail:
    "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01",
  caseDetail:
    "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml&pgjId=159M00",
  courts: "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01"
});

function createBlockedError(message, payload) {
  const error = new Error(
    message ||
      "Court Auction site blocked this client (ipcheck=false). Wait at least 1 hour before retrying with the same IP."
  );
  error.code = "BLOCKED";
  error.upstreamUrl = "courtauction.go.kr";
  if (payload && typeof payload === "object") {
    error.upstreamPayload = payload;
    if (payload.message) error.upstreamMessage = payload.message;
  }
  return error;
}

function createUpstreamError(payload, endpointPath, statusCode) {
  const upstreamMessage =
    payload &&
    payload.errors &&
    typeof payload.errors === "object" &&
    payload.errors.errorMessage
      ? String(payload.errors.errorMessage)
      : "";

  const error = new Error(
    `Court Auction request failed for ${endpointPath}` +
      (upstreamMessage ? ` (${upstreamMessage})` : "")
  );
  error.code = "UPSTREAM_ERROR";
  error.statusCode = typeof statusCode === "number" ? statusCode : null;
  error.upstreamUrl = endpointPath;
  if (payload && typeof payload === "object") {
    error.upstreamPayload = payload;
    if (upstreamMessage) error.upstreamMessage = upstreamMessage;
  }
  return error;
}

function createNetworkError(cause, endpointPath) {
  const error = new Error(
    `Court Auction network error for ${endpointPath}: ${cause && cause.message ? cause.message : cause}`
  );
  error.code = "NETWORK_ERROR";
  error.upstreamUrl = endpointPath;
  if (cause) error.cause = cause;
  return error;
}

function buildCookieHeader(cookieJar) {
  const entries = [];
  for (const [key, value] of cookieJar) {
    entries.push(`${key}=${value}`);
  }
  return entries.join("; ");
}

function ingestSetCookie(cookieJar, headers) {
  if (!headers || typeof headers.getSetCookie !== "function") {
    const raw = headers && typeof headers.get === "function" ? headers.get("set-cookie") : null;
    if (!raw) return;
    parseAndStoreCookieLine(cookieJar, raw);
    return;
  }
  const lines = headers.getSetCookie() || [];
  for (const line of lines) {
    parseAndStoreCookieLine(cookieJar, line);
  }
}

function parseAndStoreCookieLine(cookieJar, line) {
  if (!line) return;
  const firstSegment = String(line).split(";")[0];
  const eqIndex = firstSegment.indexOf("=");
  if (eqIndex <= 0) return;
  const name = firstSegment.slice(0, eqIndex).trim();
  const value = firstSegment.slice(eqIndex + 1).trim();
  if (!name) return;
  cookieJar.set(name, value);
}

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(min, jitterMs) {
  const extra = Math.floor(Math.random() * Math.max(0, jitterMs));
  return Math.max(0, min) + extra;
}

class CourtAuctionHttpClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || global.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "CourtAuctionHttpClient requires a fetch implementation. Pass options.fetchImpl or run on Node 18+."
      );
    }
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
    this.minDelayMs = Number.isFinite(options.minDelayMs) ? options.minDelayMs : 2000;
    this.jitterMs = Number.isFinite(options.jitterMs) ? options.jitterMs : 1000;
    this.maxCallsPerSession = Number.isFinite(options.maxCallsPerSession)
      ? options.maxCallsPerSession
      : 10;
    this.cookieJar = new Map();
    this.warmedUp = false;
    this.callsSoFar = 0;
    this.lastCallAt = 0;
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.delayImpl = typeof options.delayImpl === "function" ? options.delayImpl : delay;
  }

  resetSession() {
    this.cookieJar = new Map();
    this.warmedUp = false;
    this.callsSoFar = 0;
    this.lastCallAt = 0;
  }

  buildHeaders(endpointKey, extra = {}) {
    const refererPath = ENDPOINT_REFERER_HINT[endpointKey] || ENDPOINT_REFERER_HINT.notices;
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      Origin: this.baseUrl,
      Referer: `${this.baseUrl}${refererPath}`,
      "X-Requested-With": "XMLHttpRequest"
    };

    const cookieHeader = buildCookieHeader(this.cookieJar);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    return Object.assign(headers, extra);
  }

  async warmup() {
    if (this.warmedUp) return;
    const url = `${this.baseUrl}${WARMUP_PATH}`;
    const controller = createAbortController(this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.buildHeaders("notices"),
        redirect: "manual",
        signal: controller.signal
      });
      ingestSetCookie(this.cookieJar, response.headers);
      this.warmedUp = true;
    } catch (cause) {
      throw createNetworkError(cause, WARMUP_PATH);
    } finally {
      controller.cleanup();
    }
  }

  async ensureBudget() {
    if (this.callsSoFar >= this.maxCallsPerSession) {
      const error = new Error(
        `Court Auction call budget exceeded (${this.maxCallsPerSession} calls per session). ` +
          "Reset the client or wait before retrying to avoid IP blocks."
      );
      error.code = "BUDGET_EXCEEDED";
      throw error;
    }
    if (this.lastCallAt > 0) {
      const elapsed = this.now() - this.lastCallAt;
      const wait = jitter(this.minDelayMs, this.jitterMs) - elapsed;
      if (wait > 0) {
        await this.delayImpl(wait);
      }
    }
  }

  async postJson(endpointKey, body) {
    const path = ENDPOINT_PATHS[endpointKey];
    if (!path) {
      throw new Error(`Unknown court auction endpoint: ${endpointKey}`);
    }
    await this.warmup();
    await this.ensureBudget();

    this.callsSoFar += 1;
    this.lastCallAt = this.now();

    const url = `${this.baseUrl}${path}`;
    const controller = createAbortController(this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.buildHeaders(endpointKey, {
          "Content-Type": "application/json; charset=UTF-8"
        }),
        body: JSON.stringify(body || {}),
        redirect: "manual",
        signal: controller.signal
      });
    } catch (cause) {
      controller.cleanup();
      throw createNetworkError(cause, path);
    }

    controller.cleanup();
    ingestSetCookie(this.cookieJar, response.headers);

    if (!response.ok) {
      throw createUpstreamError(null, path, response.status);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw createNetworkError(cause, path);
    }

    if (
      payload &&
      typeof payload === "object" &&
      payload.errors &&
      typeof payload.errors === "object" &&
      payload.errors.errorMessage
    ) {
      throw createUpstreamError(payload, path, response.status);
    }

    if (
      payload &&
      typeof payload === "object" &&
      payload.data &&
      typeof payload.data === "object" &&
      payload.data.ipcheck === false
    ) {
      throw createBlockedError(payload.message || null, payload);
    }

    return payload;
  }
}

function createAbortController(timeoutMs) {
  if (
    typeof AbortController !== "function" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return { signal: undefined, cleanup: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(handle)
  };
}

module.exports = {
  CourtAuctionHttpClient,
  ENDPOINT_PATHS,
  WARMUP_PATH,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  createBlockedError,
  createUpstreamError,
  createNetworkError
};
