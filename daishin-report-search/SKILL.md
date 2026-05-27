---
name: daishin-report-search
description: 대신증권 리포트 GitHub Pages 미러에서 최신 HTML 리포트 목록과 원문/설명 페이지를 조회한다.
license: MIT
metadata:
  category: finance
  locale: ko-KR
  phase: v1
---

# Daishin Report Search

## What this skill does

대신증권 리포트 HTML 미러(`jay-jo-0/github_pages_repo`)에서 최신 리포트 목록을 찾고, 특정 리포트의 원문 텍스트·제목·헤딩·Rating/Target 표·원문 링크를 에이전트가 재사용하기 쉬운 JSON으로 반환한다.

이 스킬은 투자 조언, 매매 자동화, 추천을 하지 않는다. 공개 HTML 리포트를 읽어 요약 가능한 자료로 정리하는 조회 전용 스킬이다.

## When to use

- "대신증권 최신 리포트 보여줘"
- "대신증권 반도체 리포트 찾아줘"
- "20260511082352 리포트 원문과 설명 페이지를 읽어줘"
- "대신증권 리포트 목록을 에이전트가 쓰기 좋은 JSON으로 줘"

## Prerequisites

- 인터넷 연결
- Node.js 18+
- 이 저장소의 `daishin-report-search` npm package 또는 동일 로직

## Public access path discovered

### Primary source: GitHub recursive tree API

- list endpoint: `https://api.github.com/repos/jay-jo-0/github_pages_repo/git/trees/main?recursive=1`
- selected paths: repository-root files matching `YYYYMMDDHHMMSS.html`
- optional companion paths: `YYYYMMDDHHMMSS_explain.html`
- detail raw HTML: `https://raw.githubusercontent.com/Jay-jo-0/github_pages_repo/main/<path>`
- browser detail URL: `https://jay-jo-0.github.io/github_pages_repo/<path>`
- reason selected: the sample GitHub Pages URL maps directly to a public GitHub repository. The recursive tree API exposes all timestamped HTML filenames without relying on a brittle directory listing screen scrape. Raw GitHub URLs provide stable unauthenticated detail fetches.

### Fallback source: GitHub contents API for an exact file

- exact-file endpoint: `https://api.github.com/repos/jay-jo-0/github_pages_repo/contents/<path>?ref=main`
- used automatically for a known timestamp when the raw detail URL is unavailable; it also provides GitHub content metadata for manual diagnostics.

No `k-skill-proxy` route is used because the upstream is public and does not require an API key.

## Workflow

### 1. List latest reports

```js
const { listReports } = require("daishin-report-search")

const result = await listReports({
  limit: 10,
  query: "반도체",   // optional; matches title/headings/detail text
  maxInspect: 100,   // optional query crawl budget among newest pages
  githubToken: process.env.GITHUB_TOKEN // optional; raises GitHub API limits when caller has one
})

console.log(result.items)
```

CLI:

```bash
node packages/daishin-report-search/src/cli.js --limit 10
node packages/daishin-report-search/src/cli.js 반도체 --limit 5 --max-inspect 100
```

Return each item with:

- `id` (`YYYYMMDDHHMMSS`)
- `date`, `time`, `timestamp` (filename-derived KST timestamp)
- `title`
- `headings`
- `excerpt`
- `ratingTargets` when a Rating/Target table is present
- `pageUrl`, `rawUrl`, `apiUrl`
- `hasExplain`, `explainUrl` when a companion explanation page exists

### 2. Fetch one report

```js
const { fetchReport } = require("daishin-report-search")

const report = await fetchReport("20260511082352", {
  includeExplain: true
})

console.log(report.title)
console.log(report.text)
console.log(report.explain?.text)
```

CLI:

```bash
node packages/daishin-report-search/src/cli.js --id 20260511082352 --include-explain
```

### 3. Summarize conservatively

When answering a user, show:

```text
- 제목: ...
  게시 추정 시각: 2026-05-11 08:23:52 KST (파일명 기준)
  주요 헤딩: ...
  Rating/Target: ... (있는 경우)
  원문: https://jay-jo-0.github.io/github_pages_repo/...
  설명 페이지: ... (있는 경우)
```

Always state that the timestamp is filename-derived and that report contents can change in the public mirror.

## Fallback order

1. GitHub recursive tree API → filter timestamped root HTML files → sort newest filename first → fetch raw detail HTML for selected/latest candidates.
2. If a query is present, inspect newer candidates up to `maxInspect` until enough matches are found or the budget is exhausted; return a warning if the budget is exhausted.
3. For a known id, fetch raw detail directly. If explanation is requested, fetch `<id>_explain.html`; if absent, return the original report plus a warning.
4. If the tree endpoint is truncated, blocked, rate-limited, or changed, report that as a source warning/failure instead of guessing hidden pages.
5. For a known id, if the raw detail URL fails, fall back to the GitHub contents API for that exact file path. Explanation pages use the same exact-file fallback but remain optional and return a warning if unavailable.
6. If the caller has authenticated GitHub access, pass `githubToken` / `githubHeaders` in library calls or set `DAISHIN_GITHUB_TOKEN` / `GITHUB_TOKEN` for the CLI; these credentials are scoped to `api.github.com` requests and are not sent to raw detail URLs. Do not require or proxy a token by default.

## Done when

- Latest report rows or a specific report are returned with direct source URLs.
- Query and limit were applied or explicitly left broad.
- Explanation pages were included only when requested or when listing metadata shows they exist.
- Empty results and upstream warnings are disclosed.

## Failure modes

- GitHub unauthenticated API rate limits can return 403/429; latest/search returns empty `items` plus `source.error.kind = "rate_limit"` and rate-limit reset metadata when GitHub exposes it. Retry later or use caller-supplied authenticated GitHub access if appropriate.
- The repository path or branch can change; then tree/raw URLs will fail.
- The tree response could become truncated; in that case the latest-list completeness is not guaranteed.
- HTML structure can change; title/headings/table extraction may be partial, but URLs and raw text fallback should still be returned when available.
- Some pages may not be authored by Daishin even though they are in the issue-scoped public mirror. Do not infer provenance beyond page title/content.

## Notes

- Read-only lookup only; no login, trading, order placement, recommendation, or investment advice.
- Do not scrape private Daishin services or bypass CAPTCHA/login walls.
- No secrets or API keys are required. Optional GitHub tokens are caller-owned, used only when explicitly supplied via options or environment, and scoped to GitHub API hosts.
