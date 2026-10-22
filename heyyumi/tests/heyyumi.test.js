"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const helperPath = "../scripts/heyyumi.mjs";
const FUTURE = "2099-12-01T19:00:00+09:00";

function tempConfigEnv(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heyyumi-test-"));
  return { dir, env: { KSKILL_CONFIG_DIR: dir, ...extra } };
}

async function startServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const record = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
    requests.push(record);
    handler(record, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

test("reserve without --confirm previews and never touches the network", async () => {
  const { runCommand } = await import(helperPath);
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: "http://127.0.0.1:1" });

  const result = await runCommand(
    "reserve",
    { "place-id": "1726507251", time: FUTURE, guests: "2", phone: "010-1234-5678", name: "홍길동" },
    [],
    { env }
  );

  assert.equal(result.preview, true);
  assert.equal(result.sent, false);
  assert.equal(result.request.placeId, "1726507251");
  assert.equal(result.request.guestCount, 2);
  assert.match(result.request.idempotencyKey, /^kskill-[0-9a-f]{32}$/);
});

test("reserve --confirm posts the exact body with Bearer auth and a stable idempotency key", async () => {
  const { runCommand } = await import(helperPath);
  const api = await startServer((req, res) =>
    json(res, 200, { success: true, data: { reservationId: "r-1", status: "pending", placeId: "1726507251" } })
  );
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: api.url });
  const options = { "place-id": "1726507251", time: FUTURE, guests: "4", phone: "010-1234-5678", note: "창가", confirm: true };

  try {
    const first = await runCommand("reserve", options, [], { env });
    const second = await runCommand("reserve", options, [], { env });

    assert.equal(first.data.status, "pending");
    assert.equal(api.requests.length, 2);
    const [sent] = api.requests;
    assert.equal(sent.method, "POST");
    assert.equal(sent.url, "/api/v1/reservations");
    assert.equal(sent.headers.authorization, "Bearer hmp_test");
    assert.equal(sent.headers["x-map3-sandbox"], undefined);
    assert.deepEqual(JSON.parse(sent.body), {
      placeId: "1726507251",
      reservationTime: FUTURE,
      guestCount: 4,
      guestPhone: "010-1234-5678",
      note: "창가",
      idempotencyKey: first.request.idempotencyKey
    });
    assert.equal(first.request.idempotencyKey, second.request.idempotencyKey, "retrying the same request must reuse the key");
  } finally {
    api.server.close();
  }
});

test("--sandbox sends the sandbox header and does not need --confirm", async () => {
  const { runCommand } = await import(helperPath);
  const api = await startServer((req, res) =>
    json(res, 200, { success: true, data: { reservationId: "sbx_r_1", status: "pending", sandbox: true } })
  );
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: api.url });

  try {
    const result = await runCommand(
      "reserve",
      { "place-id": "1", time: FUTURE, guests: "2", phone: "010-1234-5678", sandbox: true },
      [],
      { env }
    );
    assert.equal(result.data.sandbox, true);
    assert.equal(api.requests[0].headers["x-map3-sandbox"], "1");
  } finally {
    api.server.close();
  }
});

test("reservation input is rejected before any request is built", async () => {
  const { buildReservationRequest } = await import(helperPath);
  const base = { "place-id": "1", time: FUTURE, guests: "2", phone: "010-1234-5678" };
  const code = (override) => {
    try {
      buildReservationRequest({ ...base, ...override });
    } catch (error) {
      return error.code;
    }
    return "none";
  };

  assert.equal(code({}), "none");
  assert.equal(code({ time: "2099-12-01T19:00:00" }), "invalid_input", "offset-less time is ambiguous");
  assert.equal(code({ time: "2001-01-01T19:00:00+09:00" }), "invalid_input", "past time");
  assert.equal(code({ guests: "0" }), "invalid_input");
  assert.equal(code({ guests: "2.5" }), "invalid_input");
  assert.equal(code({ phone: "call me" }), "invalid_input");
  assert.equal(code({ "place-id": " " }), "invalid_input");
});

test("422 reservation_not_available surfaces as a non-retryable typed error with retryAfter preserved", async () => {
  const { runCommand } = await import(helperPath);
  const api = await startServer((req, res) =>
    json(res, 422, { success: false, error: { code: "reservation_requests_closed", message: "closed" }, retryAfter: "2026-12-01T02:00:00.000Z" })
  );
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: api.url });

  try {
    await assert.rejects(
      runCommand("reserve", { "place-id": "1", time: FUTURE, guests: "2", phone: "010-1234-5678", confirm: true }, [], { env }),
      (error) => {
        assert.equal(error.code, "reservation_requests_closed");
        assert.equal(error.details.status, 422);
        assert.equal(error.details.retryAfter, "2026-12-01T02:00:00.000Z");
        return true;
      }
    );
  } finally {
    api.server.close();
  }
});

test("401 and 429 map to unauthorized and rate_limited", async () => {
  const { runCommand } = await import(helperPath);
  let status = 401;
  const api = await startServer((req, res) =>
    json(res, status, { success: false, error: "nope" }, status === 429 ? { "retry-after": "7" } : {})
  );
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: api.url });

  try {
    await assert.rejects(runCommand("search", { keyword: "a" }, [], { env }), { code: "unauthorized" });
    status = 429;
    await assert.rejects(runCommand("search", { keyword: "a" }, [], { env }), (error) => {
      assert.equal(error.code, "rate_limited");
      assert.equal(error.details.retryAfter, "7");
      return true;
    });
  } finally {
    api.server.close();
  }
});

test("search maps flags to API query params and defaults to the cheap field tiers", async () => {
  const { runCommand } = await import(helperPath);
  const api = await startServer((req, res) => json(res, 200, { success: true, data: [], meta: { total: 0 } }, { "x-map3-units": "2" }));
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: api.url });

  try {
    const result = await runCommand(
      "search",
      { keyword: "파스타", "region-code": "1141011100", reservable: "true", "open-at": "2026-12-01T19:00", "page-size": "5" },
      [],
      { env }
    );
    const url = new URL(api.requests[0].url, "http://x");
    assert.equal(url.pathname, "/api/v1/places");
    assert.equal(url.searchParams.get("keyword"), "파스타");
    assert.equal(url.searchParams.get("region_code"), "1141011100");
    assert.equal(url.searchParams.get("reservable"), "true");
    assert.equal(url.searchParams.get("open_at"), "2026-12-01T19:00");
    assert.equal(url.searchParams.get("page_size"), "5");
    assert.equal(url.searchParams.get("fields"), "core,contact_hours");
    assert.equal(result.units, "2");
  } finally {
    api.server.close();
  }
});

test("status long-poll wait is capped at the documented 25 seconds", async () => {
  const { runCommand } = await import(helperPath);
  const api = await startServer((req, res) => json(res, 200, { success: true, data: { reservationId: "r/1", status: "confirmed" } }));
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: api.url });

  try {
    await runCommand("reservation-status", { wait: "300" }, ["r/1"], { env });
    const url = new URL(api.requests[0].url, "http://x");
    assert.equal(url.pathname, "/api/v1/reservations/r%2F1");
    assert.equal(url.searchParams.get("wait"), "25");
  } finally {
    api.server.close();
  }
});

test("live-ask validates kind and previews without --confirm", async () => {
  const { runCommand, buildLiveStatusRequest } = await import(helperPath);
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_API_BASE_URL: "http://127.0.0.1:1" });

  assert.throws(() => buildLiveStatusRequest({ "place-id": "1", kind: "menu", topic: "x" }), { code: "invalid_input" });
  const preview = await runCommand("live-ask", { "place-id": "1", kind: "seats", topic: "party of 10" }, [], { env });
  assert.equal(preview.preview, true);
  assert.equal(preview.request.kind, "seats");
});

test("API key from secrets.env is used and wins over a saved OAuth token", async () => {
  const { resolveCredential, oauthTokenPath } = await import(helperPath);
  const { dir, env } = tempConfigEnv();
  fs.writeFileSync(path.join(dir, "secrets.env"), "OTHER=1\nKSKILL_HEYYUMI_API_KEY='hmp_from_file'\n");
  fs.writeFileSync(oauthTokenPath(env), JSON.stringify({ access_token: "oauth_tok", expires_at: 0 }));

  assert.deepEqual(await resolveCredential({ env }), { kind: "api_key", token: "hmp_from_file" });
});

test("expired OAuth token is refreshed with the refresh_token grant and re-saved 0600", async () => {
  const { resolveCredential, oauthTokenPath } = await import(helperPath);
  const auth = await startServer((req, res) =>
    json(res, 200, { access_token: "new_access", refresh_token: "new_refresh", expires_in: 3600 })
  );
  const { env } = tempConfigEnv();
  fs.writeFileSync(
    oauthTokenPath(env),
    JSON.stringify({
      access_token: "old",
      refresh_token: "old_refresh",
      expires_at: Date.now() - 1000,
      token_endpoint: `${auth.url}/oauth/token`,
      client_id: "hyc_1"
    })
  );

  try {
    const credential = await resolveCredential({ env });
    assert.deepEqual(credential, { kind: "oauth", token: "new_access" });
    const form = new URLSearchParams(auth.requests[0].body);
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "old_refresh");
    assert.equal(form.get("client_id"), "hyc_1");
    assert.equal(JSON.parse(fs.readFileSync(oauthTokenPath(env), "utf8")).refresh_token, "new_refresh");
    assert.equal(fs.statSync(oauthTokenPath(env)).mode & 0o777, 0o600);
  } finally {
    auth.server.close();
  }
});

test("login runs DCR + PKCE S256 over loopback and verifies the code_verifier", async () => {
  const { login, oauthTokenPath } = await import(helperPath);
  let challenge = "";
  const auth = await startServer((req, res) => {
    const origin = `http://${req.headers.host}`;
    if (req.url === "/.well-known/oauth-authorization-server") {
      return json(res, 200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        scopes_supported: ["read"],
        code_challenge_methods_supported: ["S256"]
      });
    }
    if (req.url === "/oauth/register") {
      return json(res, 201, { client_id: "hyc_login" });
    }
    if (req.url === "/oauth/token") {
      return json(res, 200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });
    }
    json(res, 404, {});
  });
  const { env } = tempConfigEnv();
  const seen = { authorize: null, redirect: null };

  try {
    // Re-read the token request body from the recorded requests below.
    const outcome = await login({
      env,
      issuer: auth.url,
      timeoutMs: 10000,
      announce: async (authorizeUrl) => {
        const url = new URL(authorizeUrl);
        seen.authorize = Object.fromEntries(url.searchParams);
        challenge = url.searchParams.get("code_challenge");
        seen.redirect = url.searchParams.get("redirect_uri");
        const wrong = await fetch(`${seen.redirect}?code=x&state=wrong`);
        assert.equal(wrong.status, 400, "a callback with the wrong state must be rejected");
      }
    }).catch((error) => error);

    // The wrong-state callback aborts the flow by design; run a clean flow next.
    assert.equal(outcome.code, "oauth_failed");

    const clean = await login({
      env,
      issuer: auth.url,
      timeoutMs: 10000,
      announce: async (authorizeUrl) => {
        const url = new URL(authorizeUrl);
        seen.authorize = Object.fromEntries(url.searchParams);
        challenge = url.searchParams.get("code_challenge");
        await fetch(`${url.searchParams.get("redirect_uri")}?code=the_code&state=${url.searchParams.get("state")}`);
      }
    });

    assert.equal(seen.authorize.response_type, "code");
    assert.equal(seen.authorize.client_id, "hyc_login");
    assert.equal(seen.authorize.code_challenge_method, "S256");
    assert.match(seen.authorize.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const tokenRequest = auth.requests.filter((r) => r.url === "/oauth/token").at(-1);
    const form = new URLSearchParams(tokenRequest.body);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), "the_code");
    assert.equal(
      crypto.createHash("sha256").update(form.get("code_verifier")).digest("base64url"),
      challenge,
      "code_verifier must hash to the challenge sent to /authorize"
    );
    assert.equal(clean.hasRefreshToken, true);
    assert.equal(JSON.parse(fs.readFileSync(oauthTokenPath(env), "utf8")).access_token, "at");
    assert.equal(fs.statSync(oauthTokenPath(env)).mode & 0o777, 0o600);
  } finally {
    auth.server.close();
  }
});

test("a 401 with an OAuth credential tells the user to use an API key", async () => {
  const { classifyHttpFailure } = await import(helperPath);
  const response = { status: 401, headers: new Headers() };
  const error = classifyHttpFailure(response, { success: false, error: "Invalid or expired API key" }, "oauth");
  assert.equal(error.code, "unauthorized");
  assert.match(error.message, /API key/);
});
