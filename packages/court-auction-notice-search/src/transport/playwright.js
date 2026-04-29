"use strict";

const {
  ENDPOINT_PATHS,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  createBlockedError,
  createUpstreamError,
  createNetworkError
} = require("./http");

const FALLBACK_MODULE_NAMES = ["rebrowser-playwright", "playwright-core", "playwright"];
const WARMUP_PATH = "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01";

let cachedChromium = null;

async function loadChromium(loaderImpl) {
  if (cachedChromium) return cachedChromium;
  if (typeof loaderImpl === "function") {
    cachedChromium = await loaderImpl();
    return cachedChromium;
  }

  let lastError;
  for (const moduleName of FALLBACK_MODULE_NAMES) {
    try {
      const mod = await import(moduleName);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) {
        cachedChromium = chromium;
        return cachedChromium;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error(
    "Court Auction playwright fallback requires one of " +
      FALLBACK_MODULE_NAMES.join(", ") +
      ". Install with: npm install rebrowser-playwright"
  );
  error.code = "PLAYWRIGHT_UNAVAILABLE";
  if (lastError) error.cause = lastError;
  throw error;
}

function isFallbackAvailable() {
  for (const moduleName of FALLBACK_MODULE_NAMES) {
    try {
      require.resolve(moduleName);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

class CourtAuctionPlaywrightClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
    this.headless = options.headless !== false;
    this.loader = typeof options.chromiumLoader === "function" ? options.chromiumLoader : null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.warmedUp = false;
  }

  async ensureBrowser() {
    if (this.page) return;
    const chromium = await loadChromium(this.loader);
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext({
      userAgent: this.userAgent,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport: { width: 1280, height: 900 }
    });
    this.page = await this.context.newPage();
  }

  async warmup() {
    if (this.warmedUp) return;
    await this.ensureBrowser();
    try {
      await this.page.goto(`${this.baseUrl}${WARMUP_PATH}`, {
        waitUntil: "domcontentloaded",
        timeout: this.timeoutMs
      });
      this.warmedUp = true;
    } catch (cause) {
      throw createNetworkError(cause, WARMUP_PATH);
    }
  }

  async postJson(endpointKey, body) {
    const path = ENDPOINT_PATHS[endpointKey];
    if (!path) {
      throw new Error(`Unknown court auction endpoint: ${endpointKey}`);
    }
    await this.warmup();

    const url = `${this.baseUrl}${path}`;
    const requestPayload = JSON.stringify(body || {});

    let response;
    try {
      response = await this.page.evaluate(
        async ({ targetUrl, payload }) => {
          const res = await fetch(targetUrl, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              Accept: "application/json, text/javascript, */*; q=0.01",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: payload
          });
          const text = await res.text();
          return { status: res.status, body: text };
        },
        { targetUrl: url, payload: requestPayload }
      );
    } catch (cause) {
      throw createNetworkError(cause, path);
    }

    if (!response || response.status >= 400) {
      throw createUpstreamError(null, path, response ? response.status : null);
    }

    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch (cause) {
      throw createNetworkError(cause, path);
    }

    if (
      payload &&
      payload.errors &&
      typeof payload.errors === "object" &&
      payload.errors.errorMessage
    ) {
      throw createUpstreamError(payload, path, response.status);
    }

    if (
      payload &&
      payload.data &&
      typeof payload.data === "object" &&
      payload.data.ipcheck === false
    ) {
      throw createBlockedError(payload.message || null, payload);
    }

    return payload;
  }

  async close() {
    try {
      if (this.page) await this.page.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.context) await this.context.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.browser) await this.browser.close();
    } catch {
      /* ignore */
    }
    this.page = null;
    this.context = null;
    this.browser = null;
    this.warmedUp = false;
  }
}

module.exports = {
  CourtAuctionPlaywrightClient,
  isFallbackAvailable,
  loadChromium
};
