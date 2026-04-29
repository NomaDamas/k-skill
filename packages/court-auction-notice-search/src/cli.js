"use strict";

const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber,
  getCourtCodes,
  getBidTypes,
  resolveBidTypeCode,
  CourtAuctionHttpClient
} = require("./index");

const USAGE = `court-auction-notice-search — 대법원경매정보(courtauction.go.kr) read-only client

USAGE
  court-auction-notice-search notices --date <YYYY-MM-DD> [--court-code <B000210>] [--bid-type date|period]
  court-auction-notice-search notice-detail --court-code <B000210> --sale-date <YYYY-MM-DD> --judge-dept-code <jdbnCd>
                                            [--bid-start <YYYY-MM-DD>] [--bid-end <YYYY-MM-DD>] [--bid-type date|period]
  court-auction-notice-search case --court-code <B000210> --case-number <2024타경100001>
  court-auction-notice-search codes courts
  court-auction-notice-search codes bid-types

GLOBAL FLAGS
  --json                 Print JSON output (default)
  --pretty               Pretty-print JSON
  --include-raw=false    Strip the raw passthrough field from output
  --timeout-ms <ms>      HTTP timeout per request (default: 15000)
  --min-delay-ms <ms>    Minimum jitter between calls (default: 2000)
  --max-calls <N>        Per-session call budget (default: 10)
  -h, --help             Show this help

NOTES
  - The court auction site blocks bursty traffic by IP for ~1 hour. Keep traffic slow.
  - On block detection (data.ipcheck === false), the client throws a BLOCKED error and stops.
  - This skill is read-only. Always re-verify actual auction data on the official site before bidding.
`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (token === "-h" || token === "--help") {
      args.flags.help = true;
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      let name;
      let value;
      if (eq !== -1) {
        name = token.slice(2, eq);
        value = token.slice(eq + 1);
      } else {
        name = token.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("-")) {
          value = true;
        } else {
          value = next;
          i += 1;
        }
      }
      args.flags[name] = value;
    } else {
      args._.push(token);
    }
    i += 1;
  }
  return args;
}

function flagToInt(flags, name) {
  if (flags[name] === undefined) return undefined;
  const n = Number(flags[name]);
  if (!Number.isFinite(n)) {
    throw new Error(`--${name} must be an integer, got ${flags[name]}`);
  }
  return n;
}

function buildClient(flags) {
  const opts = {};
  const timeoutMs = flagToInt(flags, "timeout-ms");
  if (timeoutMs !== undefined) opts.timeoutMs = timeoutMs;
  const minDelayMs = flagToInt(flags, "min-delay-ms");
  if (minDelayMs !== undefined) opts.minDelayMs = minDelayMs;
  const maxCalls = flagToInt(flags, "max-calls");
  if (maxCalls !== undefined) opts.maxCallsPerSession = maxCalls;
  return new CourtAuctionHttpClient(opts);
}

function emit(value, flags) {
  const pretty = flags.pretty || flags["pretty-print"];
  const json = pretty
    ? JSON.stringify(value, null, 2)
    : JSON.stringify(value);
  process.stdout.write(`${json}\n`);
}

function shouldIncludeRaw(flags) {
  if (flags["include-raw"] === undefined) return undefined;
  if (flags["include-raw"] === false || flags["include-raw"] === "false") return false;
  return true;
}

async function runNotices(flags) {
  const date = flags.date;
  if (!date) throw new Error("--date is required (YYYY-MM-DD)");
  const includeRaw = shouldIncludeRaw(flags);
  const result = await searchSaleNotices({
    date,
    courtCode: flags["court-code"] || flags.court || "",
    bidType: flags["bid-type"] || flags.bidType,
    client: buildClient(flags),
    includeRaw: includeRaw === undefined ? true : includeRaw
  });
  emit(result, flags);
}

async function runNoticeDetail(flags) {
  const result = await getSaleNoticeDetail(
    {
      courtCode: flags["court-code"],
      saleDate: flags["sale-date"],
      judgeDeptCode: flags["judge-dept-code"],
      judgeDeptName: flags["judge-dept-name"],
      judgeDeptPhone: flags["judge-dept-phone"],
      salePlace: flags["sale-place"],
      bidStartDate: flags["bid-start"],
      bidEndDate: flags["bid-end"],
      bidType: flags["bid-type"]
    },
    {
      client: buildClient(flags),
      includeRaw: shouldIncludeRaw(flags) !== false
    }
  );
  emit(result, flags);
}

async function runCase(flags) {
  const result = await getCaseByCaseNumber({
    courtCode: flags["court-code"],
    caseNumber: flags["case-number"] || flags.caseNumber,
    client: buildClient(flags),
    includeRaw: shouldIncludeRaw(flags) !== false
  });
  emit(result, flags);
}

async function runCodes(positional, flags) {
  const sub = positional[1];
  if (sub === "bid-types" || sub === "bid_types" || sub === "bid") {
    emit({ items: getBidTypes() }, flags);
    return;
  }
  if (!sub || sub === "courts") {
    const result = await getCourtCodes({ client: buildClient(flags) });
    emit(result, flags);
    return;
  }
  throw new Error(`Unknown codes subcommand: ${sub}. Try "courts" or "bid-types".`);
}

async function main(argv) {
  const args = parseArgs(argv || []);
  if (args.flags.help || args._.length === 0) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (args.flags["bid-type"] !== undefined && args.flags["bid-type"] !== true) {
    resolveBidTypeCode(args.flags["bid-type"]);
  }

  const command = args._[0];
  switch (command) {
    case "notices":
      await runNotices(args.flags);
      return 0;
    case "notice-detail":
    case "noticeDetail":
      await runNoticeDetail(args.flags);
      return 0;
    case "case":
      await runCase(args.flags);
      return 0;
    case "codes":
      await runCodes(args._, args.flags);
      return 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n${USAGE}`);
      return 2;
  }
}

module.exports = { main, parseArgs, USAGE };
