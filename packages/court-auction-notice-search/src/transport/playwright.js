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

function resetChromiumCacheForTests() {
  cachedChromium = null;
}

// Lazily load the shared browser runtime adapter. The adapter is a regular
// (non-optional) dependency, but it is only touched when a fallback actually
// needs a browser session, so pure-HTTP callers never pay for loading it.
function loadRuntime() {
  try {
    return require("k-skill-browser-runtime");
  } catch (cause) {
    const error = new Error(
      "Court Auction browser-runtime fallback requires k-skill-browser-runtime."
    );
    error.code = "PLAYWRIGHT_UNAVAILABLE";
    error.cause = cause;
    throw error;
  }
}

function isFallbackAvailable() {
  for (const moduleName of FALLBACK_MODULE_NAMES) {
    try {
      require.resolve(moduleName);
      return true;
    } catch {
    }
  }
  try {
    loadRuntime();
    return true;
  } catch {
    return false;
  }
}

class CourtAuctionPlaywrightClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
    this.headless = options.headless !== false;
    this.loader = typeof options.chromiumLoader === "function" ? options.chromiumLoader : null;

    // Shared browser-runtime (BrowserOS / Chrome CDP) options. CDP is the
    // preferred browser-runtime path when usable; the local launch fallback
    // below remains intact for when no CDP endpoint is reachable.
    this.preferRuntime = options.preferRuntime !== false;
    this.provider = options.provider || undefined;
    this.cdpUrl = options.cdpUrl || undefined;
    this.probe = options.probe;
    this.asideProbe = options.asideProbe;
    this.asideCommand = options.asideCommand;
    this.asideTimeoutMs = options.asideTimeoutMs;
    this.connectLoader =
      typeof options.connectLoader === "function" ? options.connectLoader : null;
    this.reuseDefaultContext = options.reuseDefaultContext === true;

    this.browser = null;
    this.context = null;
    this.page = null;
    this.warmedUp = null;
    this.runtimeSession = null;
    this.usesCdp = false;
  }

  async ensureBrowser() {
    if (this.page) return;

    if (this.preferRuntime) {
      // The runtime adapter is a regular dependency, but resolve it lazily so a
      // missing adapter degrades to the local launch fallback instead of
      // throwing and blocking the local path.
      let runtime = null;
      try {
        runtime = loadRuntime();
      } catch {
        runtime = null;
      }

      if (runtime) {
        try {
          await this.ensureCdpBrowser(runtime);
          return;
        } catch (err) {
          const code = err && err.code;
          const stopCodes = runtime.STOP_CODES || {};
          // Hard unavailable: no playwright module is installed, so the local
          // launch fallback cannot work either. Surface the original error.
          if (code === stopCodes.PLAYWRIGHT_UNAVAILABLE || code === "PLAYWRIGHT_UNAVAILABLE") {
            throw err;
          }
          // An unknown provider is a configuration error (the runtime fails
          // closed on purpose); do not silently mask it with a local launch.
          if (code === stopCodes.UNKNOWN_PROVIDER || code === "UNKNOWN_PROVIDER") {
            throw err;
          }
          // UNAVAILABLE / probe failure / network error: BrowserOS or the CDP
          // endpoint is not reachable. Fall through to the local launch fallback.
        }
      }
    }

    await this.ensureLocalBrowser();
  }

  async ensureCdpBrowser(runtime) {
    const connectOptions = {};
    if (this.provider) connectOptions.provider = this.provider;
    if (this.cdpUrl) connectOptions.cdpUrl = this.cdpUrl;
    if (this.probe !== undefined) connectOptions.probe = this.probe;
    if (this.asideProbe !== undefined) connectOptions.asideProbe = this.asideProbe;
    if (this.asideCommand !== undefined) connectOptions.asideCommand = this.asideCommand;
    if (this.asideTimeoutMs !== undefined) connectOptions.asideTimeoutMs = this.asideTimeoutMs;
    if (this.connectLoader) connectOptions.connectLoader = this.connectLoader;
    if (this.loader) connectOptions.chromiumLoader = this.loader;

    // runtime.connect never launches BrowserOS and never passes headless flags;
    // it only attaches to an already-running user CDP session.
    const { browser } = await runtime.connect(connectOptions);
    const session = await runtime.getAutomationPage(browser, {
      reuseDefaultContext: this.reuseDefaultContext,
      contextOptions: {
        userAgent: this.userAgent,
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        viewport: { width: 1280, height: 900 }
      }
    });

    this.browser = browser;
    this.context = session.context;
    this.page = session.page;
    this.runtimeSession = session;
    this.usesCdp = true;
  }

  async ensureLocalBrowser() {
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
    if (this.usesCdp) {
      // CDP-connected browsers are user-owned (BrowserOS/Chrome profile). Only
      // clean up the page/context this adapter created and disconnect the
      // automation client; never close the user's browser application.
      const runtime = loadRuntime();
      try {
        if (this.runtimeSession) {
          await runtime.cleanupAutomationPage(this.runtimeSession);
        }
      } catch {
        /* ignore */
      }
      try {
        await runtime.disconnectBrowser(this.browser);
      } catch {
        /* disconnect may refuse for non-CDP browsers; leave to GC */
      }
      this.runtimeSession = null;
      this.usesCdp = false;
      this.page = null;
      this.context = null;
      this.browser = null;
      this.warmedUp = null;
      return;
    }

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
  loadChromium,
  loadRuntime,
  resetChromiumCacheForTests
};
