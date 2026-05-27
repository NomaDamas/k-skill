#!/usr/bin/env node
const { fetchReport, listReports } = require("./index")

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = args.id
    ? await fetchReport(args.id, args)
    : await listReports(args)
  console.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--query" || arg === "-q") options.query = argv[++i] || ""
    else if (arg === "--limit") options.limit = argv[++i]
    else if (arg === "--max-inspect") options.maxInspect = argv[++i]
    else if (arg === "--id") options.id = argv[++i]
    else if (arg === "--include-explain") options.includeExplain = true
    else if (arg === "--include-html") options.includeHtml = true
    else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (/^\d{14}(?:\.html)?$/.test(arg) && !options.id) {
      options.id = arg
    } else if (!options.query) {
      options.query = arg
    }
  }
  return options
}

function printHelp() {
  console.log(`Usage: daishin-report-search [query] [options]\n\nList latest reports:\n  daishin-report-search --limit 10\n  daishin-report-search 반도체 --limit 5 --max-inspect 100\n\nFetch one report:\n  daishin-report-search --id 20260511082352 --include-explain\n\nOptions:\n  -q, --query <text>     Filter by title/headings/detail text\n  --limit <number>      Maximum list results (default: 10)\n  --max-inspect <n>     Maximum latest pages to inspect for query matching\n  --id <timestamp>      Fetch one YYYYMMDDHHMMSS report\n  --include-explain     Fetch companion *_explain.html page for --id\n  --include-html         Include raw HTML in JSON output\n`)
  console.log("Environment:\n  DAISHIN_GITHUB_TOKEN or GITHUB_TOKEN  Optional caller-owned token for api.github.com requests\n")
}

function run() {
  return main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = { parseArgs, printHelp, main }
