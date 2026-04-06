# lck-analytics

`jerjangmin`님의 원본 [`lck-analytics` 스킬 팩](https://github.com/jerjangmin/share/tree/main/SKILL/lck-analytics)을 k-skill의 npm workspace / Changesets 배포 흐름에 맞춰 옮긴 LCK 전용 Node.js 클라이언트입니다.

Riot 공식 LoL Esports 데이터와 Oracle's Elixir 스타일 historical row / CSV를 함께 사용해 날짜별 LCK 경기 결과, 현재 순위, live turning point, 밴픽 matchup / synergy, patch meta, 팀 파워 레이팅을 계산합니다.

## Install

```bash
npm install lck-analytics
```

글로벌 skill 실행 예시는 아래를 기준으로 합니다.

```bash
npm install -g lck-analytics
```

## Origin / attribution

- Original skill + prototype package: <https://github.com/jerjangmin/share/tree/main/SKILL/lck-analytics>
- Original author: `jerjangmin`
- k-skill adaptation goal: same capability surface, but released through this repository's official npm/Changesets pipeline

## Official surfaces

- 일정/결과: `https://esports-api.lolesports.com/persisted/gw/getSchedule`
- 토너먼트 목록: `https://esports-api.lolesports.com/persisted/gw/getTournamentsForLeague`
- 순위: `https://esports-api.lolesports.com/persisted/gw/getStandings`
- 이벤트 상세: `https://esports-api.lolesports.com/persisted/gw/getEventDetails`
- 라이브 window: `https://feed.lolesports.com/livestats/v1/window/{gameId}`
- 라이브 details: `https://feed.lolesports.com/livestats/v1/details/{gameId}`

## Usage

```js
const {
  buildHistoricalAnalytics,
  getGameAnalysis,
  getLckSummary,
  getMatchAnalysis,
  getMatchResults,
  getPatchMetaReport,
  getStandings,
  getTeamPowerRatings,
} = require("lck-analytics");

(async () => {
  const results = await getMatchResults("2026-04-01", {
    team: "한화",
  });

  const standings = await getStandings({
    date: "2026-04-01",
    team: "T1",
  });

  const summary = await getLckSummary("2026-04-01", {
    team: "한화",
    includeStandings: true,
  });

  const historical = buildHistoricalAnalytics([
    {
      league: "LCK",
      matchid: "sample-1",
      date: "2026-04-01",
      patch: "16.6.753.8272",
      side: "blue",
      teamname: "Hanwha Life Esports",
      opponentteam: "T1",
      playername: "HLE Zeus",
      position: "top",
      champion: "Aatrox",
      opponentchampion: "Gnar",
      result: "win",
      gd15: 1200,
      csd15: 18,
      xpd15: 340,
      drg: 100,
      bn: 100,
      blindpick: 0,
      counterpick: 1,
    },
  ]);

  const patchMeta = getPatchMetaReport(historical, "16.6.753.8272");
  const ratings = getTeamPowerRatings(historical);

  const gameAnalysis = await getGameAnalysis("game-id", {
    historicalDataset: historical,
    liveWindowPayload: {/* optional cached payload */},
    liveDetailsPayload: {/* optional cached payload */},
  });

  const matchAnalysis = await getMatchAnalysis("2026-04-01", {
    historicalDataset: historical,
  });

  console.log(results.matches[0]);
  console.log(standings.rows[0]);
  console.log(summary);
  console.log(patchMeta);
  console.log(ratings[0]);
  console.log(gameAnalysis.turningPoints);
  console.log(matchAnalysis.matches[0]?.powerPreview);
})();
```

## API

### `getMatchResults(date, options)`

- `date`: `YYYY-MM-DD` 또는 `Date`
- `options.team`: 현재명 / 과거명 / 한글 / 영문 / 약칭 alias
- `options.maxPages`: 일정 페이지 탐색 상한, 기본값 `6`
- 기본적으로 `matches[*].games[*].live` 와 `matches[*].live` 에 인게임 실시간 요약을 채웁니다
- `options.includeLiveDetails === false` 이면 상세 live fetch를 생략합니다

### `getStandings(options)`

- `options.date`: `YYYY-MM-DD` 또는 `Date`
- `options.tournamentId`: 특정 토너먼트 강제 지정 가능
- `options.team`: 특정 팀만 현재 순위에서 필터링

### `getLckSummary(date, options)`

- 날짜 결과와 해당 시점 스플릿 순위를 한 번에 반환합니다

### `buildHistoricalAnalytics(input, options)`

- Oracle's Elixir 스타일 CSV 문자열 또는 row 배열로 historical 분석 데이터셋을 만듭니다
- 반환값에는 `teamPowerRatings`, `championStats`, `matchupStats`, `synergyStats`, `patchMeta` 가 포함됩니다

### `getGameAnalysis(gameId, options)`

- live window/details payload를 기반으로 timeline, turning points, draft edge, patch meta context를 계산합니다

### `getMatchAnalysis(date, options)`

- 날짜별 match 결과 위에 게임별 분석과 팀 파워 preview를 붙여 반환합니다

## Release note

이 패키지는 `packages/lck-analytics` workspace로 관리됩니다. `main` 에 머지되면 이 저장소의 Changesets 흐름이 **Version Packages PR** 을 만들고, 그 PR merge 후 npm publish가 실행됩니다.

## Notes

- 기본 Riot web header + 공개 API key fallback을 사용하지만, 안정성을 위해 `LOLESPORTS_API_KEY` 환경변수 override도 지원합니다
- turning point 분석은 공개 live snapshot 기반 heuristic 입니다
- `DN SOOPers`, `DN FREECS`, `광동 프릭스`, `Afreeca Freecs` 같은 리브랜딩 alias를 같은 canonical team으로 정규화합니다
