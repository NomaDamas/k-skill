const { STATUS_MAP } = require("./constants");
const {
  resolveTeamPayload,
  resolveTeamQuery,
  stripAliasTokens,
} = require("./teams");

function normalizeDateInput(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("date must be a valid Date or YYYY-MM-DD string.");
    }

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(value).reduce((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    };
  }

  const match = String(value || "").trim().match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (!match) {
    throw new Error("date must be a valid Date or YYYY-MM-DD string.");
  }

  const [year, month, day] = [match[1], match[2], match[3]];
  const candidate = new Date(`${year}-${month}-${day}T00:00:00+09:00`);
  if (Number.isNaN(candidate.getTime())) {
    throw new Error("date must be a valid Date or YYYY-MM-DD string.");
  }

  return {
    year,
    month,
    day,
    isoDate: `${year}-${month}-${day}`,
  };
}

function eventToKoreaDateTime(startTime) {
  const date = new Date(startTime);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    kickOff: `${parts.hour}:${parts.minute}`,
  };
}

function normalizeMatchStatus(state) {
  const mapped = STATUS_MAP[state] || {
    state: String(state || "unknown"),
    label: String(state || "알 수 없음"),
    finished: false,
  };

  return {
    code: state || "unknown",
    state: mapped.state,
    label: mapped.label,
    finished: mapped.finished,
  };
}

function normalizeScheduleResponse(payload, options = {}) {
  const schedule = payload?.data?.schedule || payload?.schedule || payload || {};
  const requestedDate = normalizeDateInput(options.date);
  const requestedTeam = options.team ? resolveTeamQuery(options.team) : null;
  const events = Array.isArray(schedule.events) ? schedule.events : [];

  const matches = events
    .filter((event) => event?.league?.slug === "lck")
    .map(normalizeEventMatch)
    .filter((match) => match.date === requestedDate.isoDate)
    .filter((match) => !requestedTeam || matchIncludesRequestedTeam(match, requestedTeam))
    .sort(compareMatches);

  return {
    queryDate: requestedDate.isoDate,
    filteredTeam: requestedTeam
      ? {
          input: requestedTeam.input,
          canonicalId: requestedTeam.canonicalId,
          normalized: requestedTeam.currentName,
        }
      : null,
    matches,
    pageInfo: {
      older: schedule.pages?.older || null,
      newer: schedule.pages?.newer || null,
    },
  };
}

function normalizeEventMatch(event) {
  const teams = Array.isArray(event?.match?.teams) ? event.match.teams.map(resolveTeamPayload) : [];
  const [team1, team2] = teams;
  const koreaTime = eventToKoreaDateTime(event.startTime);
  const status = normalizeMatchStatus(event.state || event?.match?.state);
  const score = {
    team1: normalizeNumber(team1?.result?.gameWins ?? event?.match?.teams?.[0]?.result?.gameWins),
    team2: normalizeNumber(team2?.result?.gameWins ?? event?.match?.teams?.[1]?.result?.gameWins),
  };

  return {
    matchId: event?.match?.id || event?.id || null,
    eventId: event?.id || null,
    league: event?.league?.name || "LCK",
    leagueSlug: event?.league?.slug || "lck",
    tournamentId: event?.tournament?.id || null,
    tournamentName: event?.tournament?.name || null,
    blockName: event?.blockName || null,
    date: koreaTime.date,
    kickOff: koreaTime.kickOff,
    startTime: event?.startTime || null,
    status,
    strategy: event?.match?.strategy || null,
    team1: team1 ? stripAliasTokens(team1) : null,
    team2: team2 ? stripAliasTokens(team2) : null,
    score,
    winner: determineWinner(team1, team2, score, status),
    flags: Array.isArray(event?.match?.flags) ? event.match.flags : [],
  };
}

function normalizeStandingsResponse(payload, options = {}) {
  const standings = Array.isArray(payload?.data?.standings) ? payload.data.standings : [];
  const requestedTeam = options.team ? resolveTeamQuery(options.team) : null;
  const tournament = options.tournament || null;
  const stage = standings.flatMap((entry) => entry?.stages || []).find((candidate) => Array.isArray(candidate?.sections));
  const section = stage?.sections?.find((candidate) => Array.isArray(candidate?.rankings)) || null;
  const rows = [];

  for (const ranking of section?.rankings || []) {
    for (const team of ranking.teams || []) {
      const resolved = resolveTeamPayload(team);
      const row = {
        rank: normalizeNumber(ranking.ordinal),
        team: stripAliasTokens(resolved),
        wins: normalizeNumber(team?.record?.wins) ?? 0,
        losses: normalizeNumber(team?.record?.losses) ?? 0,
      };

      if (!requestedTeam || teamMatchesRequestedTeam(resolved, requestedTeam)) {
        rows.push(row);
      }
    }
  }

  rows.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.team.name.localeCompare(right.team.name, "en");
  });

  return {
    tournamentId: tournament?.id || null,
    tournamentName: tournament?.slug || tournament?.name || null,
    stage: stage
      ? {
          id: stage.id,
          name: stage.name,
          slug: stage.slug,
        }
      : null,
    sectionName: section?.name || null,
    filteredTeam: requestedTeam
      ? {
          input: requestedTeam.input,
          canonicalId: requestedTeam.canonicalId,
          normalized: requestedTeam.currentName,
        }
      : null,
    rows,
  };
}

function normalizeTournamentList(payload) {
  const tournaments = payload?.data?.leagues?.flatMap((league) => league?.tournaments || []) || [];

  return tournaments
    .map((tournament) => ({
      id: tournament.id,
      slug: tournament.slug,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function normalizeEventDetailsResponse(payload) {
  const event = payload?.data?.event || payload?.event || {};
  const matchTeams = Array.isArray(event?.match?.teams) ? event.match.teams.map(resolveTeamPayload) : [];
  const byId = new Map(matchTeams.map((team) => [String(team.id), team]));

  return {
    eventId: event?.id || null,
    streams: Array.isArray(event?.streams) ? event.streams : [],
    games: (event?.match?.games || []).map((game) => ({
      id: game?.id || null,
      number: normalizeNumber(game?.number),
      state: game?.state || null,
      teams: (game?.teams || []).map((team) => {
        const resolved = byId.get(String(team?.id)) || resolveTeamPayload(team);
        return {
          side: team?.side || null,
          team: stripAliasTokens(resolved),
        };
      }),
    })),
  };
}

function normalizeLiveGameResponse(windowPayload, detailsPayload, options = {}) {
  const gameMetadata = windowPayload?.gameMetadata || {};
  const windowFrames = Array.isArray(windowPayload?.frames) ? windowPayload.frames : [];
  const detailsFrames = Array.isArray(detailsPayload?.frames) ? detailsPayload.frames : [];
  const latestWindow = windowFrames.at(-1) || null;
  const latestDetails = detailsFrames.at(-1) || null;

  if (!latestWindow && !latestDetails) {
    return null;
  }

  const participantDirectory = buildParticipantDirectory(gameMetadata, latestWindow, latestDetails);
  const blue = normalizeLiveSide("blue", latestWindow?.blueTeam, participantDirectory);
  const red = normalizeLiveSide("red", latestWindow?.redTeam, participantDirectory);
  const firstTimestamp = windowFrames[0]?.rfc460Timestamp || detailsFrames[0]?.rfc460Timestamp || null;
  const lastTimestamp = latestWindow?.rfc460Timestamp || latestDetails?.rfc460Timestamp || null;
  const normalized = {
    gameId: options.gameId || windowPayload?.esportsGameId || null,
    matchId: windowPayload?.esportsMatchId || options.matchId || null,
    patchVersion: gameMetadata.patchVersion || null,
    gameState: latestWindow?.gameState || null,
    updatedAt: lastTimestamp,
    durationSeconds: firstTimestamp && lastTimestamp
      ? Math.max(0, Math.round((new Date(lastTimestamp) - new Date(firstTimestamp)) / 1000))
      : null,
    blueTeam: blue,
    redTeam: red,
    goldDiff: blue.totalGold !== null && red.totalGold !== null ? blue.totalGold - red.totalGold : null,
    killDiff: blue.totalKills !== null && red.totalKills !== null ? blue.totalKills - red.totalKills : null,
  };

  return hasMeaningfulLiveStats(normalized) ? normalized : null;
}

function hasMeaningfulLiveStats(live) {
  if (!live) {
    return false;
  }

  if (live.gameState && live.gameState !== "in_game") {
    return true;
  }

  const teamSignals = [live.blueTeam, live.redTeam].some((team) => {
    if (!team) {
      return false;
    }

    return (team.totalGold ?? 0) > 0
      || (team.totalKills ?? 0) > 0
      || (team.towers ?? 0) > 0
      || (team.barons ?? 0) > 0
      || (team.dragonCount ?? 0) > 0
      || team.participants.some((participant) =>
        (participant.level ?? 0) > 1
        || (participant.creepScore ?? 0) > 0
        || (participant.totalGold ?? 0) > 0
        || (participant.kills ?? 0) > 0
        || (participant.deaths ?? 0) > 0
        || (participant.assists ?? 0) > 0
        || participant.items.length > 0,
      );
  });

  return teamSignals;
}

function buildParticipantDirectory(gameMetadata, latestWindow, latestDetails) {
  const directory = new Map();
  const sideMaps = [
    ["blue", gameMetadata?.blueTeamMetadata?.participantMetadata || [], latestWindow?.blueTeam?.participants || []],
    ["red", gameMetadata?.redTeamMetadata?.participantMetadata || [], latestWindow?.redTeam?.participants || []],
  ];
  const detailParticipants = new Map((latestDetails?.participants || []).map((participant) => [participant.participantId, participant]));

  for (const [side, metadataRows, windowRows] of sideMaps) {
    const windowParticipants = new Map(windowRows.map((participant) => [participant.participantId, participant]));

    for (const metadata of metadataRows) {
      directory.set(metadata.participantId, {
        side,
        participantId: metadata.participantId,
        esportsPlayerId: metadata.esportsPlayerId || null,
        summonerName: metadata.summonerName || null,
        championId: metadata.championId || null,
        role: metadata.role || null,
        window: windowParticipants.get(metadata.participantId) || null,
        details: detailParticipants.get(metadata.participantId) || null,
      });
    }
  }

  return directory;
}

function normalizeLiveSide(side, teamSnapshot, participantDirectory) {
  const participants = [...participantDirectory.values()]
    .filter((participant) => participant.side === side)
    .sort((left, right) => left.participantId - right.participantId)
    .map((participant) => ({
      participantId: participant.participantId,
      esportsPlayerId: participant.esportsPlayerId,
      summonerName: participant.summonerName,
      championId: participant.championId,
      role: participant.role,
      level: normalizeNumber(participant.window?.level ?? participant.details?.level),
      kills: normalizeNumber(participant.window?.kills ?? participant.details?.kills),
      deaths: normalizeNumber(participant.window?.deaths ?? participant.details?.deaths),
      assists: normalizeNumber(participant.window?.assists ?? participant.details?.assists),
      creepScore: normalizeNumber(participant.window?.creepScore ?? participant.details?.creepScore),
      totalGold: normalizeNumber(participant.window?.totalGold ?? participant.details?.totalGoldEarned),
      items: Array.isArray(participant.details?.items) ? participant.details.items : [],
    }));

  return {
    side,
    totalGold: normalizeNumber(teamSnapshot?.totalGold),
    totalKills: normalizeNumber(teamSnapshot?.totalKills),
    towers: normalizeNumber(teamSnapshot?.towers),
    inhibitors: normalizeNumber(teamSnapshot?.inhibitors),
    barons: normalizeNumber(teamSnapshot?.barons),
    dragons: Array.isArray(teamSnapshot?.dragons) ? teamSnapshot.dragons : [],
    dragonCount: Array.isArray(teamSnapshot?.dragons) ? teamSnapshot.dragons.length : 0,
    participants,
  };
}

function resolveTournamentForDate(tournaments, date) {
  const requestedDate = normalizeDateInput(date).isoDate;
  const direct = tournaments.find((tournament) => tournament.startDate <= requestedDate && requestedDate <= tournament.endDate);
  if (direct) {
    return direct;
  }

  const older = tournaments.filter((tournament) => tournament.startDate <= requestedDate);
  return older.at(-1) || tournaments[0] || null;
}

function matchIncludesRequestedTeam(match, requestedTeam) {
  return teamMatchesRequestedTeam(match.team1, requestedTeam) || teamMatchesRequestedTeam(match.team2, requestedTeam);
}

function teamMatchesRequestedTeam(team, requestedTeam) {
  if (!team) {
    return false;
  }

  const resolved = resolveTeamPayload(team);
  if (requestedTeam.canonicalId && resolved.canonicalId) {
    return requestedTeam.canonicalId === resolved.canonicalId;
  }

  return resolved.aliasTokens.has(requestedTeam.token);
}

function determineWinner(team1, team2, score, status) {
  if (!status.finished || score.team1 === null || score.team2 === null) {
    return null;
  }

  if (score.team1 === score.team2) {
    return "draw";
  }

  return score.team1 > score.team2 ? team1?.canonicalId || team1?.code || "team1" : team2?.canonicalId || team2?.code || "team2";
}

function compareMatches(left, right) {
  const leftKey = `${left.date}T${left.kickOff}`;
  const rightKey = `${right.date}T${right.kickOff}`;

  if (leftKey !== rightKey) {
    return leftKey.localeCompare(rightKey);
  }

  return String(left.matchId || "").localeCompare(String(right.matchId || ""));
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

module.exports = {
  buildParticipantDirectory,
  compareMatches,
  eventToKoreaDateTime,
  normalizeDateInput,
  hasMeaningfulLiveStats,
  normalizeEventDetailsResponse,
  normalizeEventMatch,
  normalizeLiveGameResponse,
  normalizeLiveSide,
  normalizeMatchStatus,
  normalizeScheduleResponse,
  normalizeStandingsResponse,
  normalizeTournamentList,
  resolveTournamentForDate,
};
