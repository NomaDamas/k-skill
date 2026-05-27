# 공연 일정·잔여석 조회 가이드

## 이 기능으로 할 수 있는 일

- YES24 (`ticket.yes24.com`) 공연의 일정과 등급별 잔여석 수를 단일 HTTP 호출로 조회
- 인터파크 (`tickets.interpark.com`) 공연의 일정과 등급별 잔여석 수를 단일 HTTP 호출로 조회
- 공연 URL 또는 `platform:id` 표기 (`yes24:58026`, `interpark:26000541`) 로 입력
- 회차별 등급명·잔여수 (YES24 는 노출가 포함) 를 JSON 으로 정리

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- `python3` (3.9 이상) 와 `httpx` 패키지
- 인터넷 연결

`httpx` 설치:

```bash
pip install httpx
```

## v1 범위

이 기능은 **공개 endpoint / 조회 전용** 범위로 제공된다.

- YES24 의 `axPerfDay.aspx`, `axPerfPlayTime.aspx`, `axPerfRemainSeat.aspx` 와 인터파크의 `api-ticketfront.interpark.com/v1/goods/<id>/playSeq` 만 호출한다.
- 회차 단위 일정·등급별 잔여석 *수* 만 정규화한다.
- 예매·결제·취소·환불·좌석 선택·로그인 자동화는 **의도적으로 포함하지 않는다**. 매크로를 이용한 입장권 부정구매·판매는 공연법 §4조의2 (2023.9.22 시행) 에 따라 형사처벌 대상이다.
- 차단 우회, CAPTCHA 우회, fingerprint spoofing, headless 감지 우회는 사용하지 않는다.

## 기본 흐름

1. 공연 URL 또는 `platform:id` 를 받아온다.
2. 일정만 필요하면 `schedule`, 등급별 잔여석까지 필요하면 `seats` 를 호출한다.
3. 결과 JSON 에서 회차별 날짜·시각·등급·잔여수를 정리하고 "조회 시각 기준" 임을 함께 안내한다.
4. 사용자가 페이지에서 직접 결제하도록 안내한다 — 스킬이 결제·예매 흐름을 대신하지 않는다.

## 예시

### 일정 조회 (인터파크)

```bash
python3 scripts/ticket_availability.py schedule "https://tickets.interpark.com/goods/26000541"
```

응답 (요약):

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

### 일정 조회 (YES24, 기본 3주 윈도우)

```bash
python3 scripts/ticket_availability.py schedule "https://ticket.yes24.com/Perf/58026"
```

6개월 전체:

```bash
python3 scripts/ticket_availability.py schedule "yes24:58026" --all-dates
```

### 등급별 잔여석 조회

```bash
python3 scripts/ticket_availability.py seats "interpark:26000541"
```

응답 (요약, 회차당 1개 키):

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

YES24 응답은 회차별 `time_label` (예: `1회`, `2회`) 와 등급별 `price` (노출가, 예: `110,000원`) 가 함께 들어온다.

### 헬스체크

```bash
python3 scripts/ticket_availability.py health
```

응답:

```json
{
  "yes24": {"status": 200, "ok": true},
  "interpark": {"status": 200, "ok": true}
}
```

### 한 줄 JSON (파이프용)

```bash
python3 scripts/ticket_availability.py seats "interpark:26000541" --compact
```

## 출력에서 확인할 점

- `platform` 이 `yes24` 또는 `interpark` 인지
- `schedule[].date`, `time` 또는 `time_label` 이 채워졌는지
- `seats[<key>].seats[].grade` 와 `remain` 이 채워졌는지
- 잔여 0 인 등급이 매진된 등급인지 (조회 시각 기준이라 실시간 변동 가능)

## 실패 모드

- **빈 `schedule`**: 공연 ID 가 유효하지만 향후 3주 (또는 6개월) 내 일정이 없을 때. `--all-dates` 또는 다른 ID 확인을 안내한다.
- **인터파크 `data: []`**: goods_code 가 지나간 공연이거나 오픈 전 / 비공개. 다른 ID 확인을 안내한다.
- **HTTP 4xx/5xx**: 차단·일시 장애. 우회 시도하지 않고 `http error` 메시지를 그대로 반환한다.
- **HTML 응답 스키마 변경**: YES24 `axPerfRemainSeat.aspx` 는 HTML 정규식 파싱이라 사이트 갱신 시 영향 가능. 잔여 0 으로 잘못 보고될 가능성이 있어 "조회 시각 기준" 임을 명시한다.
- **rate-limit**: `seats` 명령은 회차별로 순차 호출한다 (Interpark 0.3s, YES24 0.4s 간격). 100 회차 짜리 공연이면 30 ~ 40 초 소요. 짧은 모니터링 루프에 넣지 말 것.

## 보안·법적 주의

- 본 스킬은 **조회 전용** 이다. 시크릿·로그인 세션·자동 예매·자동 결제·좌석 선택을 일체 포함하지 않는다.
- 공연법 §4조의2 (2023.9.22 시행): 매크로 프로그램을 이용한 입장권 부정구매·판매는 형사처벌 대상. 이 스킬은 의도적으로 그 경로를 막아두었다.
- 등급별 잔여 *수치* 만 인용하고, 좌석 번호·좌석 위치는 노출하지 않는다.

## 참고

- v1 은 비로그인 / 공개 endpoint / 단일 HTTP 호출 범위다.
- 헤더는 `User-Agent` + `Referer` + JSON `Accept` 만 사용한다 (`Cookie`, `Authorization` 없음).
- `httpx` 외 외부 의존성은 없다.
