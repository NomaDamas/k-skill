# 한국 주식 정보 조회 가이드

## 이 기능으로 할 수 있는 일

- KRX 상장 종목 검색 (`/v1/korean-stock/search`)
- 종목 기본정보 조회 (`/v1/korean-stock/base-info`)
- 종목 일별 시세 조회 (`/v1/korean-stock/trade-info`)
- 종목명이 모호할 때 시장/종목코드 후보를 먼저 좁히기

## 가장 중요한 규칙

기본 경로는 `https://k-skill-proxy.nomadamas.org/v1/korean-stock/...` 이다.
사용자는 `KRX_API_KEY` 를 준비할 필요가 없다. `KRX_API_KEY` 는 proxy 서버에서만 관리한다.

upstream 참고 구현은 [`jjlabsio/korea-stock-mcp`](https://github.com/jjlabsio/korea-stock-mcp) 이지만, 이 레포의 기본 사용법은 로컬 MCP 설치가 아니라 **proxy first** 다.

## 먼저 필요한 것

없음. 인터넷 연결만 있으면 된다.

## 추천 조회 순서

1. 종목명이 애매하면 `/v1/korean-stock/search?q=...` 로 후보를 먼저 찾는다.
2. 후보에서 `market`, `code` 를 확인한다.
3. 기본 정보가 필요하면 `/v1/korean-stock/base-info` 를 호출한다.
4. 가격/거래량이 필요하면 `/v1/korean-stock/trade-info` 를 호출한다.
5. 휴장일이면 `bas_dd` 를 최근 영업일로 다시 지정한다.

## 검색 예시

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/search' \
  --data-urlencode 'q=삼성전자' \
  --data-urlencode 'bas_dd=20260408'
```

## 기본정보 예시

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/base-info' \
  --data-urlencode 'market=KOSPI' \
  --data-urlencode 'code=005930' \
  --data-urlencode 'bas_dd=20260408'
```

## 일별 시세 예시

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/trade-info' \
  --data-urlencode 'market=KOSPI' \
  --data-urlencode 'code=005930' \
  --data-urlencode 'bas_dd=20260408'
```

## 응답 해석 팁

- `code` 는 보통 6자리 단축코드다.
- `standard_code` 는 KRX 표준코드다.
- `close_price`, `trading_volume`, `market_cap` 은 숫자로 정규화돼 온다.
- `base_date`/`bas_dd` 는 일별 snapshot 날짜다.
- 휴장일/장마감 전에는 빈 결과나 `not_found` 가 나올 수 있다.
- 일부 시장 upstream 이 실패하면 검색 응답에 `upstream.degraded=true` 와 `failed_markets` 가 붙을 수 있다.

## 답변 템플릿 권장

- 종목명 / 시장 / 종목코드
- 기준일
- 종가 / 등락률 / 거래량 / 시가총액
- 필요하면 상장일 / 액면가 / 상장주식수
- 마지막 한 줄: `KRX 공식 데이터 기준이며 투자 조언은 아닙니다.`

## 에러/제약

- 잘못된 `market`, `code`, `bas_dd` 형식은 400
- proxy 서버에 `KRX_API_KEY` 가 없으면 503
- 검색 중 일부 시장 upstream 이 실패하면 200 이지만 `upstream.degraded=true` / `failed_markets` 가 함께 온다.
- 모든 요청 시장에서 upstream KRX 조회가 실패하면 502
- 기준일에 종목을 찾지 못하면 404 `not_found`

## 참고 링크

- 원본 MCP 서버(참고용): `https://github.com/jjlabsio/korea-stock-mcp`
- 공식 KRX Open API: `https://openapi.krx.co.kr/contents/OPP/MAIN/main/index.cmd`
