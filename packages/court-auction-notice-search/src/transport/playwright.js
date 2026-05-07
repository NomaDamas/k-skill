"use strict";

const {
  ENDPOINT_PATHS,
  ENDPOINT_WARMUP_PATH,
  WARMUP_PATH: DEFAULT_WARMUP_PATH,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  createBlockedError,
  createUpstreamError,
  createNetworkError
} = require("./http");

const FALLBACK_MODULE_NAMES = ["playwright-core", "playwright", "rebrowser-playwright"];

const ENDPOINT_SUBMISSION_ID = Object.freeze({
  propertySearch: "mf_wfm_mainFrame_sbm_selectGdsDtlSrch"
});

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
    this.warmedUp = null;
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

  async warmup(endpointKey) {
    const warmupPath = ENDPOINT_WARMUP_PATH[endpointKey] || DEFAULT_WARMUP_PATH;
    if (this.warmedUp === warmupPath) return;
    await this.ensureBrowser();
    try {
      await this.page.goto(`${this.baseUrl}${warmupPath}`, {
        waitUntil: "domcontentloaded",
        timeout: this.timeoutMs
      });
      this.warmedUp = warmupPath;
    } catch (cause) {
      throw createNetworkError(cause, warmupPath);
    }
  }

  async postJson(endpointKey, body) {
    const path = ENDPOINT_PATHS[endpointKey];
    if (!path) {
      throw new Error(`Unknown court auction endpoint: ${endpointKey}`);
    }
    await this.warmup(endpointKey);

    const url = `${this.baseUrl}${path}`;
    const requestPayload = JSON.stringify(body || {});
    const submissionId = ENDPOINT_SUBMISSION_ID[endpointKey] || "";

    let response;
    try {
      response = await this.page.evaluate(
        async ({ targetUrl, payload, submissionid }) => {
          const headers = {
            "Content-Type": "application/json;charset=UTF-8",
            Accept: "application/json"
          };
          if (submissionid) {
            headers.submissionid = submissionid;
            headers["sc-userid"] = "SYSTEM";
          }
          const res = await fetch(targetUrl, {
            method: "POST",
            credentials: "same-origin",
            headers,
            body: payload
          });
          const text = await res.text();
          return { status: res.status, body: text };
        },
        { targetUrl: url, payload: requestPayload, submissionid: submissionId }
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
    this.warmedUp = null;
  }
}

module.exports = {
  CourtAuctionPlaywrightClient,
  isFallbackAvailable,
  loadChromium
};
