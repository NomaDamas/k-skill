---
"k-skill-proxy": minor
---

Add `/v1/lh-notice/search` and `/v1/lh-notice/detail` routes plus matching `lh-notice-search` skill. Proxies the official LH 청약 (Korea Land & Housing Corporation lease/subscription) notice API on `apis.data.go.kr/B552555/lhLeaseNoticeInfo1/*`, reuses the existing `DATA_GO_KR_API_KEY`, and keeps the user-facing credential surface empty ("불필요"). Handles the LH-specific `[CMN, dsList]` JSON envelope plus the standard data.go.kr XML auth-error envelope, does not cache upstream failures, and exposes `lhNoticeConfigured` on `/health`. Closes #145.
