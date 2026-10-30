// Secret redaction shared by route adapters and the Fastify error handler so a
// service key can never reach response bodies, error messages, stacks, or the
// `cause` chain that Pino serializes into logs.
"use strict";

// Redacts the raw key, its percent-encoded form, its URLSearchParams form
// (`serviceKey=...`), and any surviving `serviceKey` token from arbitrary text.
function redactSecretValue(text, secret) {
  let redacted = String(text);
  if (typeof secret === "string" && secret) {
    const serializedSecret = new URLSearchParams({ serviceKey: secret })
      .toString()
      .slice("serviceKey=".length);
    for (const candidate of [secret, encodeURIComponent(secret), serializedSecret]) {
      if (candidate) {
        redacted = redacted.split(candidate).join("[REDACTED]");
      }
    }
  }
  return redacted.replace(/serviceKey(?:=|%3D)[^&\s"'<>\\]+/giu, "serviceKey=[REDACTED]");
}

const REDACTABLE_ERROR_FIELDS = ["message", "stack", "upstreamBodySnippet"];
const MAX_REDACT_DEPTH = 5;

// Walks the bounded `cause` chain and redacts the secret out of every textual
// field a logger might serialize. Mutates and returns the original error so the
// caller can keep rethrowing it.
function redactErrorChain(error, secret) {
  let current = error;
  for (let depth = 0; current && typeof current === "object" && depth < MAX_REDACT_DEPTH; depth += 1) {
    for (const field of REDACTABLE_ERROR_FIELDS) {
      let value;
      try {
        value = current[field];
      } catch {
        continue;
      }
      if (typeof value !== "string" || !value) {
        continue;
      }
      const redacted = redactSecretValue(value, secret);
      if (redacted === value) {
        continue;
      }
      try {
        current[field] = redacted;
      } catch {
        // Some abort/network errors expose `message` as a read-only prototype
        // accessor (e.g. DOMException). Shadow it with an own property so the
        // secret still cannot escape; if even that is refused, the value is a
        // generic message that carries no key.
        try {
          Object.defineProperty(current, field, { value: redacted, writable: true, configurable: true });
        } catch {
          // Best-effort redaction only.
        }
      }
    }
    current = current.cause;
  }
  return error;
}

module.exports = {
  redactErrorChain,
  redactSecretValue
};
