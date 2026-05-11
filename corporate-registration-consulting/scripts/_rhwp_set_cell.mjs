#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

globalThis.measureTextWidth = (font, text) => {
  const match = String(font || "").match(/([0-9.]+)px/);
  const size = match ? parseFloat(match[1]) : 12;
  let width = 0;
  for (const ch of String(text || "")) {
    const cp = ch.codePointAt(0) ?? 0;
    width += cp >= 0x1100 && cp <= 0xffdc ? size : size * 0.55;
  }
  return width;
};

function parseJsonResult(raw, op) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.ok !== true) {
      throw new Error(`${op} rejected by rhwp: ${raw}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${op} returned non-JSON payload: ${raw}`);
    }
    throw error;
  }
}

function loadOperations(path) {
  const ops = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(ops)) {
    throw new Error("ops.json must be a JSON array");
  }
  return ops;
}

function asInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new Error(`operation ${name} must be an integer`);
  }
  return value;
}

async function main() {
  const [inputPath, outputPath, opsPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || !opsPath) {
    throw new Error("usage: _rhwp_set_cell.mjs <input.hwp> <output.hwp> <ops.json>");
  }

  const core = await import("@rhwp/core");
  const wasmBytes = readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
  await core.default({ module_or_path: wasmBytes });

  const ops = loadOperations(opsPath);
  const inputBytes = readFileSync(inputPath);
  const doc = new core.HwpDocument(new Uint8Array(inputBytes));

  try {
    for (const op of ops) {
      const section = asInteger(op.section, "section");
      const parentParagraph = asInteger(op.parentParagraph, "parentParagraph");
      const control = asInteger(op.control, "control");
      const cell = asInteger(op.cell, "cell");
      const cellParagraph = op.cellParagraph === undefined ? 0 : asInteger(op.cellParagraph, "cellParagraph");
      const text = op.text === undefined || op.text === null ? "" : String(op.text);

      const length = doc.getCellParagraphLength(section, parentParagraph, control, cell, cellParagraph);
      if (length > 0) {
        parseJsonResult(
          doc.deleteTextInCell(section, parentParagraph, control, cell, cellParagraph, 0, length),
          "deleteTextInCell"
        );
      }
      parseJsonResult(
        doc.insertTextInCell(section, parentParagraph, control, cell, cellParagraph, 0, text),
        "insertTextInCell"
      );
    }

    const bytes = doc.exportHwp();
    writeFileSync(outputPath, Buffer.from(bytes));
    console.log(JSON.stringify({ ok: true, count: ops.length, outputPath, bytesWritten: bytes.length }));
  } finally {
    doc.free();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
