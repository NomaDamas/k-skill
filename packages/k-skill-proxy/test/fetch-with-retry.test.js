const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchWithRetry, isRetryableError, isRetryableStatus } = require("../src/fetch-with-retry");

test("fetchWithRetry retries a single 502 then returns the successful response", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) {
      return new Response("upstream down", { status: 502 });
    }
    return new Response("ok", { status: 200 });
  };

  const response = await fetchWithRetry("https://example.invalid/v1", {
    fetchImpl,
    jitterRatio: 0,
    sleep: async () => {}
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(calls.length, 2);
});

test("fetchWithRetry does not retry 403", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("forbidden", { status: 403 });
  };

  const response = await fetchWithRetry("https://example.invalid/v1", {
    fetchImpl,
    jitterRatio: 0,
    sleep: async () => {
      throw new Error("sleep should not run for non-retryable status");
    }
  });

  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test("fetchWithRetry retries network failures then throws the last error", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const error = new Error("fetch failed: read ECONNRESET");
    error.code = "ECONNRESET";
    throw error;
  };

  await assert.rejects(
    () => fetchWithRetry("https://example.invalid/v1", {
      fetchImpl,
      attempts: 2,
      jitterRatio: 0,
      sleep: async () => {}
    }),
    /ECONNRESET/
  );
  assert.equal(calls, 2);
});

test("fetchWithRetry stops once the shared timeout signal has aborted", async () => {
  const controller = new AbortController();
  const calls = [];
  const sleeps = [];
  const fetchImpl = async () => {
    calls.push(controller.signal.aborted);
    controller.abort();
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  };

  await assert.rejects(
    () => fetchWithRetry("https://example.invalid/v1", {
      fetchImpl,
      attempts: 2,
      signal: controller.signal,
      jitterRatio: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    }),
    /aborted due to timeout/
  );

  assert.deepEqual(calls, [false], "the aborted deadline must not trigger another upstream attempt");
  assert.deepEqual(sleeps, [], "no backoff sleep may extend the caller's timeout budget");
});

test("retry classifiers cover 429/5xx and connection resets", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(502), true);
  assert.equal(isRetryableStatus(404), false);
  assert.equal(isRetryableStatus(403), false);
  assert.equal(isRetryableError({ name: "AbortError" }), true);
  assert.equal(isRetryableError({ code: "ECONNRESET" }), true);
  assert.equal(isRetryableError({ message: "bad request" }), false);
});
