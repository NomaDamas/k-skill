---
"court-auction-notice-search": minor
---

Add Workflow C property free-condition search via `searchProperties()` (`POST /pgj/pgjsearch/searchControllerMain.on`).

The request body matches the canonical PGJ151M01 submission captured from a real browser session — numeric `pageNo`/`pageSize`/`statNum`, full `dma_pageInfo` shape, and the upstream-correct field names (`mvprpArtclKndCd`/`mvprpAtchmPlcTypCd`, not the previously-guessed `mvprpArtclKnd`/`mvrpDspslPlcTyp`).

The static usage/region codetables come from upstream discovery captures: 4 대분류 (`10000=토지`, `20000=건물`, `30000=차량및운송장비`, `40000=기타`) plus representative mid/small classes; 19 시도 with their official codes. Sigungu/dong cascade XHRs are not reliable so callers pass raw codes (e.g. `"11680"`) directly.

`searchProperties()` automatically falls back to the Playwright client when the direct HTTP call returns `BLOCKED` or `UPSTREAM_ERROR` 400 (the WAF blocks bursty raw HTTP). Disable with `{ fallback: false }`.

Other fixes:
- `resolveUsageCode(name, level)` now refuses to silently return a wrong-level code for ambiguous names (e.g. `"아파트"` exists at multiple levels) — returns the input unchanged so the upstream rejects it instead of producing a wrong query.
- `resolveRegionCodes({})` no longer accidentally maps "no region" to the first row's sido.
- `flbdCount` is integer-only; `pageSize` is capped at 100 to avoid overloading the upstream.
- Endpoint-aware HTTP/Playwright warmup (`PGJ151F00` for property search instead of `PGJ143M01`).
- CLI `search` accepts `--region 시도:시군구:읍면동` and `--usage 대:중:소` colon shorthand alongside the existing split flags.
