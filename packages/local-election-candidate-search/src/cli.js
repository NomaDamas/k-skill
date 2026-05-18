#!/usr/bin/env node
const { searchCandidates } = require("./index")

async function main(options = parseArgs(process.argv.slice(2)), io = console) {
  if (options.help) {
    printHelp(io)
    return
  }
  const result = await searchCandidates(options)
  io.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--name" || arg === "--query" || arg === "-q" || arg === "--keyword") options.name = argv[++i] || ""
    else if (arg === "--election" || arg === "--type" || arg === "--election-code") options.election = argv[++i] || ""
    else if (arg === "--date" || arg === "--year" || arg === "--election-date") options.electionDate = argv[++i] || ""
    else if (arg === "--region" || arg === "--city" || arg === "--district") options.region = argv[++i] || ""
    else if (arg === "--limit") options.limit = argv[++i] || ""
    else if (arg === "--all" || arg === "--include-all") options.localOnly = false
    else if (arg === "--local-only") options.localOnly = true
    else if (arg === "--include-html") options.includeHtml = true
    else if (arg === "--fixture") options.fixture = argv[++i] || ""
    else if (arg === "--help" || arg === "-h") options.help = true
    else if (!options.name) options.name = arg
  }
  return options
}

function printHelp(io = console) {
  io.log(`Usage: local-election-candidate-search <candidate-name> [options]

Search the official NEC integrated candidate search and return Korean local election candidate entries.

Examples:
  local-election-candidate-search 오세훈 --election 시도지사 --region 서울 --limit 5
  local-election-candidate-search 김동연 --date 2014 --election 기초의원
  local-election-candidate-search 이재명 --all

Options:
  --name, -q <name>        Exact candidate name (required; NEC search works best with exact names).
  --election <type>        시도지사, 기초단체장, 광역의원, 기초의원, 광역비례, 기초비례, 교육감.
  --date, --year <date>    Election year or date (YYYY, YYYYMMDD, YYYY.MM.DD).
  --region <text>          Filter district/region text, e.g. 서울 or 동작.
  --limit <number>         Max returned entries (default 20; max 100).
  --all                    Include non-local election results too.
  --include-html           Include raw upstream HTML for diagnostics.
  --fixture <path>         Parse a saved NEC HTML fixture instead of fetching.
`)
}

function formatError(error) {
  if (process.env.LOCAL_ELECTION_CANDIDATE_SEARCH_DEBUG && error && error.stack) return error.stack
  if (error && error.message) return `Error: ${error.message}`
  return String(error)
}

function run(argv = process.argv.slice(2), io = console) {
  return main(parseArgs(argv), io).catch((error) => {
    io.error(formatError(error))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = { parseArgs, printHelp, formatError, main, run }
