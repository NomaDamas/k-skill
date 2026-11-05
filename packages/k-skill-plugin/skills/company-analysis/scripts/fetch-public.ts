#!/usr/bin/env node
// Capture one public document without cookies, API keys, redirects or overwrites.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MAX_BYTES = 20_000_000;
const SECRET = /^(?:api[_-]?key|service[_-]?key|crtfc[_-]?key|auth(?:orization|[_-]?key)?|access[_-]?token|key|secret|token|password|passwd|session(?:id|[_-]?key)?)$/i;

function sourceUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("invalid URL"); }
  if (value.length > 2048 || parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password ||
      parsed.hash || (parsed.port && parsed.port !== "443") ||
      /[\s<>"'\\]/.test(value) || [...parsed.searchParams.keys()].some((key) => SECRET.test(key)) ||
      parsed.hostname === "localhost" || parsed.hostname.endsWith(".local") ||
      /^\d+(?:\.\d+){3}$/.test(parsed.hostname) || parsed.hostname.includes(":")) {
    throw new Error("public HTTPS URL without credentials or secret query required");
  }
  return parsed;
}

async function main(): Promise<void> {
  if (process.argv.length !== 4) throw new Error("usage: node scripts/fetch-public.ts HTTPS_URL NEW_OUTPUT_DIRECTORY");
  const address = sourceUrl(process.argv[2]);
  const output = resolve(process.argv[3]);
  if (existsSync(output)) throw new Error("output directory already exists; snapshots are immutable");
  const response = await fetch(address, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent": "CompanyAnalysisLocal/1.0 (public research)",
      "Accept": "application/json,text/html,application/pdf,application/xml,text/plain,*/*;q=0.1",
    },
  });
  if (response.status !== 200 || !response.body) throw new Error(`HTTP ${response.status}; source unavailable`);
  const type = response.headers.get("content-type") ?? "";
  if (!/^(?:application\/(?:json|pdf|xml|xhtml\+xml)|text\/(?:html|plain|xml))/i.test(type)) {
    throw new Error(`unsupported content type: ${type}`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("source exceeds 20 MB limit");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) throw new Error("empty response; source unavailable");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  mkdirSync(output);
  writeFileSync(resolve(output, "raw"), raw, { flag: "wx" });
  const capture = JSON.stringify({
    url: address.toString(),
    retrieved_at: new Date().toISOString(),
    content_type: type,
    bytes: raw.length,
    sha256,
  }, null, 2) + "\n";
  writeFileSync(resolve(output, "capture.json"), capture, { flag: "wx" });
  const captureSha256 = createHash("sha256").update(capture).digest("hex");
  process.stdout.write(`raw_sha256=${sha256}\ncapture_sha256=${captureSha256}\npath=${output}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`CAPTURE_ERROR: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
