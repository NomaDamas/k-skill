# court-auction-notice-search

## 0.2.1

### Patch Changes

- d7aca1b: Fix sale notice search to post the court site month key (`YYYYMM`) and filter exact-day requests locally; normalize the current nested notice-detail response shape and HTML-formatted prices.

## 0.2.0

### Minor Changes

- d11c7d3: Add the initial `court-auction-notice-search` package and matching skill. Browses 대법원경매정보(`courtauction.go.kr`) 부동산 매각공고 by 매각기일·법원·기일/기간 입찰, expands each notice into 사건번호·용도·주소·감정평가액·최저매각가, and looks up an auction case directly by 법원+사건번호. Direct HTTP transport with optional Playwright fallback, conservative ≥2s throttle and 10-call session budget, and an immediate `BLOCKED` throw when the site returns `data.ipcheck === false`.

## 0.1.0

### Minor Changes

- Initial release. Workflow A (매각공고 목록 + 상세 펼치기) and Workflow B (사건번호 직조회) plus 법원사무소 + 입찰구분 코드테이블. 2-tier transport (direct HTTP first, optional Playwright fallback via `rebrowser-playwright`/`playwright-core`), aggressive throttling (≥2s jitter, 10-call session budget), and `BLOCKED` error on `data.ipcheck === false`. Workflow C (자유 조건검색), Workflow D (일별/월별 캘린더), 매각물건 사진/PDF, 동산 경매는 follow-up 이슈로 분리.
