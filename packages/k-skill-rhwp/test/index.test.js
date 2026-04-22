"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

function sha1(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
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

test("replaceAll persists same-length replacement into the output bytes (regression for silent no-op)", async () => {
  const src = await newBlankFixture("replace-same-src.hwp");
  const mid = tempPath("replace-same-mid.hwp");
  const dst = tempPath("replace-same-dst.hwp");
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
  assert.equal(result.count, 3, `expected 3 replacements, got ${result.count}`);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, "2026 2026 2026".length);
  assert.notEqual(sha1(mid), sha1(dst), "replaceAll output must differ from input bytes");
  const hitNew = await searchText({ input: dst, query: "2026" });
  assert.equal(hitNew.found, true, "replacement 2026 must be findable after replaceAll");
  assert.equal(hitNew.sec, 0);
  assert.equal(hitNew.para, 0);
  const hitOld = await searchText({ input: dst, query: "2025" });
  assert.equal(hitOld.found, false, "query 2025 must not be findable after replaceAll");
});

test("replaceAll persists LONGER-length replacement and grows paragraph length by the correct amount", async () => {
  const src = await newBlankFixture("replace-longer-src.hwp");
  const mid = tempPath("replace-longer-mid.hwp");
  const dst = tempPath("replace-longer-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "2026년 테스트"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "2026",
    replacement: "이천이십칠"
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  const info = await getDocumentInfo(dst);
  assert.equal(
    info.sections[0].paragraphs[0].length,
    "이천이십칠년 테스트".length,
    "paragraph length must grow when replacement is longer than query"
  );
  assert.notEqual(sha1(mid), sha1(dst));
  assert.equal((await searchText({ input: dst, query: "이천이십칠" })).found, true);
  assert.equal((await searchText({ input: dst, query: "2026" })).found, false);
});

test("replaceAll persists SHORTER-length replacement and shrinks paragraph length by the correct amount", async () => {
  const src = await newBlankFixture("replace-shorter-src.hwp");
  const mid = tempPath("replace-shorter-mid.hwp");
  const dst = tempPath("replace-shorter-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "longlonglong tail"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "longlonglong",
    replacement: "AB"
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, "AB tail".length);
  assert.notEqual(sha1(mid), sha1(dst));
});

test("replaceAll with empty replacement deletes every match (delete-to-empty)", async () => {
  const src = await newBlankFixture("replace-delete-src.hwp");
  const mid = tempPath("replace-delete-mid.hwp");
  const dst = tempPath("replace-delete-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "foo-X-bar-X-baz"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "-X-",
    replacement: ""
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, "foobarbaz".length);
  assert.equal((await searchText({ input: dst, query: "-X-" })).found, false);
});

test("replaceAll handles replacement containing the query without infinite loop (non-overlapping semantics)", async () => {
  const src = await newBlankFixture("replace-contains-src.hwp");
  const mid = tempPath("replace-contains-mid.hwp");
  const dst = tempPath("replace-contains-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "aaa"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "a",
    replacement: "aa"
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 3, "non-overlapping replace: each original 'a' matched once, not each expanded one");
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, 6, "'aaa' with a→aa produces 'aaaaaa' under non-overlapping semantics");
});

test("replaceAll with zero matches writes output and reports count 0", async () => {
  const src = await newBlankFixture("replace-none-src.hwp");
  const mid = tempPath("replace-none-mid.hwp");
  const dst = tempPath("replace-none-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "no matches here"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "XYZ",
    replacement: "ABC"
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  const info = await getDocumentInfo(dst);
  assert.equal(info.sections[0].paragraphs[0].length, "no matches here".length);
});

test("replaceAll honors case-sensitive flag", async () => {
  const src = await newBlankFixture("replace-case-src.hwp");
  const mid = tempPath("replace-case-mid.hwp");
  const dst = tempPath("replace-case-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "abc ABC abc"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "abc",
    replacement: "xyz",
    caseSensitive: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2, "case-sensitive replacement must skip ABC");
  assert.equal((await searchText({ input: dst, query: "ABC", caseSensitive: true })).found, true);
});

test("replaceAll rejects replacement containing newlines (paragraph-break scope guard)", async () => {
  const src = await newBlankFixture("replace-newline-src.hwp");
  const mid = tempPath("replace-newline-mid.hwp");
  const dst = tempPath("replace-newline-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "hello"
  });
  await assert.rejects(
    replaceAll({
      input: mid,
      output: dst,
      query: "hello",
      replacement: "multi\nline"
    }),
    /newline|paragraph/i,
    "replaceAll must refuse replacements containing paragraph-break characters"
  );
});

test("replaceAll refuses case-insensitive matching when source text contains case-folding length-changing chars (e.g. Turkish İ U+0130)", async () => {
  // Regression: without the guard, `ABCİABCİXYZ` + case-insensitive `İ → Z` reported
  // { ok:true, count:2 } but silently produced `ABCZABCİZYZ` (the X at index 8 was
  // corrupted while the second İ was left untouched). This is because
  // String.prototype.toLowerCase() maps İ (U+0130) to i + combining dot above
  // (U+0069 U+0307), which changes UTF-16 length and drifts every subsequent offset.
  const src = await newBlankFixture("replace-unicode-drift-src.hwp");
  const mid = tempPath("replace-unicode-drift-mid.hwp");
  const dst = tempPath("replace-unicode-drift-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "ABCİABCİXYZ"
  });
  await assert.rejects(
    replaceAll({
      input: mid,
      output: dst,
      query: "İ",
      replacement: "Z"
    }),
    /case.?insensitive|case.?fold|UTF-?16|U\+0130/i,
    "replaceAll must refuse case-insensitive matching on inputs with length-changing case folding"
  );
  assert.equal(
    fs.existsSync(dst),
    false,
    "no output file should be written when replaceAll rejects case-insensitive drift"
  );
});

test("replaceAll refuses case-insensitive matching when the query itself contains case-folding length-changing chars", async () => {
  const src = await newBlankFixture("replace-unicode-query-src.hwp");
  const mid = tempPath("replace-unicode-query-mid.hwp");
  const dst = tempPath("replace-unicode-query-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "plain ascii text"
  });
  await assert.rejects(
    replaceAll({
      input: mid,
      output: dst,
      query: "İ",
      replacement: "X"
    }),
    /case.?insensitive|case.?fold|UTF-?16|U\+0130/i,
    "replaceAll must refuse case-insensitive matching when the query has length-changing case folding"
  );
  assert.equal(fs.existsSync(dst), false);
});

test("replaceAll with --case-sensitive succeeds on inputs containing İ (guard only applies to case-insensitive path)", async () => {
  const src = await newBlankFixture("replace-unicode-case-src.hwp");
  const mid = tempPath("replace-unicode-case-mid.hwp");
  const dst = tempPath("replace-unicode-case-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "ABCİABCİXYZ"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "İ",
    replacement: "Z",
    caseSensitive: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2, "case-sensitive replacement must hit both İ occurrences");
  const info = await getDocumentInfo(dst);
  assert.equal(
    info.sections[0].paragraphs[0].length,
    "ABCZABCZXYZ".length,
    "paragraph length must match fully-replaced output (both İ → Z, X stays)"
  );
  assert.equal(
    (await searchText({ input: dst, query: "İ", caseSensitive: true })).found,
    false,
    "İ must be gone from case-sensitive output"
  );
  assert.equal(
    (await searchText({ input: dst, query: "X", caseSensitive: true })).found,
    true,
    "X must be preserved (not corrupted by offset drift)"
  );
});

test("replaceAll case-insensitive still works for normal ASCII/Hangul that do not change UTF-16 length under toLowerCase", async () => {
  // Regression guard: the Unicode fix must not break the common case.
  const src = await newBlankFixture("replace-unicode-ok-src.hwp");
  const mid = tempPath("replace-unicode-ok-mid.hwp");
  const dst = tempPath("replace-unicode-ok-dst.hwp");
  await insertText({
    input: src,
    output: mid,
    section: 0,
    paragraph: 0,
    offset: 0,
    text: "hello WORLD 안녕 HELLO"
  });
  const result = await replaceAll({
    input: mid,
    output: dst,
    query: "hello",
    replacement: "hi"
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 2, "case-insensitive must still match both 'hello' and 'HELLO'");
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
