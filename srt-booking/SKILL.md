---
name: srt-booking
description: Search, reserve, inspect, and cancel SRT tickets in Korea with the koreantrain Python package. Use when the user asks for SRT seat availability, booking, canceling, or sold-out retry plans.
license: MIT
metadata:
  category: travel
  locale: ko-KR
  phase: v1
---

# SRT Booking

## What this skill does

`koreantrain` 위에서 SRT 좌석을 조회하고, 조건이 맞으면 예약과 취소까지 진행한다.

## When to use

- "수서에서 부산 가는 SRT 찾아줘"
- "내일 오전 SRT 빈자리 있으면 잡아줘"
- "예약 내역 확인해줘"
- "이 SRT 예약 취소해줘"

## When not to use

- 결제까지 자동으로 끝내야 하는 경우
- 비밀번호를 채팅창에 직접 보내려는 경우
- SRT가 아니라 KTX/Korail 예매인 경우

## Prerequisites

- Python 3.10+
- `python -m pip install koreantrain`
- `sops` and `age` installed
- common setup reviewed in `../k-skill-setup/SKILL.md`
- secret policy reviewed in `../docs/security-and-secrets.md`

## Required secrets

- `KSKILL_SRT_ID`
- `KSKILL_SRT_PASSWORD`

평문 비밀번호는 금지한다. 항상 `sops exec-env ...` 패턴을 사용한다.

## Inputs

- 출발역
- 도착역
- 날짜: `YYYYMMDD`
- 희망 시작 시각: `HHMMSS`
- 인원 수와 승객 유형
- 좌석 선호: 일반실 / 특실

## Workflow

### 1. Validate secrets path

비밀번호를 직접 받지 않는다. 필요한 경우 encrypted secrets file 경로와 변수 이름만 확인한다.

### 2. Search first

먼저 조회해서 후보를 요약한다.

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" 'python - <<'"'"'PY'"'"'
import os
from koreantrain import SRTService

svc = SRTService(os.environ["KSKILL_SRT_ID"], os.environ["KSKILL_SRT_PASSWORD"])
trains = svc.search("수서", "부산", "20260328", "080000", time_limit="120000")

for idx, train in enumerate(trains[:5], start=1):
    print(idx, train)
PY
'
```

### 3. Summarize options before side effects

예약 전에는 항상 아래를 짧게 정리한다.

- 출발/도착 시각
- 일반실/특실 가능 여부
- 예상 운임

### 4. Reserve only after the train is fixed

예약은 부작용이 있으므로 정확한 열차를 고른 뒤에만 진행한다.

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" 'python - <<'"'"'PY'"'"'
import os
from koreantrain import Passenger, SRTService, SeatType

svc = SRTService(os.environ["KSKILL_SRT_ID"], os.environ["KSKILL_SRT_PASSWORD"])
trains = svc.search("수서", "부산", "20260328", "080000", time_limit="120000")
reservation = svc.reserve(
    trains[0],
    passengers=[Passenger.adult(1)],
    seat_type=SeatType.GENERAL_FIRST,
)
print(reservation)
PY
'
```

### 5. Inspect or cancel

예약 확인이나 취소도 같은 credential path를 유지한다. 취소 전에는 대상 예약을 다시 식별한다.

## Done when

- 조회 요청이면 후보 열차가 정리되어 있다
- 예약 요청이면 예약 결과, 운임, 구입기한이 확인되어 있다
- 취소 요청이면 어떤 예약을 취소했는지 명확하다

## Failure modes

- 로그인 오류: 계정 정보나 SRT site policy 변경 가능성 확인
- 매진: 다른 시간대나 좌석 타입으로 재조회
- 네트워크 오류: 짧게 재시도하되 aggressive polling은 피하기

## Notes

- `koreantrain`은 통합 API지만 SRT는 내부적으로 비공식 표면에 의존할 수 있다
- 자동 재시도 루프는 계정 보호 차원에서 짧고 보수적으로 유지한다
