#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const {
  HIPASS_ENDPOINTS,
  buildChromeLaunchCommand,
  buildUsageHistoryQuery,
  inspectHipassPage,
  listUsageHistory,
  openReceiptPopup,
  parseUsageHistoryList
} = require("./index")

function printHelp() {
  process.stdout.write(`hipass-receipt — logged-in browser session helper for https://www.hipass.co.kr

Commands:
  hipass-receipt --help
  hipass-receipt chrome-command [--profile-dir DIR] [--debugging-port PORT] [--chrome-path PATH]
  hipass-receipt fixture-demo --fixture PATH [--start-date YYYY-MM-DD --end-date YYYY-MM-DD]
  hipass-receipt list --start-date YYYY-MM-DD --end-date YYYY-MM-DD [--cdp-url URL] [--page-size N] [--ecd-no VALUE|--encrypted-card-number VALUE]
  hipass-receipt receipt --start-date YYYY-MM-DD --end-date YYYY-MM-DD --row-index N [--cdp-url URL] [--ecd-no VALUE|--encrypted-card-number VALUE]

Notes:
- This workflow only supports a logged-in browser session. It does not automate ID/PW or OTP entry.
- Start Chrome with a dedicated --remote-debugging-port and --user-data-dir profile, then let the user log in manually.
- Hi-Pass exposes session timeout behavior through /comm/sessionCheck.do and permission-check redirects.
`)
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) {
      args._.push(token)
      continue
    }

    const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true
    args[key] = value
  }
  return args
}

function required(args, key, description) {
  if (!args[key]) {
    throw new Error(`Missing required --${description || key}`)
  }
  return args[key]
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    printHelp()
    return
  }

  const command = argv[0]
  const args = parseArgs(argv.slice(1))
  const ecdNo = args.ecdNo ?? args.encryptedCardNumber

  if (command === "chrome-command") {
    process.stdout.write(
      `${buildChromeLaunchCommand({
        chromePath: args.chromePath,
        profileDir: args.profileDir,
        debuggingPort: args.debuggingPort
      })}\n`,
    )
    return
  }

  if (command === "fixture-demo") {
    const fixturePath = path.resolve(required(args, "fixture", "fixture PATH"))
    const html = fs.readFileSync(fixturePath, "utf8")
    const output = {
      endpoints: HIPASS_ENDPOINTS,
      pageInfo: inspectHipassPage(html),
      query: args.startDate && args.endDate ? buildUsageHistoryQuery(args) : null,
      parsed: parseUsageHistoryList(html)
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    return
  }

  if (command === "list") {
    const parsed = await listUsageHistory({
      cdpUrl: args.cdpUrl,
      startDate: required(args, "startDate", "start-date YYYY-MM-DD"),
      endDate: required(args, "endDate", "end-date YYYY-MM-DD"),
      ecdNo,
      pageSize: args.pageSize,
      pageNo: args.pageNo,
      receiptTimeType: args.receiptTimeType
    })
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`)
    return
  }

  if (command === "receipt") {
    const parsed = await openReceiptPopup({
      cdpUrl: args.cdpUrl,
      startDate: required(args, "startDate", "start-date YYYY-MM-DD"),
      endDate: required(args, "endDate", "end-date YYYY-MM-DD"),
      rowIndex: Number(required(args, "rowIndex", "row-index N")),
      ecdNo,
      pageSize: args.pageSize,
      pageNo: args.pageNo,
      receiptTimeType: args.receiptTimeType
    })
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`)
    return
  }

  throw new Error(`Unsupported command: ${command}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
