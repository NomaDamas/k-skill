# 당근부동산 검색 가이드 (`daangn-realty-search`)

당근부동산 공개 웹 데이터 표면을 사용해 지역 기반 부동산 매물 후보를 검색하고, 상세 페이지의 공개 메타를 읽기 전용으로 확인하는 스킬입니다.

## 사용 시나리오

- "당근부동산 합정동 월세 매물 찾아봐"
- "마포구 전세 후보 당근에서 봐줘"
- "이 당근부동산 URL 상세 요약해줘"

## 구현 표면

브라우저 자동화, 로그인, 채팅, 문의, 예약, 계약 자동화를 사용하지 않습니다.

1. 지역 해석: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>`
2. 검색: `https://realty.daangn.com/map/{name1}/{name2}/{name3}[/{용도}][/{거래}][/{거래방식}]`의 TanStack Router SSR 스트림(`<script class="$tsr">`의 `loaderData.articles`와 `dehydratedData.relayRecords`). 스트림이 없으면 구버전 `window.RELAY_STORE`를 fallback으로 읽습니다.
3. 상세: `https://realty.daangn.com/articles/<id>`의 `application/ld+json` 및 `<title>`

구버전 `https://www.daangn.com/kr/realty/?_data=routes/kr.realty._index` 표면은 2026-06 기준 HTTP 204 빈 응답으로 폐기되어 사용하지 않습니다. 2026-11부터 지도 페이지에는 `window.RELAY_STORE`가 없습니다.

SSR 목록은 URL 당 최대 20건이며 인접 동 매물이 섞입니다. 쿼리스트링(`?salesTypes=`)은 목록을 바꾸지 않고, 경로 slug(`/원룸/월세`, `/아파트/전세/직거래`)만 서버 필터로 동작합니다.

## 로컬 실행

```bash
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "합정동" --limit 5
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "합정동" --sales-type "STORE,OFFICETEL" --trade-type "MONTH"
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "가양1동" --sales-type 원룸 --trade-type 월세 --exact-dong
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- detail "https://realty.daangn.com/articles/..."
```

## 지역 필터

지역명은 당근 region API로 `name1/name2/name3`를 해석한 뒤 지도 URL 경로에 넣습니다.

```text
합정동 → 서울특별시 마포구 합정동 → /map/서울특별시/마포구/합정동
가양1동 → (행정동 → 법정동) 가양동 → 서울특별시 강서구 가양동 → /map/서울특별시/강서구/가양동
```

당근부동산 지도는 법정동 단위라서 `가양1동`·`가양제1동`·`등촌1동` 같은 행정동 이름은 법정동으로 바꿔 찾습니다. 같은 동명이 여러 시도에 있으면 앞 단어 힌트(`대전 가양1동`) → 서울특별시 → 정확 일치 순으로 고르고, 다른 후보는 `region_resolution.candidates`로 보여 줍니다.

## 출력 해석

검색 결과는 `salesType`, `area_sqm`, `area_pyeong`, `trades`, `url`, `region`(매물 소재 동), `floor_label`, 상세 보강 시 `title`, `address`를 우선 확인합니다. 가격은 만원 단위이며 `tradePrice`는 매매면 `price_manwon`, 전세·월세·단기·연세면 `deposit_manwon`으로 옮깁니다. 부동산 판단에는 실시간 상태, 보증금/월세, 관리비, 면적, 중개/직거래 여부가 중요하므로 원본 URL을 함께 제시합니다.

## 제한사항

- 당근부동산 지도 SSR 스트림과 `realty.daangn.com` 상세 HTML 구조 변경에 영향을 받습니다.
- 문의, 방문 예약, 계약, 결제, 채팅은 실행하지 않습니다.
- 공고 내용은 실시간 상태와 달라질 수 있어 최종 판단 전 원문 확인이 필요합니다.
