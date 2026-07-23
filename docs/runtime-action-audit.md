# Runtime Action Audit

2026-07-23 기준 top-level `SKILL.md` 122개를 돌쇠 우선 실행 계약으로 전수 검토한 결과다. 이 표는 스킬 선택/분류용이며 실제 portable 계약은 각 `SKILL.md`의 `## Runtime contract (required)` 블록이 담당한다.

## Mode definitions

- **commerce** (13): 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제
- **booking** (18): 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제
- **communication** (7): 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원
- **submission** (11): 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소
- **account** (3): 지원되는 계정 작업 수행 → 비가역 변경 직전 `clarify`
- **hard-boundary** (9): 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행
- **local** (13): 요청 산출물을 로컬에서 실제 생성·변환·정리
- **lookup** (48): 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결

## Complete catalog

| Skill | Mode | Dolshoi completion target |
| --- | --- | --- |
| `assembly-bill-vote-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `biz-health-check` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `bok-ecos-stats` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `building-register-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `bunjang-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `catchtable-sniper` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `cheap-gas-nearby` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `corporate-registration-consulting` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `coupang-product-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `court-auction-notice-search` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `court-payment-order-assistant` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `d2b-notice-search` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `daangn-cars-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `daangn-jobs-search` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `daangn-realty-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `daangn-used-goods-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `daishin-report-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `daiso-product-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `danawa-price-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `delivery-tracking` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `donation-place-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `emergency-room-beds` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `ev-charger-nearby` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `ev-subsidy-status` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `express-bus-booking` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `fine-dust-location` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `flight-ticket-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `foresttrip-vacancy` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `fsc-corporate-info` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `g2b-order-plan-search` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `g2b-sanctioned-supplier` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `gangnamunni-clinic-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `geeknews-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `gongsijiga-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `gov-overseas-trip-report` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `han-river-water-level` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `highway-traffic-status` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `hipass-receipt` | `account` | 지원되는 계정 작업 수행 → 비가역 변경 직전 `clarify` |
| `hola-poke-yeoksam` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `household-waste-info` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `housing-official-price` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `hwp` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `intercity-bus-booking` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `iros-registry-automation` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `job-posting-match` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `jobkorea-talent-search` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `joseon-sillok-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `k-dart` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `k-schoollunch-menu` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `k-skill-cleaner` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `k-skill-setup` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `kakao-bar-nearby` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `kakao-map` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `kakaotalk-mac` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `kbl-results` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `kbo-results` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `keris-academic-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `kleague-results` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `kopis-performance-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `korea-weather` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `korean-character-count` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `korean-cinema-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `korean-heritage-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `korean-holiday-calendar` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `korean-humanizer` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `korean-jangbu-for` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `korean-law-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `korean-marathon-schedule` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `korean-middle-korean` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `korean-patent-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `korean-privacy-terms` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `korean-scholarship-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `korean-slang-writing` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `korean-spell-check` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `korean-stock-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `korean-transit-route` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `kosis-stats` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `kr-whois-lookup` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `kstartup-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `ktx-booking` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `lck-analytics` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `lh-notice-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `library-book-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `local-election-candidate-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `localdata-business-status` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `lotto-results` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `lovebug-report` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `market-kurly-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `mfds-drug-safety` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `mfds-food-safety` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `myrealtrip-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `naming-house` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `national-pension-workplace` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `naver-ad-performance` | `account` | 지원되는 계정 작업 수행 → 비가역 변경 직전 `clarify` |
| `naver-blog-research` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `naver-news-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `naver-shopping-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `nhis-care-checkup-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `nts-business-registration` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `nts-tax-delinquency` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `ohou-today-deal` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `olive-young-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `parking-lot-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `popbill` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `public-restroom-nearby` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `real-estate-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `rhwp-advanced` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `rhwp-edit` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `s2b-notice-search` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `saju-fortune` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `saramin-talent-search` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `seoul-bike` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `seoul-density` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `seoul-subway-arrival` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `sh-notice-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `srt-booking` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `subway-lost-property` | `communication` | 수신자·payload 준비 → draft 입력 → `clarify` 후 실제 전송/지원 |
| `ticket-availability` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `toss-securities` | `account` | 지원되는 계정 작업 수행 → 비가역 변경 직전 `clarify` |
| `used-car-price-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `yebigun-training` | `hard-boundary` | 법률·현장·본인인증·전자서명 경계 직전의 공식 단계까지 수행 |
| `zipcode-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |

## Maintenance

- 새 top-level skill을 추가하면 이 표와 `scripts/skill-docs.test.js`의 전체 개수/액션 목록을 함께 갱신한다.
- mode가 `lookup`이어도 사용자가 downstream action을 명시하면 portable runtime contract에 따라 공식 표면이 지원하는 범위까지 이어간다.
- `hard-boundary`를 단순 read-only와 혼동하지 않는다. 가능한 준비·navigation·prefill은 수행하되 금지/본인행위 경계는 넘지 않는다.
