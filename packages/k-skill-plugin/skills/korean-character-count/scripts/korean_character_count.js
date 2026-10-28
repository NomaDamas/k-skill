#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const LINE_BREAK_PATTERN = /\r\n|[\n\r\u2028\u2029]/gu;
const HANGUL_OR_MARK_PATTERN = /^[\p{Script=Hangul}\p{Mark}]+$/u;
const HAS_HANGUL_PATTERN = /\p{Script=Hangul}/u;
const WHITESPACE_ONLY_PATTERN = /^\s+$/u;
const ASCII_ONLY_PATTERN = /^[\x00-\x7F]+$/;

function ensureSegmenter() {
  if (!globalThis.Intl?.Segmenter) {
    throw new Error("Intl.Segmenter is required. Use Node.js 18 or newer.");
  }

  return new Intl.Segmenter("ko", { granularity: "grapheme" });
}

function segmentGraphemes(text) {
  return Array.from(ensureSegmenter().segment(text), ({ segment }) => segment);
}

function countUtf8Bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }

  return Array.from(text.matchAll(LINE_BREAK_PATTERN)).length + 1;
}

function countNeisBytes(text) {
  let total = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(LINE_BREAK_PATTERN)) {
    const breakIndex = match.index ?? 0;
    total += countNeisChunkBytes(text.slice(lastIndex, breakIndex));
    total += 2;
    lastIndex = breakIndex + match[0].length;
  }

  total += countNeisChunkBytes(text.slice(lastIndex));
  return total;
}

function countNeisChunkBytes(chunk) {
  return segmentGraphemes(chunk).reduce((sum, grapheme) => sum + countNeisGraphemeBytes(grapheme), 0);
}

function countNeisGraphemeBytes(grapheme) {
  if (!grapheme) {
    return 0;
  }

  if (ASCII_ONLY_PATTERN.test(grapheme)) {
    return 1;
  }

  if (HANGUL_OR_MARK_PATTERN.test(grapheme) && HAS_HANGUL_PATTERN.test(grapheme)) {
    return 3;
  }

  return countUtf8Bytes(grapheme);
}

function createReport(text, profile = "default") {
  const graphemes = segmentGraphemes(text);
  const bytesUtf8 = countUtf8Bytes(text);
  const bytesNeis = countNeisBytes(text);
  const selectedBytes = profile === "neis" ? bytesNeis : bytesUtf8;

  return {
    profile,
    contract: {
      characters: "Unicode extended grapheme clusters via Intl.Segmenter",
      bytes:
        profile === "neis"
          ? "NEIS-compatible bytes: Hangul grapheme=3B, ASCII grapheme=1B, each line break=2B, everything else falls back to UTF-8 bytes"
          : "Actual UTF-8 encoded byte length",
      lines:
        "Empty string => 0 lines; otherwise count CRLF, LF, CR, U+2028, U+2029 as one line break each and add 1",
    },
    counts: {
      characters: graphemes.length,
      characters_without_whitespace: graphemes.filter((grapheme) => !WHITESPACE_ONLY_PATTERN.test(grapheme)).length,
      code_points: Array.from(text).length,
      utf16_code_units: text.length,
      lines: countLines(text),
      bytes: selectedBytes,
      bytes_utf8: bytesUtf8,
      bytes_neis: bytesNeis,
    },
  };
}

function parseArgs(argv, stdinIsTTY = process.stdin.isTTY) {
  const options = {
    format: "json",
    inputMode: null,
    profile: "default",
    text: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--text") {
      setInputMode(options, "text");
      options.text = readNextValue(argv, ++index, arg);
      continue;
    }

    if (arg === "--file") {
      setInputMode(options, "file");
      options.file = readNextValue(argv, ++index, arg);
      continue;
    }

    if (arg === "--stdin") {
      setInputMode(options, "stdin");
      continue;
    }

    if (arg === "--profile") {
      const value = readNextValue(argv, ++index, arg);

      if (!["default", "neis"].includes(value)) {
        throw new Error(`Unknown profile: ${value}`);
      }

      options.profile = value;
      continue;
    }

    if (arg === "--format") {
      const value = readNextValue(argv, ++index, arg);

      if (!["json", "text"].includes(value)) {
        throw new Error(`Unknown format: ${value}`);
      }

      options.format = value;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (!options.inputMode) {
    if (stdinIsTTY) {
      throw new Error("Provide exactly one input source with --text, --file, or --stdin.");
    }

    options.inputMode = "stdin";
  }

  return options;
}

function setInputMode(options, nextMode) {
  if (options.inputMode) {
    throw new Error("Provide exactly one input source with --text, --file, or --stdin.");
  }

  options.inputMode = nextMode;
}

function readNextValue(argv, index, flagName) {
  const value = argv[index];

  if (value == null) {
    throw new Error(`Missing value after ${flagName}`);
  }

  return value;
}

function readInput(options) {
  if (options.inputMode === "text") {
    return options.text ?? "";
  }

  if (options.inputMode === "file") {
    return fs.readFileSync(options.file, "utf8");
  }

  return fs.readFileSync(0, "utf8");
}

function formatTextReport(report) {
  return [
    `profile: ${report.profile}`,
    `characters: ${report.counts.characters}`,
    `characters_without_whitespace: ${report.counts.characters_without_whitespace}`,
    `code_points: ${report.counts.code_points}`,
    `utf16_code_units: ${report.counts.utf16_code_units}`,
    `lines: ${report.counts.lines}`,
    `bytes: ${report.counts.bytes}`,
    `bytes_utf8: ${report.counts.bytes_utf8}`,
    `bytes_neis: ${report.counts.bytes_neis}`,
    `character_contract: ${report.contract.characters}`,
    `byte_contract: ${report.contract.bytes}`,
    `line_contract: ${report.contract.lines}`,
  ].join("\n");
}

function printHelp() {
  console.log(`Usage: node scripts/korean_character_count.js [--text <text> | --file <path> | --stdin] [--profile default|neis] [--format json|text]

Deterministically count Korean text characters, lines, and bytes.

Options:
  --text <text>      Count the provided text
  --file <path>      Read UTF-8 text from a file
  --stdin            Read UTF-8 text from stdin
  --profile <name>   default (grapheme + UTF-8) or neis
  --format <name>    json (default) or text
  --help, -h         Show this help text
`);
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  const report = createReport(readInput(options), options.profile);
  const output = options.format === "text" ? formatTextReport(report) : JSON.stringify(report, null, 2);

  console.log(output);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  countLines,
  countNeisBytes,
  countUtf8Bytes,
  createReport,
  formatTextReport,
  main,
  parseArgs,
  segmentGraphemes,
};
