# k-schoollunch-menu — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# Korean School Lunch Menu (NEIS)

## What this skill does

나이스(NEIS) 교육정보 개방 포털의 **학교기본정보**·**급식식단정보**를 `k-skill-proxy`가 중계하는 HTTP API로 조회한다.

- 사용자는 **시도교육청 이름**(자연어)과 **학교 이름**, **날짜**만 말하면 된다.
- 에이전트는 먼저 `/v1/neis/school-search`로 학교를 찾고, 응답의 `SD_SCHUL_CODE`·`ATPT_OFCDC_SC_CODE`로 `/v1/neis/school-meal`을 호출한다.
- 인증키(`KEDU_INFO_KEY`)는 **프록시 서버에만** 두고, 클라이언트는 키 없이 프록시 URL만 호출한다.

## When to use

- "서울특별시교육청 미래초등학교 오늘 급식 뭐야?"
- "○○초 급식 식단 알려줘"
- "이번 주 화요일 중학교 급식 메뉴"
- "급식 메뉴 조회해줘" (교육청·학교·날짜 확인 후 진행)

## Prerequisites

- 인터넷 연결
- `curl` 사용 가능 환경
- `k-skill-proxy`에 `KEDU_INFO_KEY`가 설정된 배포(기본 hosted 또는 self-host)에 접근 가능할 것

## Credential requirements

- 사용자 측 **필수** 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `KEDU_INFO_KEY` 는 **프록시 운영 서버** 환경에만 둔다.

## Proxy base URL

에이전트는 아래처럼 base 를 정한다.

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
BASE="${BASE%/}"
```

## Workflow

### 1) Collect inputs (do not guess)

다음이 없으면 사용자에게 짧게 묻는다.

1. **교육청** — 자연어 허용 (예: `서울특별시교육청`, `서울`, `경기도교육청`).
2. **학교명** — 자연어 (예: `미래초등학교`, `○○중학교`).
3. **급식일** — `YYYYMMDD` 또는 사용자가 말한 날짜를 한국 시간 기준으로 `YYYYMMDD`로 정한다. 생략 시 **오늘(한국 시간)**.

교육청 표현이 애매해 `ambiguous_education_office`가 나오면, 응답의 `candidate_codes`를 보여 주고 더 구체적인 이름(예: `경상북도교육청` vs `경상남도교육청`)을 받는다.

### 2) Search school (`/v1/neis/school-search`)

```bash
curl -fsS --get "${BASE}/v1/neis/school-search" \
  --data-urlencode "educationOffice=${EDU_OFFICE}" \
  --data-urlencode "schoolName=${SCHOOL_NAME}"
```

- `EDU_OFFICE`, `SCHOOL_NAME`은 사용자 입력을 그대로 넣어도 된다. 프록시가 교육청명을 코드로 해석한다.
- 응답의 `resolved_education_office.atpt_ofcdc_sc_code`로 실제 매칭된 시도교육청 코드를 확인할 수 있다.

### 3) Disambiguate when multiple schools match

`schoolInfo` 본문에서 `row`가 **여러 개**면 사용자에게 **학교명·주소(`ORG_RDNMA` 등)**를 보여 주고 하나를 고르게 한다.

한 건뿐이면 그 row의 `ATPT_OFCDC_SC_CODE`, `SD_SCHUL_CODE`를 다음 단계에 쓴다.

### 4) Fetch meal (`/v1/neis/school-meal`)

```bash
curl -fsS --get "${BASE}/v1/neis/school-meal" \
  --data-urlencode "educationOfficeCode=${ATPT}" \
  --data-urlencode "schoolCode=${SD}" \
  --data-urlencode "mealDate=${YYYYMMDD}"
```

- `ATPT` / `SD`는 3단계에서 확정한 코드.
- **조식·중식·석식만** 보고 싶으면 `mealKindCode=1|2|3` (선택).

### 5) Summarize for the user

- `mealServiceDietInfo` 안의 `row`를 기준으로 요약한다.
- 메뉴 문자열(`DDISH_NM` 등)의 `<br/>`는 줄바꿈으로 바꿔 읽기 쉽게 한다.
- 칼로리·영양 정보 필드가 있으면 한두 줄로 덧붙인다.
- NEIS가 빈 결과를 주면 "해당 일자 급식 데이터 없음" 가능성을 안내한다.

## Upstream reference

- 급식·학교기본정보 데이터: [나이스 교육정보 개방 포털](https://open.neis.go.kr/)

## Done when

- 교육청·학교·날짜를 확인했다.
- 학교 검색으로 단일 학교를 확정했다(또는 사용자가 선택했다).
- 급식 API 호출에 성공했고, 메뉴를 사용자 친화적으로 정리했다.

## Failure modes

- 프록시에 `KEDU_INFO_KEY` 미설정 → `503` / `upstream_not_configured`
- 교육청 이름이 여러 시도에 걸침 → `400` / `ambiguous_education_office`
- 학교명이 여러 건 — 사용자 선택 없이 임의로 고르지 말 것
- 공휴일·방학·미제공 일자로 빈 급식
- NEIS API 일시 장애·호출 제한

## Notes

- 학교 코드를 사용자에게 외우게 하지 않는다. 항상 `school-search` → `school-meal` 순서를 따른다.
- Raw JSON을 그대로 붙여 넣지 말고 요약 위주로 답한다.
- 자세한 엔드포인트·필드는 `docs/features/k-schoollunch-menu.md`와 `docs/features/k-skill-proxy.md`를 참고한다.
