const LCK_LEAGUE_ID = "98767991310872058";
const DEFAULT_LOLESPORTS_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const LOLESPORTS_API_BASE_URL = "https://esports-api.lolesports.com/persisted/gw";
const LIVE_STATS_BASE_URL = "https://feed.lolesports.com/livestats/v1";
const DEFAULT_HEADERS = {
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9,ko-KR;q=0.8,ko;q=0.7",
  "user-agent": "k-skill/lck-analytics",
};

const STATUS_MAP = {
  completed: { state: "finished", label: "종료", finished: true },
  inProgress: { state: "live", label: "진행 중", finished: false },
  unstarted: { state: "scheduled", label: "예정", finished: false },
};

module.exports = {
  DEFAULT_HEADERS,
  DEFAULT_LOLESPORTS_API_KEY,
  LCK_LEAGUE_ID,
  LIVE_STATS_BASE_URL,
  LOLESPORTS_API_BASE_URL,
  STATUS_MAP,
};
