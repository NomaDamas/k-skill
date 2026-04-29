# court-auction-notice-search

## 0.1.0

### Minor Changes

- Initial release. Workflow A (매각공고 목록 + 상세 펼치기) and Workflow B (사건번호 직조회) plus 법원사무소 + 입찰구분 코드테이블. 2-tier transport (direct HTTP first, optional Playwright fallback via `rebrowser-playwright`/`playwright-core`), aggressive throttling (≥2s jitter, 10-call session budget), and `BLOCKED` error on `data.ipcheck === false`. Workflow C (자유 조건검색), Workflow D (일별/월별 캘린더), 매각물건 사진/PDF, 동산 경매는 follow-up 이슈로 분리.
