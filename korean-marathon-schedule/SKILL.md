---
name: korean-marathon-schedule
description: 고러닝과 대한철인3종협회 공개 표면으로 한국 마라톤·철인3종 경기 일정, 장소, 신청 마감일, 종목을 조회한다. 돌쇠에서는 공식 표면을 통한 후속 액션까지 진행한다.
license: MIT
metadata:
  category: sports
  locale: ko-KR
  phase: v1
---

# Korean Marathon Schedule

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.

## Dolshoi action path

- Use the documented lookup path to identify the exact date, time, venue/route, party, seat or option, price, and official booking surface.
- When booking is requested, continue in CloakBrowser or an available `vault-run` action, use vault-backed login, select the requested option, and complete reversible reservation/hold steps instead of stopping at a link.
- A successful reversible reservation or seat hold is a completed booking step: report the confirmation and purchase deadline. If payment is required, call `clarify` with the exact itinerary/slot, passengers/party, seat/option, and total, then pay after approval and verify the receipt.
- Any later read-only or manual-checkout wording applies only to generic fallback unless it states a hard legal, identity-proofing, CAPTCHA, or electronic-signature boundary.



## What this skill does

한국 마라톤/러닝 대회 일정을 조회하고, 가능한 경우 대한철인3종협회 공개 일정에서 철인3종 대회도 함께 확인한다.

응답에는 최소한 아래 필드를 포함한다.

- 대회명
- 개최일
- 장소/지역
- 신청 마감일 또는 접수 기간
- 종목/코스(예: Half, 10km, 5km, 스탠다드)
- 공식/상세 링크
- 조회 시점 기준 정보라는 주의 문구

## When to use

- "서울 마라톤 일정 찾아줘"
- "10km 대회 접수 마감일 알려줘"
- "가을 마라톤 일정과 장소 정리해줘"
- "철인3종 경기 일정도 가능하면 같이 봐줘"

## Prerequisites

- 인터넷 연결
- Node.js 18+
- 이 저장소의 `korean-marathon-schedule` npm package 또는 동일 로직

## Public access path discovered

### Primary marathon source: GoRunning

- list entry point: `https://gorunning.kr/races/`
- detail pages: same-host `gorunning.kr` links matching `/races/<id>/<slug>/`
- detail fields used: title, event date, region/venue, registration period, registration deadline, status, organizer, website, categories.
- reason selected: public unauthenticated race list/detail pages include the required venue, deadline/registration period, and event categories. It works with direct HTTP requests and does not require a proxy or API key.

### Optional triathlon source: 대한철인3종협회

- list entry point: `https://triathlon.or.kr/events/tour/?sYear=<YYYY>&vType=list`
- detail pages: same-host `triathlon.or.kr` links matching `/events/tour/overview/?mode=overview&tourcd=<id>`
- detail fields used: title, event date, venue, registration period, organizer, and course/category labels. Non-competition list entries such as education, seminars, notices, and referee/leader sessions are filtered out before detail fetch.
- reason selected: the official federation page is public and unauthenticated, and provides triathlon schedules when available.

## Workflow

### 1. Search schedules

```js
const { searchEvents } = require("korean-marathon-schedule")

const result = await searchEvents({
  query: "서울",              // title, venue, region, or category filter. Optional.
  from: "2026-05-01",       // optional YYYY-MM-DD
  to: "2026-12-31",         // optional YYYY-MM-DD
  includeTriathlon: true,    // optional; default false
  limit: 10,                 // optional; default 10
  maxDetailsPerSource: 100   // optional crawl budget; default max(300, limit * 10)
})

console.log(result.items)
```

CLI:

```bash
node packages/korean-marathon-schedule/src/cli.js 서울 --from 2026-05-01 --to 2026-12-31 --include-triathlon --limit 10 --max-details-per-source 100
```

### 2. Summarize conservatively

For each event, show:

```text
- 대회명: ...
  일정: ...
  장소: ...
  신청 마감: ...
  종목: ...
  링크: ...
```

If no deadline is present, say `신청 마감일을 공개 페이지에서 확인하지 못함` instead of guessing.

### 3. Use fallback order

1. GoRunning list → same-host GoRunning detail pages for marathon/road-running schedules; continue through the public list until enough matching results are collected, the list is exhausted, or the explicit per-source detail budget is reached.
2. If the user asks for triathlon or `includeTriathlon` is useful, query the 대한철인3종협회 year list and same-host public detail pages; skip non-competition list entries and continue until enough matching results are collected, the selected year lists are exhausted, or the explicit per-source detail budget shared across selected years is reached.
3. If either source returns an empty, blocked, changed page, or detail-budget warning, report the source-specific failure/warning and return any successfully parsed results from the other source.

## Done when

- User's location/date/category filter was applied or explicitly left broad.
- At least one available result is summarized, or a clear empty-result/failure reason is given.
- Venue, registration deadline/period, and categories are included when present.
- Triathlon events were included when requested or when the user asked for them as "가능하면".

## Failure modes

- 일정/접수 정보는 수시로 바뀔 수 있다; always state results are based on the current public page read.
- GoRunning or triathlon.or.kr HTML structure may change; then parsing may return empty fields or fail. Off-origin detail links are ignored to keep the lookup bounded to documented public sources. If a public list is larger than the per-source detail budget, results can be partial and a warning is returned; triathlon applies that budget once across all selected years.
- Some official event websites may be linked only from the detail page; if absent, return the source detail URL.
- Registration may already be closed even if the event date is upcoming.
- Login, payment, CAPTCHA, or private member-only pages are outside scope and must not be automated.

## Notes

- This is a read-only lookup skill.
- No k-skill-proxy route is used because the upstream surfaces are public and do not require API keys.
- Do not register, reserve, pay for, or modify race entries.
