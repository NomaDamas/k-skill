#!/usr/bin/env node
const { searchEvents } = require("./index")

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = await searchEvents(args)
  console.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--query" || arg === "-q") options.query = argv[++i] || ""
    else if (arg === "--from") options.from = argv[++i]
    else if (arg === "--to") options.to = argv[++i]
    else if (arg === "--limit") options.limit = Number(argv[++i])
    else if (arg === "--max-details-per-source") options.maxDetailsPerSource = Number(argv[++i])
    else if (arg === "--include-triathlon") options.includeTriathlon = true
    else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (!options.query) {
      options.query = arg
    }
  }
  return options
}

function printHelp() {
  console.log(`Usage: korean-marathon-schedule [query] [options]\n\nOptions:\n  -q, --query <text>              Filter by title, region, venue, or category\n  --from <YYYY-MM-DD>             Earliest event date\n  --to <YYYY-MM-DD>               Latest event date\n  --limit <number>                Maximum results (default: 10)\n  --max-details-per-source <number>\n                                  Detail crawl budget for each public source\n  --include-triathlon             Include 대한철인3종협회 triathlon events when possible\n`)
}

function run() {
  return main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = { parseArgs, printHelp, main }
