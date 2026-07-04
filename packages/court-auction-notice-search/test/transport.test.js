"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CourtAuctionHttpClient,
  ENDPOINT_PATHS,
  WARMUP_PATH,
  createBlockedError,
  createUpstreamError
} = require("../src/transport/http");
const {
  CourtAuctionPlaywrightClient,
  resetChromiumCacheForTests
} = require("../src/transport/playwright");

const fixturesDir = path.join(__dirname, "fixtures");
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const noticesSample = loadFixture("notices-sample.json");
const blockedSample = loadFixture("blocked.json");
const errorSample = loadFixture("error-response.json");

function makeJsonResponse(body, headers = {}, status = 200) {
  const responseHeaders = new Headers({ "content-type": "application/json", ...headers });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => responseHeaders.get(name),
      getSetCookie: () => {
        const value = headers["set-cookie"];
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
      }
    },
    json: async () => body
  };
}

function buildFakeFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const handler = handlers[String(url).split("?")[0].replace(/^https?:\/\/[^/]+/, "")];
    if (typeof handler === "function") {
      return handler(url, init);
    }
    if (handler !== undefined) return handler;
    throw new Error(`unmocked URL: ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function newClient(handlers, overrides = {}) {
  return new CourtAuctionHttpClient({
    fetchImpl: buildFakeFetch(handlers),
    minDelayMs: 0,
    jitterMs: 0,
    timeoutMs: 5000,
    delayImpl: async () => {},
    now: (() => {
      let t = 1_000_000;
      return () => {
        t += 1;
        return t;
      };
    })(),
    ...overrides
  });
}

test("warmup GETs the index page and stores JSESSIONID/WMONID cookies", async () => {
  const client = newClient({
    [WARMUP_PATH.split("?")[0]]: () =>
      makeJsonResponse(
        {},
        {
          "set-cookie": [
            "JSESSIONID=abc123; Path=/; HttpOnly",
            "WMONID=def456; Path=/"
          ]
        }
      )
  });

  await client.warmup();
  assert.equal(client.warmedUp, WARMUP_PATH);
  assert.equal(client.cookieJar.get("JSESSIONID"), "abc123");
  assert.equal(client.cookieJar.get("WMONID"), "def456");
});

test("postJson calls warmup first, then POSTs body with cookies + correct headers", async () => {
  const fetchImpl = buildFakeFetch({
    [WARMUP_PATH.split("?")[0]]: () =>
      makeJsonResponse(
        {},
        { "set-cookie": "JSESSIONID=session1; Path=/" }
      ),
    [ENDPOINT_PATHS.notices]: () => makeJsonResponse(noticesSample)
  });

  const client = new CourtAuctionHttpClient({
    fetchImpl,
    minDelayMs: 0,
    jitterMs: 0,
    delayImpl: async () => {}
  });

  const payload = await client.postJson("notices", {
    dma_srchDspslPbanc: { srchYmd: "20260427", cortOfcCd: "", bidDvsCd: "", srchBtnYn: "Y" }
  });

  assert.equal(payload.status, 200);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].init.method, "GET");
  assert.equal(fetchImpl.calls[1].init.method, "POST");

  const postHeaders = fetchImpl.calls[1].init.headers;
  assert.equal(postHeaders["Content-Type"], "application/json; charset=UTF-8");
  assert.equal(postHeaders["X-Requested-With"], "XMLHttpRequest");
  assert.match(postHeaders.Cookie, /JSESSIONID=session1/);
  assert.equal(postHeaders.Origin, "https://www.courtauction.go.kr");
});

test("postJson throws BLOCKED error when data.ipcheck === false", async () => {
  const client = newClient({
    [WARMUP_PATH.split("?")[0]]: () => makeJsonResponse({}),
    [ENDPOINT_PATHS.notices]: () => makeJsonResponse(blockedSample)
  });

  await assert.rejects(
    () =>
      client.postJson("notices", {
        dma_srchDspslPbanc: { srchYmd: "20260427", cortOfcCd: "", bidDvsCd: "", srchBtnYn: "Y" }
      }),
    (error) => {
      assert.equal(error.code, "BLOCKED");
      assert.match(error.message, /blocked|차단/);
      assert.equal(error.upstreamPayload.message, blockedSample.message);
      return true;
    }
  );
});

test("postJson throws UPSTREAM_ERROR when payload.errors.errorMessage is set", async () => {
  const client = newClient({
    [WARMUP_PATH.split("?")[0]]: () => makeJsonResponse({}),
    [ENDPOINT_PATHS.noticeDetail]: () => makeJsonResponse(errorSample)
  });

  await assert.rejects(
    () => client.postJson("noticeDetail", {}),
    (error) => {
      assert.equal(error.code, "UPSTREAM_ERROR");
      assert.match(error.upstreamMessage, /사용에 불편을 드려/);
      return true;
    }
  );
});

test("postJson enforces a per-session call budget", async () => {
  const client = newClient(
    {
      [WARMUP_PATH.split("?")[0]]: () => makeJsonResponse({}),
      [ENDPOINT_PATHS.notices]: () => makeJsonResponse(noticesSample)
    },
    { maxCallsPerSession: 2 }
  );

  await client.postJson("notices", {});
  await client.postJson("notices", {});
  await assert.rejects(() => client.postJson("notices", {}), (err) => {
    assert.equal(err.code, "BUDGET_EXCEEDED");
    return true;
  });
});

test("postJson throttles between calls using delayImpl", async () => {
  const delays = [];
  let now = 1000;
  const client = new CourtAuctionHttpClient({
    fetchImpl: buildFakeFetch({
      [WARMUP_PATH.split("?")[0]]: () => makeJsonResponse({}),
      [ENDPOINT_PATHS.notices]: () => makeJsonResponse(noticesSample)
    }),
    minDelayMs: 1500,
    jitterMs: 0,
    delayImpl: async (ms) => {
      delays.push(ms);
    },
    now: () => now
  });

  await client.postJson("notices", {});
  await client.postJson("notices", {});
  assert.ok(
    delays.some((d) => d === 1500),
    `expected a 1500ms throttle delay, got [${delays.join(",")}]`
  );
});

test("createBlockedError and createUpstreamError carry diagnostics", () => {
  const blocked = createBlockedError(null, { message: "차단" });
  assert.equal(blocked.code, "BLOCKED");
  assert.equal(blocked.upstreamMessage, "차단");

  const upstream = createUpstreamError(
    { errors: { errorMessage: "boom" } },
    "/pgj/x.on",
    500
  );
  assert.equal(upstream.code, "UPSTREAM_ERROR");
  assert.equal(upstream.statusCode, 500);
  assert.equal(upstream.upstreamMessage, "boom");
});
const propertiesSample = loadFixture("properties-sample.json");

// --- Browser-runtime fallback tier (BrowserOS/CDP preferred, local launch intact) ---

test.afterEach(() => {
  resetChromiumCacheForTests();
});

function createFakePage(response) {
  const calls = { goto: 0, evaluate: 0, close: 0 };
  const page = {
    goto: async () => {
      calls.goto += 1;
    },
    evaluate: async () => {
      calls.evaluate += 1;
      return { status: response.status, body: JSON.stringify(response.body) };
    },
    close: async () => {
      calls.close += 1;
    }
  };
  return { page, calls };
}

function createFakeCdpBrowser(response) {
  const fakePage = createFakePage(response);
  const calls = { newContext: 0, newPage: 0, disconnect: 0, close: 0 };
  const context = {
    pages: () => [],
    newPage: async () => {
      calls.newPage += 1;
      return fakePage.page;
    },
    close: async () => {}
  };
  const browser = {
    contexts: () => [],
    newContext: async () => {
      calls.newContext += 1;
      return context;
    },
    disconnect: async () => {
      calls.disconnect += 1;
    },
    close: async () => {
      calls.close += 1;
    }
  };
  return { browser, context, page: fakePage.page, pageCalls: fakePage.calls, calls };
}

function createFakeLocalChromium(response) {
  const fakePage = createFakePage(response);
  const launchCalls = [];
  const context = {
    newPage: async () => fakePage.page,
    close: async () => {}
  };
  const browser = {
    newContext: async () => context,
    close: async () => {}
  };
  const chromium = {
    launch: async (opts) => {
      launchCalls.push(opts);
      return browser;
    }
  };
  return { chromium, browser, context, page: fakePage.page, pageCalls: fakePage.calls, launchCalls };
}

test("CourtAuctionPlaywrightClient prefers the BrowserOS/runtime CDP path when usable and never launches a headless browser", async () => {
  const cdp = createFakeCdpBrowser({ status: 200, body: propertiesSample });
  const client = new CourtAuctionPlaywrightClient({
    baseUrl: "https://www.courtauction.go.kr",
    probe: false,
    connectLoader: async () => cdp.browser
  });

  const payload = await client.postJson("propertySearch", {
    dma_pageInfo: { pageNo: 1, pageSize: 10 },
    dma_srchGdsDtlSrchInfo: {}
  });

  assert.equal(payload.status, 200);
  assert.ok(client.usesCdp, "client should be attached over CDP");
  assert.equal(cdp.calls.newContext, 1, "CDP path creates an owned automation context");
  assert.equal(cdp.pageCalls.evaluate, 1, "request is issued through the CDP page");
  assert.equal(cdp.calls.close, 0, "user-owned BrowserOS/Chrome browser is never closed");

  await client.close();
  assert.equal(cdp.calls.disconnect, 1, "CDP browser is disconnected on close");
  assert.equal(cdp.calls.close, 0, "close() still never closes the user-owned browser");
});

test("CourtAuctionPlaywrightClient falls back to the local chromium.launch path when the CDP endpoint is unavailable", async () => {
  const local = createFakeLocalChromium({ status: 200, body: propertiesSample });
  const client = new CourtAuctionPlaywrightClient({
    baseUrl: "https://www.courtauction.go.kr",
    // Simulate BrowserOS/CDP not running: probe fails closed with UNAVAILABLE.
    probe: async () => ({ ok: false, statusCode: 0, url: "http://127.0.0.1:9100/json/version" }),
    chromiumLoader: async () => local.chromium
  });

  const payload = await client.postJson("propertySearch", {
    dma_pageInfo: { pageNo: 1, pageSize: 10 },
    dma_srchGdsDtlSrchInfo: {}
  });

  assert.equal(payload.status, 200);
  assert.ok(!client.usesCdp, "client fell through to the local launch path");
  assert.equal(local.launchCalls.length, 1, "local chromium.launch was used as fallback");
  assert.deepEqual(local.launchCalls[0], { headless: true }, "local launch preserves headless flag");

  await client.close();
  assert.equal(client.browser, null, "local launch close clears the owned browser");
});

test("CourtAuctionPlaywrightClient local launch path still works directly with preferRuntime:false", async () => {
  const local = createFakeLocalChromium({ status: 200, body: propertiesSample });
  const client = new CourtAuctionPlaywrightClient({
    baseUrl: "https://www.courtauction.go.kr",
    preferRuntime: false,
    headless: false,
    chromiumLoader: async () => local.chromium
  });

  await client.postJson("propertySearch", {
    dma_pageInfo: { pageNo: 1, pageSize: 10 },
    dma_srchGdsDtlSrchInfo: {}
  });

  assert.equal(local.launchCalls.length, 1);
  assert.deepEqual(local.launchCalls[0], { headless: false });
  assert.ok(!client.usesCdp);
  await client.close();
  assert.equal(client.browser, null);
});

test("CourtAuctionPlaywrightClient surfaces PLAYWRIGHT_UNAVAILABLE when the local fallback has no playwright module", async () => {
  const client = new CourtAuctionPlaywrightClient({
    baseUrl: "https://www.courtauction.go.kr",
    preferRuntime: false
  });

  // Force loadChromium down the "no module installed" branch by injecting a
  // loader that throws the same PLAYWRIGHT_UNAVAILABLE error the real loader
  // produces when none of playwright-core/playwright/rebrowser-playwright exist.
  client.loader = async () => {
    const error = new Error("no playwright module");
    error.code = "PLAYWRIGHT_UNAVAILABLE";
    throw error;
  };

  await assert.rejects(
    () => client.postJson("propertySearch", {}),
    (err) => err.code === "PLAYWRIGHT_UNAVAILABLE"
  );
});

test("CourtAuctionPlaywrightClient CDP path cleans up only owned page/context and disconnects safely", async () => {
  const cdp = createFakeCdpBrowser({ status: 200, body: propertiesSample });
  const client = new CourtAuctionPlaywrightClient({
    baseUrl: "https://www.courtauction.go.kr",
    probe: false,
    connectLoader: async () => cdp.browser
  });

  await client.postJson("propertySearch", {});
  const ownedPage = client.runtimeSession.page;
  const ownedContext = client.runtimeSession.context;

  await client.close();

  assert.equal(cdp.pageCalls.close, 1, "owned automation page is closed");
  assert.equal(cdp.calls.disconnect, 1, "automation client is disconnected");
  assert.equal(cdp.calls.close, 0, "user browser is never closed");
  assert.equal(client.runtimeSession, null, "runtime session is dropped");
  assert.equal(client.usesCdp, false);
  assert.ok(ownedPage && ownedContext, "owned session resources were tracked before cleanup");
});
