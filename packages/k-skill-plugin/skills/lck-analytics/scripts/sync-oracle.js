#!/usr/bin/env node
const path = require("node:path");
const {
  formatOutput,
  loadLckResults,
  parseArgs,
  readText,
  resolveCachePaths,
  writeJson,
} = require("./_lib");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cacheDir = path.resolve(args.cache || path.join(process.cwd(), ".openclaw-lck-cache"));
  const csvPath = args.csv ? path.resolve(args.csv) : path.join(__dirname, "..", "samples", "oracle-lck-sample.csv");
  const league = args.league || "LCK";
  const csvText = readText(csvPath);

  if (!csvText.trim()) {
    throw new Error(`CSV not found or empty: ${csvPath}`);
  }

  const pkg = await loadLckResults();
  const historical = pkg.buildHistoricalAnalytics(csvText, { league });
  const paths = resolveCachePaths(cacheDir);

  writeJson(paths.historical, {
    source: {
      type: "oracle-style-csv",
      csvPath,
      league,
      updatedAt: new Date().toISOString(),
    },
    data: historical,
  });

  process.stdout.write(formatOutput({
    ok: true,
    cacheFile: paths.historical,
    teamRatings: historical.teamPowerRatings.length,
    matchupStats: historical.matchupStats.length,
    synergyStats: historical.synergyStats.length,
    patchMeta: historical.patchMeta.length,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
