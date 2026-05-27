# 항공권 가격 조회 (`flight-ticket-search`)

[`fast-flights`](https://pypi.org/project/fast-flights/) 라이브러리를 통해 Google Flights 공개 검색 표면을 조회해 항공권 후보, 예약 검색 링크, 날짜·월·연도별 최저가·평균가 비교를 보수적으로 제공하는 스킬입니다. API key, 로그인, 결제, CAPTCHA 우회 없이 무료 공개 표면만 사용합니다.

## 사용 시나리오

- "인천에서 나리타 다음 달 최저가 알려줘"
- "6월 ICN-NRT 월별 비교"
- "올해랑 내년 6월 1일 항공권 가격 비교"
- "ICN-LAX 비즈니스 가격 대략 비교해줘"
- "서울에서 도쿄 왕복 예약 링크 줘"

## 구현 표면

브라우저 자동화나 로그인을 사용하지 않습니다.

1. `fast-flights==2.2` 가 Google Flights 의 공개 검색 결과를 파싱합니다.
2. 예약 링크는 특정 판매자 결제 deep link 가 아니라 **Google Flights 검색 결과 링크**입니다. 실제 구매·결제·좌석 선택은 사용자가 브라우저에서 직접 진행합니다.
3. 첫 실행 시 `~/.cache/k-skill/flight-ticket-search/venv` 에 `fast-flights` 가 격리 설치되고 이후 그 venv 로 재실행합니다. 저장소에는 의존성 vendoring 이나 API key 를 두지 않습니다.

## 로컬 실행

### 단일 검색

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

### 월별 비교

지정 월의 날짜들을 실제 검색해 각 날짜의 최저가·평균가를 비교합니다. 기본은 주 1회 샘플링입니다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-month \
  --from ICN \
  --to NRT \
  --month 2026-06 \
  --sample weekly \
  --limit 5
```

일별 전체 조회가 필요하면 `--sample daily` 를 씁니다. 28~31 회 요청이 발생하므로 rate limit 보호를 위해 `--sleep` 을 1.5 초 이상 유지합니다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-month \
  --from ICN \
  --to NRT \
  --month 2026-06 \
  --sample daily \
  --sleep 2 \
  --limit 10
```

### 사용자 정의 범위 비교

"다음주부터 2주간", "6월 1일부터 20일까지"처럼 범위를 받을 때 사용합니다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-range \
  --from ICN \
  --to BKK \
  --start-date 2026-06-01 \
  --end-date 2026-06-20 \
  --step-days 3 \
  --limit 5
```

`--step-days 1` 은 일별 비교, `7` 은 주별 비교입니다.

### 연도 비교

같은 월일을 여러 연도에 대해 조회합니다.

```bash
python3 flight-ticket-search/scripts/flight_ticket_search.py compare-years \
  --from ICN \
  --to NRT \
  --years 2026,2027 \
  --month-day 06-01 \
  --limit 5
```

## 출력 해석

### 단일 검색 응답 주요 필드

- `meta.booking_search_url` — Google Flights 예약 검색 링크
- `meta.price_band` — Google 이 표시하는 `low` / `typical` / `high` 가격 band
- `stats.min_price`, `stats.avg_price`, `stats.max_price`
- `flights[].name`, `departure`, `arrival`, `duration`, `stops`, `price_text`
- `flights[].quality` — `complete` 또는 `partial` (Google Flights 응답 일부가 누락될 수 있음을 표시)

### 비교 검색 응답 주요 필드

- `stats.min_price` — 샘플 날짜 중 최저가
- `stats.avg_of_daily_min` — 날짜별 최저가의 평균
- `stats.max_of_daily_min` — 날짜별 최저가 중 최고값
- `cheapest_dates[]` — 가장 싼 날짜와 예약 검색 링크
- `rows[]` — 날짜별 성공/실패 및 요약
- `failures[]` — 너무 먼 미래 날짜 등 실패 케이스 (숨기지 않고 보고)

## 입력 가이드

- 출발/도착 공항 IATA 코드: `ICN`, `GMP`, `PUS`, `NRT`, `HND`, `LAX`, `CJU` 등
- 출발일: `YYYY-MM-DD`
- 선택: 왕복 귀국일, 성인 수(기본 1), 좌석 등급(`economy` / `premium-economy` / `business` / `first`), 비교 샘플 방식(`weekly` / `daily`)

사용자가 도시명만 말하면 IATA 코드를 추론합니다. 흔한 기본값:

- 서울/인천 국제선: `ICN`
- 서울 국내선/제주: `GMP`
- 도쿄: 나리타 `NRT` 또는 하네다 `HND` — 명시 없으면 사용자에게 확인
- 제주: `CJU`

## 예약 링크 정책

- `booking_search_url` 은 Google Flights 검색 URL 입니다.
- 특정 항공사/OTA 결제 단계 deep link 를 자동 추출하거나 클릭하지 않습니다.
- 결제·예약 확정·로그인·여권 정보 입력은 스킬 범위 밖입니다.
- 사용자가 예약까지 원하면 링크를 열어 직접 확인하도록 안내합니다.

## 검증된 노선 (2026-05-10 로컬 프로브 기준)

- 국내선: `GMP-CJU`, `ICN-CJU`
- 동북아: `ICN-NRT`, `ICN-PVG`, `ICN-HKG`, `ICN-TPE`
- 동남아: `ICN-SIN`, `ICN-BKK`
- 중동: `ICN-DXB`
- 북미: `ICN-LAX`, `ICN-JFK`
- 유럽: `ICN-LHR`, `ICN-CDG`, `ICN-FRA`
- 오세아니아: `ICN-SYD`
- 남미: `ICN-GRU`
- 왕복/좌석 등급/성인 다수: `ICN↔NRT`, `GMP↔CJU`, business, 성인 2명

## 실패 모드

- Google Flights HTML/프론트엔드 구조 변경으로 항공사명·시간 파싱이 비거나 `partial` 로 떨어질 수 있습니다.
- 일부 노선은 가격만 나오고 항공편 상세가 누락될 수 있습니다.
- 잘못된 IATA 코드, 동일 출도착 공항, 실제 항공편이 없는 구간은 실패합니다.
- 너무 먼 미래 날짜는 upstream 에 결과가 없을 수 있습니다.
- 비교 기능은 날짜별 실시간 조회라 요청 수가 많습니다. daily 월별 비교는 30 회 안팎의 요청이 발생합니다.
- `fast-flights` fallback 이 외부 fetch helper 를 쓰는 경우 `401 no token provided` 가 날 수 있어, 동일 입력의 실사용성이 낮은 케이스면 사전 validation 으로 막거나 잠시 후 재시도합니다.
- Skyscanner: CAPTCHA/403 으로 직접 provider 부적합 (사용하지 않음).
- Kiwi Tequila API: 무료 계정 API key 가 필요해 기본 no-key 경로에서는 사용하지 않습니다.

## 비범위

- 실제 예약/결제/취소/좌석 지정 자동화
- 로그인 회원가, 카드 할인, 쿠폰, 마일리지 적용가 확정
- CAPTCHA, fingerprint, bot-block 우회
- 스카이스캐너 직접 조회 (CAPTCHA/403 으로 안정 provider 가 아님)

## 출처

- 스킬 정의: [`flight-ticket-search/SKILL.md`](../../flight-ticket-search/SKILL.md)
- 헬퍼 스크립트: [`flight-ticket-search/scripts/flight_ticket_search.py`](../../flight-ticket-search/scripts/flight_ticket_search.py)
- `fast-flights`: <https://pypi.org/project/fast-flights/>
- Google Flights: <https://www.google.com/travel/flights>
