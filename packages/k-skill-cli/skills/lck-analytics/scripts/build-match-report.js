#!/usr/bin/env node
const path = require("node:path");
const {
  formatOutput,
  loadLckResults,
  parseArgs,
  readJson,
  resolveCachePaths,
  writeJson,
} = require("./_lib");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date;
  if (!date) {
    throw new Error("--date <YYYY-MM-DD> is required");
  }

  const cacheDir = path.resolve(args.cache || path.join(process.cwd(), ".openclaw-lck-cache"));
  const paths = resolveCachePaths(cacheDir);
  const historicalWrapper = readJson(paths.historical, { data: {} });
  const pkg = await loadLckResults();

  const analysis = await pkg.getMatchAnalysis(date, {
    team: args.team || undefined,
    historicalDataset: historicalWrapper.data,
  });

  const reportFile = path.join(paths.reports, `match-${date}${args.team ? `-${args.team}` : ""}.json`);
  writeJson(reportFile, analysis);

  process.stdout.write(formatOutput({
    ok: true,
    reportFile,
    queryDate: analysis.queryDate,
    matchCount: analysis.matches.length,
    teams: analysis.matches.map((match) => `${match.team1?.name} vs ${match.team2?.name}`),
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
