---
name: ktx-booking
description: Search, reserve, inspect, and cancel KTX, ITX-청춘, ITX-새마을, 무궁화 and other Korail tickets in Korea with the korail2 + pycryptodome Python packages. Use when the user asks for KTX/ITX seats, Korail bookings, train changes, or reservation status.
license: MIT
metadata:
  category: travel
  locale: ko-KR
  phase: v1
---

# KTX Booking

## What this skill does

`korail2` 위에 `scripts/ktx_booking.py` helper 를 얹어 KTX/Korail 조회, 예약, 예약 확인, 취소를 처리한다.

최근 Korail 앱의 Dynapath anti-bot 체크 때문에 원본 `korail2` 0.4.0 예제만으로는 `MACRO ERROR` 가 날 수 있다. 이 스킬은 helper 가 `x-dynapath-m-token`, `Sid`, 최신 app version(`250601002`)을 붙여 실제 예매 흐름을 복구하는 것을 전제로 한다.

## When to use

- "서울에서 부산 가는 KTX 찾아줘"
- "남춘천에서 용산 가는 ITX-청춘 찾아줘"
- "코레일 예약 확인해줘"
- "KTX 취소해줘"
- "오전 9시 이후 KTX 중 제일 빠른 거 잡아줘"

## When not to use

- SRT 예매인 경우
- 실결제 확정까지 자동화해야 하는 경우
- credential 을 평문으로 넣으려는 경우

## Prerequisites

- Python 3.10+
- `python3 -m pip install korail2 pycryptodome`

## Required environment variables

- `KSKILL_KTX_ID`
- `KSKILL_KTX_PASSWORD`

### Credential resolution order

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

기본 경로에 저장하는 것은 fallback일 뿐, 강제가 아니다.

## Inputs

- 출발역
- 도착역
- 날짜: `YYYYMMDD`
- 희망 시작 시각: `HHMMSS`
- 인원 수와 승객 유형
- 좌석 선호
- 조회 결과에서 복사한 `train_id`

## Workflow

### 0. Install the package globally when missing

`python3 -c 'import korail2, Crypto'` 가 실패하면 다른 구현으로 우회하지 말고 전역 Python 패키지 설치를 먼저 시도한다.

```bash
python3 -m pip install korail2 pycryptodome
```

### 1. Ensure credentials are available

`KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` 환경변수가 설정되어 있는지 확인한다. 없으면 위 credential resolution order에 따라 확보한다.

시크릿이 없다는 이유로 웹사이트를 직접 긁거나 다른 비공식 경로를 찾지 않는다.

### 2. Search first via the helper

항상 helper 를 통해 조회한다.

```bash
python3 scripts/ktx_booking.py search 서울 부산 20260328 090000 --limit 5
```

좌석이 없는 열차도 후보에 포함하려면 `--include-no-seats`, 예약 대기 가능한 열차도 같이 보고 싶으면 `--include-waiting-list` 를 붙인다.

### 3. Present the shortlist

예매 전에 항상 아래를 확인한다.

- `index`
- `train_id`
- 출발/도착 시각
- KTX 여부
- 일반실/특실 가능 여부
- 예약 대기 가능 여부

### 4. Reserve only after the target train is unambiguous

조회 결과의 `train_id` 를 고른 뒤에만 예약한다. 이 값은 helper 가 열차 번호/운행일/시각/역 코드를 묶어 만든 stable selector 이므로, 재조회 시 같은 열차가 아직 있으면 그대로 잡고 없으면 실패한다.

```bash
python3 scripts/ktx_booking.py reserve 서울 부산 20260328 090000 --train-id <train_id> --seat-option general-first
```

응답에는 예약번호, 운임, 구입기한이 포함된다. **결제는 자동화하지 않는다.**
좌석이 없을 때는 조회 단계에서 `--include-waiting-list` 를 켜고 예약 단계에서 `--try-waiting` 으로 예약 대기까지 시도할 수 있다.

### 5. Inspect or cancel

취소는 대상 예약을 다시 조회해 식별한 뒤에만 진행한다.

```bash
python3 scripts/ktx_booking.py reservations
```

```bash
python3 scripts/ktx_booking.py cancel <reservation_id>
```

## Done when

- 조회면 열차 후보가 정리되어 있다
- 예약이면 예약 결과와 제한 시간이 확인되어 있다
- 취소면 어떤 예약을 취소했는지 남아 있다

## Failure modes

- 로그인 실패
- 매진
- Korail anti-bot 규칙 변경

## Notes

- `scripts/ktx_booking.py` 는 upstream `korail2` anti-bot 회귀를 보완하는 helper 다
- 조회는 KTX뿐 아니라 ITX-청춘·ITX-새마을·무궁화호 등 전체 열차(`TrainType.ALL`)를 대상으로 한다
- `korail2` 는 Korail 전용 표면이라 train type 과 passenger model 이 분명하다
- 결제 완료까지는 자동화하지 않는다
- aggressive polling 은 피한다
