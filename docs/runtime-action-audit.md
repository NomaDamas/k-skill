# Runtime Action Audit

2026-07-23 기준 top-level `SKILL.md` 122개를 돌쇠 우선 실행 계약으로 전수 검토한 결과다. 이 표는 스킬 선택/분류용이며 실제 portable 계약은 각 `SKILL.md`의 `## Runtime contract (required)` 블록이 담당한다.

## Mode definitions

- **commerce** (13): 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제
- **booking** (17): 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제
- **submission** (12): 공식 폼·첨부 준비 → `clarify` 후 제출/지원/결제/취소
- **recruiting** (2): 기업 인재검색 → shortlist → 유료 열람/제안 직전 `clarify`
- **account** (3): 지원되는 계정 작업 수행 → 비가역 변경 직전 `clarify`
- **legal** (8): 공식 법률·정부 표면의 로그인/인증/서류 준비를 진행하고 `clarify` 후 제출·입찰·수수료 결제
- **operations** (1): k-skill 설치·업데이트·복구·런타임 연결을 실제 적용하고 검증
- **local** (12): 요청 산출물을 로컬에서 실제 생성·변환·정리
- **lookup** (54): 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결

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
| `corporate-registration-consulting` | `legal` | 공식 법률 표면에서 로그인·서류 준비를 진행하고 `clarify` 후 허용된 제출·수수료 결제 |
| `coupang-product-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `court-auction-notice-search` | `legal` | 공식 법원 표면에서 로그인·물건 검토·입찰 준비를 진행하고 `clarify` 후 허용된 법적 액션 |
| `court-payment-order-assistant` | `legal` | 공식 전자소송 표면에서 로그인·서류 준비를 진행하고 `clarify` 후 허용된 제출·수수료 결제 |
| `d2b-notice-search` | `legal` | 공식 조달 표면에서 로그인·공고/서류 준비를 진행하고 `clarify` 후 허용된 제출 |
| `daangn-cars-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `daangn-jobs-search` | `submission` | 공식 계정 표면에서 지원서를 준비하고 `clarify` 후 제출 |
| `daangn-realty-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `daangn-used-goods-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `daishin-report-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `daiso-product-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `danawa-price-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `delivery-tracking` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `donation-place-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `emergency-room-beds` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `ev-charger-nearby` | `lookup` | 충전소 위치·충전기 유형·현재 상태 조회 완료 |
| `ev-subsidy-status` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `express-bus-booking` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `fine-dust-location` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `flight-ticket-search` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `foresttrip-vacancy` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `fsc-corporate-info` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `g2b-order-plan-search` | `legal` | 공식 조달 표면에서 로그인·공고/서류 준비를 진행하고 `clarify` 후 허용된 제출 |
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
| `iros-registry-automation` | `legal` | 공식 등기 표면에서 로그인·서류 준비를 진행하고 `clarify` 후 허용된 신청·수수료 결제 |
| `job-posting-match` | `lookup` | 공개 채용공고를 검색하고 이력서 기반 적합도·지원 전략을 정리 |
| `jobkorea-talent-search` | `recruiting` | 후보 shortlist를 만들고 `clarify` 후 유료 열람·연락처 공개·제안 전송 |
| `joseon-sillok-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `k-dart` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `k-schoollunch-menu` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `k-skill-cleaner` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `k-skill-setup` | `operations` | 설치·업데이트·복구·브라우저/프록시/vault 연결을 적용하고 검증 |
| `kakao-bar-nearby` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `kakao-map` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `kakaotalk-mac` | `lookup` | 로컬 카카오톡 아카이브 동기화·검색·chunk 조회 완료 |
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
| `kr-whois-lookup` | `lookup` | 공개 WHOIS 등록정보 조회 완료 |
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
| `nhis-care-checkup-search` | `lookup` | 장기요양기관·건강검진기관 후보와 공개 정보를 조회 |
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
| `s2b-notice-search` | `legal` | 공식 학교장터 표면에서 로그인·공고/서류 준비를 진행하고 `clarify` 후 허용된 제출 |
| `saju-fortune` | `local` | 요청 산출물을 로컬에서 실제 생성·변환·정리 |
| `saramin-talent-search` | `recruiting` | 후보 shortlist를 만들고 `clarify` 후 유료 열람·연락처 공개·제안 전송 |
| `seoul-bike` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `seoul-density` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `seoul-subway-arrival` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |
| `sh-notice-search` | `submission` | 공식 폼·첨부 준비 → `clarify` 후 제출/결제/취소 |
| `srt-booking` | `booking` | 공식 일정/좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `subway-lost-property` | `lookup` | LOST112·운영기관 공식 표면의 검색 조건과 결과를 정리 |
| `ticket-availability` | `booking` | 공식 일정·좌석 선택 → 예약·선점 → `clarify` 후 필요한 결제 |
| `toss-securities` | `account` | 지원되는 계정 작업 수행 → 비가역 변경 직전 `clarify` |
| `used-car-price-search` | `commerce` | 공식 상품 선택 → 장바구니/checkout 준비 → `clarify` 후 주문·결제 |
| `yebigun-training` | `legal` | 공식 예비군 표면에서 로그인·일정 확인·신청 준비를 진행하고 `clarify` 후 허용된 신청 |
| `zipcode-search` | `lookup` | 요청한 조회를 완료하고, 별도 후속 행동 요청 시 지원되는 공식 표면으로 연결 |

## Commerce capability gaps

`commerce`는 검색 결과나 딥링크에서 끝나는 유형이 아니다. 돌쇠에서는 공식
상품/매물 상태를 재확인하고, 필요한 경우 CloakBrowser와 vault-backed login을
사용해 장바구니·문의·예약·checkout을 준비하며, 결제·계약·메시지 전송 직전
`clarify` 승인을 받아야 한다.

현재 이 실행 경로가 완성되지 않은 스킬은 다음 이슈에서 추적한다.

| Skill | Expansion issue |
|---|---|
| `daangn-cars-search` | [#450](https://github.com/NomaDamas/k-skill/issues/450) |
| `daangn-realty-search` | [#453](https://github.com/NomaDamas/k-skill/issues/453) |
| `daangn-used-goods-search` | [#445](https://github.com/NomaDamas/k-skill/issues/445) |
| `daiso-product-search` | [#452](https://github.com/NomaDamas/k-skill/issues/452) |
| `danawa-price-search` | [#446](https://github.com/NomaDamas/k-skill/issues/446) |
| `hola-poke-yeoksam` | [#447](https://github.com/NomaDamas/k-skill/issues/447) |
| `market-kurly-search` | [#454](https://github.com/NomaDamas/k-skill/issues/454) |
| `ohou-today-deal` | [#448](https://github.com/NomaDamas/k-skill/issues/448) |
| `olive-young-search` | [#449](https://github.com/NomaDamas/k-skill/issues/449) |
| `used-car-price-search` | [#451](https://github.com/NomaDamas/k-skill/issues/451) |

이슈가 완료되기 전에는 해당 스킬의 현재 조회/링크 기능을 실제 구매 완료로
과장하지 않는다. 공식 표면이 후속 거래를 지원하지 않는 것으로 확인되면
`commerce` 대신 `lookup`, `submission`, 또는 다른 실제 capability profile로
재분류한다.

## Maintenance

- 새 top-level skill을 추가하면 이 표와 `scripts/skill-docs.test.js`의 전체 개수/액션 목록을 함께 갱신한다.
- mode가 `lookup`이어도 사용자가 downstream action을 명시하면 portable runtime contract에 따라 공식 표면이 지원하는 범위까지 이어간다.
- `legal`은 단순 read-only가 아니다. 공식 표면의 로그인·인증·서류 준비·prefill을 진행하고, 법적 효과 직전 `clarify` 승인을 받는다. CAPTCHA나 보안 통제는 우회하지 않는다.
