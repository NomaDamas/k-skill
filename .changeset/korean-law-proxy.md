---
"k-skill-proxy": minor
---

Add hosted `korean-law` proxy routes (`/v1/korean-law/search`, `/v1/korean-law/detail`) that wrap the official 법제처 (open.law.go.kr) DRF `lawSearch.do`/`lawService.do` endpoints. The proxy injects the operator `LAW_OC` plus a browser `User-Agent`/`Referer` (the actual cause of upstream "사용자 정보 검증 실패" rejections) and retries empty/HTML maintenance responses, so the `korean-law-search` skill becomes proxy-first with no per-user key. Drops the unstable Beopmang fallback from the documented surface.
