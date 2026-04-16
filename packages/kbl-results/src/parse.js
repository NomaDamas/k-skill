const KNOWN_TEAMS = [
  { code: "50", name: "창원 LG", fullName: "창원 LG 세이커스", logoClass: "lg", aliases: ["LG", "세이커스"] },
  { code: "70", name: "안양 정관장", fullName: "안양 정관장 레드부스터스", logoClass: "kgc", aliases: ["정관장", "KGC", "레드부스터스"] },
  { code: "16", name: "원주 DB", fullName: "원주 DB 프로미", logoClass: "db", aliases: ["DB", "프로미"] },
  { code: "55", name: "서울 SK", fullName: "서울 SK 나이츠", logoClass: "sk", aliases: ["SK", "나이츠"] },
  { code: "66", name: "고양 소노", fullName: "고양 소노 스카이거너스", logoClass: "sono", aliases: ["소노", "스카이거너스", "SONO"] },
  { code: "60", name: "부산 KCC", fullName: "부산 KCC 이지스", logoClass: "kcc", aliases: ["KCC", "이지스"] },
  { code: "06", name: "수원 KT", fullName: "수원 KT 소닉붐", logoClass: "kt", aliases: ["KT", "소닉붐"] },
  { code: "10", name: "울산 현대모비스", fullName: "울산 현대모비스 피버스", logoClass: "hd", aliases: ["현대모비스", "모비스", "피버스"] },
  { code: "64", name: "대구 한국가스공사", fullName: "대구 한국가스공사 페가수스", logoClass: "pega", aliases: ["한국가스공사", "가스공사", "페가수스"] },
  { code: "35", name: "서울 삼성", fullName: "서울 삼성 썬더스", logoClass: "ss", aliases: ["삼성", "썬더스"] },
];

const STATUS_MAP = {
  live: { code: "LIVE", state: "live", label: "진행 중" },
  finished: { code: "ENDED", state: "finished", label: "종료" },
  scheduled: { code: "SCHEDULED", state: "scheduled", label: "예정" },
};

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

    return buildDateParts(parts.year, parts.month, parts.day);
  }

  const match = String(value || "").trim().match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (!match || !isValidCalendarDate(match[1], match[2], match[3])) {
    throw new Error("date must be a valid Date or YYYY-MM-DD string.");
  }

  return buildDateParts(match[1], match[2], match[3]);
}

function normalizeScheduleResponse(payload, options = {}) {
  const queryDate = options.date ? normalizeDateInput(options.date) : null;
  const seasonGrade = options.seasonGrade == null ? 1 : Number(options.seasonGrade);
  const teamDirectory = buildTeamDirectory({
    scheduleRows: payload,
    standingsRows: options.standingsRows,
  });
  const requestedTeam = options.team ? resolveTeamQuery(options.team, teamDirectory) : null;
  const rows = Array.isArray(payload) ? payload : [];

  const matches = rows
    .filter((item) => Number(item.seasonGrade || 1) === seasonGrade)
    .filter((item) => !queryDate || item.gameDate === queryDate.compactDate)
    .filter((item) => !requestedTeam || itemMatchesRequestedTeam(item, requestedTeam))
    .map((item) => normalizeScheduleItem(item, teamDirectory))
    .sort(compareMatches);

  return {
    queryDate: queryDate?.isoDate ?? null,
    seasonGrade,
    filteredTeam: requestedTeam
      ? {
          input: requestedTeam.input,
          normalized: requestedTeam.fullName,
          code: requestedTeam.code,
        }
      : null,
    matches,
  };
}

function normalizeStandingsResponse(payload) {
  const teamDirectory = buildTeamDirectory({ standingsRows: payload });
  const rows = (Array.isArray(payload) ? payload : [])
    .map((item) => {
      const team = stripAliasTokens(getTeam(item.tcode, item.tname, item.tnameF, item.teamLogoClass, teamDirectory));
      const win = normalizeNumber(item.win) ?? 0;
      const loss = normalizeNumber(item.loss) ?? 0;
      const draw = normalizeNumber(item.draw) ?? 0;

      return {
        rank: normalizeNumber(item.rank),
        team,
        win,
        loss,
        draw,
        gamesBehind: normalizeNumber(item.winDiff) ?? 0,
        winningPercentage: calculateWinningPercentage(win, loss, draw),
        home: {
          win: normalizeNumber(item.hwin) ?? 0,
          loss: normalizeNumber(item.hloss) ?? 0,
        },
        away: {
          win: normalizeNumber(item.awin) ?? 0,
          loss: normalizeNumber(item.aloss) ?? 0,
        },
        streak: {
          win: normalizeNumber(item.contiWin) ?? 0,
          loss: normalizeNumber(item.contiLoss) ?? 0,
        },
        maxStreak: {
          win: normalizeNumber(item.maxWin) ?? 0,
          loss: normalizeNumber(item.maxLoss) ?? 0,
        },
        lastFive: normalizeLastRecord(item.lastRecord),
      };
    })
    .sort((left, right) => left.rank - right.rank);

  return {
    rows,
  };
}

function normalizeScheduleItem(item, teamDirectory) {
  const homeTeam = stripAliasTokens(getTeam(item.tcodeH, item.tnameH, item.tnameFH, item.logoH, teamDirectory));
  const awayTeam = stripAliasTokens(getTeam(item.tcodeA, item.tnameA, item.tnameFA, item.logoA, teamDirectory));
  const status = normalizeMatchStatus(item);
  const score = {
    home: normalizeNumber(item.scoreH),
    away: normalizeNumber(item.scoreA),
  };

  return {
    gameKey: item.gmkey || null,
    gameNumber: normalizeNumber(item.gameNo),
    gameCode: item.gameCode || null,
    seasonCode: normalizeNumber(item.seasonCode),
    seasonGrade: normalizeNumber(item.seasonGrade),
    competitionName: item.seasonName1 || null,
    seasonCategory: {
      code: item.seasonCategory || null,
      label: item.seasonCategoryName || null,
    },
    date: compactDateToIso(item.gameDate),
    dateLabel: item.gameDate || null,
    weekDay: item.weekDay || null,
    startTime: compactTimeToClock(item.gameStart),
    endTime: compactTimeToClock(item.gameEnd),
    status,
    homeTeam,
    awayTeam,
    score,
    winner: determineWinner(score, status, homeTeam, awayTeam),
    venue: {
      shortName: item.stadiumname || null,
      name: item.stadiumnameF || item.stadiumname || null,
    },
    broadcastChannels: splitBroadcastChannels(item.tv),
  };
}

function buildTeamDirectory({ scheduleRows = [], standingsRows = [] } = {}) {
  const directory = new Map();

  for (const team of KNOWN_TEAMS) {
    upsertTeam(directory, team.code, team.name, team.fullName, team.logoClass, team.aliases);
  }

  for (const item of scheduleRows || []) {
    upsertTeam(directory, item.tcodeH, item.tnameH, item.tnameFH, item.logoH);
    upsertTeam(directory, item.tcodeA, item.tnameA, item.tnameFA, item.logoA);
  }

  for (const item of standingsRows || []) {
    upsertTeam(directory, item.tcode, item.tname, item.tnameF, item.teamLogoClass);
  }

  return directory;
}

function upsertTeam(directory, code, name, fullName, logoClass, aliases = []) {
  if (!code) {
    return;
  }

  const existing = directory.get(code) || {
    code,
    name: name || code,
    fullName: fullName || name || code,
    logoClass: logoClass || null,
    aliasTokens: new Set(),
  };

  if (name) {
    existing.name = name;
  }
  if (fullName) {
    existing.fullName = fullName;
  }
  if (logoClass) {
    existing.logoClass = logoClass;
  }

  const values = [
    code,
    name,
    fullName,
    logoClass,
    ...aliases,
    removeCityPrefix(name),
    removeCityPrefix(fullName),
    extractEnglishFragment(name),
    extractEnglishFragment(fullName),
  ].filter(Boolean);

  for (const value of values) {
    existing.aliasTokens.add(normalizeToken(value));
  }

  directory.set(code, existing);
}

function resolveTeamQuery(query, teamDirectory) {
  const input = String(query || "").trim();
  const token = normalizeToken(input);
  const exact = [];
  const fuzzy = [];

  for (const team of teamDirectory.values()) {
    if (team.aliasTokens.has(token)) {
      exact.push(team);
      continue;
    }

    for (const alias of team.aliasTokens) {
      if (alias.includes(token) || token.includes(alias)) {
        fuzzy.push(team);
        break;
      }
    }
  }

  const matches = exact.length ? exact : fuzzy;
  if (matches.length === 1) {
    return {
      ...matches[0],
      input,
    };
  }

  return {
    code: null,
    name: input,
    fullName: input,
    input,
    token,
  };
}

function itemMatchesRequestedTeam(item, requestedTeam) {
  if (requestedTeam.code) {
    return item.tcodeH === requestedTeam.code || item.tcodeA === requestedTeam.code;
  }

  return [
    normalizeToken(item.tnameH),
    normalizeToken(item.tnameFH),
    normalizeToken(item.tnameA),
    normalizeToken(item.tnameFA),
  ].some((token) => token && (token.includes(requestedTeam.token) || requestedTeam.token.includes(token)));
}

function normalizeMatchStatus(item) {
  if (Number(item.isEnded) === 1) {
    return {
      ...STATUS_MAP.finished,
      finished: true,
    };
  }

  if (Number(item.isStarted) === 1) {
    return {
      ...STATUS_MAP.live,
      finished: false,
      quarter: item.playingQuarter || null,
    };
  }

  return {
    ...STATUS_MAP.scheduled,
    finished: false,
  };
}

function determineWinner(score, status, homeTeam, awayTeam) {
  if (!status.finished) {
    return null;
  }
  if (score.home === score.away) {
    return null;
  }

  return {
    team: score.home > score.away ? homeTeam : awayTeam,
  };
}

function getTeam(code, name, fullName, logoClass, teamDirectory) {
  const team = teamDirectory.get(String(code)) || {};
  return {
    code: String(code),
    name: name || team.name || String(code),
    fullName: fullName || team.fullName || name || String(code),
    logoClass: logoClass || team.logoClass || null,
    aliasTokens: team.aliasTokens || new Set(),
  };
}

function stripAliasTokens(team) {
  const { aliasTokens, ...rest } = team;
  return rest;
}

function normalizeToken(value) {
  return String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^0-9A-Z가-힣]+/g, "");
}

function buildDateParts(year, month, day) {
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return {
    isoDate: `${year}-${paddedMonth}-${paddedDay}`,
    compactDate: `${year}${paddedMonth}${paddedDay}`,
    year: String(year),
    month: paddedMonth,
    day: paddedDay,
  };
}

function isValidCalendarDate(year, month, day) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || !Number.isInteger(numericDay)) {
    return false;
  }

  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1) {
    return false;
  }

  const maxDay = [31, isLeapYear(numericYear) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][numericMonth - 1];
  return numericDay <= maxDay;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function compactDateToIso(value) {
  const input = String(value || "");
  if (!/^\d{8}$/.test(input)) {
    return null;
  }

  return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
}

function compactTimeToClock(value) {
  const input = String(value || "");
  if (!/^\d{4}$/.test(input)) {
    return null;
  }

  return `${input.slice(0, 2)}:${input.slice(2, 4)}`;
}

function splitBroadcastChannels(value) {
  return String(value || "")
    .split("/")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function compareMatches(left, right) {
  const leftSortKey = `${left.date || ""}${(left.startTime || "").replace(":", "")}${String(left.gameNumber || "").padStart(4, "0")}`;
  const rightSortKey = `${right.date || ""}${(right.startTime || "").replace(":", "")}${String(right.gameNumber || "").padStart(4, "0")}`;
  return leftSortKey.localeCompare(rightSortKey);
}

function removeCityPrefix(value) {
  const parts = String(value || "").trim().split(/\s+/);
  return parts.length >= 2 ? parts.slice(1).join(" ") : value;
}

function extractEnglishFragment(value) {
  const matches = String(value || "").match(/[A-Za-z]{2,}/g);
  return matches ? matches.join(" ") : null;
}

function calculateWinningPercentage(win, loss, draw) {
  const total = win + loss + draw;
  if (!total) {
    return 0;
  }

  return Number((win / total).toFixed(3));
}

function normalizeLastRecord(value) {
  return Array.isArray(value)
    ? value.slice(0, 5).map((entry) => (Number(entry) === 1 ? "W" : "L"))
    : [];
}

module.exports = {
  buildTeamDirectory,
  normalizeDateInput,
  normalizeScheduleResponse,
  normalizeStandingsResponse,
  normalizeToken,
  resolveTeamQuery,
};
