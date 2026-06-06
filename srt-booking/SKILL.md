---
name: srt-booking
description: Search, reserve, inspect, and cancel SRT tickets in Korea with the SRTrain library. Use when the user asks for SRT seat availability, booking, canceling, or sold-out retry plans.
license: MIT
metadata:
  category: travel
  locale: ko-KR
  phase: v1
---

# SRT Booking

## What this skill does

`SRTrain` 위에 `scripts/srt_booking.py` helper 를 얹어 SRT 조회와 호차별 좌석번호 확인을 처리하고, 예약과 취소는 고정된 열차/예약을 다시 식별한 뒤 `SRTrain`으로 진행한다.

## When to use

- "수서에서 부산 가는 SRT 찾아줘"
- "내일 오전 SRT 빈자리 있으면 잡아줘"
- "SRT 5호차 빈 좌석 확인해줘"
- "SRT 11A 좌석이 비었는지 봐줘"
- "창측 좌석을 우선해서 SRT 빈자리 보여줘"
- "예약 내역 확인해줘"
- "이 SRT 예약 취소해줘"

## When not to use

- 결제까지 자동으로 끝내야 하는 경우
- 비밀번호를 채팅창에 직접 보내려는 경우
- SRT가 아니라 KTX/Korail 예매인 경우

## Prerequisites

- Python 3.10+
- `python3 -m pip install SRTrain`

## Required environment variables

- `KSKILL_SRT_ID`
- `KSKILL_SRT_PASSWORD`

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
- 좌석 선호: 일반실 / 특실
- 좌석 상세 조건: 객실 등급, 호차 번호, 좌석 번호, 빈 좌석만 보기, 탐색 우선순위

## Workflow

### 0. Install the package globally when missing

`python3 -c 'import SRT'` 가 실패하면 다른 구현으로 우회하지 말고 전역 Python 패키지 설치를 먼저 시도한다.

```bash
python3 -m pip install SRTrain
```

### 1. Ensure credentials are available

`KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD` 환경변수가 설정되어 있는지 확인한다. 없으면 위 credential resolution order에 따라 확보한다.

시크릿이 없다는 이유로 웹사이트를 직접 긁거나 다른 비공식 경로를 찾지 않는다.

### 2. Search first

먼저 helper 로 조회해서 후보를 요약한다.

```bash
python3 scripts/srt_booking.py search 수서 부산 20260328 080000 --time-limit 120000 --limit 5
```

### 3. Summarize options before side effects

예약 전에는 항상 아래를 짧게 정리한다.

- 출발/도착 시각
- 일반실/특실 가능 여부
- 예상 운임

### 4. Inspect detailed seats when the user asks for seat numbers

`search` 의 좌석 가능 여부는 열차 단위 플래그다. 사용자가 "남은 좌석 번호", "호차별 좌석", "특정 좌석", "창측/순방향 자리", "예약 전에 자리 확인"처럼 구체적인 좌석을 물으면 예약 전에 `seats` 를 호출한다.

```bash
python3 scripts/srt_booking.py seats 수서 부산 20260328 080000 --train-id <train_id>
```

특정 호차의 빈 좌석만 확인하려면 `--car-no` 와 `--available-only` 를 쓴다.

```bash
python3 scripts/srt_booking.py seats 수서 부산 20260328 080000 --train-id <train_id> --car-no 5 --available-only
```

특정 좌석이 비었는지 확인하려면 `--seat` 를 붙인다.

```bash
python3 scripts/srt_booking.py seats 수서 부산 20260328 080000 --train-id <train_id> --car-no 5 --seat 11A
```

특정 호차를 지정하지 않으면 가운데 호차부터 탐색한다. `--car-priority center|low|high` 로 호차 탐색 순서를 바꾸고, `--seat-priority forward-window|window-forward|row-low` 로 좌석 정렬 우선순위를 바꾼다.

상세 좌석 응답을 보여줄 때는 아래를 우선 요약한다.

- 호차별 `available_seat_count`
- 남은 좌석 번호 (`available_seats`)
- 좌석별 `direction`, `position`
- 특정 좌석 요청이면 `requested_seat_available`

이 기능은 좌석을 선택/선점하지 않는다. 실제 예약은 다음 단계에서만 진행한다.

### 5. Reserve only after the train is fixed

예약은 부작용이 있으므로 정확한 열차를 고른 뒤에만 진행한다.

```bash
python3 - <<'PY'
import os
from SRT import Adult, SRT, SeatType

srt = SRT(os.environ["KSKILL_SRT_ID"], os.environ["KSKILL_SRT_PASSWORD"])
trains = srt.search_train("수서", "부산", "20260328", "080000", time_limit="120000")
reservation = srt.reserve(
    trains[0],
    passengers=[Adult(1)],
    special_seat=SeatType.GENERAL_FIRST,
)
print(reservation)
PY
```

### 6. Inspect or cancel

취소 전에는 대상 예약을 다시 식별한다.

```bash
python3 - <<'PY'
import os
from SRT import SRT

srt = SRT(os.environ["KSKILL_SRT_ID"], os.environ["KSKILL_SRT_PASSWORD"])
reservations = srt.get_reservations()
print(reservations)
PY
```

## Done when

- 조회 요청이면 후보 열차가 정리되어 있다
- 좌석 상세 확인이면 호차별 남은 좌석번호나 특정 좌석 공석 여부가 정리되어 있다
- 예약 요청이면 예약 결과, 운임, 구입기한이 확인되어 있다
- 취소 요청이면 어떤 예약을 취소했는지 명확하다

## Failure modes

- 로그인 오류: 계정 정보나 SRT site policy 변경 가능성 확인
- 매진: 다른 시간대나 좌석 타입으로 재조회
- 좌석선택 페이지 형식 변경: helper 파서 업데이트 필요
- 네트워크 오류: 짧게 재시도하되 aggressive polling은 피하기

## Notes

- 상세 좌석 확인은 SRT 웹 좌석선택 페이지를 조회 전용으로 읽는다
- `SRTrain`은 SRT 전용 라이브러리라서 스킬 의도가 더 선명하다
- 결제 완료까지는 자동화하지 않는다
- 자동 재시도 루프는 계정 보호 차원에서 짧고 보수적으로 유지한다
