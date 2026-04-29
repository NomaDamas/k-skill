---
name: foresttrip-vacancy
description: Look up available Korean national forest recreation lodging or camping slots on foresttrip.go.kr. Use when the user asks for 숲나들e or 자연휴양림 빈 객실/빈자리 조회, not for booking.
license: MIT
metadata:
  category: travel
  locale: ko-KR
  phase: v1.5
---

# Foresttrip Vacancy

## What this skill does

숲나들e/자연휴양림 예약 가능 객실을 날짜 기준으로 조회한다.

이 스킬은 **조회 전용**이다. 예약 신청, 결제, 캡차 처리, 대기열 우회, 반복 스나이핑은 범위에 포함하지 않는다.

## When to use

- "이번 주말 자연휴양림 빈 객실 있어?"
- "숲나들e 2026년 5월 4일 예약 가능한 곳 조회해줘"
- "자연휴양림 빈자리 전체 조회해줘"
- "관심 휴양림 중 예약 가능한 객실만 알려줘"

## When not to use

- 예약 신청이나 결제까지 자동화해야 하는 경우
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

### Credential resolution order

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

기본 경로에 저장하는 것은 fallback일 뿐, 강제가 아니다.
Helper 자체는 `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 환경변수만 읽는다. vault나 `secrets.env` 를 사용하는 경우에도 실행 전에 해당 값을 환경변수로 주입한다.

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

`KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 가 설정되어 있는지 확인한다. 없으면 credential resolution order에 따라 확보한다.

시크릿이 없다는 이유로 대체 사이트, 캡차 우회, 비공식 예약 경로를 찾지 않는다.

### 2. Install runtime dependencies when missing

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

### 3. Run a vacancy lookup

이 스킬의 helper를 통해 조회한다. Helper는 Playwright로 숲나들e에 로그인해 CSRF/cookie와 공식 휴양림 ID 목록을 얻은 뒤, 월별예약조회 JSON endpoint만 호출한다.

2026-04-29 확인 기준, 로그인 없이 월별예약조회 화면에 접근하면 `401 Unauthorized`가 반환되고, 조회 endpoint는 JSON 대신 안내 HTML을 반환한다. 따라서 현재 helper는 로그인 세션/CSRF 확보를 필수 전제로 둔다.

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

## Done when

- 요청 날짜와 조회 범위가 명확하다.
- read-only 월별예약조회 helper를 최소 1회 실행했다.
- 빈 객실이 있으면 날짜/휴양림/객실을 정리했다.
- 빈 객실이 없으면 없다고 명확히 말했다.
- 예약/결제/대기열 우회는 시도하지 않았다.

## Failure modes

- 로그인 실패: `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 확인
- Playwright browser 미설치: `python3 -m playwright install chromium`
- fetch failure 일부 발생: 결과와 실패 개수를 함께 보고하고, 필요하면 `--refresh-session` 으로 1회 재조회
- 숲나들e 표면 변경: helper의 login/session bootstrap 또는 parser 점검 필요

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

- 조회 전용 스킬이다.
- 예약, 결제, 캡차 처리, 대기열 우회, 공격적인 반복 조회를 하지 않는다.
- 계정 시크릿은 환경변수 또는 `~/.config/k-skill/secrets.env` 로만 다룬다.
