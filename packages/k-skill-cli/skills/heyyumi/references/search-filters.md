# HeyYumi search filters

`search`/`nearby`는 MCP 도구 `search_places`/`nearby_places`의 인자로 변환된다. 전용 플래그의 kebab-case가 도구 인자명이다(`--region-code` → `region_code`). 전용 플래그가 없는 불리언 presence 필터(`wifi`, `pet_friendly`, `private_room`, `outdoor_seating`, `kids_friendly`, `group_friendly`, `corkage_free` 등)는 `--filter key=true`를 반복해 넘긴다. 자연어 값(회식, 혼밥, 조용한, 바다뷰 등)도 서버가 해석한다.

| 플래그 | 설명 |
| --- | --- |
| `--keyword` | 상호·주소·메뉴 부분검색. **특정 매장을 찾을 때는 매장 이름만 `--keyword`에 넣고 `--business-category`는 붙이지 않는다**(카페/바를 잘못된 버킷으로 걸러내 0건이 될 수 있음) |
| `--region-code`, `--region-name`, `--business-category restaurant\|cafe\|bar`, `--subtype` | 지역/업종/세부업종 |
| `--reservable true`, `--reservation-channel yumi\|external\|phone` | 예약 가능 매장만 / 예약 경로. 예약 가능은 "그 시각에 자리 있음"이 아니다 |
| `--open-at` | 한국시간. `2026-12-01T19:00`, `19:00`, `now`, `lunch`, `dinner`, `11:00-14:00`. 영업시간 미확인 매장은 기본 제외(`--include-unknown-hours true`로 포함) |
| `--recommended-for` | solo_dining, date, group_dining, family, business_meeting, formal_gathering, late_night |
| `--atmosphere` | quiet, lively, view, cozy, trendy, spacious, traditional, clean, work_study, rainy_mood |
| `--view` | ocean, sunset, river, mountain, night, city, garden |
| `--parking true`, `--parking-type` | onsite, valet, partner, nearby, none |
| `--dietary`, `--serves` | vegan_options, vegetarian_options, fully_vegan, gluten_free / coffee, alcohol, dessert |
| `--foreign-languages` | en, zh, ja, es, de, fr 응대 |
| `--min-confidence` | 0~1 |
| `--page`, `--page-size` | 페이지(최대 100) |
| `--fields` | `core`·`contact_hours`·`quality`·`edge`·`media`·`all` 또는 개별 필드명. 생략하면 서버 기본값 |
| `nearby`: `--lat --lng --radius`(m) `--sort distance\|discovery` | 좌표 주변. 좌표는 `regions`의 center를 쓴다 |

MCP 도구에는 REST의 `--max-dish-price`, `--foreigner-friendly`가 없다. 전체 어휘는 도구 스키마(`tools/list`)가 기준이다.
