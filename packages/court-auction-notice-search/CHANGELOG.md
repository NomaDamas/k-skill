# court-auction-notice-search

## 0.3.3

### Patch Changes

- aac715a: Add KISA WHOIS IP and AS lookups, and prefer Aside Browser first for automatic browser selection on macOS.
- Updated dependencies [aac715a]
  - k-skill-browser-runtime@0.4.0

## 0.3.2

### Patch Changes

- 701b6f1: Add KISA WHOIS IP and AS lookups, and prefer Aside Browser first for automatic browser selection on macOS.
- Updated dependencies [701b6f1]
  - k-skill-browser-runtime@0.3.0

## 0.3.1

### Patch Changes

- 1d2e5d6: Add the shared browser runtime, migrate the court and Hi-Pass browser integrations, prefer Aside Browser before Chrome CDP fallback, and fix live yebigun, S2B, and D2B flows.
- Updated dependencies [1d2e5d6]
- Updated dependencies [1d2e5d6]
  - k-skill-browser-runtime@0.2.0

## 0.3.0

### Minor Changes

- f527515: Add Workflow C property free-condition search via `searchProperties()` (`POST /pgj/pgjsearch/searchControllerMain.on`).

  The request body matches the canonical PGJ151M01 submission captured from a real browser session — numeric `pageNo`/`pageSize`/`statNum`, full `dma_pageInfo` shape, and the upstream-correct field names (`mvprpArtclKndCd`/`mvprpAtchmPlcTypCd`, not the previously-guessed `mvprpArtclKnd`/`mvrpDspslPlcTyp`).

  The static usage/region codetables come from upstream discovery captures: 4 대분류 (`10000=토지`, `20000=건물`, `30000=차량및운송장비`, `40000=기타`) plus representative mid/small classes; 19 시도 with their official codes. Sigungu/dong cascade XHRs are not reliable so callers pass raw codes (e.g. `"11680"`) directly.

  `searchProperties()` automatically falls back to the Playwright client only for WAF-style raw HTTP `UPSTREAM_ERROR` 400 responses. Confirmed `BLOCKED` / `ipcheck=false` responses stop by default to avoid extending an IP block; retrying that condition requires explicit `fallbackOnBlocked:true`. Disable fallback entirely with `{ fallback: false }`.

  Other fixes:

  - `resolveUsageCode(name, level)` now refuses to silently return a wrong-level code for ambiguous names (e.g. `"아파트"` exists at multiple levels) — returns the input unchanged so the upstream rejects it instead of producing a wrong query.
  - `resolveRegionCodes({})` no longer accidentally maps "no region" to the first row's sido.
  - `flbdCount` is integer-only; `pageSize` is restricted to the observed PGJ151 dropdown values `10`/`20`/`50`/`100` to avoid unsupported upstream requests.
  - Endpoint-aware HTTP/Playwright warmup (`PGJ151F00` for property search instead of `PGJ143M01`).
  - CLI `search` accepts `--region 시도:시군구:읍면동` and `--usage 대:중:소` colon shorthand alongside the existing split flags.

### Patch Changes

- a25d641: Fix sale notice search to post the court site month key (`YYYYMM`) and filter exact-day requests locally; normalize the current nested notice-detail response shape and HTML-formatted prices.

## 0.2.0

### Minor Changes

- d11c7d3: Add the initial `court-auction-notice-search` package and matching skill. Browses 대법원경매정보(`courtauction.go.kr`) 부동산 매각공고 by 매각기일·법원·기일/기간 입찰, expands each notice into 사건번호·용도·주소·감정평가액·최저매각가, and looks up an auction case directly by 법원+사건번호. Direct HTTP transport with optional Playwright fallback, conservative ≥2s throttle and 10-call session budget, and an immediate `BLOCKED` throw when the site returns `data.ipcheck === false`.

## 0.1.0

### Minor Changes

- Initial release. Workflow A (매각공고 목록 + 상세 펼치기) and Workflow B (사건번호 직조회) plus 법원사무소 + 입찰구분 코드테이블. 2-tier transport (direct HTTP first, optional Playwright fallback via `rebrowser-playwright`/`playwright-core`), aggressive throttling (≥2s jitter, 10-call session budget), and `BLOCKED` error on `data.ipcheck === false`. Workflow C (자유 조건검색), Workflow D (일별/월별 캘린더), 매각물건 사진/PDF, 동산 경매는 follow-up 이슈로 분리.
