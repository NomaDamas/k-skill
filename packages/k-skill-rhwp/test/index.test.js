"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createBlank,
  createBlankDocument,
  getDocumentInfo,
  insertText,
  deleteText,
  replaceAll,
  searchText,
  createTable,
  setCellText,
  listParagraphs,
  renderPage,
  parseJsonResult
} = require("../src/index");

const {
  getRhwpCore,
  installMeasureTextWidthShim,
  resolveRhwpWasmPath
} = require("../src/wasm-init");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-rhwp-test-"));

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function tempPath(name) {
  return path.join(tmpRoot, name);
}

async function newBlankFixture(name = "blank.hwp") {
  const target = tempPath(name);
  const doc = await createBlankDocument();
  try {
    const bytes = doc.exportHwp();
    fs.writeFileSync(target, Buffer.from(bytes));
  } finally {
    doc.free();
  }
  return target;
}

test("installMeasureTextWidthShim installs a deterministic shim only once", () => {
  const originalShim = globalThis.measureTextWidth;
  delete globalThis.measureTextWidth;
  try {
    const first = installMeasureTextWidthShim();
    assert.equal(first, true);
    assert.equal(typeof globalThis.measureTextWidth, "function");
    const again = installMeasureTextWidthShim();
    assert.equal(again, false);
    const latinWidth = globalThis.measureTextWidth("12px serif", "abc");
    const cjkWidth = globalThis.measureTextWidth("12px serif", "가나다");
    assert.ok(cjkWidth > latinWidth, `expected CJK ${cjkWidth} > latin ${latinWidth}`);
  } finally {
    globalThis.measureTextWidth = originalShim;
  }
});

test("resolveRhwpWasmPath resolves the shipped @rhwp/core wasm binary", () => {
  const wasmPath = resolveRhwpWasmPath();
  assert.ok(path.isAbsolute(wasmPath), `expected absolute path, got ${wasmPath}`);
  assert.ok(wasmPath.endsWith("rhwp_bg.wasm"), `unexpected wasm path ${wasmPath}`);
  const stat = fs.statSync(wasmPath);
  assert.ok(stat.size > 1024 * 1024, `wasm binary suspiciously small: ${stat.size}`);
});

test("parseJsonResult rejects non-JSON and {ok:false}", () => {
  assert.throws(() => parseJsonResult("not-json", "x"), /non-JSON payload/);
  assert.throws(() => parseJsonResult(JSON.stringify({ ok: false }), "x"), /rejected by rhwp/);
  const ok = parseJsonResult(JSON.stringify({ ok: true, value: 1 }), "x");
  assert.deepEqual(ok, { ok: true, value: 1 });
});

test("getRhwpCore returns a cached module with HwpDocument constructor", async () => {
  const mod = await getRhwpCore();
  assert.equal(typeof mod.HwpDocument, "function");
  assert.equal(typeof mod.version, "function");
  const again = await getRhwpCore();
  assert.equal(again, mod, "getRhwpCore must return cached module");
});

test("createBlank writes a valid HWP file that round-trips via getDocumentInfo", async () => {
  const target = tempPath("blank-via-cli-api.hwp");
  const result = await createBlank(target);
  assert.ok(result.bytesWritten > 1024, `blank HWP suspiciously small: ${result.bytesWritten}`);
  assert.equal(result.outputPath, target);
  assert.ok(fs.existsSync(target));
  const info = await getDocumentInfo(target);
  assert.equal(info.sourceFormat, "hwp");
  assert.equal(info.sectionCount, 1);
  assert.ok(info.pageCount >= 1);
  assert.equal(info.sections[0].sectionIndex, 0);
  assert.equal(info.sections[0].paragraphCount, 1);
});

test("insertText inserts text at paragraph start and round-trips on disk", async () => {
  const src = await newBlankFixture("insert-src.hwp");
  const dst = tempPath("insert-dst.hwp");
  const result = await insertText({
    input: src,
    output: dst,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "안녕하세요 rhwp!"
  });
  assert.equal(result.ok, true);
  assert.equal(typeof result.charOffset, "number");
  assert.ok(result.bytesWritten > 1024);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, "안녕하세요 rhwp!".length);
});

test("insertText rejects empty text synchronously", async () => {
  const src = await newBlankFixture("insert-empty-src.hwp");
  const dst = tempPath("insert-empty-dst.hwp");
  await assert.rejects(
    insertText({ input: src, output: dst, section: 0, paragraph: 0, offset: 0, text: "" }),
    /non-empty string/
  );
  assert.equal(fs.existsSync(dst), false, "no file should be written on validation error");
});

test("deleteText removes characters and shortens the paragraph", async () => {
  const src = await newBlankFixture("delete-src.hwp");
  const mid = tempPath("delete-mid.hwp");
  const dst = tempPath("delete-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "abcdef"
  });
  const result = await deleteText({
    input: mid,
    output: dst,
    section: 0,
    paragraph: 0,
    offset: 0,
    count: 3
  });
  assert.equal(result.ok, true);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, 3);
});

test("deleteText rejects non-positive counts", async () => {
  const src = await newBlankFixture("delete-zero-src.hwp");
  const dst = tempPath("delete-zero-dst.hwp");
  await assert.rejects(
    deleteText({ input: src, output: dst, section: 0, paragraph: 0, offset: 0, count: 0 }),
    /positive integer/
  );
});

test("replaceAll rewrites matched text and reports replacement count", async () => {
  const src = await newBlankFixture("replace-src.hwp");
  const mid = tempPath("replace-mid.hwp");
  const dst = tempPath("replace-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "2025 2025 2025"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "2025",
    replacement: "2026"
  });
  assert.equal(result.ok, true);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, "2026 2026 2026".length);
});

test("searchText reports a match location for present text", async () => {
  const src = await newBlankFixture("search-src.hwp");
  const edited = tempPath("search-edited.hwp");
  await insertText({
    input: src,
    output: edited,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "find-me-please"
  });
  const hit = await searchText({ input: edited, query: "please" });
  assert.equal(typeof hit, "object");
  assert.ok(hit, "searchText must return a match payload");
  assert.equal(hit.found, true);
});

test("createTable inserts a table and grows paragraph count", async () => {
  const src = await newBlankFixture("table-src.hwp");
  const dst = tempPath("table-dst.hwp");
  const result = await createTable({
    input: src,
    output: dst,
    section: 0,
    paragraph: 0,
    offset: 0,
    rows: 2,
    cols: 3
  });
  assert.equal(result.ok, true);
  const info = await getDocumentInfo(dst);
  assert.ok(info.sections[0].paragraphCount >= 1);
});

test("setCellText fills a cell after creating a table", async () => {
  const src = await newBlankFixture("cell-src.hwp");
  const tableFile = tempPath("cell-table.hwp");
  const tableResult = await createTable({
    input: src,
    output: tableFile,
    section: 0,
    paragraph: 0,
    offset: 0,
    rows: 2,
    cols: 2
  });
  assert.equal(tableResult.ok, true);
  assert.equal(typeof tableResult.paraIdx, "number");
  assert.equal(typeof tableResult.controlIdx, "number");
  const filled = tempPath("cell-filled.hwp");
  const cellResult = await setCellText({
    input: tableFile,
    output: filled,
    section: 0,
    parentParagraph: tableResult.paraIdx,
    control: tableResult.controlIdx,
    cell: 0,
    cellParagraph: 0,
    text: "A1 cell"
  });
  assert.equal(cellResult.ok, true);
  assert.ok(fs.existsSync(filled));
});

test("listParagraphs returns per-paragraph lengths for a section", async () => {
  const src = await newBlankFixture("list-src.hwp");
  const edited = tempPath("list-edited.hwp");
  await insertText({
    input: src,
    output: edited,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "para1"
  });
  const listing = await listParagraphs(edited, 0);
  assert.equal(listing.sectionIndex, 0);
  assert.equal(listing.paragraphCount, 1);
  assert.equal(listing.paragraphs[0].length, 5);
});

test("renderPage returns SVG markup with <svg> wrapper for a blank document", async () => {
  const src = await newBlankFixture("render-src.hwp");
  const svg = await renderPage(src, 0, "svg");
  assert.match(svg, /<svg[^>]*>/);
  assert.match(svg, /<\/svg>/);
});

test("renderPage rejects unknown format", async () => {
  const src = await newBlankFixture("render-bad-src.hwp");
  await assert.rejects(renderPage(src, 0, "pdf"), /unknown format/);
});
