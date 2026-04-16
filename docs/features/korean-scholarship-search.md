# 장학금 검색 및 조회 가이드

## 이 기능으로 할 수 있는 일

- 한국장학재단, 전국 대학교, 재단, 기업, 공공기관의 최신 장학 공고 검색
- 장학금별 금액, 지원 자격, 학자금 지원구간, 신청 기간, 링크 정리
- 사용자 조건(학교, 학부/대학원, 전공, 학과, 금액, 기관 유형) 기반 필터링
- KST(`Asia/Seoul`) 현재 날짜 기준으로 `지금 지원 가능`, `곧 열림`, `마감됨` 구분
- 정규화된 JSON 목록에 대해 지원 가능 여부 빠른 판정
- readable markdown report 출력

## 가장 중요한 규칙

이 기능은 **공식 공고 우선** 이다.

- `kosaf.go.kr`, `*.ac.kr`, `*.go.kr`, `*.or.kr`, 공식 재단/기업 도메인을 우선 본다.
- 블로그/커뮤니티/모음글은 lead source 로만 쓰고, 공식 공고로 검증되지 않으면 결과에서 제외한다.
- 신청 기간은 반드시 절대 날짜로 적는다.
- 최종 결과에는 공식 공고 링크와 신청 링크를 함께 남긴다.

## 먼저 필요한 것

- 인터넷 연결
- 최신 웹 검색 가능 에이전트
- 선택: `python3` 3.8+ (`scripts/scholarship_filter.py` helper 사용 시)

## 추천 검색 순서

1. 한국장학재단에서 전국 단위 장학/지원구간 관련 공고를 먼저 본다.
2. 사용자 학교가 있으면 해당 학교 공식 장학 공지를 본다.
3. 재단/기업/공공기관 공식 페이지를 추가로 찾는다.
4. 각 공고에서 금액, 자격, 지원구간, 기간, 신청 링크를 정규화한다.
5. 필요하면 helper로 필터링하고 지원 가능 여부를 본다.

특정 학교를 지정하면 학교 본부 장학공지, 학생지원처, 단과대, 학과/전공 홈페이지 공지를 순서대로 확인한다. 학교를 지정하지 않으면 전국 대학 `*.ac.kr` 공고를 넓게 탐색한다.

검색할 때는 `장학금` 만 보지 말고 `장학생 모집`, `외부 장학 추천`, `등록금 감면`, `생활비 지원`, `학업장려비`, `추천장학`, `근로장학` 같은 제목 단서도 같이 본다.

## 공식 표면 예시

- 한국장학재단 푸른등대 기부장학금: `https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_11_01`
- 한국장학재단 학자금 지원구간 산정절차: `https://www.kosaf.go.kr/ko/tuition.do?pg=tuition04_09_01&type=tuition`
- 한국장학재단 학자금 지원구간 경곗값: `https://www.kosaf.go.kr/ko/tuition.do?naviParam=JH%2C01%2C01%2C03&pg=tuition04_09_07`
- 삼성꿈장학재단: `https://www.sdream.or.kr/w/web60gV`
- 대학 장학 공지: 각 대학 공식 `*.ac.kr` 학생지원처/장학공지

## helper 사용 예시

정규화된 장학금 JSON 파일(`scholarships.json`)이 있다고 가정:

### 재단 장학금만 + 학부생 + 5구간 이하 + 200만원 이상

```bash
python3 scripts/scholarship_filter.py filter \
  --input scholarships.json \
  --org-type foundation \
  --student-level undergraduate \
  --income-band 5 \
  --min-amount 2000000
```

### 내 조건으로 지원 가능 여부 판정

```bash
python3 scripts/scholarship_filter.py eligibility \
  --input scholarships.json \
  --school-name "서울대학교" \
  --student-level undergraduate \
  --grade-year 2 \
  --gpa 3.5 \
  --income-band 5
```

KST 기준 readable report:

```bash
python3 scripts/scholarship_filter.py report \
  --input scholarships.json \
  --today 2026-04-14 \
  --only-open-now
```

학교별 exhaustive query plan 생성:

```bash
python3 scripts/university_search_plan.py \
  --school-name "부산대학교" \
  --department "컴퓨터공학과" \
  --year 2026
```

전국 대학 sweep query 생성:

```bash
python3 scripts/university_search_plan.py --nationwide --year 2026
```

## 바로 쓸 프롬프트 예시

```text
장학금 검색 및 조회 스킬을 사용해서 지금 신청 가능하거나 곧 열리는 한국 장학금 공고를 찾아줘. 한국장학재단, 전국 대학교, 재단, 기업, 공공기관 공식 공고만 포함하고, KST 기준 현재 날짜로 열린 공고와 곧 열릴 공고를 나눠서 가독성 좋은 form으로 정리해줘.
```

```text
장학금 검색 및 조회 스킬을 사용해서 내 조건에 맞는 장학금만 찾아줘.
- 학교: 서울대학교
- 학생 구분: 학부생
- 학년: 2학년
- 전공: 컴퓨터공학
- 학과: 컴퓨터공학부
- 학자금 지원구간: 5구간
- 최소 금액: 200만원
- 기관 유형: 재단

지원 가능 여부도 같이 표시해줘.
```

## 결과 form 권장

1. 요약: 총 후보 수 / 열린 공고 수 / 곧 열릴 공고 수
2. `지금 지원 가능`
3. `곧 열림`
4. `마감됨`

각 항목은 아래 순서로 보여주면 읽기 좋다.

- 장학금명
- 기관 / 기관 유형
- 금액
- 신청기간
- KST 기준 현재 날짜 상태
- 핵심 조건
- 공식 공고 링크
- 신청 링크

조건이 불명확한 항목은 숨기지 말고 `미확인` 으로 남긴다.

## 답변 템플릿 권장

- 장학금명
- 운영기관 / 기관 유형
- 지원 금액
- 신청 기간
- 핵심 자격 요건
- 학자금 지원구간 조건
- 공식 공고 링크
- 신청 링크
- 내 조건 기준 간단 판정

## 주의 사항

- `scripts/scholarship_filter.py` 에서 `--today` 를 생략하거나 잘못 넣으면 host local time 이 아니라 KST 오늘 날짜를 기준으로 마감 상태를 계산한다.
- "등록금 전액" 같이 금액이 정액이 아닌 공고는 원문 텍스트를 그대로 유지한다.
- 성적 조건이 4.5 만점인지 100점 만점인지 공고마다 다르므로 원문 기준을 같이 적는다.
- 장학금은 학기별/연도별로 반복되더라도 조건과 마감일이 달라질 수 있으니, 과거 공고를 최신 공고로 착각하지 않는다.
- 학자금 지원구간 관련 설명은 한국장학재단 기준을 우선 참고한다.
