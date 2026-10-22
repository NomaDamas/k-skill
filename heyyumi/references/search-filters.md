# HeyYumi search filters

`search`/`nearby`의 플래그는 API 쿼리 파라미터의 kebab-case다(`--region-code` → `region_code`). 값은 `GET https://api.heyyumi.ai/api/v1/meta`가 돌려주는 어휘를 따른다. 자연어 값(회식, 혼밥, 조용한, 바다뷰 등)도 서버가 해석한다.

| 플래그 | 설명 |
| --- | --- |
| `--keyword` | 상호·주소·메뉴 부분검색. 영문 상호와 외국어 요리명도 가능 |
| `--region-code`, `--business-category`, `--subtype` | 지역/업종/세부업종 |
| `--reservable true`, `--reservation-channel yumi\|phone` | 예약 가능 매장만 / 예약 경로. 예약 가능은 "그 시각에 자리 있음"이 아니다 |
| `--open-at` | 한국시간. `2026-12-01T19:00`, `19:00`, `now`, `lunch`, `dinner`, `11:00-14:00`. 영업시간 미확인 매장은 기본 제외(`--include-unknown-hours true`로 포함) |
| `--recommended-for` | solo_dining, date, group_dining, family, business_meeting, formal_gathering, late_night |
| `--atmosphere` | quiet, lively, view, cozy, trendy, spacious, traditional, clean, work_study, rainy_mood |
| `--parking true`, `--parking-type` | onsite, valet, partner, nearby, none |
| `--dietary`, `--serves` | vegan_options, vegetarian_options, fully_vegan, gluten_free / coffee, alcohol, dessert |
| `--foreign-languages`, `--foreigner-friendly` | en, zh, ja, es, de, fr 응대 / 외국어 메뉴·응대 |
| `--max-dish-price` | 원 단위 최저 메뉴 가격 상한 |
| `--min-confidence` | 0~1 |
| `--page`, `--page-size` | 페이지(최대 100). 요금에 영향 없음, 플랜별 결과창 한도 있음 |
| `--fields` | `core`(1)·`contact_hours`(2)·`quality`(2)·`edge`(4)·`media`(8) 토큰 등급 또는 개별 필드명 |
