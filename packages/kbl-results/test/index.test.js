const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getKBLSummary,
  getMatchResults,
  getStandings,
} = require("../src/index");
const {
  normalizeDateInput,
  normalizeScheduleResponse,
  normalizeStandingsResponse,
} = require("../src/parse");

const fixturesDir = path.join(__dirname, "fixtures");
const schedulePayload = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "schedule-kbl-2026-04.json"), "utf8"),
);
const standingsPayload = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "standings-kbl-2026.json"), "utf8"),
);

test("normalizeDateInput accepts YYYY-MM-DD and Date inputs", () => {
  assert.equal(normalizeDateInput("2026-04-01").isoDate, "2026-04-01");
  assert.equal(
    normalizeDateInput(new Date("2026-04-01T03:00:00Z")).isoDate,
    "2026-04-01",
  );
  assert.throws(() => normalizeDateInput("2026-13-40"), /date must be a valid Date or YYYY-MM-DD string\./);
});

test("normalizeScheduleResponse filters official KBL schedule data by date and team alias", () => {
  const result = normalizeScheduleResponse(schedulePayload, {
    date: "2026-04-01",
    team: "KCC",
  });

  assert.equal(result.queryDate, "2026-04-01");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].competitionName, "2025-2026");
  assert.equal(result.matches[0].seasonCategory.code, "R");
  assert.equal(result.matches[0].status.code, "ENDED");
  assert.equal(result.matches[0].status.label, "종료");
  assert.equal(result.matches[0].homeTeam.code, "60");
  assert.equal(result.matches[0].homeTeam.name, "부산 KCC");
  assert.equal(result.matches[0].homeTeam.fullName, "부산 KCC 이지스");
  assert.equal(result.matches[0].awayTeam.code, "55");
  assert.deepEqual(result.matches[0].score, { home: 81, away: 79 });
  assert.equal(result.matches[0].winner.team.code, "60");
  assert.equal(result.matches[0].venue.name, "부산사직체육관");
  assert.deepEqual(result.matches[0].broadcastChannels, ["tvN SPORTS"]);
  assert.equal(result.filteredTeam.code, "60");
  assert.equal(result.filteredTeam.normalized, "부산 KCC 이지스");
});

test("normalizeStandingsResponse keeps the official KBL team table shape", () => {
  const standings = normalizeStandingsResponse(standingsPayload);
  const sk = standings.rows.find((row) => row.team.code === "55");

  assert.equal(standings.rows.length, 10);
  assert.equal(standings.rows[0].team.code, "50");
  assert.equal(sk.rank, 4);
  assert.equal(sk.team.name, "서울 SK");
  assert.equal(sk.team.fullName, "서울 SK 나이츠");
  assert.equal(sk.win, 32);
  assert.equal(sk.loss, 22);
  assert.equal(sk.gamesBehind, 4);
  assert.deepEqual(sk.lastFive, ["L", "L", "W", "L", "L"]);
});

test("public fetchers compose day results with current standings via mocked fetch", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({
      target,
      method: options.method || "GET",
      headers: options.headers || {},
    });

    if (target.includes("/match/list?")) {
      return makeResponse(schedulePayload);
    }

    if (target.endsWith("/league/rank/team")) {
      return makeResponse(standingsPayload);
    }

    throw new Error(`unexpected url: ${target}`);
  };

  try {
    const matches = await getMatchResults("2026-04-01", { team: "서울 SK" });
    assert.equal(matches.matches.length, 1);
    assert.equal(matches.matches[0].awayTeam.fullName, "서울 SK 나이츠");

    const standings = await getStandings();
    assert.equal(standings.rows[0].team.fullName, "창원 LG 세이커스");

    const summary = await getKBLSummary("2026-04-01", {
      team: "KCC",
      includeStandings: true,
    });

    assert.equal(summary.matches.length, 1);
    assert.equal(summary.standings.rows[0].rank, 1);
    assert.equal(summary.standings.rows[0].team.fullName, "창원 LG 세이커스");
    assert.ok(
      calls.some((call) => call.target.includes("fromDate=20260401")),
      "expected official date params in the live schedule request",
    );
    assert.ok(
      calls.every((call) => call.headers["accept-language"]?.includes("ko-KR")),
      "expected live requests to pin Korean-language payloads",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("getKBLSummary skips the standings endpoint when includeStandings is false", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const target = String(url);
    calls.push(target);

    if (target.includes("/match/list?")) {
      return makeResponse(schedulePayload);
    }

    throw new Error(`unexpected url: ${target}`);
  };

  try {
    const summary = await getKBLSummary("2026-04-01", {
      team: "KCC",
      includeStandings: false,
    });

    assert.equal(summary.matches.length, 1);
    assert.equal(summary.standings, undefined);
    assert.deepEqual(
      calls.filter((target) => target.includes("/league/rank/team")),
      [],
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("getMatchResults rejects impossible calendar dates before fetching", async () => {
  let fetchCalled = false;

  await assert.rejects(
    () =>
      getMatchResults("2026-13-40", {
        fetchImpl: async () => {
          fetchCalled = true;
          return makeResponse(schedulePayload);
        },
      }),
    /date must be a valid Date or YYYY-MM-DD string\./,
  );

  assert.equal(fetchCalled, false);
});

function makeResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
