# LCK 경기 분석

`lck-analytics` 는 Riot 공식 LoL Esports 표면과 Oracle's Elixir 스타일 historical 데이터셋을 함께 사용해 LCK 경기 결과와 고급 분석을 제공하는 스킬이다.

## Origin / attribution

- Original reference skill: <https://github.com/jerjangmin/share/tree/main/SKILL/lck-analytics>
- Original author: `jerjangmin`
- k-skill adaptation: 이 저장소의 npm workspace / Changesets 배포 흐름에 맞춰 패키지와 문서를 정리한 버전

## 무엇을 할 수 있나

- 날짜별 LCK 경기 결과 조회
- 팀 alias 정규화 (`한화`, `HLE`, `SKT T1`, `DN FREECS`, `광동 프릭스` 등)
- 해당 날짜 기준 현재 순위 조회
- live game 킬 / 골드 / 오브젝트 / participant snapshot 조회
- live timeline 기반 turning point 추정
- Oracle's Elixir 스타일 CSV로부터
  - 팀 파워 레이팅
  - champion matchup / synergy
  - patch meta summary 계산

## 설치

```bash
npm install -g lck-analytics
export NODE_PATH="$(npm root -g)"
```

## 기본 조회 예시

```bash
GLOBAL_NPM_ROOT="$(npm root -g)" node --input-type=module - <<'JS'
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
  path.join(process.env.GLOBAL_NPM_ROOT, "lck-analytics", "src", "index.js"),
).href;
const { getLckSummary } = await import(entry);

const summary = await getLckSummary("2026-04-01", {
  team: "한화",
  includeStandings: true,
});

console.log(JSON.stringify(summary, null, 2));
JS
```

## Local pipeline

skill directory 안에는 원본 pack을 따라 local helper script도 포함한다.

- `lck-analytics/scripts/sync-oracle.js`
- `lck-analytics/scripts/build-match-report.js`
- `lck-analytics/scripts/analyze-live-game.js`
- `lck-analytics/samples/oracle-lck-sample.csv`

historical cache 생성:

```bash
node ./lck-analytics/scripts/sync-oracle.js \
  --csv ./lck-analytics/samples/oracle-lck-sample.csv
```

날짜별 match analysis 생성:

```bash
node ./lck-analytics/scripts/build-match-report.js \
  --date 2026-04-01 \
  --team 한화
```

live turning point 분석:

```bash
node ./lck-analytics/scripts/analyze-live-game.js \
  --game game-id
```

## Official surfaces

- `https://esports-api.lolesports.com/persisted/gw/getSchedule`
- `https://esports-api.lolesports.com/persisted/gw/getTournamentsForLeague`
- `https://esports-api.lolesports.com/persisted/gw/getStandings`
- `https://esports-api.lolesports.com/persisted/gw/getEventDetails`
- `https://feed.lolesports.com/livestats/v1/window/{gameId}`
- `https://feed.lolesports.com/livestats/v1/details/{gameId}`
- Oracle's Elixir downloads / schema reference: <https://oracleselixir.com/tools/downloads>

## Release / publish note

이 기능은 `packages/lck-analytics` workspace로 추가됐다. 따라서 `main` 에 기능 PR이 merge되면:

1. `.changeset/*.md` 가 Version Packages PR을 생성하고
2. 그 PR merge 뒤
3. npm publish workflow가 `lck-analytics` 패키지를 배포한다

즉, main merge 직후 바로 태그를 수동으로 만들지 말고 기존 Changesets 릴리스 흐름을 따른다.

## Caveats

- Riot web app용 공개 API key fallback은 회전될 수 있으므로, 필요하면 `LOLESPORTS_API_KEY` 환경변수로 override한다
- turning point는 live snapshot 기반 heuristic 이라 VOD/GRID 레벨 정밀 분석과 동일하지 않다
- historical 분석 품질은 Oracle-style row sample 수에 크게 좌우된다
