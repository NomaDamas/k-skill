# Korean Housing Subscription Reference

## What this skill does
민영주택 일반공급의 청약가점 항목별 기준표(총 84점)와 지역·전용면적별 청약통장 예치금 기준을 공개된 버전 관리 데이터로 조회한다. 실시간 공고 검색이나 개인별 청약 자격 판정은 하지 않는다.

## When to use
- "청약가점 84점은 어떻게 나뉘어?"
- "서울 전용 85㎡ 이하 예치금은?"
- "부산과 다른 광역시의 예치금 차이는?"
- "무주택기간 10년의 기준점수는?"

## Source and access
No API key, proxy, login, or scraping required. Read the public CSV files directly:
- Score CSV: https://raw.githubusercontent.com/cheer710815-hub/apttosell-subscription-data/main/housing_subscription_score_2026.csv
- Deposit CSV: https://raw.githubusercontent.com/cheer710815-hub/apttosell-subscription-data/main/private_housing_deposit_2026.csv
- Canonical dataset: https://apttosell.com/housing-subscription-data/
- Score methodology: https://apttosell.com/cheongyak-score-data/
- Deposit methodology: https://apttosell.com/private-housing-deposit-data/
- DOI: https://doi.org/10.5281/zenodo.22842058
- Data license: CC BY 4.0; cite AptToSell and the canonical dataset page when reusing values.

Read the two raw CSV URLs with an HTTP client and parse CSV headers. If raw GitHub is unavailable, use the GitHub file viewer (https://github.com/cheer710815-hub/apttosell-subscription-data/blob/main/housing_subscription_score_2026.csv and https://github.com/cheer710815-hub/apttosell-subscription-data/blob/main/private_housing_deposit_2026.csv). If both fail, report unavailable; never invent or silently substitute values.

## Inputs
- `topic`: `score` or `deposit`
- `category` (score): `homeless_period`, `dependents`, or `subscription_account_period`
- `condition` (score): exact condition key from CSV; ask for clarification if ambiguous
- `region` (deposit): `seoul_busan`, `other_metropolitan`, `other_city_county`
- `housing_area` (deposit): `85sqm_or_less`, `102sqm_or_less`, `135sqm_or_less`, `all_areas`

## Score reference (checked 2026-09-18)
- 무주택기간: 0–32점. 1년 미만 2점, 1–2년 4점, 이후 1년마다 2점 증가, 15년 이상 32점. 해당 기간 없음 0점.
- 부양가족: 0명 5점, 1명 10점, 2명 15점, 3명 20점, 4명 25점, 5명 30점, 6명 이상 35점.
- 청약통장 가입기간: 6개월 미만 1점, 6개월–1년 2점, 1–2년 3점, 이후 1년마다 1점 증가, 15년 이상 17점.
- 최대 합계: 32 + 35 + 17 = 84점. 배우자 가입기간 합산은 별도 조건이 있으며 가입기간 항목 최대 17점을 초과할 수 없다.

## Deposit reference (checked 2026-09-25)
All amounts below are **만원 (KRW 10,000)**, not won. The area column represents the desired subscription area category; use the smallest qualifying threshold.

| 전용면적 기준 | 서울·부산 | 기타 광역시 | 기타 시·군 |
|---|---:|---:|---:|
| 85㎡ 이하 | 300 | 250 | 200 |
| 102㎡ 이하 | 600 | 400 | 300 |
| 135㎡ 이하 | 1000 | 700 | 400 |
| 모든 면적 | 1500 | 1000 | 500 |

기준 근거: 「주택공급에 관한 규칙」 별표 2. 지역은 공급 지역이 아닌 신청자의 주민등록상 거주 지역을 기준으로 판단해야 하므로 사용자 질문에 지역이 모호하면 먼저 확인한다.

## Workflow
1. Classify request as score/deposit, extract category and condition or region and area.
2. Read the relevant CSV; verify its header (`category,condition,score,base_date,canonical_source` or `housing_area,seoul_busan,other_metropolitan,other_city_county,unit,source_basis,checked_date`).
3. Match exact row and return the recorded value with unit, checked date, source link, and any relevant caveat.
4. For comparison questions, return the relevant rows/columns without inferring eligibility.
5. If user asks about an actual complex or current application, consult the latest official 입주자모집공고, 청약Home and applicable regulations separately.

## Failure modes
- Source inaccessible, empty, changed schema or invalid numeric field: report data unavailable and give source URL; do not hallucinate.
- Missing/ambiguous region, area, period or dependent count: request clarification.
- Dataset date differs from current law or announcement: explain the dataset is a dated reference and official latest rules take precedence.
- A request for actual eligibility, lottery odds or winning score: out of scope; do not claim this reference determines outcomes.

## Done when
- Returned the exact row/threshold with correct units and reference date.
- Clearly distinguished static reference from latest official announcements and individual eligibility.
- Attributed AptToSell (CC BY 4.0).
