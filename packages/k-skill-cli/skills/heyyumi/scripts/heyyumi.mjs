#!/usr/bin/env node
// HeyYumi (https://heyyumi.ai) helper: Korean restaurant/cafe/bar search and
// table-reservation requests through the official REST API.
//
// Reads (places, regions) run directly. Anything that reaches a venue owner or
// a guest's phone (reserve, live-ask) only prints a preview unless --confirm is
// passed, so the calling agent must get explicit user approval first.
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

export const DEFAULT_API_BASE_URL = "https://api.heyyumi.ai";
export const DEFAULT_OAUTH_ISSUER = "https://heyyumi.ai";
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_FIELDS = "core,contact_hours";
export const MAX_LONG_POLL_SECONDS = 25;
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

function configDir(env = process.env) {
  return path.join(env.KSKILL_CONFIG_DIR || path.join(os.homedir(), ".config", "k-skill"));
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
    const value = parseDotenvValue(fs.readFileSync(path.join(configDir(env), "secrets.env"), "utf8"), API_KEY_ENV);
    if (value) {
      return value;
    }
  } catch {
    // no dotenv file
  }
  return "";
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
      const refreshed = await postForm(
        saved.token_endpoint,
        { grant_type: "refresh_token", refresh_token: saved.refresh_token, client_id: saved.client_id },
        { fetchImpl }
      );
      const next = tokensFromResponse(refreshed, saved, {
        issuer: saved.issuer,
        token_endpoint: saved.token_endpoint,
        client_id: saved.client_id
      });
      writeOauthTokens(next, env);
      return { kind: "oauth", token: next.access_token };
    }
  }
  throw new HeyYumiError(
    "missing_credentials",
    `No HeyYumi credential. Set ${API_KEY_ENV} (key from https://heyyumi.ai/dashboard) or run: heyyumi.mjs login`
  );
}

function apiBase(env = process.env) {
  return (env.KSKILL_HEYYUMI_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export async function apiRequest(method, route, { query, body, sandbox = false, env = process.env, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const credential = await resolveCredential({ env, fetchImpl });
  const url = new URL(`${apiBase(env)}${route}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const headers = { accept: "application/json", authorization: `Bearer ${credential.token}` };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (sandbox) {
    headers["x-map3-sandbox"] = "1";
  }
  const response = await fetchImpl(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok || payload === null || payload.success === false) {
    throw classifyHttpFailure(response, payload, credential.kind);
  }
  return { data: payload.data, meta: payload.meta, units: response.headers.get("x-map3-units") };
}

export function classifyHttpFailure(response, payload, credentialKind = "api_key") {
  const status = response.status;
  const upstreamCode = payload?.error?.code ?? payload?.code ?? (typeof payload?.error === "string" ? payload.error : undefined);
  const message = payload?.error?.message ?? payload?.message ?? (typeof payload?.error === "string" ? payload.error : `HTTP ${status}`);
  const details = { status, upstreamCode, retryAfter: payload?.retryAfter ?? payload?.error?.retryAfter ?? response.headers.get("retry-after") ?? undefined };

  if (status === 401) {
    const hint = credentialKind === "oauth"
      ? " (the saved OAuth token was rejected by the REST API; use an API key from https://heyyumi.ai/dashboard)"
      : "";
    return new HeyYumiError("unauthorized", `HeyYumi rejected the credential: ${message}${hint}`, details);
  }
  if (status === 429) {
    return new HeyYumiError("rate_limited", `HeyYumi rate or quota limit hit: ${message}`, details);
  }
  if (status === 422) {
    // reservation_not_available / live_status_not_available: do not retry.
    // reservation_requests_closed: retry only at details.retryAfter.
    // venue_closed_at_requested_time: pick another time.
    return new HeyYumiError(upstreamCode || "unprocessable", message, details);
  }
  if (status === 404) {
    return new HeyYumiError(upstreamCode || "not_found", message, details);
  }
  if (status === 400) {
    return new HeyYumiError(upstreamCode || "bad_request", message, details);
  }
  return new HeyYumiError(status >= 500 ? "upstream_error" : "http_error", message, details);
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
  if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    throw new HeyYumiError("invalid_input", "--phone must look like 010-1234-5678");
  }
  return phone;
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

// ---- commands -------------------------------------------------------------

const SEARCH_PASSTHROUGH = [
  "keyword", "region_code", "business_category", "min_confidence", "recommended_for", "atmosphere", "parking",
  "parking_type", "reservable", "payment_methods", "serves", "dietary", "foreign_languages", "subtype", "bbq_meat",
  "view", "max_dish_price", "foreigner_friendly", "legacy", "local_food", "exclude", "muslim_friendly", "open_at",
  "include_unknown_hours", "reservation_channel", "page", "page_size", "sort", "radius"
];

function searchQuery(options) {
  const query = { fields: options.fields || DEFAULT_FIELDS };
  for (const key of SEARCH_PASSTHROUGH) {
    const flag = key.replaceAll("_", "-");
    const value = options[flag] ?? options[key];
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

export async function runCommand(command, options, positionals, context = {}) {
  const sandbox = Boolean(options.sandbox);
  const request = (method, route, extra = {}) => apiRequest(method, route, { sandbox, ...context, ...extra });

  switch (command) {
    case "regions":
      return request("GET", "/api/v1/regions", {
        query: { dong: options.dong, sigungu: options.sigungu, sido: options.sido }
      });
    case "search":
      return request("GET", "/api/v1/places", { query: searchQuery(options) });
    case "nearby": {
      const lat = Number(requireText(options.lat, "lat"));
      const lng = Number(requireText(options.lng, "lng"));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new HeyYumiError("invalid_input", "--lat and --lng must be numbers");
      }
      return request("GET", "/api/v1/places/nearby", { query: { ...searchQuery(options), lat, lng } });
    }
    case "place": {
      const id = requireText(positionals[0] ?? options["place-id"], "place-id");
      return request("GET", `/api/v1/places/${encodeURIComponent(id)}`, {
        query: { fields: options.fields || "core,contact_hours,quality" }
      });
    }
    case "reserve": {
      const body = buildReservationRequest(options, { now: context.now });
      if (!options.confirm && !sandbox) {
        return { preview: true, sent: false, request: body };
      }
      const result = await request("POST", "/api/v1/reservations", { body });
      return { ...result, request: body };
    }
    case "reservation-status": {
      const id = requireText(positionals[0] ?? options.id, "id");
      return request("GET", `/api/v1/reservations/${encodeURIComponent(id)}`, {
        query: { wait: clampWait(options.wait) }
      });
    }
    case "live-ask": {
      const body = buildLiveStatusRequest(options);
      if (!options.confirm && !sandbox) {
        return { preview: true, sent: false, request: body };
      }
      const result = await request("POST", "/api/v1/live-status", { body });
      return { ...result, request: body };
    }
    case "live-status": {
      const id = requireText(positionals[0] ?? options.id, "id");
      return request("GET", `/api/v1/live-status/${encodeURIComponent(id)}`, {
        query: { wait: clampWait(options.wait) }
      });
    }
    default:
      throw new HeyYumiError("invalid_input", `unknown command "${command}"`);
  }
}

function clampWait(value) {
  if (value === undefined) {
    return undefined;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new HeyYumiError("invalid_input", "--wait must be a number of seconds >= 0");
  }
  return Math.min(Math.floor(seconds), MAX_LONG_POLL_SECONDS);
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

// Loopback PKCE flow. `announce(url)` hands the sign-in URL to the user.
export async function login({ env = process.env, fetchImpl = fetch, announce, issuer, timeoutMs = 300000, resource } = {}) {
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
    const registration = await (async () => {
      const response = await fetchImpl(metadata.registration_endpoint, {
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
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.client_id) {
        throw new HeyYumiError("oauth_failed", `Client registration failed with HTTP ${response.status}`);
      }
      return body;
    })();

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
        redirect_uri: redirectUri
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
  keyword: { type: "string" }, "region-code": { type: "string" }, "business-category": { type: "string" },
  "min-confidence": { type: "string" }, "recommended-for": { type: "string" }, atmosphere: { type: "string" },
  parking: { type: "string" }, "parking-type": { type: "string" }, reservable: { type: "string" },
  "payment-methods": { type: "string" }, serves: { type: "string" }, dietary: { type: "string" },
  "foreign-languages": { type: "string" }, subtype: { type: "string" }, "bbq-meat": { type: "string" },
  view: { type: "string" }, "max-dish-price": { type: "string" }, "foreigner-friendly": { type: "string" },
  legacy: { type: "string" }, "local-food": { type: "string" }, exclude: { type: "string" },
  "muslim-friendly": { type: "string" }, "open-at": { type: "string" }, "include-unknown-hours": { type: "string" },
  "reservation-channel": { type: "string" }, page: { type: "string" }, "page-size": { type: "string" },
  sort: { type: "string" }, radius: { type: "string" }, lat: { type: "string" }, lng: { type: "string" },
  fields: { type: "string" },
  "place-id": { type: "string" }, time: { type: "string" }, guests: { type: "string" }, phone: { type: "string" },
  name: { type: "string" }, note: { type: "string" }, "idempotency-key": { type: "string" },
  kind: { type: "string" }, topic: { type: "string" }, question: { type: "string" },
  id: { type: "string" }, wait: { type: "string" },
  confirm: { type: "boolean" }, sandbox: { type: "boolean" }, resource: { type: "string" }, help: { type: "boolean", short: "h" }
};

const USAGE = `Usage: heyyumi.mjs <command> [options]

Read (no side effects):
  regions --dong 홍제동 [--sigungu 서대문구] [--sido 서울]
  search --keyword 파스타 [--region-code C] [--reservable true] [--open-at "2026-12-01T19:00"] [--fields core,contact_hours]
  nearby --lat 37.589 --lng 126.943 [--radius 1000] [--keyword ...]
  place <place-id> [--fields core,contact_hours,quality]
  reservation-status <reservation-id> [--wait 25]
  live-status <query-id> [--wait 25]

Side effects (preview unless --confirm; --sandbox simulates without sending):
  reserve --place-id ID --time 2026-12-01T19:00:00+09:00 --guests 2 --phone 010-1234-5678 [--name N] [--note T] --confirm
  live-ask --place-id ID --kind item|wait|seats --topic "<bare token>" [--question T] --confirm

Auth:
  login [--resource URL]   HeyYumi OAuth (Google sign-in) in the browser; saves a 0600 token file
  KSKILL_HEYYUMI_API_KEY   API key from https://heyyumi.ai/dashboard (takes precedence)
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
