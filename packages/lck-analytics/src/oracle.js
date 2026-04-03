const { resolveTeamQuery } = require("./teams");

function parseOracleCsv(csvText) {
  const text = String(csvText || "").trim();
  if (!text) {
    return [];
  }

  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow.map((value) => String(value || "").trim());

  return bodyRows
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])] )));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeCell(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return trimmed;
}

function normalizeOracleGameRows(rows, options = {}) {
  const filteredLeague = options.league || "LCK";
  const normalized = rows
    .filter((row) => !filteredLeague || String(row.league || row.League || "").toUpperCase() === String(filteredLeague).toUpperCase())
    .map((row) => {
      const teamQuery = resolveTeamQuery(row.teamname || row.Team || row.team || row.team_name);
      const opponentQuery = resolveTeamQuery(row.opponentteam || row.opponent || row.Opponent || row.opponent_team);
      const patch = String(row.patch || row.gameversion || row.gameVersion || "");
      const champion = row.champion || row.Champion || null;
      const position = String(row.position || row.Pos || row.pos || "").toLowerCase() || null;
      const result = normalizeResult(row.result ?? row.Result);

      return {
        matchId: String(row.matchid || row.MatchId || row.match_id || row.gameid || row.GameId || `${row.date || row.Date}-${teamQuery.currentName}-${champion}`),
        date: String(row.date || row.Date || ""),
        patch,
        side: normalizeSide(row.side || row.Side),
        team: {
          input: teamQuery.input,
          canonicalId: teamQuery.canonicalId,
          name: teamQuery.currentName,
        },
        opponent: {
          input: opponentQuery.input,
          canonicalId: opponentQuery.canonicalId,
          name: opponentQuery.currentName,
        },
        playerName: row.playername || row.Player || row.player || null,
        position,
        champion,
        opponentChampion: row.opponentchampion || row.opponent_champion || row.OpponentChampion || null,
        result,
        goldDiffAt15: toNumber(row.gd15 ?? row.GD15 ?? row.goldDiffAt15),
        csDiffAt15: toNumber(row.csd15 ?? row.CSD15 ?? row.csDiffAt15),
        xpDiffAt15: toNumber(row.xpd15 ?? row.XPD15 ?? row.xpDiffAt15),
        firstBloodRate: toNumber(row.fb ?? row["FB%"] ?? row.firstBloodRate),
        dragonControlRate: toNumber(row.drg ?? row["DRG%"] ?? row.dragonControlRate),
        baronControlRate: toNumber(row.bn ?? row["BN%"] ?? row.baronControlRate),
        towerControlRate: toNumber(row.ft ?? row["FT%"] ?? row.towerControlRate),
        kills: toNumber(row.kills ?? row.K),
        deaths: toNumber(row.deaths ?? row.D),
        assists: toNumber(row.assists ?? row.A),
        gamesPlayed: toNumber(row.gamesplayed ?? row.GP) ?? 1,
        blindPick: toBooleanLike(row.blindpick ?? row["BLND%"] ?? row.blindPick),
        counterPick: toBooleanLike(row.counterpick ?? row["CTR%"] ?? row.counterPick),
      };
    })
    .filter((row) => row.team.canonicalId && row.opponent.canonicalId && row.position && row.champion);

  return normalized;
}

function buildHistoricalDataset(rows, options = {}) {
  const normalizedRows = normalizeOracleGameRows(rows, options);
  return {
    rows: normalizedRows,
    teamPowerRatings: buildTeamPowerRatings(normalizedRows),
    championStats: buildChampionPatchStats(normalizedRows),
    matchupStats: buildChampionMatchups(normalizedRows),
    synergyStats: buildChampionSynergies(normalizedRows),
    patchMeta: buildPatchMetaSummaries(normalizedRows),
  };
}

function buildTeamPowerRatings(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = row.team.canonicalId;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  return [...grouped.entries()].map(([teamId, teamRows]) => {
    const wins = teamRows.filter((row) => row.result === "win").length;
    const losses = teamRows.filter((row) => row.result === "loss").length;
    const games = teamRows.length;
    const recentRows = teamRows.slice(-5);
    const recentWins = recentRows.filter((row) => row.result === "win").length;
    const avgGold15 = average(teamRows.map((row) => row.goldDiffAt15));
    const avgDragon = average(teamRows.map((row) => row.dragonControlRate));
    const avgBaron = average(teamRows.map((row) => row.baronControlRate));
    const weightedScore = round(
      ((wins / Math.max(games, 1)) * 60)
      + (normalizeScale(avgGold15, -3000, 3000) * 20)
      + (normalizeScale(avgDragon, 0, 100) * 10)
      + (normalizeScale(avgBaron, 0, 100) * 10),
      2,
    );

    return {
      teamId,
      games,
      wins,
      losses,
      recentWins,
      recentGames: recentRows.length,
      avgGoldDiffAt15: avgGold15,
      avgDragonControlRate: avgDragon,
      avgBaronControlRate: avgBaron,
      powerScore: weightedScore,
      tier: weightedScore >= 75 ? "elite" : weightedScore >= 60 ? "strong" : weightedScore >= 45 ? "average" : "developing",
    };
  }).sort((left, right) => right.powerScore - left.powerScore);
}

function buildChampionPatchStats(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = `${row.patch}::${row.position}::${row.champion}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  return [...grouped.entries()].map(([key, championRows]) => {
    const [patch, position, champion] = key.split("::");
    return {
      patch,
      position,
      champion,
      games: championRows.length,
      wins: championRows.filter((row) => row.result === "win").length,
      winRate: round(rate(championRows.filter((row) => row.result === "win").length, championRows.length), 2),
      avgGoldDiffAt15: average(championRows.map((row) => row.goldDiffAt15)),
      avgCsDiffAt15: average(championRows.map((row) => row.csDiffAt15)),
      avgXpDiffAt15: average(championRows.map((row) => row.xpDiffAt15)),
      blindPickRate: round(rate(championRows.filter((row) => row.blindPick === true).length, championRows.length), 2),
      counterPickRate: round(rate(championRows.filter((row) => row.counterPick === true).length, championRows.length), 2),
    };
  }).sort((left, right) => {
    if (left.patch !== right.patch) {
      return left.patch.localeCompare(right.patch);
    }
    return right.games - left.games;
  });
}

function buildChampionMatchups(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!row.opponentChampion) {
      continue;
    }
    const key = `${row.patch}::${row.position}::${row.champion}::${row.opponentChampion}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  return [...grouped.entries()].map(([key, matchupRows]) => {
    const [patch, position, champion, opponentChampion] = key.split("::");
    const wins = matchupRows.filter((row) => row.result === "win").length;
    return {
      patch,
      position,
      champion,
      opponentChampion,
      games: matchupRows.length,
      wins,
      winRate: round(rate(wins, matchupRows.length), 2),
      avgGoldDiffAt15: average(matchupRows.map((row) => row.goldDiffAt15)),
      avgCsDiffAt15: average(matchupRows.map((row) => row.csDiffAt15)),
      counterPickRate: round(rate(matchupRows.filter((row) => row.counterPick === true).length, matchupRows.length), 2),
    };
  }).sort((left, right) => right.games - left.games);
}

function buildChampionSynergies(rows) {
  const games = new Map();
  for (const row of rows) {
    const key = `${row.matchId}::${row.team.canonicalId}`;
    if (!games.has(key)) {
      games.set(key, []);
    }
    games.get(key).push(row);
  }

  const synergy = new Map();
  for (const gameRows of games.values()) {
    for (let index = 0; index < gameRows.length; index += 1) {
      for (let inner = index + 1; inner < gameRows.length; inner += 1) {
        const left = gameRows[index];
        const right = gameRows[inner];
        const pair = [left.champion, right.champion].sort();
        const key = `${left.patch}::${pair[0]}::${pair[1]}`;
        if (!synergy.has(key)) {
          synergy.set(key, []);
        }
        synergy.get(key).push(left.result === "win" ? 1 : 0);
      }
    }
  }

  return [...synergy.entries()].map(([key, results]) => {
    const [patch, championA, championB] = key.split("::");
    const wins = results.reduce((sum, value) => sum + value, 0);
    return {
      patch,
      championA,
      championB,
      games: results.length,
      wins,
      winRate: round(rate(wins, results.length), 2),
    };
  }).sort((left, right) => right.games - left.games);
}

function buildPatchMetaSummaries(rows) {
  const championStats = buildChampionPatchStats(rows);
  const byPatch = new Map();

  for (const stat of championStats) {
    if (!byPatch.has(stat.patch)) {
      byPatch.set(stat.patch, []);
    }
    byPatch.get(stat.patch).push(stat);
  }

  return [...byPatch.entries()].map(([patch, stats], index, all) => {
    const sorted = [...stats].sort((left, right) => right.games - left.games);
    const topPicks = sorted.slice(0, 5).map((entry) => ({
      champion: entry.champion,
      position: entry.position,
      games: entry.games,
      winRate: entry.winRate,
    }));

    const previousPatch = all[index - 1]?.[0] || null;
    const previousStats = previousPatch ? byPatch.get(previousPatch) || [] : [];
    const risers = topPicks.map((pick) => {
      const previous = previousStats.find((entry) => entry.champion === pick.champion && entry.position === pick.position);
      return {
        ...pick,
        gameDelta: pick.games - (previous?.games || 0),
      };
    }).sort((left, right) => right.gameDelta - left.gameDelta);

    return {
      patch,
      topPicks,
      risers: risers.slice(0, 3),
    };
  }).sort((left, right) => left.patch.localeCompare(right.patch));
}

function normalizeResult(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "win", "w", "true"].includes(normalized)) {
    return "win";
  }
  if (["0", "loss", "lose", "l", "false"].includes(normalized)) {
    return "loss";
  }
  return null;
}

function normalizeSide(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["blue", "b", "100"].includes(normalized)) {
    return "blue";
  }
  if (["red", "r", "200"].includes(normalized)) {
    return "red";
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBooleanLike(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }
  if (numeric === 0) {
    return false;
  }
  if (numeric === 1) {
    return true;
  }
  return numeric >= 50;
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }
  return round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length, 2);
}

function rate(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

function normalizeScale(value, min, max) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (max <= min) {
    return 0;
  }
  const clamped = Math.min(max, Math.max(min, value));
  return (clamped - min) / (max - min);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

module.exports = {
  buildChampionMatchups,
  buildChampionPatchStats,
  buildChampionSynergies,
  buildHistoricalDataset,
  buildPatchMetaSummaries,
  buildTeamPowerRatings,
  normalizeOracleGameRows,
  parseOracleCsv,
};
