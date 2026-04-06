const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildHistoricalAnalytics,
  getGameAnalysis,
  getLckSummary,
  getMatchAnalysis,
  getMatchResults,
  getStandings,
  parseOracleCsv,
} = require("../src/index");
const {
  normalizeScheduleResponse,
  normalizeStandingsResponse,
} = require("../src/parse");

const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const schedulePayload = readFixture("schedule-2026-04-01.json");
const tournamentsPayload = readFixture("tournaments-2026.json");
const standingsPayload = readFixture("standings-2026.json");
const eventDetailsPayload = readFixture("event-details-2026-04-01.json");
const liveWindowPayload = readFixture("live-window-game-1.json");
const liveDetailsPayload = readFixture("live-details-game-1.json");
const oracleCsv = fs.readFileSync(path.join(fixturesDir, "oracle-sample.csv"), "utf8");

test("normalizeScheduleResponse filters requested LCK date and Korean team aliases", () => {
  const result = normalizeScheduleResponse(schedulePayload, {
    date: "2026-04-01",
    team: "한화",
  });

  assert.equal(result.queryDate, "2026-04-01");
  assert.equal(result.matches.length, 1);
  assert.equal(result.filteredTeam.canonicalId, "hle");
  assert.equal(result.matches[0].team1.currentName, "Hanwha Life Esports");
  assert.equal(result.matches[0].team2.currentName, "T1");
  assert.deepEqual(result.matches[0].score, { team1: 1, team2: 0 });
});

test("normalizeStandingsResponse keeps the LCK standings shape and alias resolution", () => {
  const table = normalizeStandingsResponse(standingsPayload, {
    tournament: {
      id: "tournament-2026",
      slug: "lck-2026-spring",
      name: "LCK 2026 Spring",
    },
    team: "T1",
  });

  assert.equal(table.tournamentId, "tournament-2026");
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].team.canonicalId, "t1");
  assert.equal(table.rows[0].wins, 4);
  assert.equal(table.rows[0].losses, 2);
});

test("public fetchers compose summary, standings, live details, and match analysis", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({
      target,
      headers: options.headers || {},
    });

    if (target.includes("getSchedule")) {
      return makeResponse(schedulePayload);
    }

    if (target.includes("getTournamentsForLeague")) {
      return makeResponse(tournamentsPayload);
    }

    if (target.includes("getStandings")) {
      return makeResponse(standingsPayload);
    }

    if (target.includes("getEventDetails")) {
      return makeResponse(eventDetailsPayload);
    }

    if (target.includes("/window/game-1")) {
      return makeResponse(liveWindowPayload);
    }

    if (target.includes("/details/game-1")) {
      return makeResponse(liveDetailsPayload);
    }

    throw new Error(`unexpected url: ${target}`);
  };

  try {
    const results = await getMatchResults("2026-04-01", { team: "한화" });
    const standings = await getStandings({ date: "2026-04-01", team: "T1" });
    const summary = await getLckSummary("2026-04-01", {
      team: "한화",
      includeStandings: true,
    });
    const analysis = await getMatchAnalysis("2026-04-01", {
      team: "한화",
      historicalDataset: buildHistoricalAnalytics(oracleCsv),
    });

    assert.equal(results.matches.length, 1);
    assert.equal(results.matches[0].games[0].teams[0].team.currentName, "Hanwha Life Esports");
    assert.equal(results.matches[0].live.killDiff, 5);
    assert.equal(standings.rows[0].team.currentName, "T1");
    assert.equal(summary.standings.rows[0].team.currentName, "Hanwha Life Esports");
    assert.equal(analysis.matches[0].analyses[0].draft.overallEdge, "blue");
    assert.equal(analysis.matches[0].powerPreview.teamA.teamId, "hle");
    assert.ok(
      calls.some((call) => call.headers["x-api-key"]),
      "expected Riot API requests to include an x-api-key header",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("historical analytics parse Oracle-style CSV and power rankings", () => {
  const parsedRows = parseOracleCsv(oracleCsv);
  const historical = buildHistoricalAnalytics(parsedRows);

  assert.equal(parsedRows.length, 4);
  assert.equal(historical.rows.length, 4);
  assert.equal(historical.teamPowerRatings[0].teamId, "hle");
  assert.equal(historical.teamPowerRatings[0].wins, 2);
  assert.equal(historical.patchMeta[0].patch, "16.6.753.8272");
  assert.equal(historical.matchupStats[0].champion, "Aatrox");
});

test("getGameAnalysis computes turning points and draft context from injected live payloads", async () => {
  const historical = buildHistoricalAnalytics(oracleCsv);
  const analysis = await getGameAnalysis("game-1", {
    matchId: "match-1",
    number: 1,
    state: "inProgress",
    historicalDataset: historical,
    liveWindowPayload,
    liveDetailsPayload,
  });

  assert.equal(analysis.gameId, "game-1");
  assert.equal(analysis.patch, "16.6.753.8272");
  assert.equal(analysis.current.goldDiff, 3600);
  assert.ok(analysis.turningPoints.length >= 1);
  assert.equal(analysis.turningPoints[0].favoredSide, "blue");
  assert.equal(analysis.draft.roleMatchups[0].role, "top");
  assert.equal(analysis.meta.topPicks[0].champion, "Aatrox");
});

function makeResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
