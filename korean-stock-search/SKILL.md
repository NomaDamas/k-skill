---
name: korean-stock-search
description: Use k-skill-proxy to search Korean listed stocks, inspect KRX base information, and fetch daily trade snapshots without asking the user to issue a KRX API key.
license: MIT
metadata:
  category: finance
  locale: ko-KR
  phase: v1
---

# Korean Stock Search

## What this skill does

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/korean-stock/...` 로 요청해서 KRX 상장 종목 검색, 종목 기본정보, 일별 시세를 조회한다.

upstream 설계 참고는 [`jjlabsio/korea-stock-mcp`](https://github.com/jjlabsio/korea-stock-mcp) 이지만, 사용자는 `KRX_API_KEY` 를 발급받거나 로컬 MCP 서버를 설치할 필요가 없다. `KRX_API_KEY` 는 proxy 서버에서만 관리한다.

## When to use

- "삼성전자 종목코드랑 시장구분 찾아줘"
- "005930 기본정보 보여줘"
- "SK하이닉스 20260408 종가/거래량 알려줘"
- "KOSDAQ 에서 알테오젠 시세 확인해줘"

## When not to use

- 미국/일본/가상자산 같은 비한국 주식 조회
- 실시간 체결/호가/분봉 조회
- 재무제표/공시 원문 분석 (이 스킬 범위 밖)
- 투자 자문/매수 추천

## Inputs

- `q`: 종목명 또는 종목코드 검색어 (`search` endpoint)
- `market`: `KOSPI` | `KOSDAQ` | `KONEX`
- `code`: 종목코드 (보통 6자리 단축코드, 예: `005930`)
- `bas_dd`: 기준일 `YYYYMMDD` (없으면 KST 오늘 날짜 기본값, 휴장일이면 최근 영업일로 다시 시도)
- `limit`: 검색 결과 수 (기본 10, 최대 20)

## Prerequisites

없음. 사용자는 `KRX_API_KEY` 를 준비할 필요가 없다. upstream key는 proxy 서버에서만 주입한다.

## Default path

추가 client API 레이어는 불필요하다. 그냥 프록시 서버에 HTTP 요청만 넣으면 된다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 없으면 기본 경로 `https://k-skill-proxy.nomadamas.org` 를 사용한다.

## Supported endpoints

### 종목 검색

```http
GET /v1/korean-stock/search?q={검색어}&bas_dd={YYYYMMDD}
```

### 종목 기본정보

```http
GET /v1/korean-stock/base-info?market={KOSPI|KOSDAQ|KONEX}&code={종목코드}&bas_dd={YYYYMMDD}
```

### 종목 일별 시세

```http
GET /v1/korean-stock/trade-info?market={KOSPI|KOSDAQ|KONEX}&code={종목코드}&bas_dd={YYYYMMDD}
```

## Example requests

종목 검색:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/search' \
  --data-urlencode 'q=삼성전자' \
  --data-urlencode 'bas_dd=20260408'
```

종목 기본정보:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/base-info' \
  --data-urlencode 'market=KOSPI' \
  --data-urlencode 'code=005930' \
  --data-urlencode 'bas_dd=20260408'
```

종목 일별 시세:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/trade-info' \
  --data-urlencode 'market=KOSPI' \
  --data-urlencode 'code=005930' \
  --data-urlencode 'bas_dd=20260408'
```

## Response shape

### 검색 응답

```json
{
  "items": [
    {
      "market": "KOSPI",
      "code": "005930",
      "standard_code": "KR7005930003",
      "name": "삼성전자",
      "short_name": "삼성전자",
      "english_name": "Samsung Electronics",
      "listed_at": "1975-06-11"
    }
  ],
  "query": { "q": "삼성전자", "bas_dd": "20260408", "limit": 10 },
  "proxy": { "name": "k-skill-proxy", "cache": { "hit": false, "ttl_ms": 300000 } }
}
```

### 기본정보 응답

```json
{
  "item": {
    "market": "KOSPI",
    "code": "005930",
    "standard_code": "KR7005930003",
    "name": "삼성전자",
    "short_name": "삼성전자",
    "english_name": "Samsung Electronics",
    "security_group": "주권",
    "section_type": "대형주",
    "stock_certificate_type": "보통주",
    "par_value": 100,
    "listed_shares": 5969782550
  },
  "query": { "market": "KOSPI", "code": "005930", "bas_dd": "20260408" },
  "proxy": { "name": "k-skill-proxy", "cache": { "hit": false, "ttl_ms": 300000 } }
}
```

### 일별 시세 응답

```json
{
  "item": {
    "market": "KOSPI",
    "code": "005930",
    "standard_code": "KR7005930003",
    "base_date": "20260408",
    "name": "삼성전자",
    "close_price": 84000,
    "change_price": 1000,
    "fluctuation_rate": 1.2,
    "open_price": 83000,
    "high_price": 84500,
    "low_price": 82800,
    "trading_volume": 12345678,
    "trading_value": 1030000000000,
    "market_cap": 500000000000000
  },
  "query": { "market": "KOSPI", "code": "005930", "bas_dd": "20260408" },
  "proxy": { "name": "k-skill-proxy", "cache": { "hit": false, "ttl_ms": 300000 } }
}
```

## Response policy

- 종목명이 모호하면 먼저 `search` 로 시장/종목코드를 좁힌 뒤 `base-info` 또는 `trade-info` 로 들어간다.
- 일부 시장 upstream 이 실패하면 `upstream.degraded=true` 와 `failed_markets` 를 보고 부분 장애 여부를 함께 설명한다.
- `trade-info` 결과는 일별 snapshot 이다. 실시간 호가/체결처럼 말하지 않는다.
- 휴장일/장마감 이전이면 해당 `bas_dd` 에 데이터가 없을 수 있으니 최근 영업일로 재시도한다. 이 경우 `trade-info` 는 502 대신 `not_found` 로 끝날 수 있다.
- 숫자는 사람이 읽기 쉬운 단위(원, 주, 억/조)로 짧게 풀어주되 원본 숫자도 유지한다.
- 답변 말미에 "KRX 공식 데이터 기준 / 투자 조언 아님" 을 짧게 남긴다.

## Keep the answer compact

- 종목명 / 시장 / 종목코드
- 기준일
- 종가 / 등락률 / 거래량 / 시가총액
- 필요할 때만 상장일 / 상장주식수 / 액면가
- 여러 후보가 나오면 상위 3~5개만 보여주고 사용자가 고르게 한다

## Failure modes

- `q`, `market`, `code`, `bas_dd` 형식이 잘못되면 400 응답
- 프록시 서버에 `KRX_API_KEY` 가 없으면 503 응답
- 검색 중 일부 시장 upstream 이 실패하면 200 응답이지만 `upstream.degraded=true` 와 `failed_markets` 를 함께 반환할 수 있다.
- 모든 요청 시장에서 upstream KRX 조회가 실패하면 502 응답
- 해당 기준일/시장에 종목이 없으면 404 `not_found`

## Done when

- 검색어가 모호하면 `search` 로 후보를 먼저 좁혔다.
- 필요한 경우 `base-info` 와 `trade-info` 를 호출해 핵심 수치를 정리했다.
- 사용자가 `KRX_API_KEY` 없이도 조회 가능하다는 점을 유지했다.
- KRX 공식 데이터 기준임을 짧게 남겼다.

## Notes

- 원본 참고: `https://github.com/jjlabsio/korea-stock-mcp`
- 공식 데이터 출처: KRX Open API (`https://openapi.krx.co.kr/contents/OPP/MAIN/main/index.cmd`)
- 이 스킬은 read-only 조회 전용이다.
