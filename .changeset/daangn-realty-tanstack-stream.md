---
"@nomadamas/k-skill": patch
---

`daangn-realty-search`가 2026-11 당근부동산 지도 페이지의 TanStack Router SSR 스트림(`$tsr`)에서 매물을 다시 읽습니다(구 `window.RELAY_STORE`는 fallback). `tradePrice`를 거래유형별 보증금·매매가로 매핑하고, 용도·거래·직거래 필터를 경로 slug로 서버에 넘기며, `가양1동`·`등촌1동` 같은 행정동 이름을 법정동으로 바꿔 서울 우선으로 해석합니다.
