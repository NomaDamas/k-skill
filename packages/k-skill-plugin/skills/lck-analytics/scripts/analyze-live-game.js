#!/usr/bin/env node
const fs = require("node:fs");
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
  const gameId = args.game;
  if (!gameId) {
    throw new Error("--game <gameId> is required");
  }

  const cacheDir = path.resolve(args.cache || path.join(process.cwd(), ".openclaw-lck-cache"));
  const paths = resolveCachePaths(cacheDir);
  const historicalWrapper = readJson(paths.historical, { data: {} });
  const pkg = await loadLckResults();

  const liveWindowPayload = args.window ? JSON.parse(fs.readFileSync(path.resolve(args.window), "utf8")) : undefined;
  const liveDetailsPayload = args.details ? JSON.parse(fs.readFileSync(path.resolve(args.details), "utf8")) : undefined;

  const analysis = await pkg.getGameAnalysis(gameId, {
    matchId: args.match,
    number: args.number ? Number(args.number) : null,
    state: args.state || undefined,
    historicalDataset: historicalWrapper.data,
    liveWindowPayload,
    liveDetailsPayload,
  });

  const reportFile = path.join(paths.reports, `game-${gameId}.json`);
  writeJson(reportFile, analysis);

  process.stdout.write(formatOutput({
    ok: true,
    reportFile,
    patch: analysis.patch,
    turningPoints: analysis.turningPoints,
    draftEdge: analysis.draft?.overallEdge || null,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
