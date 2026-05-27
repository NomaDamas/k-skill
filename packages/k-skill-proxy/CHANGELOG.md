# k-skill-proxy

## 0.5.0

### Minor Changes

- 01cd887: Add `/v1/kstartup/{business-info,announcements,contents,statistics}` routes that wrap the data.go.kr `15125364` (창업진흥원\_K-Startup) Open API. The routes inject `DATA_GO_KR_API_KEY` server-side, return 503 when the key (or the per-dataset 활용신청) is missing, and cache successful JSON responses while bypassing the cache for upstream error envelopes (`resultCode != "00"`).

## 0.4.0

### Minor Changes

- 271ea18: Add `/v1/kstartup/{business-info,announcements,contents,statistics}` routes that wrap the data.go.kr `15125364` (창업진흥원\_K-Startup) Open API. The routes inject `DATA_GO_KR_API_KEY` server-side, return 503 when the key (or the per-dataset 활용신청) is missing, and cache successful JSON responses while bypassing the cache for upstream error envelopes (`resultCode != "00"`).

## 0.3.0

### Minor Changes

- 315dbbb: Add `/v1/seoul-density/citydata` route that proxies the Seoul Open Data realtime hotspot crowd-level API (`citydata_ppltn`) using the server-side `SEOUL_OPEN_API_KEY`.

### Patch Changes

- cd3366a: Add National Tax Service business registration status and authenticity proxy routes.

## 0.2.1

### Patch Changes

- 2ff51db: refactor: remove realtyprice route (moved to standalone gongsijiga-search package)

## 0.2.0

### Minor Changes

- 4fc0139: Add `/v1/lh-notice/search` and `/v1/lh-notice/detail` routes plus matching `lh-notice-search` skill. Proxies the official LH 청약 (Korea Land & Housing Corporation lease/subscription) notice API on `apis.data.go.kr/B552555/lhLeaseNoticeInfo1/*`, reuses the existing `DATA_GO_KR_API_KEY`, and keeps the user-facing credential surface empty ("불필요"). Handles the LH-specific `[CMN, dsList]` JSON envelope plus the standard data.go.kr XML auth-error envelope, does not cache upstream failures, and exposes `lhNoticeConfigured` on `/health`. Closes #145.
- 4fc0139: Add `/v1/naver-news/search` route plus matching `naver-news-search` skill. Proxies the official Naver Search Open API news endpoint (`openapi.naver.com/v1/search/news.json`), reuses the existing `NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET` credentials, and keeps the user-facing credential surface empty ("불필요"). Strips `<b>` highlight tags and decodes HTML entities in titles/descriptions, parses RFC822 `pubDate` into ISO-8601, deduplicates results by canonicalized `link` (query-param order, trailing slash, host casing and fragments are ignored; different paths or query values are preserved), caches successes for 5 minutes (failures are not cached), and exposes `naverNewsApiConfigured` on `/health`. The route rejects `start + display - 1 > 1000` with a `400 bad_request` preflight before calling upstream, so requests outside Naver's 1000-item search window fail fast with a clear message instead of returning empty results. Closes #143.
