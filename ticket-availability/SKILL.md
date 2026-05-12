---
name: ticket-availability
description: YES24 / 인터파크 공연의 공개 일정 + 등급별 잔여석을 단일 HTTP 호출로 조회 (조회 전용, 예매·결제 없음).
license: MIT
metadata:
  category: lifestyle
  subcategory: ticket
  locale: ko-KR
  phase: v1
---

# Ticket Availability

## What this skill does

YES24 (`ticket.yes24.com`) 와 인터파크 (`tickets.interpark.com`) 의 공개 BFF JSON / Ajax endpoint 를 단일 HTTP 요청으로 호출해 공연 일정과 등급별 잔여석 수를 정규화한다.

- 공연 URL 또는 `platform:id` 표기로 입력을 받는다.
- 일정 (날짜·시간·회차) 조회.
- 등급별 잔여석 수 조회 (등급명, 잔여수, YES24의 경우 노출가).
- 좌석맵 / 좌석 선택 / 예매 / 결제 / 로그인 세션 접근은 하지 않는다.
- CloakBrowser, Playwright, fingerprint spoofing, CAPTCHA 우회를 사용하지 않는다 (`httpx` only).

## When to use

- "오늘 인터파크 ○○ 공연 잔여석 있어?"
- "YES24 콘서트 ID 58026 일정 알려줘"
- "이 공연 R석 몇 자리 남았어?"
- "공연 URL 줄게, 회차별 잔여석 확인해줘"

## When not to use

- 예매·결제·취소·환불 처리 — **공연법 §4조의2 (2023.9 시행) 매크로 입장권 부정구매·판매 금지** 대상이며 이 스킬은 의도적으로 예매를 지원하지 않는다.
- 좌석 선택, 좌석맵 시각화, 특정 좌석 번호 확인 — 잔여 *수* 만 노출한다.
- 회원 등급별 우선 예매, 쿠폰가, 카드사 할인가 — 공개 endpoint 만 사용한다.
- 차단 우회, CAPTCHA 우회, headless 감지 우회 — `httpx` 한 호출로 안 되면 실패 모드로 처리하고 종료한다.

## Required inputs

공연 URL 또는 `platform:id` 표기가 없으면 먼저 물어본다.

권장 질문:

> 확인하실 공연의 YES24 또는 인터파크 URL을 알려주세요.
> 예: `https://tickets.interpark.com/goods/26000541`
>     `https://ticket.yes24.com/Perf/58026`

## Prerequisites

- Python 3.9+
- `httpx` (표준 패키지)

설치:

```bash
pip install httpx
```

## Workflow

### 1. URL 파싱

| 입력 | 매칭 |
|---|---|
| `https://tickets.interpark.com/goods/<goods_code>` | platform=interpark |
| `https://ticket.yes24.com/Perf/<perf_id>` | platform=yes24 |
| `https://ticket.yes24.com/New/Perf/Detail/View/<perf_id>` | platform=yes24 |
| `yes24:<id>` / `interpark:<id>` | shorthand |

### 2. 일정 조회 (`schedule`)

```bash
python3 scripts/ticket_availability.py schedule "https://tickets.interpark.com/goods/26000541"
```

응답 — Interpark:
```json
{
  "platform": "interpark",
  "id": "26000541",
  "schedule": [
    {"date": "2026-05-13", "time": "14:30", "play_seq": "055"},
    {"date": "2026-05-14", "time": "19:30", "play_seq": "057"}
  ]
}
```

응답 — YES24:
```json
{
  "platform": "yes24",
  "id": "58026",
  "schedule": [
    {"date": "2026-05-16", "time_label": "1회", "id_time": "1432397"}
  ]
}
```

YES24 는 기본 3주 윈도우. 6개월 전체는 `--all-dates` 추가.

### 3. 잔여석 조회 (`seats`)

```bash
python3 scripts/ticket_availability.py seats "interpark:26000541"
```

응답:
```json
{
  "platform": "interpark",
  "id": "26000541",
  "seats": {
    "2026-05-13|14:30|055": {
      "date": "2026-05-13", "time": "14:30", "play_seq": "055",
      "seats": [
        {"grade": "VIP석", "remain": 150},
        {"grade": "R석",  "remain": 36},
        {"grade": "S석",  "remain": 82},
        {"grade": "A석",  "remain": 71}
      ]
    }
  }
}
```

YES24 응답은 등급별 `price` (노출가) 도 포함:
```json
{"grade": "전석", "price": "110,000원", "remain": 2}
```

### 4. 헬스체크 (`health`)

```bash
python3 scripts/ticket_availability.py health
```

응답:
```json
{"yes24": {"status": 200, "ok": true}, "interpark": {"status": 200, "ok": true}}
```

## Output format

기본 출력은 들여쓰기 JSON. 파이프/스크립트용은 `--compact` 추가 (한 줄 JSON).

## Endpoints used

이 스킬이 호출하는 공개 endpoint 만:

| Platform | Method | URL |
|---|---|---|
| YES24 | POST | `https://ticket.yes24.com/New/Perf/Sale/Ajax/axPerfDay.aspx` |
| YES24 | POST | `https://ticket.yes24.com/NEw/Perf/Detail/Ajax/axPerfPlayTime.aspx` |
| YES24 | POST | `https://ticket.yes24.com/New/Perf/Detail/Ajax/axPerfRemainSeat.aspx` |
| Interpark | GET | `https://api-ticketfront.interpark.com/v1/goods/<id>/playSeq` |
| Interpark | GET | `https://api-ticketfront.interpark.com/v1/goods/<id>/playSeq/PlaySeq/<seq>/REMAINSEAT` |

전부 비로그인 / 무인증. 헤더는 `User-Agent` + `Referer` + JSON `Accept` 만.

## Failure modes

- **YES24 `schedule` 결과 빈 배열**: 공연 ID 가 유효하지만 향후 3주(또는 6개월) 내 일정이 없음. ID 자체가 잘못된 경우와 구분되지 않으므로, 사용자에게 `--all-dates` 또는 다른 ID 확인을 안내한다.
- **Interpark `data: []`**: goods_code 가 지나갔거나 아직 오픈 전 / 비공개. 다른 ID 확인을 안내한다.
- **HTTP 4xx/5xx**: 차단/일시 장애. 우회 시도하지 않고 `http error` 출력 후 종료.
- **JSON 스키마 변경**: YES24 axPerfRemainSeat 는 HTML 응답을 정규식으로 파싱 — 사이트 갱신 시 영향 가능. `remain` 0 으로 잘못 보고될 수 있어 사용자에게 "조회 시각 기준" 이라고 표기.
- **공연 매진**: API 는 `remain: 0` 반환. 매진 표시.

## Response style

- 잔여석은 "조회 시각 기준" 으로 표현한다 (실시간 변동).
- "매크로", "선점", "오픈런", "자동 예매" 표현 금지 — 이 스킬은 조회 전용.
- 잔여석 수치 + 등급명 만 인용. 좌석 번호 / 좌석 위치는 노출하지 않는다.
- "지금 사라" 같은 행위 유도 금지 — 사용자가 직접 페이지에서 결제.

## Notes

- 본 스킬은 의도적으로 **예매 / 결제 / 좌석선택 / 로그인 자동화** 를 포함하지 않는다. 매크로를 통한 입장권 부정구매·판매는 공연법 §4조의2 (2023.9.22 시행) 에 의해 형사처벌 대상.
- 시크릿 / 키 / 로그인 세션 일체 사용하지 않는다.
- Rate limit: `seats` 명령은 회차별 순차 호출 — Interpark 0.3s, YES24 0.4s 간격. 100회차 짜리 공연이면 약 30s ~ 40s 소요. 짧은 모니터링 루프에 넣지 말 것.

## Done when

- 공연 URL 또는 `platform:id` 가 확인되었다.
- 일정 또는 잔여석 결과 JSON 을 반환하거나, 빈 결과 사유를 설명했다.
- 예매 / 결제 / 좌석 선택 기능을 자동화하지 않았다.
- 조회 시각 기준임을 안내했다.
