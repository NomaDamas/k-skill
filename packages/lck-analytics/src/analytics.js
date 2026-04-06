const { normalizeLiveGameResponse } = require("./parse");

function normalizeLiveTimeline(windowPayload, detailsPayload, options = {}) {
  const windowFrames = Array.isArray(windowPayload?.frames) ? windowPayload.frames : [];
  const detailsFrames = Array.isArray(detailsPayload?.frames) ? detailsPayload.frames : [];
  const detailsByTimestamp = new Map(detailsFrames.map((frame) => [frame.rfc460Timestamp, frame]));
  const firstTimestamp = windowFrames[0]?.rfc460Timestamp || detailsFrames[0]?.rfc460Timestamp || null;

  return windowFrames
    .map((windowFrame) => normalizeTimelineFrame(windowPayload, windowFrame, detailsByTimestamp.get(windowFrame.rfc460Timestamp), {
      ...options,
      firstTimestamp,
    }))
    .filter(Boolean);
}

function normalizeTimelineFrame(windowPayload, windowFrame, detailsFrame, options = {}) {
  const live = normalizeLiveGameResponse({
    esportsGameId: windowPayload?.esportsGameId,
    esportsMatchId: windowPayload?.esportsMatchId,
    gameMetadata: windowPayload?.gameMetadata,
    frames: [windowFrame],
  }, {
    frames: detailsFrame ? [detailsFrame] : [],
  }, options);

  if (!live) {
    return null;
  }

  return {
    timestamp: windowFrame.rfc460Timestamp,
    gameState: windowFrame.gameState || null,
    durationSeconds: options.firstTimestamp
      ? Math.max(0, Math.round((new Date(windowFrame.rfc460Timestamp) - new Date(options.firstTimestamp)) / 1000))
      : live.durationSeconds,
    blueTeam: live.blueTeam,
    redTeam: live.redTeam,
    goldDiff: live.goldDiff,
    killDiff: live.killDiff,
    objectiveScore: computeObjectiveScore(live.blueTeam) - computeObjectiveScore(live.redTeam),
  };
}

function analyzeTurningPoints(timeline, options = {}) {
  const thresholdGoldSwing = options.thresholdGoldSwing || 1800;
  const thresholdObjectiveSwing = options.thresholdObjectiveSwing || 2;
  const candidates = [];

  for (let index = 1; index < timeline.length; index += 1) {
    const previous = timeline[index - 1];
    const current = timeline[index];
    const goldSwing = Math.abs((current.goldDiff ?? 0) - (previous.goldDiff ?? 0));
    const killSwing = Math.abs((current.killDiff ?? 0) - (previous.killDiff ?? 0));
    const objectiveSwing = Math.abs((current.objectiveScore ?? 0) - (previous.objectiveScore ?? 0));
    const leadFlip = Math.sign(current.goldDiff || 0) !== 0
      && Math.sign(previous.goldDiff || 0) !== 0
      && Math.sign(current.goldDiff || 0) !== Math.sign(previous.goldDiff || 0);

    if (!leadFlip && goldSwing < thresholdGoldSwing && objectiveSwing < thresholdObjectiveSwing && killSwing < 3) {
      continue;
    }

    const favoredSide = resolveFavoredSide(current.goldDiff);
    candidates.push({
      timestamp: current.timestamp,
      durationSeconds: current.durationSeconds,
      goldSwing,
      killSwing,
      objectiveSwing,
      favoredSide,
      swingScore: round((goldSwing / 300) + (killSwing * 3) + (objectiveSwing * 6) + (leadFlip ? 10 : 0), 2),
      reason: summarizeTurningPoint(previous, current, { goldSwing, killSwing, objectiveSwing, leadFlip, favoredSide }),
    });
  }

  return candidates.sort((left, right) => right.swingScore - left.swingScore).slice(0, options.limit || 3);
}

function summarizeTurningPoint(previous, current, context) {
  const pieces = [];
  if (context.leadFlip) {
    pieces.push("골드 리드가 뒤집혔습니다");
  }
  if (context.goldSwing >= 1800) {
    pieces.push(`골드 차이가 ${formatSigned(current.goldDiff)}로 크게 움직였습니다`);
  }
  if (context.killSwing >= 3) {
    pieces.push(`교전으로 킬 차이가 ${formatSigned(current.killDiff)}가 됐습니다`);
  }
  if (context.objectiveSwing >= 2) {
    pieces.push("주요 오브젝트 격차가 벌어졌습니다");
  }
  if (pieces.length === 0) {
    pieces.push("중요한 흐름 변화가 감지됐습니다");
  }

  const side = context.favoredSide === "blue" ? "블루" : context.favoredSide === "red" ? "레드" : null;
  return side ? `${side} 진영 기준 turning point: ${pieces.join(", ")}` : pieces.join(", ");
}

function analyzeDraft(game, historicalDataset, options = {}) {
  const patch = options.patch || game?.live?.patchVersion || null;
  const blueParticipants = game?.live?.blueTeam?.participants || [];
  const redParticipants = game?.live?.redTeam?.participants || [];
  const matchupStats = historicalDataset?.matchupStats || [];
  const synergyStats = historicalDataset?.synergyStats || [];

  const roleMatchups = blueParticipants.map((blueParticipant) => {
    const redParticipant = redParticipants.find((candidate) => candidate.role === blueParticipant.role);
    if (!redParticipant) {
      return null;
    }

    const blueEdge = findMatchup(matchupStats, patch, blueParticipant.role, blueParticipant.championId, redParticipant.championId);
    const redEdge = findMatchup(matchupStats, patch, redParticipant.role, redParticipant.championId, blueParticipant.championId);
    const favoredSide = pickFavoredSide(blueEdge, redEdge);

    return {
      role: blueParticipant.role,
      blueChampion: blueParticipant.championId,
      redChampion: redParticipant.championId,
      favoredSide,
      blueSample: blueEdge?.games || 0,
      redSample: redEdge?.games || 0,
      summary: summarizeMatchup(blueEdge, redEdge, blueParticipant, redParticipant),
    };
  }).filter(Boolean);

  const blueSynergy = scoreSynergy(blueParticipants, synergyStats, patch);
  const redSynergy = scoreSynergy(redParticipants, synergyStats, patch);

  return {
    patch,
    roleMatchups,
    blueSynergy,
    redSynergy,
    overallEdge: pickOverallDraftEdge(roleMatchups, blueSynergy, redSynergy),
  };
}

function scoreSynergy(participants, synergyStats, patch) {
  const champions = participants.map((participant) => participant.championId).filter(Boolean);
  const pairs = [];
  for (let index = 0; index < champions.length; index += 1) {
    for (let inner = index + 1; inner < champions.length; inner += 1) {
      const championA = champions[index];
      const championB = champions[inner];
      const stat = synergyStats.find((entry) => (
        (!patch || entry.patch === patch)
        && ((entry.championA === championA && entry.championB === championB)
        || (entry.championA === championB && entry.championB === championA))
      ));
      if (stat) {
        pairs.push(stat);
      }
    }
  }

  return {
    samplePairs: pairs.length,
    avgWinRate: round(average(pairs.map((entry) => entry.winRate)), 2),
    topPairs: pairs.sort((left, right) => right.games - left.games).slice(0, 3),
  };
}

function summarizeMetaForGame(game, historicalDataset, options = {}) {
  const patch = options.patch || game?.live?.patchVersion || null;
  const patchMeta = (historicalDataset?.patchMeta || []).find((entry) => !patch || entry.patch === patch) || null;
  return {
    patch,
    topPicks: patchMeta?.topPicks || [],
    risers: patchMeta?.risers || [],
  };
}

function buildGameAnalysis(game, historicalDataset, options = {}) {
  const timeline = normalizeLiveTimeline(options.liveWindowPayload, options.liveDetailsPayload, {
    gameId: game.id,
    matchId: options.matchId,
  });
  const currentLive = timeline.at(-1) ? {
    gameId: game.id,
    patchVersion: options.liveWindowPayload?.gameMetadata?.patchVersion || null,
    durationSeconds: timeline.at(-1).durationSeconds,
    blueTeam: timeline.at(-1).blueTeam,
    redTeam: timeline.at(-1).redTeam,
    goldDiff: timeline.at(-1).goldDiff,
    killDiff: timeline.at(-1).killDiff,
  } : game.live || null;
  const enrichedGame = {
    ...game,
    live: currentLive,
  };

  return {
    gameId: game.id,
    number: game.number,
    state: game.state,
    patch: currentLive?.patchVersion || null,
    current: currentLive,
    timeline,
    turningPoints: analyzeTurningPoints(timeline, options.turningPointOptions),
    draft: analyzeDraft(enrichedGame, historicalDataset, {
      patch: currentLive?.patchVersion || null,
    }),
    meta: summarizeMetaForGame(enrichedGame, historicalDataset, {
      patch: currentLive?.patchVersion || null,
    }),
  };
}

function buildTeamPreview(teamId, historicalDataset) {
  const ratings = historicalDataset?.teamPowerRatings || [];
  return ratings.find((entry) => entry.teamId === teamId) || null;
}

function compareTeams(teamAId, teamBId, historicalDataset) {
  const left = buildTeamPreview(teamAId, historicalDataset);
  const right = buildTeamPreview(teamBId, historicalDataset);
  return {
    teamA: left,
    teamB: right,
    favoredTeamId: !left || !right ? left?.teamId || right?.teamId || null : left.powerScore >= right.powerScore ? left.teamId : right.teamId,
    powerGap: left && right ? round(Math.abs(left.powerScore - right.powerScore), 2) : null,
  };
}

function getPatchMetaSummary(historicalDataset, patch) {
  return (historicalDataset?.patchMeta || []).find((entry) => entry.patch === patch) || null;
}

function findMatchup(matchupStats, patch, role, champion, opponentChampion) {
  return matchupStats.find((entry) => (
    (!patch || entry.patch === patch)
    && entry.position === role
    && entry.champion === champion
    && entry.opponentChampion === opponentChampion
  )) || null;
}

function pickFavoredSide(blueEdge, redEdge) {
  const blueScore = scoreMatchup(blueEdge);
  const redScore = scoreMatchup(redEdge);
  if (blueScore === redScore) {
    return null;
  }
  return blueScore > redScore ? "blue" : "red";
}

function scoreMatchup(edge) {
  if (!edge) {
    return 0;
  }
  return (edge.winRate || 0) + Math.min(edge.games || 0, 10);
}

function summarizeMatchup(blueEdge, redEdge, blueParticipant, redParticipant) {
  if (!blueEdge && !redEdge) {
    return `${blueParticipant.championId} vs ${redParticipant.championId} 매치업 표본이 부족합니다.`;
  }

  const favored = pickFavoredSide(blueEdge, redEdge);
  if (favored === "blue") {
    return `${blueParticipant.championId} 쪽이 유리한 매치업으로 보입니다.`;
  }
  if (favored === "red") {
    return `${redParticipant.championId} 쪽이 유리한 매치업으로 보입니다.`;
  }
  return `${blueParticipant.championId} vs ${redParticipant.championId} 매치업은 팽팽합니다.`;
}

function pickOverallDraftEdge(roleMatchups, blueSynergy, redSynergy) {
  const blueWins = roleMatchups.filter((entry) => entry.favoredSide === "blue").length;
  const redWins = roleMatchups.filter((entry) => entry.favoredSide === "red").length;
  const blueScore = blueWins + ((blueSynergy.avgWinRate || 50) / 100);
  const redScore = redWins + ((redSynergy.avgWinRate || 50) / 100);
  if (blueScore === redScore) {
    return null;
  }
  return blueScore > redScore ? "blue" : "red";
}

function computeObjectiveScore(team) {
  if (!team) {
    return 0;
  }
  return (team.towers || 0)
    + ((team.inhibitors || 0) * 1.5)
    + ((team.barons || 0) * 3)
    + ((team.dragonCount || 0) * 1.2);
}

function resolveFavoredSide(goldDiff) {
  if (!Number.isFinite(goldDiff) || goldDiff === 0) {
    return null;
  }
  return goldDiff > 0 ? "blue" : "red";
}

function formatSigned(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

module.exports = {
  analyzeDraft,
  analyzeTurningPoints,
  buildGameAnalysis,
  buildTeamPreview,
  compareTeams,
  getPatchMetaSummary,
  normalizeLiveTimeline,
};
