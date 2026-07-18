#!/usr/bin/env node
"use strict"

const { getSubsidyStatus, searchRegions } = require("./index")

function parseArgs(argv) {
  const options = { command: "status" }
  let index = 0
  if (argv[0] && !argv[0].startsWith("-") && ["status", "regions"].includes(argv[0])) {
    options.command = argv[0]
    index = 1
  }
  for (; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--region" || arg === "-r") options.region = argv[++index]
    else if (arg === "--query" || arg === "-q") options.query = argv[++index]
    else if (arg === "--vehicle" || arg === "--vehicle-type") options.vehicleType = argv[++index]
    else if (arg === "--year") options.year = argv[++index]
    else if (arg === "--category") options.category = argv[++index]
    else if (arg === "--model") options.model = argv[++index]
    else if (arg === "--transport") options.transport = argv[++index]
    else if (arg === "--provider") options.provider = argv[++index]
    else if (arg === "--cdp-url") options.cdpUrl = argv[++index]
    else if (arg === "--timeout") options.timeoutMs = argv[++index]
    else if (arg === "--json") options.json = true
    else if (arg === "--help" || arg === "-h") options.help = true
    else if (!options.region && options.command === "status") options.region = arg
    else if (!options.query && options.command === "regions") options.query = arg
  }
  return options
}

function formatCount(counts) {
  if (!counts) return "확인 불가"
  const total = Number.isFinite(counts.total) ? `${counts.total.toLocaleString("ko-KR")}대` : "확인 불가"
  const details = [
    ["우선", counts.priority],
    ["법인·기관", counts.corporate],
    ["일반", counts.general]
  ]
  if (Number.isFinite(counts.taxi)) details.splice(2, 0, ["택시", counts.taxi])
  if (Number.isFinite(counts.small_business)) details.splice(2, 0, ["중소기업", counts.small_business])
  return `${total} (${details.filter(([, value]) => Number.isFinite(value)).map(([label, value]) => `${label} ${value.toLocaleString("ko-KR")}`).join(", ")})`
}

function formatStatus(result) {
  const lines = [
    `${result.region.sido_name} ${result.region.local_name} ${result.status.vehicle_label} 보조금 현황`,
    `조회: ${result.source.fetched_at}`,
    "",
    `민간공고대수: ${formatCount(result.status.notice_count)}`,
    `접수대수: ${formatCount(result.status.application_count)}`,
    `출고대수: ${formatCount(result.status.delivered_count)}`,
    `출고잔여대수: ${formatCount(result.status.delivery_remaining_count)}`,
    `상태: ${result.availability.label}`,
    `접수방법: ${result.status.application_method || "확인 불가"}`,
    `비고: ${result.status.note || "없음"}`
  ]
  if (result.model_subsidy) {
    lines.push(
      "",
      `모델: ${result.model_subsidy.manufacturer} ${result.model_subsidy.model}`,
      `1대당 보조금: ${(result.model_subsidy.total_subsidy_krw || 0).toLocaleString("ko-KR")}원`,
      `모델 기준 잔여 환산치: ${(result.remaining_budget.model_equivalent_estimate_krw || 0).toLocaleString("ko-KR")}원`
    )
  } else if (Array.isArray(result.model_subsidy_candidates) && result.model_subsidy_candidates.length) {
    lines.push("", "일치하는 세부 모델:")
    for (const item of result.model_subsidy_candidates) {
      const subsidy = Number.isFinite(item.total_subsidy_krw)
        ? `${item.total_subsidy_krw.toLocaleString("ko-KR")}원`
        : "확인 불가"
      const estimate = Number.isFinite(item.remaining_equivalent_estimate_krw)
        ? `${item.remaining_equivalent_estimate_krw.toLocaleString("ko-KR")}원`
        : "확인 불가"
      lines.push(`- ${item.manufacturer} ${item.model}: 1대당 ${subsidy}, 잔여 환산치 ${estimate}`)
    }
  }
  lines.push(
    "",
    "주의: 출고잔여대수는 실제 신청 가능 대수와 다를 수 있으며 정확한 원화 예산 잔액이 아닙니다.",
    `출처: ${result.source.url}`
  )
  if (result.warnings.length) lines.push("", ...result.warnings.map((warning) => `경고: ${warning}`))
  return lines.join("\n")
}

function printHelp(io = console) {
  io.log(`Usage:
  ev-subsidy-status status --region "경기 성남시" [options]
  ev-subsidy-status regions --query "중구" [options]

Options:
  -r, --region <region>       시도와 시군구. 예: 경기 성남시
  -q, --query <text>          regions 명령의 지역 검색어
  --vehicle <type>            passenger/승용, cargo/화물, bus/승합
  --year <year>               기준년도. 기본값은 현재 연도
  --model <model>             지자체 모델별 보조금과 잔여 환산치 조회
  --transport <transport>     기본 direct-http, 선택값 browser
  --provider <provider>       browser 사용 시 auto, aside, browseros, chrome-cdp
  --cdp-url <url>             사용자가 실행한 Chrome/BrowserOS CDP URL
  --timeout <ms>              페이지 대기 시간
  --json                      JSON 출력
`)
}

async function main(options = parseArgs(process.argv.slice(2)), io = console) {
  if (options.help) {
    printHelp(io)
    return null
  }
  if (options.command === "regions") {
    const result = await searchRegions(options)
    io.log(JSON.stringify(result, null, 2))
    return result
  }
  const result = await getSubsidyStatus(options)
  io.log(options.json ? JSON.stringify(result, null, 2) : formatStatus(result))
  return result
}

function formatError(error) {
  return JSON.stringify({
    error: {
      code: error && error.code ? error.code : "UNKNOWN",
      message: error && error.message ? error.message : String(error),
      details: error && error.details ? error.details : {}
    }
  }, null, 2)
}

function run(argv = process.argv.slice(2), io = console) {
  return main(parseArgs(argv), io).catch((error) => {
    io.error(formatError(error))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = {
  formatCount,
  formatError,
  formatStatus,
  main,
  parseArgs,
  printHelp,
  run
}
