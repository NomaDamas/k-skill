# 학교 학사일정 조회 가이드

## 이 기능으로 할 수 있는 일

- 시도교육청 이름(자연어) + 학교 이름으로 학교 코드 조회
- 특정 일자 또는 기간의 학사일정 조회
- 학교 행사, 방학, 시험, 재량휴업일 등 NEIS에 공개된 일정 확인
- 나이스(NEIS) Open API 인증키는 프록시 서버(`KEDU_INFO_KEY`)에서만 관리

## 가장 중요한 규칙

1. 클라이언트는 **`KEDU_INFO_KEY`를 들고 있지 않는다.** `k-skill-proxy`만 upstream `KEY`를 붙인다.
2. 학교 식별은 **하드코딩 금지**. 반드시 **`/v1/neis/school-search` → `/v1/neis/school-schedule`** 순서로 조합한다.
3. 학교명이 여러 건이면 주소와 학교명을 보여 주고 사용자에게 선택을 받는다.

## 먼저 필요한 것

- 인터넷 연결
- 프록시 base URL (기본: `https://k-skill-proxy.nomadamas.org`)

## 기본 조회 흐름

### 1) 학교 검색

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/neis/school-search' \
  --data-urlencode 'educationOffice=서울특별시교육청' \
  --data-urlencode 'schoolName=미래초등학교'
```

응답에 `resolved_education_office`와 `schoolInfo` 블록이 붙는다. `row`에서 `ATPT_OFCDC_SC_CODE`, `SD_SCHUL_CODE`, `SCHUL_NM`, 주소 필드를 확인한다.

### 2) 학사일정 하루 조회

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/neis/school-schedule' \
  --data-urlencode 'educationOfficeCode=B10' \
  --data-urlencode 'schoolCode=7010123' \
  --data-urlencode 'date=20260410'
```

`educationOfficeCode` / `schoolCode`는 1단계 검색 결과에서 가져온다.

### 3) 학사일정 기간 조회

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/neis/school-schedule' \
  --data-urlencode 'educationOfficeCode=B10' \
  --data-urlencode 'schoolCode=7010123' \
  --data-urlencode 'from=2026-04-01' \
  --data-urlencode 'to=2026-04-30'
```

## 파라미터 요약

| 단계 | 주요 쿼리 |
| --- | --- |
| school-search | `educationOffice`, `schoolName` (별칭: `office`, `school`, …) |
| school-schedule | `educationOfficeCode`, `schoolCode`, `date` 또는 `from`/`to` |

## 자주 보는 필드

- `AA_YMD`: 일정일
- `EVENT_NM`: 일정명
- `EVENT_CNTNT`: 일정 내용
- `SBTR_DD_SC_NM`: 수업공제일 구분(제공되는 경우)
- `ONE_GRADE_EVENT_YN` 등 학년별 일정 여부 필드(제공되는 경우)

## 참고 링크

- 나이스 교육정보 개방 포털: `https://open.neis.go.kr/`
- 프록시 구현·엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
