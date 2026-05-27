---
name: flight-ticket-search
description: Google Flights 공개 검색 표면을 무료로 조회해 항공권 후보, 예약 검색 링크, 날짜/월/연도별 최저가·평균가 비교를 보수적으로 제공한다.
license: MIT
metadata:
  category: travel
  locale: ko-KR
  phase: v1
---

# Flight Ticket Search

## What this skill does

`fast-flights` 기반으로 Google Flights의 공개 검색 결과를 조회해 항공권 후보를 정리한다. API key, 로그인, 결제, CAPTCHA 우회 없이 무료 공개 표면만 사용한다.

제공 기능:

- 편도/왕복 항공권 검색
- Google Flights 예약 검색 링크 생성
- 상위 후보 가격, 항공사, 출도착 시간, 소요시간, 경유 수 정리
- 날짜 범위, 월별, 연도별 샘플 비교
- 최저가, 평균가, 최고가 및 `low`/`typical`/`high` 가격 band 요약

예약 링크는 특정 판매자 결제 deep link가 아니라 **Google Flights 검색 결과 링크**다. 실제 구매·결제·좌석 선택은 사용자가 브라우저에서 직접 진행해야 한다.

## When to use

- "항공권 조회해줘"
- "인천에서 나리타 다음 달 최저가"
- "6월 ICN-NRT 월별 비교"
- "올해랑 내년 6월 1일 항공권 가격 비교"
- "서울에서 도쿄 왕복 예약 링크 줘"
- "ICN-LAX 비즈니스 가격 대략 비교해줘"

## When not to use

- 실제 예약/결제/취소/좌석지정 자동화
- 로그인 회원가, 카드 할인, 쿠폰, 마일리지 적용가 확정
- CAPTCHA, fingerprint, bot-block 우회
- 스카이스캐너 직접 조회. 현재 `skyscanner.net`은 기본 접속부터 CAPTCHA/403이 걸리므로 안정 skill provider로 쓰지 않는다.

## Required inputs

최소 입력:

- 출발 공항 IATA 코드: `ICN`, `GMP`, `PUS` 등
- 도착 공항 IATA 코드: `NRT`, `HND`, `LAX` 등
- 출발일 `YYYY-MM-DD` 또는 비교할 월/범위

선택 입력:

- 왕복 귀국일 `YYYY-MM-DD`
- 성인 수, 기본 1명
- 좌석 등급: `economy`, `premium-economy`, `business`, `first`
- 비교 샘플 방식: 월별 `weekly` 또는 `daily`

사용자가 도시명만 말하면 IATA 코드를 추론하되 애매하면 확인한다. 흔한 기본값은 다음처럼 처리한다.

- 서울/인천 국제선: `ICN`
- 서울 국내선/제주: `GMP` 우선, 사용자가 인천을 말하면 `ICN`
- 도쿄: 나리타 `NRT` 또는 하네다 `HND` 중 사용자가 지정하지 않으면 둘 중 하나를 확인한다.
- 제주: `CJU`

## Helper script

이 skill은 저장소 내 helper를 직접 실행한다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py --help
```

최초 실행 시 `~/.cache/k-skill/flight-ticket-search/venv`에 `fast-flights==2.2`를 설치하고 그 venv로 재실행한다. 저장소에는 의존성 vendoring이나 API key를 넣지 않는다.

## Single search

편도:

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py search \
  --from ICN \
  --to NRT \
  --date 2026-06-01 \
  --adults 1 \
  --seat economy \
  --limit 5 \
  --format markdown
```

왕복:

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py search \
  --from ICN \
  --to NRT \
  --date 2026-06-01 \
  --return-date 2026-06-08 \
  --adults 1 \
  --seat economy \
  --limit 5
```

응답 주요 필드:

- `meta.booking_search_url` — Google Flights 예약 검색 링크
- `meta.price_band` — Google이 표시하는 `low`/`typical`/`high` 가격 band
- `stats.min_price`, `stats.avg_price`, `stats.max_price`
- `flights[].name`, `departure`, `arrival`, `duration`, `stops`, `price_text`
- `flights[].quality` — `complete` 또는 `partial`

## Monthly comparison

월별 비교는 지정 월의 날짜들을 실제 검색해 각 날짜의 최저가/평균가를 비교한다.

빠른 기본값은 주 1회 샘플링이다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-month \
  --from ICN \
  --to NRT \
  --month 2026-06 \
  --sample weekly \
  --limit 5
```

일별 전체 조회가 필요하면 `--sample daily`를 쓴다. 다만 28~31회 요청이 발생하므로 rate limit을 위해 `--sleep`을 1.5초 이상 유지한다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-month \
  --from ICN \
  --to NRT \
  --month 2026-06 \
  --sample daily \
  --sleep 2 \
  --limit 10
```

월별 비교 응답:

- `stats.min_price` — 샘플 날짜 중 최저가
- `stats.avg_of_daily_min` — 날짜별 최저가의 평균
- `stats.max_of_daily_min` — 날짜별 최저가 중 최고값
- `cheapest_dates[]` — 가장 싼 날짜와 예약 검색 링크
- `rows[]` — 날짜별 성공/실패 및 요약

## Custom range comparison

사용자가 "다음주부터 2주간", "6월 1일부터 20일까지"처럼 범위를 주면 날짜 범위 비교를 사용한다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-range \
  --from ICN \
  --to BKK \
  --start-date 2026-06-01 \
  --end-date 2026-06-20 \
  --step-days 3 \
  --limit 5
```

`--step-days 1`은 일별 비교, `7`은 주별 비교다.

## Year comparison

연도 비교는 같은 월일을 여러 연도에 대해 조회한다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-years \
  --from ICN \
  --to NRT \
  --years 2026,2027 \
  --month-day 06-01 \
  --limit 5
```

주의: Google Flights가 너무 먼 미래 날짜를 표시하지 않으면 해당 연도는 실패로 기록한다. 실패한 날짜를 숨기지 말고 `failures`에 같이 보고한다.

## Reservation link policy

- `booking_search_url`은 Google Flights 검색 URL이다.
- 특정 항공사/OTA 결제 단계 deep link를 자동 추출하거나 클릭하지 않는다.
- 결제·예약 확정·로그인·여권 정보 입력은 skill 범위 밖이다.
- 사용자가 예약까지 원하면 링크를 열어 직접 확인하도록 안내한다.

## Response style

대표님에게는 짧게 핵심부터 보고한다.

좋은 형식:

```text
ICN → NRT / 2026-06-01 / 성인 1명 / economy
가격 band: typical
최저/평균/최고: ₩129,800 / ₩254,000 / ₩684,400
예약 검색 링크: <url>

1. Jeju Air — 09:45 → 12:15 / 2h30m / 직항 / ₩129,800
2. Air Seoul — 09:20 → 11:50 / 2h30m / 직항 / ₩143,500
3. Air Premia — 08:50 → 11:20 / 2h30m / 직항 / ₩160,800
```

월별 비교:

```text
ICN → NRT / 2026-06 weekly 샘플
최저: 6/1 ₩129,800
샘플 평균: ₩142,300
비싼 날: 6/22 ₩188,000

싼 날짜 TOP 3
1. 2026-06-01 — ₩129,800
2. 2026-06-08 — ₩135,000
3. 2026-06-15 — ₩144,000
```

파싱 누락 후보는 숨기지 말고 이렇게 표시한다.

```text
항공편 상세 확인 불가 — 시간 확인 불가 / 가격 ₩228,700
※ Google Flights 응답에서 항공사·시간 파싱이 일부 누락됐습니다.
```

## Failure modes

- Google Flights HTML/프론트엔드 구조 변경으로 항공사명·시간 파싱이 비거나 깨질 수 있다.
- 일부 노선은 가격만 나오고 항공편 상세가 `partial`로 떨어질 수 있다.
- 잘못된 IATA 코드, 동일 출도착 공항, 실제 항공편이 없는 구간은 실패한다.
- 너무 먼 미래 날짜는 upstream에서 결과가 없을 수 있다.
- 비교 기능은 날짜별 실시간 조회라 요청 수가 많다. daily 월별 비교는 30회 안팎의 요청이 발생한다.
- `fast-flights` fallback이 외부 fetch helper를 쓰는 경우 401 `no token provided`가 날 수 있다. 동일 입력의 실사용성이 낮은 케이스면 사전 validation으로 막고, 정상 노선이면 잠시 후 재시도한다.

## Verified discovery notes

2026-05-10 로컬 프로브 기준:

- Skyscanner home/API: CAPTCHA/403 blocked로 직접 provider 부적합.
- Kiwi Tequila API: 무료 계정 API key 필요. 기본 무료/no-key 경로는 아님.
- Google Flights + `fast-flights==2.2`: 국내선/일본/동남아/미국/유럽/호주/남미 일부 성공.
- 추가 테스트 성공: `ICN-CJU`, `ICN-NRT`, `ICN-PVG`, `ICN-SIN`, `ICN-BKK`, `ICN-DXB`, `ICN-LAX`, `ICN-JFK`, `ICN-LHR`, `ICN-CDG`, `ICN-FRA`, `ICN-HKG`, `ICN-TPE`, `ICN-SYD`, `ICN-GRU`, `ICN↔NRT`, `GMP↔CJU`, business, 성인 2명.
- 정상 실패/차단 대상: `GMP-ICN`, `ICN-ICN`, invalid airport code.

## Done when

- 출발/도착/날짜/좌석/인원 조건을 확인했다.
- 단일 검색이면 상위 후보와 예약 검색 링크를 제공했다.
- 비교 검색이면 샘플 방식과 최저/평균/최고, 싼 날짜 TOP을 제공했다.
- 가격은 조회 시점 기준이며 실제 결제가는 달라질 수 있음을 표시했다.
- 로그인/결제/CAPTCHA 우회는 하지 않았다.
