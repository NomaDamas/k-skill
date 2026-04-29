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
  assert.equal(client.warmedUp, true);
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
