const {
  DEFAULT_HEADERS,
  DEFAULT_LOLESPORTS_API_KEY,
  LCK_LEAGUE_ID,
  LIVE_STATS_BASE_URL,
  LOLESPORTS_API_BASE_URL,
} = require("./constants");
const {
  normalizeDateInput,
  normalizeEventDetailsResponse,
  normalizeLiveGameResponse,
  normalizeScheduleResponse,
  normalizeStandingsResponse,
  normalizeTournamentList,
  resolveTournamentForDate,
} = require("./parse");
const {
  buildGameAnalysis,
  compareTeams,
  getPatchMetaSummary,
} = require("./analytics");
const {
  buildHistoricalDataset,
  parseOracleCsv,
} = require("./oracle");

async function requestJson(path, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const url = new URL(`${LOLESPORTS_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      ...DEFAULT_HEADERS,
      "x-api-key": options.apiKey || process.env.LOLESPORTS_API_KEY || DEFAULT_LOLESPORTS_API_KEY,
      ...(options.headers || {}),
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`LoL Esports request failed with ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchSchedulePage(options = {}) {
  return requestJson("getSchedule", {
    query: {
      hl: options.hl || "en-US",
      leagueId: options.leagueId || LCK_LEAGUE_ID,
      pageToken: options.pageToken,
    },
    fetchImpl: options.fetchImpl,
    apiKey: options.apiKey,
    signal: options.signal,
  });
}

async function fetchTournaments(options = {}) {
  return requestJson("getTournamentsForLeague", {
    query: {
      hl: options.hl || "en-US",
      leagueId: options.leagueId || LCK_LEAGUE_ID,
    },
    fetchImpl: options.fetchImpl,
    apiKey: options.apiKey,
    signal: options.signal,
  });
}

async function fetchStandings(options = {}) {
  return requestJson("getStandings", {
    query: {
      hl: options.hl || "en-US",
      tournamentId: options.tournamentId,
    },
    fetchImpl: options.fetchImpl,
    apiKey: options.apiKey,
    signal: options.signal,
  });
}

async function fetchEventDetails(options = {}) {
  return requestJson("getEventDetails", {
    query: {
      hl: options.hl || "en-US",
      id: options.eventId,
    },
    fetchImpl: options.fetchImpl,
    apiKey: options.apiKey,
    signal: options.signal,
  });
}

async function requestLiveJson(kind, gameId, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const url = new URL(`${LIVE_STATS_BASE_URL}/${kind}/${gameId}`);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "k-skill/lck-analytics",
      ...(options.headers || {}),
    },
    signal: options.signal,
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`LoL Esports live stats request failed with ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchLiveWindow(options = {}) {
  return requestLiveJson("window", options.gameId, options);
}

async function fetchLiveDetails(options = {}) {
  return requestLiveJson("details", options.gameId, options);
}

async function getMatchResults(date, options = {}) {
  const requestedDate = normalizeDateInput(date).isoDate;
  const pages = [];
  let payload = options.schedulePayload || await fetchSchedulePage(options);
  pages.push(payload);

  const maxPages = Number(options.maxPages || 6);
  let direction = resolveSearchDirection(payload, requestedDate);
  let pageCount = 1;

  while (direction && pageCount < maxPages) {
    const pageToken = payload?.data?.schedule?.pages?.[direction];
    if (!pageToken) {
      break;
    }

    payload = await fetchSchedulePage({
      ...options,
      pageToken,
    });
    pages.push(payload);
    pageCount += 1;
    direction = resolveSearchDirection(payload, requestedDate);
  }

  const mergedPayload = mergeSchedulePages(pages);
  const result = normalizeScheduleResponse(mergedPayload, {
    date: requestedDate,
    team: options.team,
  });

  const matches = options.includeLiveDetails === false
    ? result.matches
    : await enrichMatchesWithLiveDetails(result.matches, options);

  return {
    ...result,
    matches,
    pagesExamined: pages.length,
  };
}

async function getStandings(options = {}) {
  const tournamentsPayload = options.tournamentsPayload || await fetchTournaments(options);
  const tournaments = normalizeTournamentList(tournamentsPayload);
  const tournament = options.tournamentId
    ? tournaments.find((candidate) => candidate.id === String(options.tournamentId)) || { id: String(options.tournamentId) }
    : resolveTournamentForDate(tournaments, options.date || new Date());

  if (!tournament?.id) {
    return {
      tournamentId: null,
      tournamentName: null,
      stage: null,
      sectionName: null,
      filteredTeam: options.team ? { input: options.team, canonicalId: null, normalized: options.team } : null,
      rows: [],
    };
  }

  const standingsPayload = options.standingsPayload || await fetchStandings({
    ...options,
    tournamentId: tournament.id,
  });

  return normalizeStandingsResponse(standingsPayload, {
    tournament,
    team: options.team,
  });
}

async function enrichMatchesWithLiveDetails(matches, options = {}) {
  return Promise.all(matches.map(async (match) => {
    const eventDetailsPayload = options.eventDetailsByMatchId?.[match.eventId]
      || options.eventDetailsByMatchId?.[match.matchId]
      || await fetchEventDetails({
        ...options,
        eventId: match.eventId || match.matchId,
      });

    const eventDetails = normalizeEventDetailsResponse(eventDetailsPayload);
    const games = await Promise.all(eventDetails.games.map(async (game) => {
      if (game.state !== "inProgress") {
        return {
          ...game,
          live: null,
        };
      }

      const liveWindowPayload = options.liveWindowByGameId?.[game.id] !== undefined
        ? options.liveWindowByGameId[game.id]
        : await fetchLiveWindow({ ...options, gameId: game.id });
      const liveDetailsPayload = options.liveDetailsByGameId?.[game.id] !== undefined
        ? options.liveDetailsByGameId[game.id]
        : await fetchLiveDetails({ ...options, gameId: game.id });

      return {
        ...game,
        live: normalizeLiveGameResponse(liveWindowPayload, liveDetailsPayload, {
          gameId: game.id,
          matchId: match.matchId,
        }),
      };
    }));

    return {
      ...match,
      streams: eventDetails.streams,
      games,
      live: match.status.state === "live" ? summarizeMatchLive(games) : null,
    };
  }));
}

async function getLckSummary(date, options = {}) {
  const matches = options.matchesResponse || await getMatchResults(date, options);
  const summary = {
    queryDate: matches.queryDate,
    filteredTeam: matches.filteredTeam,
    matches: matches.matches,
  };

  if (options.includeStandings !== false) {
    summary.standings = await getStandings({
      ...options,
      date,
      team: options.team,
      tournamentsPayload: options.tournamentsPayload,
      standingsPayload: options.standingsPayload,
    });
  }

  return summary;
}

function buildHistoricalAnalytics(input, options = {}) {
  const rows = typeof input === "string" ? parseOracleCsv(input) : input;
  return buildHistoricalDataset(Array.isArray(rows) ? rows : [], options);
}

async function getGameAnalysis(gameId, options = {}) {
  const historical = options.historicalDataset
    || buildHistoricalAnalytics(options.oracleCsv || options.historicalRows || [], options);
  const liveWindowPayload = options.liveWindowPayload !== undefined
    ? options.liveWindowPayload
    : await fetchLiveWindow({ ...options, gameId });
  const liveDetailsPayload = options.liveDetailsPayload !== undefined
    ? options.liveDetailsPayload
    : await fetchLiveDetails({ ...options, gameId });

  const game = options.game || {
    id: gameId,
    number: options.number || null,
    state: options.state || (liveWindowPayload?.frames?.length ? "inProgress" : null),
    live: null,
  };

  return buildGameAnalysis(game, historical, {
    matchId: options.matchId,
    liveWindowPayload,
    liveDetailsPayload,
    turningPointOptions: options.turningPointOptions,
  });
}

async function getMatchAnalysis(date, options = {}) {
  const matchesResponse = options.matchesResponse || await getMatchResults(date, options);
  const historical = options.historicalDataset
    || buildHistoricalAnalytics(options.oracleCsv || options.historicalRows || [], options);

  const matches = await Promise.all(matchesResponse.matches.map(async (match) => {
    const baseMatch = options.includeLiveDetails === false || match.games ? match : (await enrichMatchesWithLiveDetails([match], options))[0];
    const analyses = await Promise.all((baseMatch.games || []).map(async (game) => {
      if (!game.live && options.liveWindowByGameId?.[game.id] === undefined && game.state !== "inProgress") {
        return {
          gameId: game.id,
          number: game.number,
          state: game.state,
          patch: null,
          current: null,
          timeline: [],
          turningPoints: [],
          draft: null,
          meta: null,
        };
      }

      return getGameAnalysis(game.id, {
        ...options,
        game,
        matchId: baseMatch.matchId,
        historicalDataset: historical,
        liveWindowPayload: options.liveWindowByGameId?.[game.id],
        liveDetailsPayload: options.liveDetailsByGameId?.[game.id],
      });
    }));

    return {
      ...baseMatch,
      analyses,
      powerPreview: compareTeams(baseMatch.team1?.canonicalId, baseMatch.team2?.canonicalId, historical),
    };
  }));

  return {
    queryDate: matchesResponse.queryDate,
    filteredTeam: matchesResponse.filteredTeam,
    matches,
  };
}

function getTeamPowerRatings(input, options = {}) {
  const historical = input?.teamPowerRatings ? input : buildHistoricalAnalytics(input, options);
  return historical.teamPowerRatings;
}

function getPatchMetaReport(input, patch, options = {}) {
  const historical = input?.patchMeta ? input : buildHistoricalAnalytics(input, options);
  return getPatchMetaSummary(historical, patch);
}

function mergeSchedulePages(pages) {
  const merged = [];
  const seen = new Set();

  for (const payload of pages) {
    for (const event of payload?.data?.schedule?.events || []) {
      const key = event?.match?.id || event?.id;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(event);
    }
  }

  return {
    data: {
      schedule: {
        events: merged,
        pages: pages.at(-1)?.data?.schedule?.pages || { older: null, newer: null },
      },
    },
  };
}

function summarizeMatchLive(games) {
  const currentGame = games.find((game) => game.state === "inProgress" && game.live)
    || games.find((game) => game.live);
  if (!currentGame) {
    return null;
  }

  return {
    currentGameNumber: currentGame.number,
    currentGameState: currentGame.state,
    gameId: currentGame.id,
    gameState: currentGame.live?.gameState || null,
    updatedAt: currentGame.live?.updatedAt || null,
    durationSeconds: currentGame.live?.durationSeconds ?? null,
    blueTeam: currentGame.live?.blueTeam || null,
    redTeam: currentGame.live?.redTeam || null,
    goldDiff: currentGame.live?.goldDiff ?? null,
    killDiff: currentGame.live?.killDiff ?? null,
  };
}

function resolveSearchDirection(payload, requestedDate) {
  const eventDates = (payload?.data?.schedule?.events || [])
    .map((event) => event?.startTime)
    .filter(Boolean)
    .map((startTime) => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startTime)));

  if (eventDates.length === 0) {
    return null;
  }

  const sorted = [...eventDates].sort();
  const minDate = sorted[0];
  const maxDate = sorted.at(-1);

  if (requestedDate < minDate) {
    return "older";
  }

  if (requestedDate > maxDate) {
    return "newer";
  }

  return null;
}

module.exports = {
  buildHistoricalAnalytics,
  enrichMatchesWithLiveDetails,
  fetchEventDetails,
  fetchLiveDetails,
  fetchLiveWindow,
  fetchSchedulePage,
  fetchStandings,
  fetchTournaments,
  getGameAnalysis,
  getLckSummary,
  getMatchAnalysis,
  getMatchResults,
  getPatchMetaReport,
  getStandings,
  getTeamPowerRatings,
  mergeSchedulePages,
  parseOracleCsv,
  requestJson,
  requestLiveJson,
  resolveSearchDirection,
  summarizeMatchLive,
};
