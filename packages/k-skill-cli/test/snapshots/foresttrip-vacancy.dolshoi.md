# foresttrip-vacancy — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.
- When booking is requested, continue past search results: use vault-backed login on the official surface, select the requested date/slot/seat, and complete reversible reservation or hold steps instead of stopping at a link.
- A successful reversible reservation or seat hold is a completed booking step: report the confirmation and any purchase deadline. If payment is required, call `clarify` with the exact itinerary/slot, party, seat/option, and total, then pay after approval and verify the receipt.

# Foresttrip Vacancy

## What this skill does

숲나들e 공식 사이트(`https://foresttrip.go.kr/index.jsp`)에서 자연휴양림 예약 가능 객실을 날짜 기준으로 조회 자동화한다.

generic runtime에서 helper는 조회 전용이다. 돌쇠에서는 조회 결과를 공식 CloakBrowser 예약 흐름으로 이어가며, CAPTCHA·대기열 우회·공격적 반복 스나이핑은 여전히 하지 않는다.

## When to use

- "이번 주말 자연휴양림 빈 객실 있어?"
- "숲나들e 2026년 5월 4일 예약 가능한 곳 조회해줘"
- "자연휴양림 빈자리 전체 조회해줘"
- "관심 휴양림 중 예약 가능한 객실만 알려줘"

## When not to use

- 돌쇠가 아니며 예약 신청이나 결제까지 자동화해야 하는 경우
- 캡차를 풀거나 대기열을 우회해야 하는 경우
- 계정 정보를 채팅창에 직접 넣으려는 경우
- aggressive polling, 스나이핑, 반복 예약 시도가 필요한 경우

## Prerequisites

- Python 3.9+
- Playwright Chromium browser

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 scripts/run_foresttrip_vacancy.py --check-deps
```

## Required environment variables

- `KSKILL_FORESTTRIP_ID`
- `KSKILL_FORESTTRIP_PASSWORD`

Optional:

- none

### Credential handling

- 돌쇠 credential mode에서는 `vault-run` capability를 사용하고, 없으면 `request_vault_credential`을 호출한다. ID/PW 원문을 채팅이나 shell에 넣지 않는다.
- 그 밖의 환경에서는 이미 주입된 환경변수 → host vault → `~/.config/k-skill/secrets.env` 순서로 사용한다.
- Generic helper 자체는 `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 환경변수만 읽는다.

## Inputs

- 날짜: `YYYYMMDD`, 여러 날짜면 comma-separated `YYYYMMDD,YYYYMMDD`
- 조회 범위:
  - `--all`: 전체 자연휴양림 조회
  - `--forest-id`: 특정 `insttId` 조회
  - `--forest-name`: 공식 휴양림명 부분 일치 조회
- 출력 형식:
  - `--text`: 사람용 요약
  - `--json`: 구조화 결과
- 선택 필터:
  - `--categories 01`: 숙박
  - `--categories 02`: 야영/캠핑
  - `--categories 01,02`: 숙박 + 야영/캠핑
- 고급 실행 옵션:
  - `--week-range N`: `--dates` 를 생략했을 때만 오늘부터 N주 범위를 조회
  - `--concurrency N`: 병렬 조회 worker 수, 1-5 범위
  - `--session-cache PATH`: 로그인 세션 캐시 경로 override

## Workflow

### 1. Ensure credentials are available

돌쇠 credential mode에서는 숲나들e capability를 사용하고, 없으면 `request_vault_credential`을 호출한다. generic fallback에서만 `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD`를 확인한다.

시크릿이 없다는 이유로 대체 사이트, 캡차 우회, 비공식 예약 경로를 찾지 않는다.

### 2. Install runtime dependencies when missing

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

### 3. Run a vacancy lookup

이 스킬의 helper를 통해 조회한다. Helper는 Playwright로 숲나들e에 로그인해 CSRF/cookie와 공식 휴양림 ID 목록을 얻은 뒤, 월별예약조회 JSON endpoint만 호출한다.

2026-04-29 확인 기준, 로그인 없이 월별예약조회 화면에 접근하면 `401 Unauthorized`가 반환되고, 조회 endpoint는 JSON 대신 안내 HTML을 반환한다. 따라서 현재 helper는 로그인 세션/CSRF 확보를 필수 전제로 둔다.

API는 `srchDate` 단일 일자만 요청해도 응답에 5일 윈도우를 포함할 수 있다. helper는 요청 범위(`today`–`last_day`) 밖 `useDt` 행을 자동 제거하므로 사용자에게는 요청한 날짜의 빈자리만 노출된다.

전체 자연휴양림에서 특정 날짜 조회:

```bash
python3 scripts/run_foresttrip_vacancy.py --all --text --dates 20260504
```

JSON 출력:

```bash
python3 scripts/run_foresttrip_vacancy.py --all --json --dates 20260504
```

캠핑/야영만 조회:

```bash
python3 scripts/run_foresttrip_vacancy.py --all --text --dates 20260504 --categories 02
```

특정 휴양림명으로 조회:

```bash
python3 scripts/run_foresttrip_vacancy.py --forest-name 유명산 --text --dates 20260504
```

### 4. Summarize results conservatively

응답은 아래 항목 중심으로 짧게 정리한다.

- 조회 날짜
- 조회 범위
- 예약 가능한 휴양림명
- 객실/시설명
- 숙박/야영 구분
- 정원 또는 수용 인원
- fetch failure가 있으면 실패 개수

결과가 없으면 "조회 시점 기준 예약 가능 객실 없음"이라고 말한다. 실제 예약 가능 여부는 숲나들e 화면에서 재확인될 수 있음을 덧붙인다.

`goodsNm`에 "예비"가 포함된 객실은 운영자가 보유하는 내부용 자리로, 사용자 예약 화면에는 노출되지 않는다. helper는 이 객실들을 결과에서 자동 제외한다. 같은 `(휴양림, 날짜, 객실명)` 조합의 중복 행도 dedup된다.

## Done when

- 요청 날짜와 조회 범위가 명확하다.
- read-only 월별예약조회 helper를 최소 1회 실행했다.
- 빈 객실이 있으면 날짜/휴양림/객실을 정리했다.
- 빈 객실이 없으면 없다고 명확히 말했다.
- 돌쇠의 예약 요청이면 공식 예약 흐름을 진행했고, 결제가 필요하면 `clarify` 승인 후 완료 상태를 확인했다.
- CAPTCHA/대기열 우회는 시도하지 않았다.

## Failure modes

- 로그인 실패: `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 확인
- Playwright browser 미설치: `python3 -m playwright install chromium`
- fetch failure 일부 발생: 결과와 실패 개수를 함께 보고하고, 필요하면 `--refresh-session` 으로 1회 재조회
- 숲나들e 표면 변경: helper의 login/session bootstrap 또는 parser 점검 필요
- "(예비)" 객실이 결과에 안 나옴: 정상 동작이다. 사용자 예약 화면에 노출되지 않는 운영자 보유분이라 의도적으로 제외된다.
- 사용자 화면 객실 수와 helper 결과가 다름: 같은 객실의 중복 행이 dedup되었거나, 요청 범위 밖 `useDt`가 제거됐을 가능성이 높다. raw API 응답을 확인하려면 helper 로직을 우회해서 직접 호출 필요.

## Maintainer review notes

메인테이너가 이 스킬을 검토하기 위해 숲나들e 계정을 새로 만들 필요는 없다.

계정 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `python3 -m py_compile foresttrip-vacancy/scripts/run_foresttrip_vacancy.py`
- `python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --help`
- `python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --check-deps`
- `npm run ci`

실제 live smoke는 기여자 또는 이미 숲나들e 계정을 가진 사용자가 선택적으로 수행한다. PR에는 `forests_scanned`, `fetch_failures`, `filter_hits` 같은 비민감 요약만 남기고 계정 정보, 세션 쿠키, 개인 조회 세부 내역은 공유하지 않는다.

## Safety notes

- generic helper는 조회 전용이고, 돌쇠의 예약/결제는 CloakBrowser action path로 분리한다.
- 캡차 처리, 대기열 우회, 공격적인 반복 조회를 하지 않는다.
- 돌쇠에서는 vault action을 사용하고, generic fallback에서만 환경변수 또는 `~/.config/k-skill/secrets.env`를 사용한다.
