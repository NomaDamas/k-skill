#!/usr/bin/env node
const { searchClinics } = require("./index")

async function main(options = parseArgs(process.argv.slice(2)), io = console) {
  const result = await searchClinics(options)
  io.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--query" || arg === "-q") options.query = argv[++i] || ""
    else if (arg === "--limit") options.limit = Number(argv[++i])
    else if (arg === "--debug") options.debug = true
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
  console.log(`Usage: gangnamunni-clinic-search [query] [options]\n\nOptions:\n  -q, --query <text>     Search keyword, e.g. "강남 성형외과"\n  --limit <number>       Maximum clinic results (default: 5)\n  --debug                Print stack traces for troubleshooting\n`)
}

function formatError(error, options = {}) {
  if (options.debug && error && error.stack) return error.stack
  return error && error.message ? error.message : String(error)
}

function run(argv = process.argv.slice(2), io = console) {
  const options = parseArgs(argv)
  return main(options, io).catch((error) => {
    io.error(formatError(error, options))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = { parseArgs, printHelp, formatError, run, main }
