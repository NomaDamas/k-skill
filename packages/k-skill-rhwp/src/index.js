"use strict";

const fs = require("node:fs");

const { getRhwpCore } = require("./wasm-init");

function parseJsonResult(raw, op) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.ok !== true) {
      throw new Error(`${op} rejected by rhwp: ${raw}`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`${op} returned non-JSON payload: ${raw}`);
    }
    throw err;
  }
}

async function loadDocument(filePath) {
  const core = await getRhwpCore();
  const bytes = fs.readFileSync(filePath);
  return new core.HwpDocument(new Uint8Array(bytes));
}

async function createBlankDocument() {
  const core = await getRhwpCore();
  const doc = core.HwpDocument.createEmpty();
  doc.createBlankDocument();
  return doc;
}

function writeHwp(doc, outputPath) {
  const bytes = doc.exportHwp();
  fs.writeFileSync(outputPath, Buffer.from(bytes));
  return { bytesWritten: bytes.length, outputPath };
}

async function getDocumentInfo(filePath) {
  const doc = await loadDocument(filePath);
  try {
    const info = JSON.parse(doc.getDocumentInfo());
    const sectionCount = doc.getSectionCount();
    const sections = [];
    for (let s = 0; s < sectionCount; s += 1) {
      const paragraphCount = doc.getParagraphCount(s);
      const paragraphs = [];
      for (let p = 0; p < paragraphCount; p += 1) {
        paragraphs.push({
          paragraphIndex: p,
          length: doc.getParagraphLength(s, p)
        });
      }
      sections.push({ sectionIndex: s, paragraphCount, paragraphs });
    }
    return {
      sourceFormat: doc.getSourceFormat(),
      pageCount: doc.pageCount(),
      sectionCount,
      sections,
      documentInfo: info
    };
  } finally {
    doc.free();
  }
}

async function insertText(options) {
  const { input, output, section, paragraph, offset, text } = options;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("insertText: text must be a non-empty string");
  }
  const doc = await loadDocument(input);
  try {
    const result = parseJsonResult(doc.insertText(section, paragraph, offset, text), "insertText");
    const written = writeHwp(doc, output);
    return { ...result, ...written };
  } finally {
    doc.free();
  }
}

async function deleteText(options) {
  const { input, output, section, paragraph, offset, count } = options;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("deleteText: count must be a positive integer");
  }
  const doc = await loadDocument(input);
  try {
    const result = parseJsonResult(doc.deleteText(section, paragraph, offset, count), "deleteText");
    const written = writeHwp(doc, output);
    return { ...result, ...written };
  } finally {
    doc.free();
  }
}

async function replaceAll(options) {
  const {
    input,
    output,
    query,
    replacement,
    caseSensitive = false
  } = options;
  if (typeof query !== "string" || query.length === 0) {
    throw new Error("replaceAll: query must be a non-empty string");
  }
  const doc = await loadDocument(input);
  try {
    const raw = doc.replaceAll(query, replacement ?? "", caseSensitive === true);
    const result = parseJsonResult(raw, "replaceAll");
    const written = writeHwp(doc, output);
    return { ...result, ...written };
  } finally {
    doc.free();
  }
}

async function searchText(options) {
  const {
    input,
    query,
    fromSection = 0,
    fromParagraph = 0,
    fromChar = 0,
    forward = true,
    caseSensitive = false
  } = options;
  if (typeof query !== "string" || query.length === 0) {
    throw new Error("searchText: query must be a non-empty string");
  }
  const doc = await loadDocument(input);
  try {
    const raw = doc.searchText(
      query,
      fromSection,
      fromParagraph,
      fromChar,
      forward === true,
      caseSensitive === true
    );
    return JSON.parse(raw);
  } finally {
    doc.free();
  }
}

async function createTable(options) {
  const { input, output, section, paragraph, offset, rows, cols } = options;
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error("createTable: rows must be a positive integer");
  }
  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error("createTable: cols must be a positive integer");
  }
  const doc = await loadDocument(input);
  try {
    const raw = doc.createTable(section, paragraph, offset, rows, cols);
    const result = parseJsonResult(raw, "createTable");
    const written = writeHwp(doc, output);
    return { ...result, ...written };
  } finally {
    doc.free();
  }
}

async function setCellText(options) {
  const {
    input,
    output,
    section,
    parentParagraph,
    control,
    cell,
    cellParagraph = 0,
    text,
    replace = true
  } = options;
  if (typeof text !== "string") {
    throw new Error("setCellText: text must be a string");
  }
  const doc = await loadDocument(input);
  try {
    if (replace === true) {
      const length = doc.getCellParagraphLength(section, parentParagraph, control, cell, cellParagraph);
      if (length > 0) {
        parseJsonResult(
          doc.deleteTextInCell(
            section,
            parentParagraph,
            control,
            cell,
            cellParagraph,
            0,
            length
          ),
          "deleteTextInCell"
        );
      }
    }
    const raw = doc.insertTextInCell(
      section,
      parentParagraph,
      control,
      cell,
      cellParagraph,
      0,
      text
    );
    const result = parseJsonResult(raw, "insertTextInCell");
    const written = writeHwp(doc, output);
    return { ...result, ...written };
  } finally {
    doc.free();
  }
}

async function createBlank(outputPath) {
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw new Error("createBlank: outputPath is required");
  }
  const doc = await createBlankDocument();
  try {
    return writeHwp(doc, outputPath);
  } finally {
    doc.free();
  }
}

async function listParagraphs(filePath, sectionIndex = 0) {
  const doc = await loadDocument(filePath);
  try {
    const count = doc.getParagraphCount(sectionIndex);
    const paragraphs = [];
    for (let p = 0; p < count; p += 1) {
      paragraphs.push({
        paragraphIndex: p,
        length: doc.getParagraphLength(sectionIndex, p)
      });
    }
    return { sectionIndex, paragraphCount: count, paragraphs };
  } finally {
    doc.free();
  }
}

async function renderPage(filePath, pageIndex = 0, format = "svg") {
  const doc = await loadDocument(filePath);
  try {
    if (format === "html") return doc.renderPageHtml(pageIndex);
    if (format === "svg") return doc.renderPageSvg(pageIndex);
    throw new Error(`renderPage: unknown format '${format}' (expected 'svg' or 'html')`);
  } finally {
    doc.free();
  }
}

module.exports = {
  getRhwpCore,
  loadDocument,
  createBlankDocument,
  writeHwp,
  getDocumentInfo,
  insertText,
  deleteText,
  replaceAll,
  searchText,
  createTable,
  setCellText,
  createBlank,
  listParagraphs,
  renderPage,
  parseJsonResult
};
