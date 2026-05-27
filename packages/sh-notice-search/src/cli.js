#!/usr/bin/env node
const { getNoticeDetail, searchNotices } = require("./index")

async function main(options = parseArgs(process.argv.slice(2)), io = console) {
  const result = options.seq || options.id || options.noticeSeq
    ? await getNoticeDetail(options)
    : await searchNotices(options)
  io.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--query" || arg === "-q" || arg === "--keyword") options.keyword = argv[++i] || ""
    else if (arg === "--category" || arg === "--kind") options.category = argv[++i] || ""
    else if (arg === "--status") options.status = argv[++i] || ""
    else if (arg === "--page") options.page = argv[++i] || ""
    else if (arg === "--limit" || arg === "--page-size") options.limit = argv[++i] || ""
    else if (arg === "--srch-tp" || arg === "--search-type") options.searchType = argv[++i] || ""
    else if (arg === "--seq" || arg === "--id") options.seq = argv[++i] || ""
    else if (arg === "--include-html") options.includeHtml = true
    else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (/^\d{4,}$/.test(arg) && !options.seq && (argv[i - 1] === "detail" || argv[i - 1] === "--detail")) {
      options.seq = arg
    } else if (arg === "detail" || arg === "--detail") {
      // marker only; following numeric argument can be seq
    } else if (!options.keyword) {
      options.keyword = arg
    }
  }
  return options
}

function printHelp() {
  console.log(`Usage: sh-notice-search [keyword] [options]

Search public SH notices:
  sh-notice-search 행복주택 --category 임대 --limit 5
  sh-notice-search 매입임대 --category 주거복지 --status 진행

Fetch one detail:
  sh-notice-search --seq 304371 --category 임대

Options:
  -q, --query <text>       Keyword. Defaults to title search when present.
  --search-type <type>     title/제목 or content/내용.
  --category <category>    all, rent/임대, sale/분양, welfare/주거복지, land/토지, etc.
  --status <status>        open/진행, closed/마감, announced/당첨자 (title classifier).
  --page <number>          Page number (default: 1).
  --limit <number>         Returned rows; capped at SH fixed page size 10.
  --seq <number>           Fetch detail by SH notice seq.
  --include-html           Include raw HTML in output for diagnostics.
`)
}

function formatError(error) {
  return error && error.stack ? error.stack : String(error)
}

function run(argv = process.argv.slice(2), io = console) {
  return main(parseArgs(argv), io).catch((error) => {
    io.error(formatError(error))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = { parseArgs, printHelp, formatError, main, run }
