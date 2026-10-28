#!/usr/bin/env node
// Deterministic text rows from a saved public DART viewer page; no network access.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sha = (raw: Buffer | string) => createHash("sha256").update(raw).digest("hex");

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (full, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? full;
    const point = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : full;
  });
}

export function extractDartRows(raw: Buffer): string {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  const rows: string[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)\s*>/gi)]
      .map((cell) => decodeEntities(cell[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim());
    if (cells.some(Boolean)) rows.push(cells.join(" ").trim());
  }
  if (!rows.length) throw new Error("DART page has no readable table rows");
  return rows.join("\n") + "\n";
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error("usage: node scripts/dart-rows.js CAPTURE_DIRECTORY");
    const folder = resolve(process.argv[2]);
    const raw = readFileSync(join(folder, "raw"));
    const capture = JSON.parse(readFileSync(join(folder, "capture.json"), "utf8")) as { url?: string; sha256?: string; bytes?: number };
    const link = new URL(capture.url ?? "");
    if (link.protocol !== "https:" || link.hostname !== "dart.fss.or.kr" || link.pathname !== "/report/viewer.do" ||
        capture.sha256 !== sha(raw) || capture.bytes !== raw.length || raw.length > 20_000_000) {
      throw new Error("DART viewer capture metadata mismatch");
    }
    const rows = extractDartRows(raw);
    writeFileSync(join(folder, "rows.txt"), rows, { flag: "wx" });
    process.stdout.write(`text_sha256=${sha(rows)}\nrows=${rows.split("\n").length - 1}\n`);
  } catch (error) {
    process.stderr.write(`DART_ROWS_ERROR: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
