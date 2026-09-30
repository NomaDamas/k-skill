#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDartRows = extractDartRows;
// Deterministic text rows from a saved public DART viewer page; no network access.
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const sha = (raw) => (0, node_crypto_1.createHash)("sha256").update(raw).digest("hex");
function decodeEntities(value) {
    return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (full, entity) => {
        const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
        if (!entity.startsWith("#"))
            return named[entity.toLowerCase()] ?? full;
        const point = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : full;
    });
}
function extractDartRows(raw) {
    const html = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    const rows = [];
    for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
        const cells = [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)\s*>/gi)]
            .map((cell) => decodeEntities(cell[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim());
        if (cells.some(Boolean))
            rows.push(cells.join(" ").trim());
    }
    if (!rows.length)
        throw new Error("DART page has no readable table rows");
    return rows.join("\n") + "\n";
}
if (require.main === module) {
    try {
        if (process.argv.length !== 3)
            throw new Error("usage: node scripts/dart-rows.js CAPTURE_DIRECTORY");
        const folder = (0, node_path_1.resolve)(process.argv[2]);
        const raw = (0, node_fs_1.readFileSync)((0, node_path_1.join)(folder, "raw"));
        const capture = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(folder, "capture.json"), "utf8"));
        const link = new URL(capture.url ?? "");
        if (link.protocol !== "https:" || link.hostname !== "dart.fss.or.kr" || link.pathname !== "/report/viewer.do" ||
            capture.sha256 !== sha(raw) || capture.bytes !== raw.length || raw.length > 20_000_000) {
            throw new Error("DART viewer capture metadata mismatch");
        }
        const rows = extractDartRows(raw);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(folder, "rows.txt"), rows, { flag: "wx" });
        process.stdout.write(`text_sha256=${sha(rows)}\nrows=${rows.split("\n").length - 1}\n`);
    }
    catch (error) {
        process.stderr.write(`DART_ROWS_ERROR: ${error instanceof Error ? error.message : "unknown error"}\n`);
        process.exitCode = 1;
    }
}
