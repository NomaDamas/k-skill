---
name: k-school-calendar
description: Use when the user asks for Korean school academic schedules, school events, holidays, exams, or 방학/재량휴업일 by natural-language education office and school name, via k-skill-proxy NEIS school-search and school-schedule routes.
license: MIT
metadata:
  category: education
  locale: ko-KR
  phase: v1
---

# 학교 학사일정 조회 (NEIS)

## What this skill does

나이스(NEIS) 교육정보 개방 포털의 **학교기본정보**와 **학사일정**을 `k-skill-proxy`가 중계하는 HTTP API로 조회한다.

- 사용자는 **시도교육청 이름**, **학교 이름**, **날짜 또는 기간**만 말하면 된다.
- 에이전트는 먼저 `/v1/neis/school-search`로 학교를 찾고, 응답의 `ATPT_OFCDC_SC_CODE`·`SD_SCHUL_CODE`로 `/v1/neis/school-schedule`을 호출한다.
- 인증키(`KEDU_INFO_KEY`)는 **프록시 서버에만** 두고, 클라이언트는 키 없이 프록시 URL만 호출한다.

## When to use

- "서울특별시교육청 미래초 이번 달 학사일정 알려줘"
- "우리 학교 다음 주 쉬는 날 있어?"
- "○○중학교 1학기 시험 일정 찾아줘"
- "이번 달 학교 행사 캘린더로 정리해줘"
- "방학 시작일이 언제야?"

## Prerequisites

- 인터넷 연결
- `curl` 사용 가능 환경
- `k-skill-proxy`에 `KEDU_INFO_KEY`가 설정된 배포에 접근 가능할 것

## Credential requirements

- 사용자 측 **필수** 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `KEDU_INFO_KEY` 는 **프록시 운영 서버** 환경에만 둔다.

## Proxy base URL

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
BASE="${BASE%/}"
```

## Workflow

### 1) Collect inputs

다음이 없으면 사용자에게 짧게 묻는다.

1. **교육청** — 자연어 허용 (예: `서울특별시교육청`, `서울`, `경기도교육청`).
2. **학교명** — 자연어 (예: `미래초등학교`, `○○중학교`).
3. **조회일 또는 기간** — `YYYYMMDD`, `YYYY-MM-DD`, 또는 `from`/`to` 기간. 생략 시 사용자의 요청 문맥 기준으로 오늘/이번 주/이번 달을 한국 시간 기준으로 해석한다.

교육청 표현이 애매해 `ambiguous_education_office`가 나오면, 응답의 `candidate_codes`를 보여 주고 더 구체적인 이름을 받는다.

### 2) Search school (`/v1/neis/school-search`)

```bash
curl -fsS --get "${BASE}/v1/neis/school-search" \
  --data-urlencode "educationOffice=${EDU_OFFICE}" \
  --data-urlencode "schoolName=${SCHOOL_NAME}"
```

- `EDU_OFFICE`, `SCHOOL_NAME`은 사용자 입력을 그대로 넣어도 된다. 프록시가 교육청명을 코드로 해석한다.
- 응답의 `resolved_education_office.atpt_ofcdc_sc_code`와 `schoolInfo.row[]`를 확인한다.

### 3) Disambiguate when multiple schools match

`schoolInfo.row`가 **여러 개**면 사용자에게 **학교명·주소(`ORG_RDNMA` 등)**를 보여 주고 하나를 고르게 한다.

한 건뿐이면 그 row의 `ATPT_OFCDC_SC_CODE`, `SD_SCHUL_CODE`를 다음 단계에 쓴다.

### 4) Fetch academic schedule (`/v1/neis/school-schedule`)

하루 조회:

```bash
curl -fsS --get "${BASE}/v1/neis/school-schedule" \
  --data-urlencode "educationOfficeCode=${ATPT}" \
  --data-urlencode "schoolCode=${SD}" \
  --data-urlencode "date=${YYYYMMDD}"
```

기간 조회:

```bash
curl -fsS --get "${BASE}/v1/neis/school-schedule" \
  --data-urlencode "educationOfficeCode=${ATPT}" \
  --data-urlencode "schoolCode=${SD}" \
  --data-urlencode "from=${FROM_YYYYMMDD}" \
  --data-urlencode "to=${TO_YYYYMMDD}"
```

- `educationOfficeCode` / `schoolCode`는 학교 검색 결과에서 가져온다.
- `date`를 주면 같은 날짜가 `AA_FROM_YMD`와 `AA_TO_YMD`로 들어간다.
- `from`/`to`는 `YYYYMMDD` 또는 `YYYY-MM-DD`를 허용한다.

### 5) Summarize for the user

`SchoolSchedule.row`를 기준으로 다음처럼 요약한다.

- 일정일(`AA_YMD`)
- 일정명(`EVENT_NM`)
- 세부 내용(`EVENT_CNTNT`, 있으면)
- 학년/학기/요일 등 부가 필드가 있으면 한 줄로 추가

일정이 없으면 "해당 기간 학사일정 데이터 없음" 가능성을 안내한다.

## Done when

- 교육청·학교·날짜/기간을 확인했다.
- 학교 검색으로 단일 학교를 확정했다(또는 사용자가 선택했다).
- 학사일정 API 호출에 성공했고, 일정명을 사용자 친화적으로 정리했다.

## Failure modes

- 프록시에 `KEDU_INFO_KEY` 미설정 → `503` / `upstream_not_configured`
- 교육청 이름이 여러 시도에 걸침 → `400` / `ambiguous_education_office`
- 학교명이 여러 건 — 사용자 선택 없이 임의로 고르지 말 것
- 방학·공휴일·미제공 기간으로 빈 일정
- NEIS API 일시 장애·호출 제한

## Notes

- 학교 코드를 사용자에게 외우게 하지 않는다. 항상 `school-search` → `school-schedule` 순서를 따른다.
- Raw JSON을 그대로 붙여 넣지 말고 요약 위주로 답한다.
- 신청/제출/출결 처리 같은 side effect는 이 스킬 범위가 아니다.
