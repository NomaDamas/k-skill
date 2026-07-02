# d2b-notice-search

Read-only D2B(국방전자조달시스템) bid notice lookup recipe and parsing helpers for the `d2b-notice-search` k-skill.

## Source

- Official entry point: `https://www.d2b.go.kr/index.do`
- Public search surface: the rendered `입찰공고` search form on the D2B home page
- Direct HTTP probe: `/openapi/sealedBidAnnounceList.json` is best-effort only; observed security routing can return `400 Bad Request` HTML instead of JSON.

This skill is unauthenticated lookup guidance. It does not log in, bid, submit documents, sign certificates, pay fees, or bypass security software.

## Usage

```js
const { buildBrowserAutomationInstructions, buildSearchRequest, parseListHtml } = require("d2b-notice-search")

const recipe = buildBrowserAutomationInstructions({
  keyword: "냉난방기",
  kind: "물품",
  noticeType: "긴급공고",
  dateType: "공고일자",
  dateStart: "2026-07-01",
  dateEnd: "2026-08-30"
})

console.log(recipe.steps)
```

## Returned helpers

- `normalizeSearchOptions(input)`: normalizes Korean/English aliases, dates, and page numbers.
- `buildSearchRequest(input)`: returns the official D2B entry URL, browser form selectors, and best-effort direct request metadata.
- `buildBrowserAutomationInstructions(input)`: documents the fallback order: Aside Browser, Playwright/Chrome headless, then direct HTTP best-effort.
- `parseListHtml(html)`: extracts rendered notice links with JavaScript action metadata.
- `classifyUpstreamHtml(html)`: classifies security/login/400 HTML as blocked rather than empty results.

## Boundaries

- Primary execution should use Aside Browser against the official rendered page.
- Playwright or Chrome headless is the fallback when Aside Browser is unavailable.
- Direct HTTP is not the primary path because D2B security routing may reject non-browser requests.
- No `k-skill-proxy` route is used because the discovered public search surface does not require an API key.
