#!/usr/bin/env node
"use strict";

// 신･구조문대비표 작성기. 개정안 조문 JSON 을 받아 현행 조문(k-skill-proxy 경유 법제처)과 대조한 표를
// stdout 에 쓰고, --output 이면 한글(.hwpx) 파일로도 저장한다. LAW_OC 같은 사용자 키는 필요 없다.
//
// 입력 JSON: { lawName, mst?, lawId?, title?, amendments: [{ jo?, text, currentText? }] }
// 엔진은 chrisryugj/korean-law-mcp(MIT)에서 이식했다 — korean-law-search/NOTICE 참고.

const fs = require("node:fs");
const { parseArgs } = require("node:util");
const { amendmentTable } = require("./amendment/table.js");
const { createProxyClient } = require("./amendment/current.js");

const USAGE = `사용법: amendment_table.js [--input 개정안.json] [--output 대비표.hwpx]
  --input   개정안 JSON 파일 (생략하면 stdin)
  --output  한글(.hwpx) 저장 경로 ("~/" 는 홈 디렉터리)
  KSKILL_PROXY_BASE_URL 로 proxy 주소를 바꿀 수 있다.`;

async function main(argv) {
  let args;
  try {
    args = parseArgs({ args: argv, options: { input: { type: "string", short: "i" }, output: { type: "string", short: "o" }, help: { type: "boolean", short: "h" } } }).values;
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let raw;
  try {
    raw = args.input ? fs.readFileSync(args.input, "utf8") : fs.readFileSync(0, "utf8");
  } catch (error) {
    process.stderr.write(`입력을 읽지 못했습니다: ${error.message}\n`);
    return 2;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`입력이 올바른 JSON 이 아닙니다: ${error.message}\n`);
    return 2;
  }
  if (args.output && input && typeof input === "object") input.outputPath = args.output;

  const result = await amendmentTable(createProxyClient(), input);
  (result.isError ? process.stderr : process.stdout).write(`${result.text}\n`);
  return result.isError ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error) => { process.stderr.write(`예기치 못한 오류: ${error.stack || error}\n`); process.exitCode = 1; },
);
