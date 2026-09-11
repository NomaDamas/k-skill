"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const DEFAULT_PORT = 8080;
const MAX_BODY_BYTES = 16 * 1024;

function resolveUpstreamUrl(env = {}) {
  const base = String(env.BCCARD_EATPL_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/v1/search` : null;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBearer(header) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function normalizeQuery(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("JSON object body is required.");
  }
  const allowed = ["location", "merNm", "merTpbuzNm"];
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error("Unsupported request field.");
  const query = {};
  for (const key of allowed) {
    if (body[key] !== undefined && body[key] !== null && String(body[key]).trim()) {
      query[key] = String(body[key]).trim();
    }
  }
  if (!query.location && !query.merNm && !query.merTpbuzNm) {
    throw new Error("At least one search field is required.");
  }
  return query;
}

function formatTraceNumber(instNm, sequence, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  return `${instNm}${date}${String(sequence).padStart(10, "0")}`;
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function createServer({
  env = process.env,
  fetchImpl = global.fetch,
  now = () => new Date()
} = {}) {
  const relayToken = String(env.EATPL_RELAY_TOKEN || "").trim();
  const instNm = String(env.BCCARD_EATPL_INST_NM || "").trim();
  const upstreamUrl = resolveUpstreamUrl(env);
  const timeoutMs = Number.parseInt(env.BCCARD_EATPL_API_TIMEOUT_MS || "20000", 10);
  const rateLimitMax = Number.parseInt(env.EATPL_RELAY_RATE_LIMIT_MAX || "30", 10);
  const rateLimitWindowMs = Number.parseInt(env.EATPL_RELAY_RATE_LIMIT_WINDOW_MS || "60000", 10);
  const rateLimit = new Map();
  let sequence = 0;

  async function handle(request, response) {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { ok: true });
    }
    if (request.method !== "POST" || request.url !== "/v1/search") {
      return json(response, 404, { error: "not_found" });
    }
    if (!relayToken || !instNm || !upstreamUrl) {
      return json(response, 503, { error: "relay_not_configured" });
    }
    const providedToken = parseBearer(request.headers.authorization);
    if (!providedToken || !constantTimeEqual(providedToken, relayToken)) {
      return json(response, 401, { error: "unauthorized" });
    }
    const clientKey = request.socket.remoteAddress || "unknown";
    const currentTime = Date.now();
    const previous = rateLimit.get(clientKey);
    if (!previous || currentTime - previous.startedAt >= rateLimitWindowMs) {
      rateLimit.set(clientKey, { startedAt: currentTime, count: 1 });
    } else if (previous.count >= rateLimitMax) {
      return json(response, 429, { error: "rate_limited" });
    } else {
      previous.count += 1;
    }

    let raw = "";
    let bytes = 0;
    try {
      for await (const chunk of request) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_BODY_BYTES) {
          json(response, 413, { error: "payload_too_large" });
          request.destroy();
          return;
        }
        raw += chunk;
      }
      const query = normalizeQuery(JSON.parse(raw));
      sequence = (sequence % 9999999999) + 1;
      const upstreamResponse = await fetchImpl(upstreamUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "k-skill-eatpl-relay"
        },
        body: JSON.stringify({
          trnsTrceNo: formatTraceNumber(instNm, sequence, now()),
          instNm,
          ...query
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const upstreamText = await upstreamResponse.text();
      let upstreamBody;
      try {
        upstreamBody = JSON.parse(upstreamText);
      } catch {
        return json(response, 502, { error: "invalid_upstream_response" });
      }
      if (!upstreamResponse.ok) {
        return json(response, upstreamResponse.status >= 400 && upstreamResponse.status < 500
          ? upstreamResponse.status : 502, {
          error: "upstream_error",
          message: "eat.pl upstream request failed."
        });
      }
      return json(response, 200, upstreamBody);
    } catch (error) {
      if (error instanceof SyntaxError || /required|field/.test(error.message)) {
        return json(response, 400, { error: "bad_request", message: error.message });
      }
      return json(response, 502, { error: "upstream_error" });
    }
  }

  return http.createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, { error: "relay_error" });
    });
  });
}

if (require.main === module) {
  const server = createServer();
  const port = Number.parseInt(process.env.PORT || process.env.EATPL_RELAY_PORT || DEFAULT_PORT, 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`eatpl relay listening on ${port}`);
  });
}

module.exports = {
  MAX_BODY_BYTES,
  createServer,
  formatTraceNumber,
  normalizeQuery,
  resolveUpstreamUrl
};
