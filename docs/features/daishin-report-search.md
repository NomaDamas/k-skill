# 대신증권 리포트 조회 가이드

`daishin-report-search`는 `jay-jo-0/github_pages_repo` GitHub Pages 미러에 올라오는 대신증권 리포트 HTML을 최신순으로 찾고 원문/설명 페이지를 JSON으로 정리하는 조회 전용 스킬이다.

## 공개 접근 경로

- 목록: `https://api.github.com/repos/jay-jo-0/github_pages_repo/git/trees/main?recursive=1`
- 원문 HTML: `https://raw.githubusercontent.com/Jay-jo-0/github_pages_repo/main/<YYYYMMDDHHMMSS.html>`
- exact-file fallback: `https://api.github.com/repos/jay-jo-0/github_pages_repo/contents/<YYYYMMDDHHMMSS.html>?ref=main`
- 브라우저 URL: `https://jay-jo-0.github.io/github_pages_repo/<YYYYMMDDHHMMSS.html>`
- 설명 페이지: `<YYYYMMDDHHMMSS_explain.html>`이 있을 때만 제공

파일명 timestamp를 KST 게시 추정 시각으로 표시한다. GitHub API와 raw 파일은 공개 unauthenticated endpoint라서 proxy를 쓰지 않는다.

## 사용 예시

```bash
node packages/daishin-report-search/src/cli.js --limit 10
GITHUB_TOKEN=... node packages/daishin-report-search/src/cli.js --limit 10
node packages/daishin-report-search/src/cli.js 반도체 --limit 5 --max-inspect 100
node packages/daishin-report-search/src/cli.js --id 20260511082352 --include-explain
```

```js
const { listReports, fetchReport } = require("daishin-report-search")

const latest = await listReports({ limit: 10 })
const semis = await listReports({ query: "반도체", limit: 5, maxInspect: 100 })
const withToken = await listReports({ githubToken: process.env.GITHUB_TOKEN })
const detail = await fetchReport("20260511082352", { includeExplain: true })
```

## 출력 필드

목록 항목은 `id`, `date`, `time`, `timestamp`, `title`, `headings`, `excerpt`, `ratingTargets`, `pageUrl`, `rawUrl`, `apiUrl`, `hasExplain`, `explainUrl`을 포함한다.

상세 조회는 원문 `text`를 추가하고, `includeExplain`이 켜져 있으면 `explain` 객체에 설명 페이지의 `title`, `headings`, `text`, `excerpt`, `pageUrl`을 포함한다.

## 주의 사항

- 투자 판단이나 매매 추천이 아니라 공개 리포트 조회 보조 기능이다.
- GitHub unauthenticated API rate limit, upstream repository 변경, HTML 구조 변경 시 경고나 오류가 반환될 수 있다. 목록 조회의 GitHub tree API가 403/429로 막히면 예외 대신 빈 `items`와 `source.error`/rate-limit metadata를 반환한다.
- API limit을 높여야 할 때는 caller-owned `githubToken`/`githubHeaders` 옵션 또는 CLI 환경변수 `DAISHIN_GITHUB_TOKEN`/`GITHUB_TOKEN`을 사용할 수 있다. 이 값은 GitHub API host(tree discovery와 exact-file fallback)에만 전송되고 raw 원문 URL에는 전송되지 않는다. 기본 동작에는 토큰이나 proxy가 필요 없다.
- 상세 조회는 raw 원문 URL을 먼저 읽고, 실패하면 알려진 timestamp 경로의 GitHub contents API로 fallback한다.
- 검색어가 있으면 최신 파일부터 `maxInspect`개까지 원문을 읽어 매칭하므로 너무 낮게 잡으면 결과가 누락될 수 있다.
