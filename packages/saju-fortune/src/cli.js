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
  console.log(`Usage: saju-fortune --birth-date YYYY-MM-DD --gender male|female [--birth-time HH:mm] [options]

Options:
  --name NAME                 Korean name for the reading
  --hanja-name NAME           Optional Hanja name
  --calendar solar|lunar      Birth calendar, defaults to solar; lunar is rejected until pre-converted
  --leap-month                Mark lunar leap month
  --birth-time HH:mm          Optional birth time; omit when unknown
  --birth-city CITY           Birth city for reading context
  --analysis-type TYPE        basic|fortune|yongsin|school_compare|yongsin_method
  --fortune-type TYPE         general|career|wealth|health|love
  --tool TOOL_NAME            Call an upstream-style tool name such as analyze_saju
  --target-year YEAR          Optional yearly fortune target
  --date YYYY-MM-DD           Date for convert_calendar
  --from-calendar solar|lunar Source calendar for convert_calendar
  --to-calendar solar|lunar   Target calendar for convert_calendar
  --person1-json JSON         First profile for check_compatibility
  --person2-json JSON         Second profile for check_compatibility
  --target-date YYYY-MM-DD    Date for get_daily_fortune
  --period-type TYPE          Period type for get_fortune_by_period
  --target VALUE              Period target for get_fortune_by_period
  --limit NUMBER              Maximum cycles for get_dae_un
  --preset NAME               Local settings preset for manage_settings
`);
}

function getAnalyzeInput(options) {
  return {
    name: options.name,
    hanjaName: options["hanja-name"] || options.hanjaName,
    birthDate: options["birth-date"] || options.birthDate,
    birthTime: options["birth-time"] || options.birthTime,
    calendar: options.calendar,
    isLeapMonth: Boolean(options["leap-month"] || options.isLeapMonth),
    gender: options.gender,
    birthCity: options["birth-city"] || options.birthCity,
    analysisType: options["analysis-type"] || options.analysisType,
    fortuneType: options["fortune-type"] || options.fortuneType,
    targetYear: options["target-year"] || options.targetYear
  };
}

function parseJsonOption(options, dashedKey, camelKey) {
  const value = options[dashedKey] || options[camelKey];
  if (!value || value === true) {
    return undefined;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`${dashedKey} must be valid JSON.`);
  }
}

function buildToolArgs(toolName, options) {
  const input = getAnalyzeInput(options);

  switch (toolName) {
    case "convert_calendar":
      return {
        date: options.date || input.birthDate,
        fromCalendar: options["from-calendar"] || options.fromCalendar || input.calendar,
        toCalendar: options["to-calendar"] || options.toCalendar,
        isLeapMonth: input.isLeapMonth
      };
    case "check_compatibility":
      return {
        person1: parseJsonOption(options, "person1-json", "person1Json"),
        person2: parseJsonOption(options, "person2-json", "person2Json")
      };
    case "get_daily_fortune":
      return {
        ...input,
        targetDate: options["target-date"] || options.targetDate
      };
    case "get_dae_un":
      return {
        ...input,
        limit: options.limit
      };
    case "get_fortune_by_period":
      return {
        ...input,
        periodType: options["period-type"] || options.periodType,
        target: options.target
      };
    case "manage_settings":
      return {
        preset: options.preset
      };
    case "analyze_saju":
    default:
      return input;
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const toolName = options.tool && String(options.tool);
  const input = getAnalyzeInput(options);
  const result = toolName ? callSajuTool(toolName, buildToolArgs(toolName, options)) : analyzeSaju(input, input);
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

module.exports = { buildToolArgs, getAnalyzeInput, main, parseArgs };
