# kbl-results

공식 KBL JSON 엔드포인트를 감싼 재사용 가능한 Node.js 클라이언트입니다. 날짜별 경기 결과와 현재 순위를 함께 조회할 수 있습니다.

## Install

```bash
npm install kbl-results
```

## Official surfaces

- 일정/결과: `https://api.kbl.or.kr/match/list`
- 팀 순위: `https://api.kbl.or.kr/league/rank/team`

## Usage

```js
const { getKBLSummary, getMatchResults, getStandings } = require("kbl-results");

(async () => {
  const results = await getMatchResults("2026-04-01", {
    team: "서울 SK",
  });

  const standings = await getStandings();

  const summary = await getKBLSummary("2026-04-01", {
    team: "부산 KCC",
    includeStandings: true,
  });

  console.log(results.matches[0]);
  console.log(standings.rows[0]);
  console.log(summary);
})();
```

## API

### `getMatchResults(date, options)`

- `date`: `YYYY-MM-DD` 또는 `Date`
- `options.team`: short name / full name / team code alias
- `options.seasonGrade`: 기본값은 `1` (KBL 1군)

### `getStandings()`

- 현재 KBL 팀 순위를 반환합니다.

### `getKBLSummary(date, options)`

- 날짜 결과와 현재 순위를 한 번에 반환합니다.

## Notes

- 공식 KBL JSON 엔드포인트 기준이라 HTML 크롤링보다 유지보수가 단순합니다.
- `match/list` 는 `fromDate` / `toDate` 를 `YYYYMMDD` 형식으로 받습니다.
- 1군 KBL 조회 기본값은 `seasonGrade=1` 입니다.
