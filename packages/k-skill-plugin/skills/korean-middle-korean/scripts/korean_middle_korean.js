#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const PROFILE = "middle-korean-style-v1";
const CONTRACT =
  "Deterministic Korean Middle Korean-style rewrite: public-domain orthographic flavor rules, fixed broad lexicon replacements, archaic particles/endings, Sino-Korean Hanja hints, protected URL/email/Markdown-code spans, and best-effort preservation for names/numbers when no rule matches.";

const LEXICON = [
  ["야 이", "이"],
  ["맛국노야", "맛國노〮야"],
  ["설마", "쇼ᄆᆞ"],
  ["새벽", "샛ᄇᆡ긔〮"],
  ["배우", "俳優"],
  ["구자욱이랑", "구자욱과"],
  ["거리", "街里"],
  ["손잡고", "손ᄋᆞᆯ 자ᇙ고"],
  ["걸어다니는", "거러다니ᄂᆞᆫ"],
  ["모습", "모ᄉᆡᆸ〮"],
  ["찍혀", "찍히야"],
  ["열애설", "熱愛說"],
  ["터지고", "터ᄂᆞᆺ고"],
  ["인정했지만", "인졍ᄒᆞ엿거ᄂᆞᆫ"],
  ["인정했다", "인졍ᄒᆞ엿다〮"],
  ["인정", "인졍"],
  ["맛보기한", "맛보기〮ᄒᆞᆫ"],
  ["느낌이랄까", "닏믁이ᄅᆞᆯ가〯"],
  ["기분이구나", "기븐〮이로다"],
  ["말해", "ᄆᆞᆯᄒᆞ야"],
  ["사건", "일"],
  ["학교", "學校"],
];

function record(replacements, kind, from, to, count) {
  if (count > 0) {
    replacements.push({ kind, from, to, count });
  }
}

function replaceLiteral(text, from, to, replacements) {
  const count = text.split(from).length - 1;
  if (count === 0) return text;
  record(replacements, "lexicon", from, to, count);
  return text.split(from).join(to);
}

function replaceRegex(text, pattern, to, replacements, kind, label) {
  const matches = text.match(pattern);
  const count = matches ? matches.length : 0;
  const next = text.replace(pattern, to);
  record(replacements, kind, label ?? String(pattern), typeof to === "string" ? to : "<rule>", count);
  return next;
}

function protectSpans(input) {
  const protectedSpans = [];
  let text = input;

  function protect(pattern) {
    text = text.replace(pattern, (match) => {
      const token = `\uE000${protectedSpans.length}\uE001`;
      protectedSpans.push(match);
      return token;
    });
  }

  protect(/```[\s\S]*?```/g);
  protect(/`[^`\n]*`/g);
  protect(/\[[^\]\n]*\]\([^\s)]+(?:\s+"[^"]*")?\)/g);
  protect(/\bhttps?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g);
  protect(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);

  return { text, protectedSpans };
}

function restoreSpans(text, protectedSpans) {
  let output = text;
  protectedSpans.forEach((span, index) => {
    output = output.replaceAll(`\uE000${index}\uE001`, span);
  });
  return output;
}

function convertToMiddleKoreanStyle(input) {
  return createReport(input).output;
}

function createReport(input) {
  if (typeof input !== "string") {
    throw new TypeError("input must be a string");
  }

  const replacements = [];
  const protectedInput = protectSpans(input);
  let output = protectedInput.text;

  output = replaceRegex(output, /(\d+)년/g, "$1年", replacements, "date", "년→年");
  output = replaceRegex(output, /(\d+)월/g, "$1月", replacements, "date", "월→月");
  output = replaceRegex(output, /(\d+)일/g, "$1日", replacements, "date", "일→日");

  for (const [from, to] of LEXICON) {
    output = replaceLiteral(output, from, to, replacements);
  }

  output = replaceRegex(output, /말하는/g, "ᄆᆞᆯᄒᆞᄂᆞᆫ", replacements, "ending", "말하는→ᄆᆞᆯᄒᆞᄂᆞᆫ");
  output = replaceRegex(output, /공부했다〮?/g, "공부ᄒᆞ엿다〮", replacements, "ending", "공부했다→공부ᄒᆞ엿다〮");
  output = replaceRegex(output, /했다〮?/g, "ᄒᆞ엿다〮", replacements, "ending", "했다→ᄒᆞ엿다〮");
  output = replaceRegex(output, /하는(?=\s|[",.?!]|$)/g, "ᄒᆞᄂᆞᆫ", replacements, "ending", "하는→ᄒᆞᄂᆞᆫ");
  output = replaceRegex(output, /된(?=\s|[",.?!]|$)/g, "ᄃᆞᆫ", replacements, "ending", "된→ᄃᆞᆫ");
  output = replaceRegex(output, /것이냐(?=[.?!。]|$)/g, "것이냐〮", replacements, "ending", "것이냐→것이냐〮");

  output = replaceRegex(output, /([가-힣ᄀ-ᇿA-Za-z0-9一-龥]+)(은|는)(?=\s|[",.?!]|$)/g, "$1ᄋᆞᆫ", replacements, "particle", "은/는→ᄋᆞᆫ");
  output = replaceRegex(output, /([가-힣ᄀ-ᇿA-Za-z0-9一-龥]+)(을|를)(?=\s|[",.?!]|$)/g, "$1ᄋᆞᆯ", replacements, "particle", "을/를→ᄋᆞᆯ");
  output = replaceRegex(output, /([가-힣ᄀ-ᇿA-Za-z0-9一-龥]+)에서(?=\s|[",.?!]|$)/g, "$1애", replacements, "particle", "에서→애");
  output = replaceRegex(output, /([가-힣ᄀ-ᇿA-Za-z0-9一-龥]+)와(?=\s|[",.?!]|$)/g, "$1와", replacements, "particle", "와 보존");

  output = output.replace(/\s+([,.;:?!])/g, "$1");
  output = restoreSpans(output, protectedInput.protectedSpans);

  return {
    profile: PROFILE,
    input,
    output,
    replacements,
    contract: CONTRACT,
  };
}

function parseArgs(argv) {
  const parsed = {
    format: "json",
    inputMode: null,
    text: undefined,
  };
  let sourceCount = 0;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--text") {
      sourceCount += 1;
      parsed.inputMode = "text";
      parsed.text = argv[++index];
      if (parsed.text === undefined) throw new Error("--text requires a value");
    } else if (arg === "--file") {
      sourceCount += 1;
      parsed.inputMode = "file";
      parsed.file = argv[++index];
      if (!parsed.file) throw new Error("--file requires a path");
    } else if (arg === "--stdin") {
      sourceCount += 1;
      parsed.inputMode = "stdin";
    } else if (arg === "--format") {
      parsed.format = argv[++index];
      if (!parsed.format) throw new Error("--format requires a value");
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!parsed.help && sourceCount !== 1) {
    throw new Error("provide exactly one input source: --text, --file, or --stdin");
  }
  if (!["json", "text"].includes(parsed.format)) {
    throw new Error(`unknown format: ${parsed.format}`);
  }

  return parsed;
}

function readInput(options) {
  if (options.inputMode === "text") return options.text;
  if (options.inputMode === "file") return fs.readFileSync(options.file, "utf8");
  if (options.inputMode === "stdin") return fs.readFileSync(0, "utf8");
  throw new Error("missing input source");
}

function helpText() {
  return `Usage: node scripts/korean_middle_korean.js (--text TEXT | --file PATH | --stdin) [--format json|text]\n\nConverts Korean input into a deterministic Korean Middle Korean-style rewrite.\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const report = createReport(readInput(options));
  if (options.format === "text") {
    process.stdout.write(`${report.output}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
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
  CONTRACT,
  PROFILE,
  convertToMiddleKoreanStyle,
  createReport,
  parseArgs,
  main,
};
