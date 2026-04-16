---
name: korean-scholarship-search
description: Search Korean scholarship announcements across official KOSAF, university, foundation, company, and public-sector sources, extract amount and eligibility, and filter results by school, income band, student level, and organization type. Users may invoke it with the phrase 장학금 검색 및 조회.
license: MIT
metadata:
  category: education
  locale: ko-KR
  phase: v1
---

# 장학금 검색 및 조회

사용자에게는 `장학금 검색 및 조회` 라는 이름으로 안내하고, skill slug는 `korean-scholarship-search` 이다.

## What this skill does

한국장학재단, 대학, 재단, 기업, 지자체/공공기관의 **공식 장학 공고**를 최신 기준으로 검색하고 아래 항목을 정리한다.

이 스킬은 **공식 공고 우선** 이다.

- 장학금명
- 운영기관명 / 기관 유형 (`school`, `foundation`, `government`, `company`, `local-government`, `other`)
- 지원 금액 / 등록금·생활비 구분
- 신청 기간
- 지원 조건 / 지원 자격
- 학자금 지원구간(소득구간) 조건
- 공식 공고 링크 / 신청 링크

특정 학교가 주어지면 그 학교의 본부, 학생지원처, 단과대, 학과/전공, 대학원 공지를 전수 탐색하려고 시도한다. 학교가 주어지지 않으면 `*.ac.kr` 전체를 기준으로 전국 대학 장학 공고를 넓게 찾는다.

필요하면 동봉된 helper(`scripts/scholarship_filter.py`)로 사용자 조건에 맞게 후처리 필터링하고, 지원 가능 여부를 빠르게 판정하고, KST(`Asia/Seoul`) 현재 날짜 기준 readable report를 만든다. `--today` 를 생략하거나 잘못 넣으면 host local time 이 아니라 KST 오늘 날짜를 기준일로 사용한다.

## Works in both Claude Code and Codex

- 이 스킬은 특정 에이전트 전용이 아니다.
- Claude Code에서도 사용 가능하고, Codex에서도 사용 가능하다.
- 핵심은 에이전트가 최신 웹 검색을 할 수 있어야 한다는 점이다.
- 장학금 마감일과 자격은 자주 바뀌므로 **항상 fresh search** 를 우선한다.

## When to use

- "한국 장학금 전부 찾아줘"
- "서울대 학부생이 지원 가능한 재단 장학금 찾아줘"
- "생활비 200만원 이상 주는 장학금만 골라줘"
- "학교 장학금 말고 민간재단 장학금만 보고 싶어"
- "학자금 지원구간 5구간 이하 대상 장학금만 정리해줘"
- "컴퓨터공학과 대학원생 장학금 링크까지 정리해줘"
- "내 조건으로 지원 가능한지 같이 판정해줘"

## When not to use

- 장학금 신청서 직접 제출/자동 접수
- 비공개 커뮤니티/로그인 뒤에서만 보이는 모집공고 수집
- 법률 자문이나 합격 보장 판단

## Source priority

항상 아래 우선순위를 따른다.

1. 한국장학재단 공식 페이지 (`kosaf.go.kr`)
2. 대학 공식 도메인 (`*.ac.kr`)의 학생지원처/장학공지/학사공지
3. 공공기관/지자체/재단 공식 페이지 (`*.go.kr`, `*.or.kr`, 공식 재단 도메인)
4. 기업 공식 CSR/재단/채용·공지 페이지
5. 비공식 모음글/블로그/커뮤니티는 **lead source** 로만 사용하고, 공식 공고로 교차검증되지 않으면 제외

소스별 검색 패턴은 `references/source-patterns.md` 를 보고, 검색 누락을 줄이려면 `references/search-clues.md` 의 키워드와 제목 단서를 같이 쓴다.

## Inputs

- 사용자 프로필
  - 학교명 / 학교 유형
  - 학부/대학원/고등학생 여부
  - 학년
  - 전공
  - GPA 또는 백분위
  - 학자금 지원구간
- 선호 조건
  - 기관 유형 (`school`, `foundation`, `government`, `company`, `local-government`)
  - 최소/최대 금액
  - 등록금형 / 생활비형
  - 마감 상태 (`open`, `upcoming`)
  - 특정 지역 / 특정 학교 / 특정 재단

사용자가 필터링을 원하지만 핵심 입력이 비어 있으면, 한 번에 1~3개만 짧게 보강 질문한다.

## Prerequisites

- 최신 웹 검색 가능 환경
- 인터넷 연결
- 선택: `python3` 3.8+ (`scripts/scholarship_filter.py` helper 사용 시)

## Workflow

### 1. 검색 범위를 먼저 정한다

- 사용자가 "전체"를 원하면 학교/재단/공공기관을 다 포함해 넓게 찾는다.
- 사용자가 "재단만", "학교 공고만", "생활비만" 같은 제약을 주면 그 제약부터 적용한다.
- 날짜 관련 표현은 반드시 절대 날짜로 정리한다.

### 2. 공식 소스를 병렬 탐색한다

최소한 아래 3축을 본다.

- 한국장학재단 공식 장학 페이지
- 사용자 학교 또는 관련 대학군의 공식 장학 공지
- 재단/기업/공공기관 공식 공고

검색 제목이 `장학금` 이 아닐 수 있으니 `장학생 모집`, `외부 장학 추천`, `등록금 감면`, `생활비 지원`, `학업장려비`, `추천장학`, `근로장학`, `성적우수 장학` 도 같이 본다.

대표 검색 예시:

- `site:kosaf.go.kr 장학금 {키워드}`
- `site:{학교도메인} 장학 공고`
- `site:*.ac.kr 장학 공고 {학교명} {전공}`
- `site:*.or.kr 장학생 선발 {키워드}`
- `site:*.go.kr 장학금 공고 {지역명}`

### 2-1. 학교/학과 완전 탐색 모드

사용자가 특정 학교를 주면 아래 순서를 빠뜨리지 않는다.

1. 학교 대표 도메인 확인
2. 학생지원처 / 장학팀 / 학사공지 게시판 확인
3. 단과대학 공지 확인
4. 학과 / 전공 / 대학원 과정 홈페이지 공지 확인
5. 첨부 PDF/HWP가 있으면 같이 열어 조건을 확인
6. 교내 장학과 외부 추천 장학을 분리해서 정리

학교 완전 탐색 체크리스트는 `references/school-discovery.md` 를 본다.

학교별 search plan을 만들 때는:

```bash
python3 scripts/university_search_plan.py \
  --school-name "부산대학교" \
  --department "컴퓨터공학과" \
  --year 2026
```

전국 대학 sweep query를 만들 때는:

```bash
python3 scripts/university_search_plan.py --nationwide --year 2026
```

### 3. 각 후보를 정규화한다

후보마다 최소한 아래 필드를 채운다.

```json
{
  "name": "장학금명",
  "organization": {
    "name": "운영기관명",
    "type": "foundation"
  },
  "source_url": "https://official.example.com/notice/123",
  "apply_url": "https://official.example.com/apply",
  "amount": {
    "text": "학기당 250만 원",
    "per_semester_krw": 2500000,
    "category": "living"
  },
  "deadline": {
    "start": "2026-04-01",
    "end": "2026-04-20",
    "status": "open"
  },
  "eligibility": {
    "student_levels": ["undergraduate"],
    "school_names": ["서울대학교"],
    "school_kinds": ["university"],
    "majors": ["컴퓨터공학", "소프트웨어"],
    "grade_years": [2, 3, 4],
    "gpa_min": 3.0,
    "income_band_min": 0,
    "income_band_max": 8,
    "notes": ["직전학기 12학점 이상"]
  },
  "verified_at": "2026-04-14",
  "source_kind": "official"
}
```

### 4. helper로 필터링하거나 지원 가능 여부를 본다

여러 장학금 후보를 JSON으로 정리한 뒤:

```bash
python3 scripts/scholarship_filter.py filter \
  --input scholarships.json \
  --org-type foundation \
  --student-level undergraduate \
  --income-band 5 \
  --min-amount 2000000
```

지원 가능 여부 판정:

```bash
python3 scripts/scholarship_filter.py eligibility \
  --input scholarships.json \
  --school-name "서울대학교" \
  --student-level undergraduate \
  --grade-year 2 \
  --gpa 3.5 \
  --income-band 5
```

KST 기준 현재 날짜로 열린 공고만 readable 하게 보기:

```bash
python3 scripts/scholarship_filter.py report \
  --input scholarships.json \
  --today 2026-04-14 \
  --only-open-now \
  --school-name "서울대학교"
```

마감 임박 공고만 보기:

```bash
python3 scripts/scholarship_filter.py report \
  --input scholarships.json \
  --today 2026-04-14 \
  --deadline-within-days 7
```

### 5. 사용자에게는 compact하게 보여준다

- 상위 매칭 장학금부터 정리
- 장학금명 / 기관 / 금액 / 신청기간 / 핵심 조건 / 링크
- 필터 불일치 이유가 있으면 한 줄로 설명
- "지원 가능", "조건 일부 미확인", "현재 조건으로는 불일치"를 짧게 표시

기본 출력 form은 아래 순서를 따른다.

1. 요약 블록: 총 후보 수 / 열린 공고 수 / 곧 마감 수
2. `지금 지원 가능`
3. `곧 열림`
4. `조건은 맞지만 마감됨`

각 항목은 이 형식으로 정리한다.

- 장학금명
- 기관명 / 기관 유형
- 금액
- 신청기간 + KST 기준 현재 날짜 상태 (`open`, `upcoming`, `closed`, `D-3`)
- 학교/학과/학년/성적/지원구간 핵심 조건
- 공식 공고 링크
- 신청 링크

더 자세한 form 규칙은 `references/report-format.md` 를 본다.

## Response policy

- 공식 공고 링크와 신청 링크를 반드시 남긴다.
- 금액이 숫자로 안 보이면 원문 텍스트를 그대로 남기고, 추정 금액은 임의로 만들지 않는다.
- 블로그/카페/홍보글만 발견되면 공식 공고를 다시 찾고, 못 찾으면 "미검증" 으로 표시한다.
- 장학금 마감일은 반드시 절대 날짜로 적는다.
- 사용자가 "내 조건으로 걸러줘" 라고 하면 금액, 학교/재단 여부, 학자금 지원구간, 학부/대학원 여부를 우선 필터로 사용한다.
- 학자금 지원구간은 한국장학재단 표기를 기준으로 `0~10` 정수 또는 범위로 정규화한다.

## Keep the answer compact

- 총 후보 수
- 필터 후 남은 후보 수
- 상위 5~10개만 표 또는 리스트
- 각 항목마다 공식 링크 1개 이상
- 필요 시 "추가로 더 좁힐 수 있는 필터" 2~3개 제안

## Ready-to-paste prompts

### 1. 전체 탐색

```text
장학금 검색 및 조회 스킬을 사용해서 지금 신청 가능하거나 곧 열리는 한국 장학금 공고를 찾아줘. 한국장학재단, 전국 대학교, 재단, 기업, 공공기관 공식 공고만 포함하고, KST 기준 현재 날짜로 열린 공고와 곧 열릴 공고를 나눠서 보여줘. 각 항목마다 장학금명, 기관명, 기관 유형, 지원 금액, 신청 기간, 핵심 자격, 학자금 지원구간 조건, 공식 공고 링크, 신청 링크를 가독성 좋은 섹션형 form으로 정리해줘.
```

### 2. 사용자 조건 기반 필터링

```text
장학금 검색 및 조회 스킬을 사용해서 내 조건에 맞는 장학금만 찾아줘.
조건:
- 학교: 서울대학교
- 학생 구분: 학부생
- 학년: 2학년
- 전공: 컴퓨터공학
- 학자금 지원구간: 5구간
- 최소 금액: 200만원
- 기관 유형: 재단

공식 공고만 포함하고, KST 기준 현재 날짜로 마감 여부도 고려해서 지원 가능 여부를 가능/불확실/불가로 표시해줘.
```

### 3. 학교 장학 vs 재단 장학 비교

```text
장학금 검색 및 조회 스킬을 사용해서 연세대학교 학부생이 지원할 수 있는 교내 장학금과 민간재단 장학금을 나눠서 보여줘. 학교 본부 장학공지, 단과대, 학과 홈페이지 장학 공지를 모두 확인하고, 금액, 신청 기간, 소득구간 조건, 성적 조건, 공식 링크를 같이 정리하고 어느 쪽이 내 조건에 더 맞는지 짧게 비교해줘.
```

### 4. 지원 가능 여부만 빠르게 보기

```text
장학금 검색 및 조회 스킬을 사용해서 아래 프로필로 지원 가능성이 있는 장학금만 골라줘.
- 학교: 고려대학교
- 학생 구분: 대학원생
- 전공: 전산학
- GPA: 3.8/4.5
- 학자금 지원구간: 4구간
- 원하는 유형: 생활비 장학금

각 항목마다 왜 맞는지 또는 어떤 조건이 불확실한지 한 줄씩 붙여줘.
```

## Done when

- 공식 공고 중심으로 후보를 모았다.
- 금액, 자격, 지원구간, 신청기간, 링크를 정리했다.
- 사용자가 준 조건으로 필터링했다.
- 지원 가능 여부를 빠르게 판단했다.
- 비공식 출처는 공식 페이지로 검증했거나 제외했다.

## Notes

- 한국장학재단 공식 장학·지원구간 표면은 `references/source-patterns.md` 참고
- 학교별 장학 공지는 HTML 구조가 제각각이므로, 공고 제목/본문/첨부를 같이 읽어야 한다.
- 장학금 "조건" 과 "우대사항" 을 섞지 않는다.
- "등록금 전액" 같은 비정액 장학금은 `amount.text` 를 유지하고 수치가 없으면 `*_krw` 는 비워둔다.
