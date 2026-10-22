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

function sse(res, message, headers = {}) {
  res.writeHead(200, { "content-type": "text/event-stream", ...headers });
  res.end(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
}

// Minimal Streamable-HTTP MCP server. `tools` maps tool name -> (args) => result.
// Replies as SSE for tools/call (as the real server may) and JSON for the handshake.
async function startMcp(tools, { sseForCalls = true } = {}) {
  const api = await startServer((req, res) => {
    const message = req.body ? JSON.parse(req.body) : {};
    if (message.method === "initialize") {
      return json(
        res,
        200,
        { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "mock" } } },
        { "mcp-session-id": "sess-1" }
      );
    }
    if (message.method === "notifications/initialized") {
      res.writeHead(202).end();
      return;
    }
    if (message.method === "tools/call") {
      const reply = { jsonrpc: "2.0", id: message.id, result: tools[message.params.name](message.params.arguments) };
      return sseForCalls ? sse(res, reply) : json(res, 200, reply);
    }
    json(res, 400, {});
  });
  api.calls = () =>
    api.requests.filter((r) => r.body && JSON.parse(r.body).method === "tools/call").map((r) => JSON.parse(r.body).params);
  return api;
}

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
const toolError = (data) => ({ isError: true, content: [{ type: "text", text: JSON.stringify(data) }] });

test("reserve without --confirm previews and never touches the network", async () => {
  const { runCommand } = await import(helperPath);
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: "http://127.0.0.1:1/mcp" });

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

test("reserve --confirm runs the MCP handshake then calls request_reservation with the exact arguments", async () => {
  const { runCommand } = await import(helperPath);
  const mcp = await startMcp({
    request_reservation: () => ok({ success: true, data: { reservationId: "r-1", status: "pending" } })
  });
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${mcp.url}/mcp` });
  const options = { "place-id": "1726507251", time: FUTURE, guests: "4", phone: "010-1234-5678", note: "창가", confirm: true };

  try {
    const first = await runCommand("reserve", options, [], { env });
    const second = await runCommand("reserve", options, [], { env });

    assert.equal(first.data.data.status, "pending");
    const methods = mcp.requests.slice(0, 3).map((r) => JSON.parse(r.body).method);
    assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/call"]);
    assert.equal(mcp.requests[0].headers.authorization, "Bearer hmp_test");
    assert.equal(mcp.requests[2].headers["mcp-session-id"], "sess-1", "later requests must carry the session id");
    assert.equal(mcp.requests[2].headers["mcp-protocol-version"], "2025-06-18");

    const [call] = mcp.calls();
    assert.equal(call.name, "request_reservation");
    assert.deepEqual(call.arguments, {
      placeId: "1726507251",
      reservationTime: FUTURE,
      guestCount: 4,
      guestPhone: "010-1234-5678",
      note: "창가",
      idempotencyKey: first.request.idempotencyKey
    });
    assert.equal(first.request.idempotencyKey, second.request.idempotencyKey, "retrying the same request must reuse the key");
  } finally {
    mcp.server.close();
  }
});

test("a plain application/json tools/call reply is accepted as well as SSE", async () => {
  const { runCommand } = await import(helperPath);
  const mcp = await startMcp({ resolve_regions: () => ok({ regions: [{ dong: "홍제동" }] }) }, { sseForCalls: false });
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${mcp.url}/mcp` });

  try {
    const result = await runCommand("regions", { dong: "홍제동" }, [], { env });
    assert.deepEqual(result.data, { regions: [{ dong: "홍제동" }] });
    assert.deepEqual(mcp.calls()[0], { name: "resolve_regions", arguments: { dong: "홍제동" } });
  } finally {
    mcp.server.close();
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

test("a non-Korean phone requires an email, a Korean phone does not", async () => {
  const { buildReservationRequest } = await import(helperPath);
  const base = { "place-id": "1", time: FUTURE, guests: "2" };

  assert.throws(() => buildReservationRequest({ ...base, phone: "+1 415 555 0100" }), { code: "invalid_input" });
  const foreign = buildReservationRequest({ ...base, phone: "+1 415 555 0100", email: "a@example.com" });
  assert.equal(foreign.guestEmail, "a@example.com");
  assert.equal(buildReservationRequest({ ...base, phone: "+82 10-1234-5678" }).guestEmail, undefined);
  assert.equal(buildReservationRequest({ ...base, phone: "010-1234-5678" }).guestEmail, undefined);
});

test("tool-level isError results become typed errors that keep retryAfter", async () => {
  const { runCommand } = await import(helperPath);
  const mcp = await startMcp({
    request_reservation: () =>
      toolError({ error: { code: "reservation_requests_closed", message: "closed" }, retryAfter: "2026-12-01T02:00:00.000Z" }),
    request_live_status: () => ({ isError: true, content: [{ type: "text", text: "live_status_not_available: no owner app" }] })
  });
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${mcp.url}/mcp` });

  try {
    await assert.rejects(
      runCommand("reserve", { "place-id": "1", time: FUTURE, guests: "2", phone: "010-1234-5678", confirm: true }, [], { env }),
      (error) => {
        assert.equal(error.code, "reservation_requests_closed");
        assert.equal(error.details.retryAfter, "2026-12-01T02:00:00.000Z");
        return true;
      }
    );
    await assert.rejects(
      runCommand("live-ask", { "place-id": "1", kind: "seats", topic: "party of 10", confirm: true }, [], { env }),
      { code: "live_status_not_available" }
    );
  } finally {
    mcp.server.close();
  }
});

test("HTTP 401 and 429 from the MCP endpoint map to unauthorized and rate_limited with the right remedy", async () => {
  const { runCommand } = await import(helperPath);
  let status = 401;
  const api = await startServer((req, res) =>
    json(res, status, { error: "invalid_token", error_description: "bad token" }, status === 429 ? { "retry-after": "7" } : {})
  );
  const withKey = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${api.url}/mcp` });

  try {
    await assert.rejects(runCommand("search", { keyword: "a" }, [], { env: withKey.env }), (error) => {
      assert.equal(error.code, "unauthorized");
      assert.match(error.message, /KSKILL_HEYYUMI_API_KEY/);
      return true;
    });

    const { oauthTokenPath } = await import(helperPath);
    const oauth = tempConfigEnv({ KSKILL_HEYYUMI_MCP_URL: `${api.url}/mcp` });
    fs.writeFileSync(oauthTokenPath(oauth.env), JSON.stringify({ access_token: "tok", expires_at: 0 }));
    await assert.rejects(runCommand("search", { keyword: "a" }, [], { env: oauth.env }), (error) => {
      assert.equal(error.code, "unauthorized");
      assert.match(error.message, /heyyumi\.mjs login/);
      return true;
    });

    status = 429;
    await assert.rejects(runCommand("search", { keyword: "a" }, [], { env: withKey.env }), (error) => {
      assert.equal(error.code, "rate_limited");
      assert.equal(error.details.retryAfter, "7");
      return true;
    });
  } finally {
    api.server.close();
  }
});

test("search maps flags to typed tool arguments, including repeatable --filter", async () => {
  const { runCommand } = await import(helperPath);
  const mcp = await startMcp({ search_places: () => ok({ data: [] }) });
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${mcp.url}/mcp` });

  try {
    await runCommand(
      "search",
      {
        keyword: "파스타",
        "region-code": "1141011100",
        reservable: "true",
        "open-at": "2026-12-01T19:00",
        "page-size": "5",
        "min-confidence": "0.7",
        filter: ["wifi=true", "pet_friendly=true"]
      },
      [],
      { env }
    );
    assert.deepEqual(mcp.calls()[0], {
      name: "search_places",
      arguments: {
        wifi: "true",
        pet_friendly: "true",
        keyword: "파스타",
        region_code: "1141011100",
        reservable: "true",
        open_at: "2026-12-01T19:00",
        page_size: 5,
        min_confidence: 0.7
      }
    });
    await assert.rejects(runCommand("search", { filter: ["nonsense"] }, [], { env }), { code: "invalid_input" });
    await assert.rejects(runCommand("search", { "page-size": "x" }, [], { env }), { code: "invalid_input" });
  } finally {
    mcp.server.close();
  }
});

test("nearby sends numeric lat/lng and the tool's radius_m name", async () => {
  const { runCommand } = await import(helperPath);
  const mcp = await startMcp({ nearby_places: () => ok({ data: [] }) });
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${mcp.url}/mcp` });

  try {
    await runCommand("nearby", { lat: "37.589", lng: "126.943", radius: "800", keyword: "카페" }, [], { env });
    assert.deepEqual(mcp.calls()[0], {
      name: "nearby_places",
      arguments: { keyword: "카페", lat: 37.589, lng: 126.943, radius_m: 800 }
    });
  } finally {
    mcp.server.close();
  }
});

test("status commands pick the one-shot or the blocking tool by --wait", async () => {
  const { runCommand } = await import(helperPath);
  const mcp = await startMcp({
    get_reservation: () => ok({ status: "pending" }),
    wait_for_reservation: () => ok({ status: "confirmed", settled: true }),
    get_live_status: () => ok({ status: "pending" }),
    wait_for_live_status: () => ok({ status: "available", settled: true })
  });
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: `${mcp.url}/mcp` });

  try {
    await runCommand("reservation-status", {}, ["r-1"], { env });
    await runCommand("reservation-status", { wait: true }, ["r-1"], { env });
    await runCommand("live-status", {}, ["q-1"], { env });
    await runCommand("live-status", { wait: true }, ["q-1"], { env });
    assert.deepEqual(
      mcp.calls().map((call) => [call.name, call.arguments]),
      [
        ["get_reservation", { reservationId: "r-1" }],
        ["wait_for_reservation", { reservationId: "r-1" }],
        ["get_live_status", { queryId: "q-1" }],
        ["wait_for_live_status", { queryId: "q-1" }]
      ]
    );
  } finally {
    mcp.server.close();
  }
});

test("live-ask validates kind and previews without --confirm", async () => {
  const { runCommand, buildLiveStatusRequest } = await import(helperPath);
  const { env } = tempConfigEnv({ KSKILL_HEYYUMI_API_KEY: "hmp_test", KSKILL_HEYYUMI_MCP_URL: "http://127.0.0.1:1/mcp" });

  assert.throws(() => buildLiveStatusRequest({ "place-id": "1", kind: "menu", topic: "x" }), { code: "invalid_input" });
  const preview = await runCommand("live-ask", { "place-id": "1", kind: "seats", topic: "party of 10" }, [], { env });
  assert.equal(preview.preview, true);
  assert.equal(preview.request.kind, "seats");
});

test("missing credentials point at login first, not at an API key", async () => {
  const { resolveCredential } = await import(helperPath);
  const { env } = tempConfigEnv();

  await assert.rejects(resolveCredential({ env }), (error) => {
    assert.equal(error.code, "missing_credentials");
    assert.ok(error.message.indexOf("login") < error.message.indexOf("KSKILL_HEYYUMI_API_KEY"));
    return true;
  });
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
    assert.deepEqual(await resolveCredential({ env }), { kind: "oauth", token: "new_access" });
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

test("a rejected refresh asks the user to sign in again instead of retrying", async () => {
  const { resolveCredential, oauthTokenPath } = await import(helperPath);
  const auth = await startServer((req, res) => json(res, 400, { error: "invalid_grant" }));
  const { env } = tempConfigEnv();
  fs.writeFileSync(
    oauthTokenPath(env),
    JSON.stringify({
      access_token: "old",
      refresh_token: "revoked",
      expires_at: Date.now() - 1000,
      token_endpoint: `${auth.url}/oauth/token`,
      client_id: "hyc_1"
    })
  );

  try {
    await assert.rejects(resolveCredential({ env }), { code: "login_required" });
  } finally {
    auth.server.close();
  }
});

function oauthServer({ onToken } = {}) {
  return startServer((req, res) => {
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
      onToken?.(new URLSearchParams(req.body));
      return json(res, 200, { access_token: "at", refresh_token: "rt", expires_in: 3600 });
    }
    json(res, 404, {});
  });
}

test("login rejects a callback with the wrong state", async () => {
  const { login } = await import(helperPath);
  const auth = await oauthServer();
  const { env } = tempConfigEnv();

  try {
    await assert.rejects(
      login({
        env,
        issuer: auth.url,
        timeoutMs: 10000,
        announce: async (authorizeUrl) => {
          const redirect = new URL(authorizeUrl).searchParams.get("redirect_uri");
          const response = await fetch(`${redirect}?code=x&state=wrong`);
          assert.equal(response.status, 400);
        }
      }),
      { code: "oauth_failed" }
    );
  } finally {
    auth.server.close();
  }
});

test("login runs DCR + PKCE S256 over loopback, binds the MCP resource, and verifies the code_verifier", async () => {
  const { login, oauthTokenPath } = await import(helperPath);
  let tokenForm;
  const auth = await oauthServer({ onToken: (form) => (tokenForm = form) });
  const { env } = tempConfigEnv();
  let authorize;

  try {
    const outcome = await login({
      env,
      issuer: auth.url,
      timeoutMs: 10000,
      announce: async (authorizeUrl) => {
        const url = new URL(authorizeUrl);
        authorize = Object.fromEntries(url.searchParams);
        await fetch(`${authorize.redirect_uri}?code=the_code&state=${authorize.state}`);
      }
    });

    assert.equal(authorize.response_type, "code");
    assert.equal(authorize.client_id, "hyc_login");
    assert.equal(authorize.code_challenge_method, "S256");
    assert.equal(authorize.resource, "https://mcp.heyyumi.ai");
    assert.match(authorize.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    assert.equal(tokenForm.get("grant_type"), "authorization_code");
    assert.equal(tokenForm.get("code"), "the_code");
    assert.equal(tokenForm.get("redirect_uri"), authorize.redirect_uri);
    assert.equal(
      crypto.createHash("sha256").update(tokenForm.get("code_verifier")).digest("base64url"),
      authorize.code_challenge,
      "code_verifier must hash to the challenge sent to /authorize"
    );
    assert.equal(outcome.hasRefreshToken, true);
    const saved = JSON.parse(fs.readFileSync(oauthTokenPath(env), "utf8"));
    assert.equal(saved.access_token, "at");
    assert.equal(fs.statSync(oauthTokenPath(env)).mode & 0o777, 0o600);
  } finally {
    auth.server.close();
  }
});
