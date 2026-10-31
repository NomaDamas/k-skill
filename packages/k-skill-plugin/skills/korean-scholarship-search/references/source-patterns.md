# Scholarship Source Patterns

한국 장학금 검색은 항상 **공식 공고 우선** 이다.

## 1. Source priority

1. 한국장학재단 (`kosaf.go.kr`)
2. 대학 공식 장학/학사/학생지원 공지 (`*.ac.kr`)
3. 지자체/공공기관 (`*.go.kr`, `*.or.kr`)
4. 재단/기업 공식 공고
5. 비공식 모음글은 lead source 로만 사용

## 2. Search query templates

다음 쿼리를 현재 날짜 기준으로 조합한다. 추가 키워드 단서는 `search-clues.md` 를 같이 본다.

- `site:kosaf.go.kr 장학금 {키워드}`
- `site:kosaf.go.kr 푸른등대 {키워드}`
- `site:*.ac.kr 장학 공고 {학교명}`
- `site:*.ac.kr 장학생 모집 {학교명} {전공}`
- `site:*.or.kr 장학생 선발 {키워드}`
- `site:*.go.kr 장학금 공고 {지역명}`
- `site:{재단도메인} 장학생 모집`

특정 학교 완전 탐색이 필요하면 `school-discovery.md` 절차를 같이 따른다.

## 3. What to extract from each notice

- 장학금명
- 운영기관명
- 기관 유형
- 공고일 / 신청 시작일 / 마감일
- 지원 금액 / 등록금형 / 생활비형 / 혼합형
- 지원 대상: 학교, 학부/대학원, 학년, 전공, 지역
- 성적 조건
- 학자금 지원구간 조건
- 제출서류
- 신청 방식
- 공식 공고 링크
- 공식 신청 링크

## 4. Organization type normalization

- `school`: 대학/대학원/고교 교내 장학
- `foundation`: 민간재단, 복지재단, 교육재단
- `government`: 중앙정부/공공기관
- `local-government`: 광역·기초지자체
- `company`: 기업/기업재단/CSR
- `other`: 위 분류가 애매한 경우

## 5. Eligibility normalization

가능하면 아래 필드로 구조화한다.

- `student_levels`: `highschool`, `undergraduate`, `graduate`, `all`
- `school_kinds`: `highschool`, `college`, `university`, `graduate-school`
- `grade_years`: 숫자 배열
- `majors`: 문자열 배열
- `gpa_min`: 4.5 또는 100점 기준이 섞여 있으면 원문도 같이 남긴다
- `income_band_min`, `income_band_max`
- `notes`: 구조화가 애매한 자격 조건

## 6. Verification rule

- 비공식 요약 페이지는 링크 탐색용으로만 본다.
- 최종 결과에는 공식 공고 링크를 반드시 포함한다.
- 공고 날짜가 오래됐으면 최신 회차/학기 공고를 다시 찾는다.
