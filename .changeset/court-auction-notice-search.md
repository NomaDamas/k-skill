---
"court-auction-notice-search": minor
---

Add the initial `court-auction-notice-search` package and matching skill. Browses 대법원경매정보(`courtauction.go.kr`) 부동산 매각공고 by 매각기일·법원·기일/기간 입찰, expands each notice into 사건번호·용도·주소·감정평가액·최저매각가, and looks up an auction case directly by 법원+사건번호. Direct HTTP transport with optional Playwright fallback, conservative ≥2s throttle and 10-call session budget, and an immediate `BLOCKED` throw when the site returns `data.ipcheck === false`.
