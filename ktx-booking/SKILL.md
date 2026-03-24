---
name: ktx-booking
description: Search, reserve, inspect, and cancel KTX or Korail tickets in Korea with the koreantrain Python package. Use when the user asks for KTX seats, Korail bookings, train changes, or reservation status.
license: MIT
metadata:
  category: travel
  locale: ko-KR
  phase: v1
---

# KTX Booking

## What this skill does

`koreantrain`의 Korail interface로 KTX/Korail 열차 조회, 예약, 예약 확인, 취소를 처리한다.

## When to use

- "서울에서 부산 가는 KTX 찾아줘"
- "코레일 예약 확인해줘"
- "KTX 취소해줘"
- "오전 9시 이후 KTX 중 제일 빠른 거 잡아줘"

## When not to use

- SRT 예매인 경우
- 실결제 확정까지 자동화해야 하는 경우
- credential을 평문으로 넣으려는 경우

## Prerequisites

- Python 3.10+
- `python -m pip install koreantrain`
- `sops` and `age` installed
- common setup reviewed in `../k-skill-setup/SKILL.md`
- secret policy reviewed in `../docs/security-and-secrets.md`

## Required secrets

- `KSKILL_KTX_ID`
- `KSKILL_KTX_PASSWORD`

## Inputs

- 출발역
- 도착역
- 날짜: `YYYYMMDD`
- 희망 시작 시각: `HHMMSS`
- 인원 수와 승객 유형
- 좌석 선호

## Workflow

### 1. Search first

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" 'python - <<'"'"'PY'"'"'
import os
from koreantrain import KorailService

svc = KorailService(
    os.environ["KSKILL_KTX_ID"],
    os.environ["KSKILL_KTX_PASSWORD"],
    train_type="ktx",
)
trains = svc.search("서울", "부산", "20260328", "090000", time_limit="130000")

for idx, train in enumerate(trains[:5], start=1):
    print(idx, train)
PY
'
```

### 2. Present the shortlist

예매 전에 항상 아래를 확인한다.

- 출발/도착 시각
- KTX 여부
- 좌석 가능 여부
- 가격

### 3. Reserve only after the target train is unambiguous

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" 'python - <<'"'"'PY'"'"'
import os
from koreantrain import KorailService, Passenger, SeatType

svc = KorailService(
    os.environ["KSKILL_KTX_ID"],
    os.environ["KSKILL_KTX_PASSWORD"],
    train_type="ktx",
)
trains = svc.search("서울", "부산", "20260328", "090000", time_limit="130000")
reservation = svc.reserve(
    trains[0],
    passengers=[Passenger.adult(1)],
    seat_type=SeatType.GENERAL_FIRST,
)
print(reservation)
PY
'
```

### 4. Inspect or cancel

취소는 대상 예약을 다시 조회해 식별한 뒤에만 진행한다.

## Done when

- 조회면 열차 후보가 정리되어 있다
- 예약이면 예약 결과와 제한 시간이 확인되어 있다
- 취소면 어떤 예약을 취소했는지 남아 있다

## Failure modes

- 로그인 실패
- 매진
- 사이트 응답 형식 변경

## Notes

- `koreantrain`은 SRT와 KTX를 같은 인터페이스로 다룰 수 있어 v1 구현을 얇게 유지하기 좋다
- aggressive polling은 피한다
