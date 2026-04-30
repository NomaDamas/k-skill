# 자연휴양림 빈 객실 조회 가이드

대상 사이트는 숲나들e 공식 사이트 `https://foresttrip.go.kr/index.jsp` 이다. 이 기능은 해당 사이트의 자연휴양림 예약 가능 객실 **조회 자동화**만 수행한다.

## 이 기능으로 할 수 있는 일

- 숲나들e/자연휴양림 예약 가능 객실 조회
- 특정 날짜 또는 여러 날짜 기준 조회
- 전체 자연휴양림 또는 휴양림명/ID 기준 조회
- 숙박/야영 카테고리별 조회
- JSON 또는 사람이 읽기 좋은 텍스트 출력

이 기능은 **조회 전용 자동화**이다. 예약 신청, 결제, 캡차 처리, 대기열 우회, 반복 스나이핑은 하지 않는다.

## 먼저 필요한 것

- Python 3.9+
- Playwright Chromium
- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --check-deps
```

`--check-deps` 는 숲나들e 로그인이나 네트워크 조회를 수행하지 않고, 로컬 Python/Playwright Chromium 준비 상태만 확인한다.

## 필요한 환경변수

- `KSKILL_FORESTTRIP_ID`
- `KSKILL_FORESTTRIP_PASSWORD`

선택:

- 없음

### Credential resolution order

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

helper는 `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 환경변수를 읽는다. secret vault나 `secrets.env` 는 에이전트/사용자가 값을 꺼내 실행 환경에 주입하기 위한 저장 위치이며, helper가 임의로 계정 정보를 다른 곳에 저장하지 않는다.

## 처음 실행 순서

처음 쓰는 사용자는 의존성 확인 후 환경변수를 현재 shell에만 주입해서 1개 휴양림으로 먼저 조회한다.

```bash
export KSKILL_FORESTTRIP_ID="your-foresttrip-id"
export KSKILL_FORESTTRIP_PASSWORD="your-foresttrip-password"

python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --check-deps
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --forest-name 유명산 --text --dates 20260504
```

성공 여부를 먼저 보려면 전체 조회보다 `--forest-name` 또는 `--forest-id` 로 범위를 좁혀 실행한다. JSON 결과가 필요하면 같은 조건에 `--json` 을 사용한다.

## 입력값

- 날짜: `YYYYMMDD`
- 여러 날짜: `YYYYMMDD,YYYYMMDD`
- 조회 범위: 전체 자연휴양림, 휴양림 ID, 휴양림명 부분 일치
- 카테고리:
  - `01`: 숙박
  - `02`: 야영/캠핑
  - `01,02`: 숙박 + 야영/캠핑
- 고급 옵션:
  - `--week-range N`: `--dates` 를 생략했을 때만 오늘부터 N주 조회
  - `--concurrency N`: 병렬 조회 worker 수, 1-5 범위
  - `--session-cache PATH`: 로그인 세션 캐시 경로 override

## 기본 흐름

1. `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD` 를 확보한다.
2. 필요한 경우 `python3 -m pip install playwright` 와 `python3 -m playwright install chromium` 을 실행한다.
3. helper로 read-only 월별예약조회 endpoint를 실행한다.
4. helper가 로그인 세션, CSRF, 공식 휴양림 ID 목록을 확보한다.
5. 날짜, 휴양림명, 객실/시설명, 숙박/야영 구분, 정원 중심으로 요약한다.

2026-04-29 확인 기준, 로그인 없이 월별예약조회 화면에 접근하면 `401 Unauthorized`가 반환되고, 조회 endpoint는 JSON 대신 안내 HTML을 반환한다. 따라서 현재 구현은 로그인 세션/CSRF 확보를 필수 전제로 둔다.

## 검증 방식

메인테이너가 별도 숲나들e 계정을 새로 만들 필요는 없다.

- CI/리뷰 검증: `./scripts/validate-skills.sh`, `python3 -m py_compile ...`, `--help`, `--check-deps` 로 진행한다.
- 실제 조회 검증: 기여자 또는 이미 숲나들e 계정을 가진 사용자가 개인 계정으로 선택 실행한다.
- PR에는 실제 조회 결과의 `forests_scanned`, `fetch_failures`, `filter_hits` 같은 비민감 요약값만 기록하고, 계정 정보와 세션 쿠키는 공유하지 않는다.

## 예시

전체 자연휴양림에서 하루 조회:

```bash
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --all --text --dates 20260504
```

JSON으로 조회:

```bash
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --all --json --dates 20260504
```

여러 날짜 조회:

```bash
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --all --text --dates 20260504,20260505
```

야영/캠핑만 조회:

```bash
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --all --text --dates 20260504 --categories 02
```

휴양림명으로 좁혀 조회:

```bash
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --forest-name 유명산 --text --dates 20260504
```

로그인 세션 캐시를 무시하고 새로 조회:

```bash
python3 foresttrip-vacancy/scripts/run_foresttrip_vacancy.py --all --text --dates 20260504 --refresh-session
```

## 주의할 점

- 예약 자동화가 아니다.
- 결제, 캡차 처리, 대기열 우회는 하지 않는다.
- aggressive polling은 피한다.
- 조회 결과는 시점 차이로 숲나들e 화면과 달라질 수 있다.
- 로그인 실패 시 계정 정보 또는 숲나들e 정책 변경을 먼저 확인한다.

## 흔한 문제 해결

- `Playwright browser missing`: `python3 -m playwright install chromium` 을 실행한다.
- `Missing KSKILL_FORESTTRIP_ID` 또는 `Missing KSKILL_FORESTTRIP_PASSWORD`: 환경변수가 현재 shell에 주입됐는지 확인한다.
- 로그인 실패: 숲나들e 웹사이트에서 같은 계정으로 직접 로그인되는지 먼저 확인한다.
- 날짜/카테고리/출력 옵션 오류: helper가 로그인 전에 argparse error로 중단하므로 메시지에 맞춰 값을 고친다.
- JSON 대신 HTML 안내 페이지가 반환됨: 세션/CSRF가 없거나 만료된 상태일 수 있으므로 `--refresh-session` 으로 1회 재조회한다.
- 일부 휴양림 fetch failure: 성공한 결과와 실패 개수를 함께 보고하고, 반복 polling으로 보정하지 않는다.
