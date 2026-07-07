---
name: korean-holiday-calendar
description: 한국천문연구원 특일 정보 API를 k-skill-proxy 경유로 호출해 공휴일·국경일·기념일·24절기·잡절을 조회한다. 조회 전용.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Korean Holiday Calendar

## What this skill does

공공데이터포털 **한국천문연구원_특일 정보**(data.go.kr `15012690`)의 `SpcdeInfoService`를 `k-skill-proxy` 경유로 호출한다.

지원 operation:

- `rest` → `getRestDeInfo` 공휴일
- `national` → `getHoliDeInfo` 국경일
- `anniversary` → `getAnniversaryInfo` 기념일
- `solarTerm` → `get24DivisionsInfo` 24절기
- `sundry` → `getSundryDayInfo` 잡절

## When to use

- "2026년 8월 공휴일 알려줘"
- "오늘이 공휴일인지 확인해줘"
- "2026년 24절기 조회해줘"
- "대체공휴일 있는지 확인해줘"

## Prerequisites

- 인터넷 연결
- hosted/self-host `k-skill-proxy`의 `/v1/korean-holiday/calendar` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털 `한국천문연구원_특일 정보`(15012690) 활용신청이 승인돼 있어야 한다.

키 발급:

- API 페이지: <https://www.data.go.kr/data/15012690/openapi.do>
- 공공데이터포털 이용 가이드: <https://www.data.go.kr/ugs/selectPublicDataUseGuideView.do>

## Inputs

- `operation`/`type`: `rest`(기본), `national`, `anniversary`, `solarTerm`, `sundry`
- `year`/`solYear`: 4자리 연도
- `month`/`solMonth`: 선택, `01`-`12`
- `page`/`pageNo`: 기본 1
- `limit`/`numOfRows`: 기본 100, 최대 1000

## Workflow

### 1. Query holidays for the target month or year

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/korean-holiday/calendar" \
  --data-urlencode "operation=rest" \
  --data-urlencode "year=2026" \
  --data-urlencode "month=08"
```

### 2. Decide holiday status from upstream fields

응답 item의 핵심 필드:

- `locdate`: `YYYYMMDD`
- `dateName`: 특일 이름
- `isHoliday`: `Y`면 공휴일, `N`이면 특일이지만 휴일 아님
- `dateKind`, `seq`: upstream 분류/순번

"오늘/내일이 공휴일인지" 묻는 경우 KST 기준 날짜를 `YYYYMMDD`로 만든 뒤 해당 `locdate`의 `isHoliday`를 확인한다.

## Failure modes

- `400 bad_request`: 연도/월/operation/page 값이 잘못됨.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 없음 또는 15012690 활용신청 미승인.
- `502 upstream_forbidden`: data.go.kr gateway가 키를 거부함.
- 빈 결과: 해당 연월/operation에 특일 없음. operation을 바꿔 재조회한다.
- 24절기/잡절 operation은 한국천문연구원 특일 서비스의 관례적 operation 이름을 사용한다. live smoke에서 upstream 변경이 확인되면 route allowlist를 갱신한다.

## Done when

- KST 기준 날짜와 요청 연월이 일치한다.
- `k-skill-proxy` route를 통해 호출했고 사용자에게 API key를 요구하지 않았다.
- 답변에는 `locdate`, `dateName`, `isHoliday`, operation을 함께 명시했다.

## Maintainer review notes

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `node --test packages/k-skill-proxy/test/server.test.js`
- `curl -i --get "$KSKILL_PROXY_BASE_URL/v1/korean-holiday/calendar" --data-urlencode "year=2026"` (키 미설정이면 503 확인)

Live smoke는 hosted/self-host proxy에 `DATA_GO_KR_API_KEY`가 설정되고 `15012690` 활용신청이 승인된 뒤 수행한다.

## Safety notes

- 조회 전용 스킬이다.
- 법정 영업일 판단, 금융/법률 마감 산정에는 원천 API 결과와 관계 법령/기관 공지를 함께 확인한다.
- 인증키는 프록시 서버에서만 다루며 repo/GitHub Actions/public docs에 저장하지 않는다.
