---
name: kbo-results
description: Fetch KBO game schedules and results for a specific date with the kbo-game npm package. Use when the user asks for today's KBO games, yesterday's scores, or a date-specific scoreboard.
license: MIT
metadata:
  category: sports
  locale: ko-KR
  phase: v1
---

# KBO Results

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

`kbo-game` 패키지로 특정 날짜 KBO 경기 정보를 가져와 경기 일정, 스코어, 상태를 요약한다.

## When to use

- "오늘 KBO 경기 결과 알려줘"
- "어제 한화 경기 스코어 보여줘"
- "2026-04-01 KBO 일정 정리해줘"

## Prerequisites

- Node.js 18+
- `npm install -g kbo-game`

## Inputs

- 날짜: `YYYY-MM-DD`
- 선택 사항: 특정 팀명

## Workflow

### 0. Install the package globally when missing

`npm root -g` 아래에 `kbo-game` 이 없으면 다른 구현으로 우회하지 말고 전역 Node 패키지 설치를 먼저 시도한다.

```bash
npm install -g kbo-game
```

패키지가 없다는 이유로 다른 비공식 scoreboard 소스를 자동 채택하지 않는다.

### 1. Fetch the date

```bash
GLOBAL_NPM_ROOT="$(npm root -g)" node --input-type=module - <<'JS'
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = pathToFileURL(
  path.join(process.env.GLOBAL_NPM_ROOT, "kbo-game", "dist", "index.js"),
).href;
const { getGame } = await import(entry);

const date = "2026-03-25";
const games = await getGame(new Date(`${date}T00:00:00+09:00`));
console.log(JSON.stringify(games, null, 2));
JS
```

`kbo-game@0.0.2` 기준 실제 export는 `getGame` 하나이며, 문자열 날짜(`"2026-03-25"`)를 직접 넘기면 실패한다. 항상 `Date` 객체로 변환해서 호출한다. 전역 설치를 기본으로 쓰므로 inline snippet에서는 전역 npm root 아래 entry file을 직접 import 한다.

### 2. Normalize for humans

원본 데이터를 그대로 던지지 말고 아래 기준으로 정리한다.

- 홈팀 vs 원정팀
- 진행 상태 또는 경기 종료 여부
- 스코어
- 필요한 경우 특정 팀만 필터링

### 3. Keep the answer compact

사용자가 scoreboard를 원하면 경기별 한 줄 요약부터 준다.

## Done when

- 날짜 기준 전체 경기 요약이 있다
- 팀 필터 요청이면 해당 팀 경기만 남아 있다
- raw JSON이 필요하면 별도로 제공할 수 있다

## Failure modes

- KBO 사이트 변경으로 패키지 응답이 깨질 수 있다
- 비시즌 날짜는 빈 결과가 올 수 있다

## Notes

- 이 스킬은 조회 전용이다
- 사용자 기준 "오늘/어제" 같은 상대 날짜는 항상 절대 날짜로 변환해서 실행한다
