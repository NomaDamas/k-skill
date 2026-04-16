---
name: kbl-results
description: KBL 한국프로농구 경기 결과와 현재 팀 순위를 날짜/팀 기준으로 조회한다. 공식 JSON 엔드포인트와 kbl-results npm 패키지를 사용한다.
license: MIT
metadata:
  category: sports
  locale: ko-KR
  phase: v1
---

# KBL Results

## What this skill does

공식 KBL JSON 표면으로 특정 날짜의 한국프로농구 경기 일정/결과를 조회하고, 필요하면 특정 팀(예: `서울 SK`, `부산 KCC`, 팀 코드 `55`)만 필터링한 뒤 현재 팀 순위까지 함께 정리한다.

## When to use

- "오늘 KBL 경기 결과 알려줘"
- "2026-04-01 서울 SK 경기 결과 보여줘"
- "KBL 현재 팀 순위 알려줘"

## Prerequisites

- Node.js 18+
- `npm install -g kbl-results`

## Inputs

- 날짜: `YYYY-MM-DD`
- 선택 사항: 팀명, 풀네임, 팀 코드

## Workflow

### 0. Install the package globally when missing

`npm root -g` 아래에 `kbl-results` 가 없으면 HTML scraping 으로 우회하지 말고 먼저 전역 Node 패키지 설치를 시도한다.

```bash
npm install -g kbl-results
```

### 1. Fetch the official KBL JSON

공식 KBL 웹앱은 `https://api.kbl.or.kr` JSON API를 사용한다. 따라서 브라우저 크롤링 전에 아래 표면을 우선 사용한다.

- 일정/결과: `https://api.kbl.or.kr/match/list`
- 팀 순위: `https://api.kbl.or.kr/league/rank/team`

```bash
GLOBAL_NPM_ROOT="$(npm root -g)" node --input-type=module - <<'JS'
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
  path.join(process.env.GLOBAL_NPM_ROOT, "kbl-results", "src", "index.js"),
).href;
const { getKBLSummary } = await import(entry);

const summary = await getKBLSummary("2026-04-01", {
  team: "부산 KCC",
  includeStandings: true,
});

console.log(JSON.stringify(summary, null, 2));
JS
```

### 2. Normalize for humans

원본 JSON을 그대로 던지지 말고 아래 기준으로 정리한다.

- 홈팀 vs 원정팀
- 경기 시간 / 종료 여부 / LIVE 여부
- 스코어
- 현재 순위
- 요청 팀이 있으면 해당 팀 경기만 필터링

### 3. Keep the answer compact

요청이 scoreboard 면 경기별 한 줄 요약부터 준다. 특정 팀 요청이면 그 팀 경기와 현재 순위만 먼저 보여준다.

## Done when

- 날짜 기준 경기 요약이 있다
- 팀 요청이면 해당 팀 경기만 남아 있다
- 현재 순위가 같이 정리되어 있다

## Failure modes

- KBL가 `api.kbl.or.kr` 응답 구조를 바꾸면 패키지 수정이 필요하다
- 경기 전 날짜면 결과 대신 예정 상태가 반환될 수 있다
- 크롤링 fallback은 공식 JSON이 막혔을 때만 검토한다

## Notes

- 이 스킬은 조회 전용이다
- 사용자의 "오늘/어제" 요청은 항상 절대 날짜(`YYYY-MM-DD`)로 변환해서 실행한다
- 자세한 사용 예시는 `docs/features/kbl-results.md` 와 `packages/kbl-results/README.md` 를 따른다
