#!/usr/bin/env node
// HeyYumi (https://heyyumi.ai) helper: Korean restaurant/cafe/bar search and
// table-reservation requests through HeyYumi's hosted MCP server
// (https://mcp.heyyumi.ai/mcp, Streamable HTTP).
//
// Why MCP and not REST: HeyYumi documents Google sign-in (OAuth 2.1) only for the
// MCP server. REST (api.heyyumi.ai) documents hmp_ API keys only. The MCP server
// accepts both a Google-login OAuth token and an hmp_ key as the Bearer token, so
// one transport serves users with and without a key. No k-skill-proxy is used.
//
// Anything that reaches a venue owner or a guest's phone (reserve, live-ask) only
// prints a preview unless --confirm is passed, so the calling agent must get
// explicit user approval first.
//
// Credentials, in order: KSKILL_HEYYUMI_API_KEY (env or
// ~/.config/k-skill/secrets.env), then the OAuth token saved by `login`.
// Secrets are never printed.

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_MCP_URL = "https://mcp.heyyumi.ai/mcp";
export const DEFAULT_OAUTH_ISSUER = "https://heyyumi.ai";
// RFC 8707 resource indicator: the audience the OAuth token is minted for.
export const DEFAULT_OAUTH_RESOURCE = "https://mcp.heyyumi.ai";
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_TIMEOUT_MS = 30000;
// wait_for_* tools block ~25s server-side before answering.
export const LONG_POLL_TIMEOUT_MS = 60000;
export const LIVE_STATUS_KINDS = ["item", "wait", "seats"];
export const API_KEY_ENV = "KSKILL_HEYYUMI_API_KEY";

export class HeyYumiError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "HeyYumiError";
    this.code = code;
    this.details = details;
  }
}

// ---- credentials ----------------------------------------------------------

function configDir(env = process.env) {
  return env.KSKILL_CONFIG_DIR || path.join(os.homedir(), ".config", "k-skill");
}

export function oauthTokenPath(env = process.env) {
  return path.join(configDir(env), "heyyumi-oauth.json");
}

function parseDotenvValue(text, name) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && match[1] === name) {
      return match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return "";
}

export function resolveApiKey(env = process.env) {
  if (env[API_KEY_ENV]) {
    return env[API_KEY_ENV];
  }
  try {
    return parseDotenvValue(fs.readFileSync(path.join(configDir(env), "secrets.env"), "utf8"), API_KEY_ENV);
  } catch {
    return "";
  }
}

function readOauthTokens(env = process.env) {
  try {
    return JSON.parse(fs.readFileSync(oauthTokenPath(env), "utf8"));
  } catch {
    return null;
  }
}

function writeOauthTokens(tokens, env = process.env) {
  const file = oauthTokenPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

async function postForm(url, params, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HeyYumiError("oauth_failed", `OAuth token endpoint returned HTTP ${response.status}`, {
      status: response.status,
      error: body.error,
      errorDescription: body.error_description
    });
  }
  return body;
}

function tokensFromResponse(body, previous, meta) {
  if (!body.access_token) {
    throw new HeyYumiError("oauth_failed", "OAuth token response has no access_token");
  }
  return {
    ...meta,
    access_token: body.access_token,
    refresh_token: body.refresh_token || previous?.refresh_token || "",
    expires_at: body.expires_in ? Date.now() + Number(body.expires_in) * 1000 : 0,
    scope: body.scope || previous?.scope || ""
  };
}

// Returns a usable credential: { kind: "api_key" | "oauth", token }.
export async function resolveCredential({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const apiKey = resolveApiKey(env);
  if (apiKey) {
    return { kind: "api_key", token: apiKey };
  }
  const saved = readOauthTokens(env);
  if (saved?.access_token) {
    const expired = saved.expires_at && saved.expires_at - 30000 <= now();
    if (!expired) {
      return { kind: "oauth", token: saved.access_token };
    }
    if (saved.refresh_token && saved.token_endpoint && saved.client_id) {
      let refreshed;
      try {
        refreshed = await postForm(
          saved.token_endpoint,
          { grant_type: "refresh_token", refresh_token: saved.refresh_token, client_id: saved.client_id },
          { fetchImpl }
        );
      } catch (error) {
        if (error instanceof HeyYumiError && error.details.status >= 400 && error.details.status < 500) {
          throw new HeyYumiError("login_required", "HeyYumi sign-in expired. Run: heyyumi.mjs login", error.details);
        }
        throw error;
      }
      const next = tokensFromResponse(refreshed, saved, {
        issuer: saved.issuer,
        token_endpoint: saved.token_endpoint,
        client_id: saved.client_id
      });
      writeOauthTokens(next, env);
      return { kind: "oauth", token: next.access_token };
    }
    throw new HeyYumiError("login_required", "HeyYumi sign-in expired. Run: heyyumi.mjs login");
  }
  throw new HeyYumiError(
    "missing_credentials",
    `Not signed in to HeyYumi. Run: heyyumi.mjs login (Google sign-in, no key needed), or set ${API_KEY_ENV}`
  );
}

// ---- MCP Streamable HTTP client -------------------------------------------

function mcpUrl(env = process.env) {
  return env.KSKILL_HEYYUMI_MCP_URL || DEFAULT_MCP_URL;
}

// Streamable HTTP answers either application/json or a text/event-stream whose
// `data:` events carry JSON-RPC messages. Returns the message for `id`.
export function parseRpcResponse(text, contentType, id) {
  const messages = [];
  if (/text\/event-stream/i.test(contentType || "")) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) {
        try {
          messages.push(JSON.parse(data));
        } catch {
          // ignore non-JSON keep-alives
        }
      }
    }
  } else if (text.trim()) {
    try {
      const parsed = JSON.parse(text);
      messages.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      return null;
    }
  }
  return messages.find((message) => message.id === id) ?? null;
}

export function classifyHttpFailure(response, bodyText, credentialKind) {
  const status = response.status;
  let payload = null;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    // non-JSON body
  }
  const message = payload?.error_description || payload?.message
    || (typeof payload?.error === "string" ? payload.error : payload?.error?.message) || `HTTP ${status}`;
  const details = { status, retryAfter: response.headers.get("retry-after") ?? undefined };

  if (status === 401 || status === 403) {
    const remedy = credentialKind === "api_key"
      ? `check ${API_KEY_ENV} (key from https://heyyumi.ai/dashboard)`
      : "run: heyyumi.mjs login";
    return new HeyYumiError("unauthorized", `HeyYumi rejected the credential (${message}); ${remedy}`, details);
  }
  if (status === 429) {
    return new HeyYumiError("rate_limited", `HeyYumi rate or daily quota limit hit: ${message}`, details);
  }
  return new HeyYumiError(status >= 500 ? "upstream_error" : "http_error", message, details);
}

const KNOWN_TOOL_ERROR_CODES = [
  "reservation_not_available", "reservation_requests_closed", "venue_closed_at_requested_time",
  "live_status_not_available", "reservation_time_past", "guest_phone_required", "guest_email_required",
  "venue_not_found", "reservation_not_found", "bulk_export_required", "rate_limited"
];

// A tool-level failure arrives as a successful JSON-RPC result with isError=true.
export function toolErrorFrom(result) {
  const text = (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // plain-text error
  }
  const rawCode = payload?.error?.code ?? payload?.code ?? (typeof payload?.error === "string" ? payload.error : undefined);
  const code = rawCode || KNOWN_TOOL_ERROR_CODES.find((known) => text.includes(known)) || "tool_error";
  const message = payload?.error?.message ?? payload?.message ?? (text || "HeyYumi tool call failed");
  return new HeyYumiError(code, message, {
    retryAfter: payload?.retryAfter ?? payload?.error?.retryAfter
  });
}

function toolResultData(result) {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function callTool(name, args, { env = process.env, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now } = {}) {
  const credential = await resolveCredential({ env, fetchImpl, now });
  const url = mcpUrl(env);
  let nextId = 0;
  let sessionId = "";

  const post = async (message, { expectResponse = true } = {}) => {
    const headers = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${credential.token}`
    };
    if (message.method !== "initialize") {
      headers["mcp-protocol-version"] = MCP_PROTOCOL_VERSION;
    }
    if (sessionId) {
      headers["mcp-session-id"] = sessionId;
    }
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    if (!response.ok) {
      throw classifyHttpFailure(response, text, credential.kind);
    }
    sessionId = response.headers.get("mcp-session-id") || sessionId;
    if (!expectResponse) {
      return null;
    }
    const reply = parseRpcResponse(text, response.headers.get("content-type"), message.id);
    if (!reply) {
      throw new HeyYumiError("upstream_error", `MCP server sent no reply to ${message.method}`);
    }
    if (reply.error) {
      throw new HeyYumiError("mcp_error", reply.error.message || `MCP error ${reply.error.code}`, { rpcCode: reply.error.code });
    }
    return reply.result;
  };

  await post({
    jsonrpc: "2.0",
    id: ++nextId,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "k-skill-heyyumi", version: "1" }
    }
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { expectResponse: false });
  const result = await post({ jsonrpc: "2.0", id: ++nextId, method: "tools/call", params: { name, arguments: args } });

  if (result.isError) {
    throw toolErrorFrom(result);
  }
  return { data: toolResultData(result) };
}

// ---- input builders -------------------------------------------------------

function requireText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new HeyYumiError("invalid_input", `--${name} is required`);
  }
  return text;
}

function positiveInt(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new HeyYumiError("invalid_input", `--${name} must be an integer >= 1`);
  }
  return number;
}

export function normalizePhone(value) {
  const phone = requireText(value, "phone");
  if (!/^\+?[0-9\-\s()]{7,20}$/.test(phone)) {
    throw new HeyYumiError("invalid_input", "--phone must look like 010-1234-5678 or +<country><number>");
  }
  return phone;
}

export function isKoreanPhone(phone) {
  const digits = phone.replace(/[^0-9+]/g, "");
  return /^01[016789]/.test(digits) || /^\+82/.test(digits);
}

// Requires an explicit UTC offset so a "19:00" can never silently shift zones.
export function parseReservationTime(value, { now = Date.now } = {}) {
  const text = requireText(value, "time");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new HeyYumiError("invalid_input", "--time must be ISO 8601 with an offset, e.g. 2026-12-01T19:00:00+09:00");
  }
  const millis = Date.parse(text);
  if (Number.isNaN(millis)) {
    throw new HeyYumiError("invalid_input", `--time is not a valid date: ${text}`);
  }
  if (millis <= now()) {
    throw new HeyYumiError("invalid_input", "--time must be in the future");
  }
  return text;
}

export function deriveIdempotencyKey(fields) {
  const digest = createHash("sha256")
    .update([fields.placeId, fields.reservationTime, fields.guestCount, fields.guestPhone].join("|"))
    .digest("hex");
  return `kskill-${digest.slice(0, 32)}`;
}

export function buildReservationRequest(options, { now = Date.now } = {}) {
  const request = {
    placeId: requireText(options["place-id"], "place-id"),
    reservationTime: parseReservationTime(options.time, { now }),
    guestCount: positiveInt(options.guests, "guests"),
    guestPhone: normalizePhone(options.phone)
  };
  if (options.name) {
    request.guestName = String(options.name).trim();
  }
  if (options.email) {
    request.guestEmail = String(options.email).trim();
  }
  if (!isKoreanPhone(request.guestPhone) && !request.guestEmail) {
    throw new HeyYumiError(
      "invalid_input",
      "--email is required when --phone is not a Korean number (HeyYumi emails the outcome instead of texting)"
    );
  }
  if (options.note) {
    request.note = String(options.note).trim();
  }
  request.idempotencyKey = options["idempotency-key"] || deriveIdempotencyKey(request);
  return request;
}

export function buildLiveStatusRequest(options) {
  const kind = requireText(options.kind, "kind");
  if (!LIVE_STATUS_KINDS.includes(kind)) {
    throw new HeyYumiError("invalid_input", `--kind must be one of ${LIVE_STATUS_KINDS.join(", ")}`);
  }
  const request = {
    placeId: requireText(options["place-id"], "place-id"),
    kind,
    topic: requireText(options.topic, "topic")
  };
  if (options.question) {
    request.question = String(options.question).trim();
  }
  return request;
}

// ---- search arguments -----------------------------------------------------

// Flags that map 1:1 to string arguments of search_places / nearby_places.
const STRING_FILTERS = [
  "keyword", "region_code", "region_name", "business_category", "recommended_for", "atmosphere", "parking",
  "parking_type", "reservable", "payment_methods", "serves", "dietary", "foreign_languages", "subtype", "bbq_meat",
  "view", "legacy", "local_food", "exclude", "muslim_friendly", "open_at", "include_unknown_hours",
  "reservation_channel", "fields"
];
const INTEGER_FILTERS = ["page", "page_size"];

function toInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new HeyYumiError("invalid_input", `--${name} must be an integer`);
  }
  return number;
}

function toNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new HeyYumiError("invalid_input", `--${name} must be a number`);
  }
  return number;
}

// `--filter wifi=true` reaches any of the boolean presence filters the tools accept
// (pet_friendly, private_room, ...) without a dedicated flag for each.
function parseFilters(values = []) {
  const extra = {};
  for (const entry of values) {
    const match = String(entry).match(/^([a-z][a-z0-9_]*)=(.+)$/);
    if (!match) {
      throw new HeyYumiError("invalid_input", `--filter expects key=value, got "${entry}"`);
    }
    extra[match[1]] = match[2];
  }
  return extra;
}

export function buildSearchArguments(options) {
  const args = parseFilters(options.filter);
  for (const key of STRING_FILTERS) {
    const value = options[key.replaceAll("_", "-")];
    if (value !== undefined) {
      args[key] = value;
    }
  }
  for (const key of INTEGER_FILTERS) {
    const value = options[key.replaceAll("_", "-")];
    if (value !== undefined) {
      args[key] = toInteger(value, key.replaceAll("_", "-"));
    }
  }
  if (options["min-confidence"] !== undefined) {
    args.min_confidence = toNumber(options["min-confidence"], "min-confidence");
  }
  return args;
}

// ---- commands -------------------------------------------------------------

export async function runCommand(command, options, positionals, context = {}) {
  const call = (name, args, extra = {}) => callTool(name, args, { ...context, ...extra });

  switch (command) {
    case "regions":
      return call("resolve_regions", compact({ dong: options.dong, sigungu: options.sigungu, sido: options.sido }));
    case "search":
      return call("search_places", buildSearchArguments(options));
    case "nearby": {
      const args = {
        ...buildSearchArguments(options),
        lat: toNumber(requireText(options.lat, "lat"), "lat"),
        lng: toNumber(requireText(options.lng, "lng"), "lng")
      };
      if (options.radius !== undefined) {
        args.radius_m = toInteger(options.radius, "radius");
      }
      if (options.sort !== undefined) {
        args.sort = options.sort;
      }
      return call("nearby_places", args);
    }
    case "place": {
      const id = requireText(positionals[0] ?? options["place-id"], "place-id");
      return call("get_place", compact({ id, fields: options.fields }));
    }
    case "reserve": {
      const body = buildReservationRequest(options, { now: context.now });
      if (!options.confirm) {
        return { preview: true, sent: false, request: body };
      }
      const result = await call("request_reservation", body);
      return { ...result, request: body };
    }
    case "reservation-status": {
      const reservationId = requireText(positionals[0] ?? options.id, "id");
      return options.wait
        ? call("wait_for_reservation", { reservationId }, { timeoutMs: LONG_POLL_TIMEOUT_MS })
        : call("get_reservation", { reservationId });
    }
    case "live-ask": {
      const body = buildLiveStatusRequest(options);
      if (!options.confirm) {
        return { preview: true, sent: false, request: body };
      }
      const result = await call("request_live_status", body);
      return { ...result, request: body };
    }
    case "live-status": {
      const queryId = requireText(positionals[0] ?? options.id, "id");
      return options.wait
        ? call("wait_for_live_status", { queryId }, { timeoutMs: LONG_POLL_TIMEOUT_MS })
        : call("get_live_status", { queryId });
    }
    default:
      throw new HeyYumiError("invalid_input", `unknown command "${command}"`);
  }
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ""));
}

// ---- OAuth (Google sign-in is handled by HeyYumi's own authorization server) --

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function discoverOauth(issuer, fetchImpl) {
  const response = await fetchImpl(`${issuer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new HeyYumiError("oauth_failed", `OAuth discovery failed with HTTP ${response.status}`);
  }
  const metadata = await response.json();
  for (const field of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) {
    if (!metadata[field]) {
      throw new HeyYumiError("oauth_failed", `OAuth metadata is missing ${field}`);
    }
  }
  if (!(metadata.code_challenge_methods_supported ?? []).includes("S256")) {
    throw new HeyYumiError("oauth_failed", "Authorization server does not advertise PKCE S256");
  }
  return metadata;
}

function listenOnce(onRequest) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(onRequest);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Loopback PKCE flow. `announce(url)` hands the sign-in URL to the user, who signs
// in with Google on heyyumi.ai. The browser must run on the same machine as this
// process because the redirect goes to 127.0.0.1.
export async function login({ env = process.env, fetchImpl = fetch, announce, issuer, timeoutMs = 300000, resource = DEFAULT_OAUTH_RESOURCE } = {}) {
  const base = issuer || env.KSKILL_HEYYUMI_OAUTH_ISSUER || DEFAULT_OAUTH_ISSUER;
  const metadata = await discoverOauth(base, fetchImpl);
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(16).toString("base64url");

  let settle;
  const callback = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  const server = await listenOnce((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const finish = (status, text) => {
      res.writeHead(status, { "content-type": "text/plain; charset=utf-8" }).end(text);
    };
    if (url.searchParams.get("state") !== state) {
      finish(400, "state mismatch");
      settle.reject(new HeyYumiError("oauth_failed", "OAuth state mismatch"));
      return;
    }
    if (url.searchParams.get("error")) {
      finish(400, "HeyYumi login was denied. You can close this tab.");
      settle.reject(new HeyYumiError("oauth_denied", `Authorization failed: ${url.searchParams.get("error")}`));
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      finish(400, "missing code");
      settle.reject(new HeyYumiError("oauth_failed", "OAuth callback has no code"));
      return;
    }
    finish(200, "HeyYumi login complete. You can close this tab.");
    settle.resolve(code);
  });

  const timer = setTimeout(() => settle.reject(new HeyYumiError("oauth_timeout", "Timed out waiting for HeyYumi sign-in")), timeoutMs);
  try {
    const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
    const registrationResponse = await fetchImpl(metadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: "k-skill heyyumi",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    const registration = await registrationResponse.json().catch(() => ({}));
    if (!registrationResponse.ok || !registration.client_id) {
      throw new HeyYumiError("oauth_failed", `Client registration failed with HTTP ${registrationResponse.status}`);
    }

    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: registration.client_id,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: (metadata.scopes_supported ?? ["read"]).join(" "),
      state,
      ...(resource ? { resource } : {})
    }).toString();
    announce?.(authorizeUrl.toString());

    const code = await callback;
    const body = await postForm(
      metadata.token_endpoint,
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: registration.client_id,
        redirect_uri: redirectUri,
        ...(resource ? { resource } : {})
      },
      { fetchImpl }
    );
    const tokens = tokensFromResponse(body, null, {
      issuer: base,
      token_endpoint: metadata.token_endpoint,
      client_id: registration.client_id
    });
    writeOauthTokens(tokens, env);
    return { saved: oauthTokenPath(env), expiresAt: tokens.expires_at || null, hasRefreshToken: Boolean(tokens.refresh_token) };
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

// ---- CLI ------------------------------------------------------------------

const COMMANDS = ["regions", "search", "nearby", "place", "reserve", "reservation-status", "live-ask", "live-status", "login"];

const OPTION_SPEC = {
  dong: { type: "string" }, sigungu: { type: "string" }, sido: { type: "string" },
  keyword: { type: "string" }, "region-code": { type: "string" }, "region-name": { type: "string" },
  "business-category": { type: "string" }, "min-confidence": { type: "string" },
  "recommended-for": { type: "string" }, atmosphere: { type: "string" }, parking: { type: "string" },
  "parking-type": { type: "string" }, reservable: { type: "string" }, "payment-methods": { type: "string" },
  serves: { type: "string" }, dietary: { type: "string" }, "foreign-languages": { type: "string" },
  subtype: { type: "string" }, "bbq-meat": { type: "string" }, view: { type: "string" }, legacy: { type: "string" },
  "local-food": { type: "string" }, exclude: { type: "string" }, "muslim-friendly": { type: "string" },
  "open-at": { type: "string" }, "include-unknown-hours": { type: "string" },
  "reservation-channel": { type: "string" }, page: { type: "string" }, "page-size": { type: "string" },
  fields: { type: "string" }, filter: { type: "string", multiple: true },
  sort: { type: "string" }, radius: { type: "string" }, lat: { type: "string" }, lng: { type: "string" },
  "place-id": { type: "string" }, time: { type: "string" }, guests: { type: "string" }, phone: { type: "string" },
  email: { type: "string" }, name: { type: "string" }, note: { type: "string" }, "idempotency-key": { type: "string" },
  kind: { type: "string" }, topic: { type: "string" }, question: { type: "string" }, id: { type: "string" },
  wait: { type: "boolean" }, confirm: { type: "boolean" }, resource: { type: "string" }, help: { type: "boolean", short: "h" }
};

const USAGE = `Usage: heyyumi.mjs <command> [options]

Auth (no API key needed):
  login                    Google sign-in on heyyumi.ai (OAuth 2.1 + PKCE); saves a 0600 token file
  KSKILL_HEYYUMI_API_KEY   optional hmp_ key; takes precedence over the saved sign-in

Read (no side effects):
  regions --dong 홍제동 [--sigungu 서대문구] [--sido 서울]
  search --keyword 파스타 [--region-code C] [--reservable true] [--open-at "2026-12-01T19:00"] [--filter wifi=true]
  nearby --lat 37.589 --lng 126.943 [--radius 1000] [--keyword ...]
  place <place-id> [--fields core,contact_hours,quality]
  reservation-status <reservation-id> [--wait]     --wait blocks up to ~25s per call
  live-status <query-id> [--wait]

Side effects (preview unless --confirm):
  reserve --place-id ID --time 2026-12-01T19:00:00+09:00 --guests 2 --phone 010-1234-5678 [--name N] [--email E] [--note T] --confirm
  live-ask --place-id ID --kind item|wait|seats --topic "<bare token>" [--question T] --confirm
`;

export async function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTION_SPEC, allowPositionals: true });
  } catch (error) {
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
  const [command, ...positionals] = parsed.positionals;
  if (parsed.values.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (!command) {
    stderr.write(USAGE);
    return 2;
  }
  if (!COMMANDS.includes(command)) {
    stderr.write(`unknown command "${command}"\n${USAGE}`);
    return 2;
  }
  try {
    let output;
    if (command === "login") {
      output = await login({
        env,
        resource: parsed.values.resource,
        announce: (url) => stderr.write(`Open this URL in your browser and sign in with Google:\n${url}\n`)
      });
    } else {
      output = await runCommand(command, parsed.values, positionals, { env });
    }
    stdout.write(`${JSON.stringify({ ok: true, command, ...output }, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof HeyYumiError)) {
      throw error;
    }
    stdout.write(`${JSON.stringify({ ok: false, command, error: { code: error.code, message: error.message, ...error.details } }, null, 2)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
