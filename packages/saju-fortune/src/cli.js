#!/usr/bin/env node

const { analyzeSaju, callSajuTool } = require("./index");

function parseArgs(argv) {
  const options = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      options._.push(arg);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: saju-fortune --birth-date YYYY-MM-DD --birth-time HH:mm --gender male|female [options]

Options:
  --name NAME                 Korean name for the reading
  --hanja-name NAME           Optional Hanja name
  --calendar solar|lunar      Birth calendar, defaults to solar
  --leap-month                Mark lunar leap month
  --birth-city CITY           Birth city for reading context
  --analysis-type TYPE        basic|fortune|yongsin|school_compare|yongsin_method
  --fortune-type TYPE         general|career|wealth|health|love
  --tool TOOL_NAME            Call an upstream-style tool name such as analyze_saju
  --target-year YEAR          Optional yearly fortune target
`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const input = {
    name: options.name,
    hanjaName: options["hanja-name"],
    birthDate: options["birth-date"] || options.birthDate,
    birthTime: options["birth-time"] || options.birthTime,
    calendar: options.calendar,
    isLeapMonth: Boolean(options["leap-month"]),
    gender: options.gender,
    birthCity: options["birth-city"] || options.birthCity,
    analysisType: options["analysis-type"] || options.analysisType,
    fortuneType: options["fortune-type"] || options.fortuneType,
    targetYear: options["target-year"] || options.targetYear
  };

  const result = options.tool ? callSajuTool(String(options.tool), input) : analyzeSaju(input, input);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
