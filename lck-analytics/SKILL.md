---
name: lck-analytics
description: Riot 공식 LoL Esports 데이터와 Oracle's Elixir 스타일 historical 데이터로 LCK 경기 결과, 현재 순위, live turning point, 밴픽 matchup/synergy, patch meta, 팀 파워 레이팅을 조회한다.
license: MIT
metadata:
  category: sports
  locale: ko-KR
  phase: v1
---

# LCK Results + Advanced Analysis

## What this skill does

이 스킬은 LCK 조회/분석 전용이다.

- 특정 날짜 LCK 경기 결과 조회
- 특정 팀 alias 정규화 후 필터링
- 현재 스플릿 순위 조회
- 진행 중 경기 live stats 조회
- live timeline 기반 turning point 분석
- Oracle's Elixir 스타일 historical row / CSV 기반
  - 팀 파워 레이팅
  - 챔피언 matchup / synergy 분석
  - patch meta 요약
- 날짜별 match analysis 생성

## Origin / attribution

이 스킬은 `jerjangmin` 님이 만든 원본 [`lck-analytics` skill pack](https://github.com/jerjangmin/share/tree/main/SKILL/lck-analytics)을 k-skill 저장소 안으로 옮기고, 이 저장소의 npm workspace / Changesets 배포 방식에 맞게 정리한 버전이다.

## When to use

- "오늘 LCK 경기 결과 알려줘"
- "2026-04-01 한화 경기 결과랑 순위 보여줘"
- "지금 T1 경기 킬/골드/오브젝트 요약해줘"
- "이 경기 turning point가 뭐였어?"
- "이 밴픽에서 어느 쪽 조합이 더 좋았는지 설명해줘"
- "현재 패치에서 어떤 챔피언이 메타 픽인지 보여줘"
- "LCK 팀 파워 레이팅 보여줘"

## Prerequisites

- Node.js 18+
- `npm install -g lck-analytics`

패키지가 없으면 다른 방법으로 우회하지 말고 먼저 전역 설치를 시도한다.

```bash
npm install -g lck-analytics
```

## Inputs

### 기본 입력

- 날짜: `YYYY-MM-DD`
- 선택 사항: 팀명, 과거 팀명, 한글/영문 약칭 alias

### 고급 분석 입력

- Oracle's Elixir 스타일 CSV 문자열 또는 row 배열
- game id / match id
- live window/details payload 또는 실시간 fetch 권한
- patch version

## Team alias normalization

다음 이름들은 같은 canonical team 으로 인식한다.

- `DN SOOPers`
- `DN FREECS`
- `광동 프릭스`
- `Afreeca Freecs`

추가로 `T1`, `SKT T1`, `담원`, `Dplus KIA`, `브리온`, `한화`, `젠지`, `피어엑스` 등도 alias 정규화를 지원한다.

## Official surfaces

이 스킬은 Riot 공식 / 공식 웹앱 표면을 우선 사용한다.

- 일정/결과: `getSchedule`
- 토너먼트 목록: `getTournamentsForLeague`
- 순위: `getStandings`
- 이벤트 상세: `getEventDetails`
- 라이브 window: `https://feed.lolesports.com/livestats/v1/window/{gameId}`
- 라이브 details: `https://feed.lolesports.com/livestats/v1/details/{gameId}`

historical 고급 분석은 Oracle's Elixir 스타일 데이터 입력을 사용한다.

## Workflow

### Included lightweight local pipeline

이 k-skill 팩에는 경량 로컬 파일 기반 파이프라인 스크립트가 포함된다.

- `scripts/sync-oracle.js`: Oracle-style CSV → historical cache JSON
- `scripts/build-match-report.js`: 날짜별 match analysis 생성
- `scripts/analyze-live-game.js`: game analysis 생성
- 기본 cache 위치: `.openclaw-lck-cache/`

### 1. Basic scoreboard / standings query

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

### 2. Historical analytics from Oracle-style CSV

직접 API를 호출해도 되지만, local skill pipeline에서는 아래 스크립트 사용을 우선 권장한다.

```bash
node ./lck-analytics/scripts/sync-oracle.js \
  --csv ./lck-analytics/samples/oracle-lck-sample.csv
```

### 3. Match analysis via local pipeline script

```bash
node ./lck-analytics/scripts/build-match-report.js \
  --date 2026-04-01
```

필요하면 팀 필터도 같이 준다.

```bash
node ./lck-analytics/scripts/build-match-report.js \
  --date 2026-04-01 \
  --team 한화
```

### 4. Game analysis with turning points via local pipeline script

```bash
node ./lck-analytics/scripts/analyze-live-game.js \
  --game game-id
```

fixture 기반으로 분석할 때는 `--window`, `--details` 를 같이 줄 수 있다.

## Output guidelines

사용자에게는 원본 JSON을 길게 그대로 던지지 말고 먼저 아래 순서로 정리한다.

### 경기 결과 요청

- 경기 시각
- 팀1 vs 팀2
- 상태
- 세트 스코어
- 요청 팀 경기만 있으면 해당 경기 우선
- standings 요청이 있으면 현재 순위 같이 표시

### 진행 중 경기 요청

- 현재 게임 번호
- 킬 차이
- 골드 차이
- 드래곤/바론/타워 차이
- turning point 1~3개

### historical / meta 요청

- sample 수를 먼저 표시
- 팀 파워 레이팅은 상위 팀부터 정렬
- champion matchup / synergy는 표본 수가 적으면 낮은 확신도로 표시
- patch meta는 top picks / risers 위주로 짧게 요약

## Done when

- 날짜 기준 경기 요약이 있다
- 요청 팀 필터가 적용된다
- standings 요청이면 현재 순위가 같이 정리된다
- live 요청이면 현재 게임 요약과 turning point가 있다
- historical 입력이 있으면 patch meta 또는 power rating까지 설명할 수 있다

## Failure modes

- Riot 웹앱 API 구조/헤더가 바뀌면 패키지 수정이 필요할 수 있다
- `LOLESPORTS_API_KEY` public fallback이 회전되면 환경변수 override가 필요할 수 있다
- historical CSV 컬럼명이 너무 다르면 Oracle-style 정규화 전에 전처리가 필요할 수 있다

## Notes

- 이 스킬은 조회/분석 전용이다
- 사용자의 "오늘/어제" 요청은 항상 절대 날짜(`YYYY-MM-DD`)로 변환해서 실행한다
- 이 저장소에서 `main` 으로 머지되면 Changesets가 Version Packages PR을 만들고, 그 PR이 merge된 뒤 npm publish가 실행된다
