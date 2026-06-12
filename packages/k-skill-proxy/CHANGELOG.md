# k-skill-proxy

## 0.7.0

### Minor Changes

- 66f12cb: Add hosted `korean-law` proxy routes (`/v1/korean-law/search`, `/v1/korean-law/detail`) that wrap the official 법제처 (open.law.go.kr) DRF `lawSearch.do`/`lawService.do` endpoints. The proxy injects the operator `LAW_OC` plus a browser `User-Agent`/`Referer` (the actual cause of upstream "사용자 정보 검증 실패" rejections) and retries empty/HTML maintenance responses, so the `korean-law-search` skill becomes proxy-first with no per-user key. Drops the unstable Beopmang fallback from the documented surface.

## 0.6.1

### Patch Changes

- Archive unsupported Naver Map and Blue Ribbon proxy support. The proxy no longer registers `/v1/naver-map/*` or `/v1/blue-ribbon/nearby`, and the unsupported skill/package code is preserved under `legacy/` for a future revival if operational blockers are resolved.

## 0.6.0

### Minor Changes

- 6d49a28: Add Kakao Map proxy routes (keyword search, category search, coord2address, coord2region, Kakao Mobility car directions) used by the new kakao-map skill (issue #267). All routes inject server-side KAKAO_REST_API_KEY and never forward caller-supplied apiKey query params.
- ff2aa91: Add NAVER Cloud Platform Maps directions, geocoding, and reverse-geocoding proxy routes used by the new naver-map-route skill (issue #268). Routes inject server-side NAVER_MAP_CLIENT_ID/SECRET and return 503 when the upstream key is missing.
- 540e80b: Add `/v1/kstartup/{business-info,announcements,contents,statistics}` routes that wrap the data.go.kr `15125364` (창업진흥원\_K-Startup) Open API. The routes inject `DATA_GO_KR_API_KEY` server-side, return 503 when the key (or the per-dataset 활용신청) is missing, and cache successful JSON responses while bypassing the cache for upstream error envelopes (`resultCode != "00"`).
- e6d7072: Add Seoul Bike realtime, station master, and nearby lookup proxy routes.

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
