---
name: kleague-results
description: 케이리그 경기 결과와 현재 순위를 날짜/팀 기준으로 조회한다. 공식 JSON 엔드포인트와 kleague-results npm 패키지를 사용한다.
license: MIT
metadata:
  category: sports
  locale: ko-KR
  phase: v1
---

# K League Results

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

공식 K리그 JSON 표면으로 특정 날짜의 K리그1/K리그2 경기 결과를 조회하고, 필요하면 특정 팀(예: `FC서울`, `서울 이랜드`, 팀 코드 `K09`)만 필터링한 뒤 현재 순위까지 함께 정리한다.

## When to use

- "오늘 K리그1 경기 결과 알려줘"
- "2026-03-22 FC서울 경기 결과랑 현재 순위 보여줘"
- "2026-03-22 K리그2 결과 정리해줘"

## Prerequisites

- Node.js 18+
- `npm install -g kleague-results`

## Inputs

- 날짜: `YYYY-MM-DD`
- 리그: `K리그1` 또는 `K리그2` (기본값은 `K리그1`)
- 선택 사항: 팀명, 풀네임, 팀 코드 (`서울`, `FC서울`, `K09` 등)

## Workflow

### 0. Install the package globally when missing

`npm root -g` 아래에 `kleague-results` 가 없으면 HTML scraping 으로 우회하지 말고 먼저 전역 Node 패키지 설치를 시도한다.

```bash
npm install -g kleague-results
```

### 1. Fetch the official K League JSON

이 스킬은 HTML 크롤링 대신 아래 공식 JSON 엔드포인트를 사용한다.

- 일정/결과: `https://www.kleague.com/getScheduleList.do`
- 팀 순위: `https://www.kleague.com/record/teamRank.do`

```bash
GLOBAL_NPM_ROOT="$(npm root -g)" node --input-type=module - <<'JS'
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
  path.join(process.env.GLOBAL_NPM_ROOT, "kleague-results", "src", "index.js"),
).href;
const { getKLeagueSummary } = await import(entry);

const summary = await getKLeagueSummary("2026-03-22", {
  leagueId: "K리그1",
  team: "FC서울",
  includeStandings: true,
});

console.log(JSON.stringify(summary, null, 2));
JS
```

### 2. Normalize for humans

원본 JSON을 그대로 던지지 말고 아래 기준으로 정리한다.

- 홈팀 vs 원정팀
- 경기 시간 / 경기 종료 여부
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

- K리그 사이트가 `getScheduleList.do` 또는 `teamRank.do` 응답 구조를 바꾸면 패키지 수정이 필요하다
- 경기 전 날짜면 결과 대신 예정 상태가 반환될 수 있다
- `서울` 처럼 짧은 이름만 주면 리그에 따라 `FC서울` / `서울 이랜드` 구분이 필요할 수 있다

## Notes

- 이 스킬은 조회 전용이다
- 사용자의 "오늘/어제" 요청은 항상 절대 날짜(`YYYY-MM-DD`)로 변환해서 실행한다
- 패키지를 새로 추가한 상태라면 머지 후 npm publish(Changesets 기반)를 진행해야 전역 설치 흐름이 살아난다
- 자세한 사용 예시는 `docs/features/kleague-results.md` 와 `packages/kleague-results/README.md` 를 따른다
