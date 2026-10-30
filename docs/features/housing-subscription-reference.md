# 민영주택 청약가점·예치금 참고 (housing-subscription-reference)

민영주택 일반공급의 청약가점 기준표(무주택기간 32점 + 부양가족수 35점 + 청약통장 가입기간 17점 = 84점)와 지역·전용면적별 청약 예치금 기준을 정적으로 조회하는 read-only 참고 스킬이다. 이슈 [#696](https://github.com/NomaDamas/k-skill/issues/696)에서 제안됐다.

## 값의 출처

값은 「주택공급에 관한 규칙」(국토교통부령, 시행 2026-06-15) 별표 1(가점제 적용기준, 개정 2024-12-18)과 별표 2(민영주택 청약 예치기준금액, 개정 2023-05-10)를 옮긴 정적 참고값이다. 1차 권위는 법제처 국가법령정보센터(law.go.kr)이며, 검토일은 2026-10-30이다. 최신 법령과 입주자모집공고가 항상 우선한다.

스킬에 함께 번들된 참고 파일을 CLI `read`로 읽는다(런타임에 외부 GitHub·개인 저장소·CSV URL에 의존하지 않는다).

- 가점 CSV: `npx -y @nomadamas/k-skill@0 read housing-subscription-reference references/housing_subscription_score.csv`
- 예치금 CSV: `npx -y @nomadamas/k-skill@0 read housing-subscription-reference references/private_housing_deposit.csv`
- 지역·면적 규칙: `npx -y @nomadamas/k-skill@0 read housing-subscription-reference references/region-and-area-rules.md`

## 입력

- score: `category`(`homeless_period`·`dependents`·`subscription_account_period`)와 `condition`(정확한 키). 키 전체 목록은 스킬 지침에 열거돼 있다.
- deposit: `region`(`seoul_busan`·`other_metropolitan`·`other_city_county`)과 `housing_area`(`85sqm_or_less`·`102sqm_or_less`·`135sqm_or_less`·`all_areas`).

## 지역 구분

- `seoul_busan`: 서울특별시, 부산광역시.
- `other_metropolitan`: 그 밖의 광역시 — 인천광역시, 대구광역시, 광주광역시, 대전광역시, 울산광역시(정확히 이 5개).
- `other_city_county`: 특별시 및 광역시를 제외한 지역 — 세종특별자치시, 제주특별자치도, 강원특별자치도, 전북특별자치도 및 도 관할 시·군 등.

구분 기준은 **입주자모집공고일 현재 신청자의 주민등록표상 거주지역**이며, 공급(분양) 사업지 소재지가 아니다.

## 면적 구간과 점수 구간

- 면적: `(0, 85]`, `(85, 102]`, `(102, 135]`, `(135, ∞)`의 반개구간으로 해석한다. 예: 84.9㎡는 85㎡ 이하, 85.01㎡는 102㎡ 이하.
- 점수: 모든 구간이 반개구간 `[이상, 미만)`이다. 무주택기간 10년 = 22점, 청약통장 가입기간 1년 = 3점.

## 계산 예시

- 서울, 85㎡ 이하: 300만원 (`seoul_busan` + `85sqm_or_less`).
- 세종, 84.9㎡: 200만원 (`other_city_county` + `85sqm_or_less`).
- 서울, 85.01㎡: 600만원 (`seoul_busan` + `102sqm_or_less`).
- 무주택 10년 + 부양가족 2명 + 가입 1년: 22 + 15 + 3 = 40점.
- 만 30세 미만 미혼 무주택자(및 유주택자): 무주택기간 0점. 최대 합계: 32 + 35 + 17 = 84점.

## 범위와 주의

정적 참고자료이며, 현재 청약Home 공고·개인 자격 판정·법률 자문이 아니다. 특정 단지의 당첨 커트라인·경쟁률·당첨 확률과 국민주택(공공주택) 청약은 이 스킬의 범위가 아니다. 실제 청약은 항상 최신 입주자모집공고문과 청약Home, 최신 「주택공급에 관한 규칙」을 확인한다.
