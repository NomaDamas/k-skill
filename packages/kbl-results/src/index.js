const {
  normalizeDateInput,
  normalizeScheduleResponse,
  normalizeStandingsResponse,
} = require("./parse");

const MATCH_LIST_URL = "https://api.kbl.or.kr/match/list";
const TEAM_RANK_URL = "https://api.kbl.or.kr/league/rank/team";
const DEFAULT_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "user-agent": "k-skill/kbl-results",
  "x-requested-with": "XMLHttpRequest",
  channel: "WEB",
  teamcode: "XX",
  lang: "ko",
};

async function requestJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`KBL request failed with ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchMatchList({ date, seasonGrade = 1, tcodeList = "all", fetchImpl, signal }) {
  const queryDate = normalizeDateInput(date);
  const url = new URL(MATCH_LIST_URL);
  url.searchParams.set("fromDate", queryDate.compactDate);
  url.searchParams.set("toDate", queryDate.compactDate);
  url.searchParams.set("tcodeList", tcodeList);
  if (seasonGrade != null) {
    url.searchParams.set("seasonGrade", String(seasonGrade));
  }

  return requestJson(url.toString(), {
    fetchImpl,
    signal,
  });
}

async function fetchStandings({ fetchImpl, signal }) {
  return requestJson(TEAM_RANK_URL, {
    fetchImpl,
    signal,
  });
}

async function getMatchResults(date, options = {}) {
  const payload = options.schedulePayload || await fetchMatchList({
    date,
    seasonGrade: options.seasonGrade == null ? 1 : options.seasonGrade,
    tcodeList: options.tcodeList || "all",
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  return normalizeScheduleResponse(payload, {
    date,
    team: options.team,
    seasonGrade: options.seasonGrade == null ? 1 : options.seasonGrade,
    standingsRows: options.standingsRows,
  });
}

async function getStandings(options = {}) {
  const payload = options.standingsPayload || await fetchStandings({
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  return normalizeStandingsResponse(payload);
}

async function getKBLSummary(date, options = {}) {
  const standingsPayload = options.includeStandings === false
    ? null
    : (options.standingsPayload || await fetchStandings({
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    }));

  const matches = options.matchesResponse || await getMatchResults(date, {
    ...options,
    standingsRows: standingsPayload || undefined,
  });

  const summary = {
    queryDate: matches.queryDate,
    filteredTeam: matches.filteredTeam,
    matches: matches.matches,
  };

  if (options.includeStandings !== false) {
    summary.standings = normalizeStandingsResponse(standingsPayload);
  }

  return summary;
}

module.exports = {
  fetchMatchList,
  fetchStandings,
  getKBLSummary,
  getMatchResults,
  getStandings,
};
