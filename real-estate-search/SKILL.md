---
name: real-estate-search
description: Korean apartment/officetel/villa/single-house real transaction price and rent lookups via k-skill-proxy. Based on tae0y's real-estate-mcp and MOLIT public data APIs.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# Korean Real Estate Search

## What this skill does

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/real-estate/...` 로 요청해서 한국 부동산 실거래가/전월세 데이터를 조회한다. 국토교통부(MOLIT) 실거래가 신고 데이터를 기반으로 한다.

## When to use

- "잠실 리센츠 2024년 매매 실거래가 찾아줘"
- "마포구 아파트 전세 실거래가 보여줘"
- "성수동 오피스텔 월세 실거래 데이터 볼래"
- "강남구 연립다세대 매매 실거래가"
- "용산구 상업업무용 건물 거래 내역"

## When not to use

- 해외 부동산 시세/거래 조회
- 실거래가가 아닌 민간 호가/매물 비교만 필요한 경우
- 세금/등기/중개 법률자문처럼 판단이 필요한 경우
- 청약홈 분양/당첨 조회 (아직 미지원)

## Inputs

- `q`: 지역명 (region-code endpoint, 예: `"서울 강남구"`, `"마포구"`)
- `lawd_cd`: 5자리 법정동 코드 (transaction endpoint, 예: `"11680"`)
- `deal_ymd`: 6자리 거래년월 YYYYMM (예: `"202403"`)
- `num_of_rows`: 조회 건수 (기본 100, 최대 1000)

## Prerequisites

없음. 사용자는 별도 API key를 준비할 필요가 없다. upstream key는 proxy 서버에서만 주입한다.

## Default path

추가 client API 레이어는 불필요하다. 그냥 프록시 서버에 HTTP 요청만 넣으면 된다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 없으면 기본 경로 `https://k-skill-proxy.nomadamas.org` 를 사용한다.

## Supported endpoints

### 지역코드 조회

```
GET /v1/real-estate/region-code?q={지역명}
```

### 실거래가/전월세 조회

```
GET /v1/real-estate/:assetType/:dealType?lawd_cd={코드}&deal_ymd={년월}
```

| assetType | dealType | 설명 |
|---|---|---|
| `apartment` | `trade` | 아파트 매매 |
| `apartment` | `rent` | 아파트 전월세 |
| `officetel` | `trade` | 오피스텔 매매 |
| `officetel` | `rent` | 오피스텔 전월세 |
| `villa` | `trade` | 연립다세대 매매 |
| `villa` | `rent` | 연립다세대 전월세 |
| `single-house` | `trade` | 단독/다가구 매매 |
| `single-house` | `rent` | 단독/다가구 전월세 |
| `commercial` | `trade` | 상업업무용 매매 |

`commercial/rent`는 지원하지 않는다.

## Example requests

지역코드 조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/region-code' \
  --data-urlencode 'q=강남구'
```

아파트 매매 실거래가 조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/apartment/trade' \
  --data-urlencode 'lawd_cd=11680' \
  --data-urlencode 'deal_ymd=202403'
```

오피스텔 전월세 조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/officetel/rent' \
  --data-urlencode 'lawd_cd=11680' \
  --data-urlencode 'deal_ymd=202403'
```

## Response shape

### 지역코드 응답

```json
{
  "results": [
    { "lawd_cd": "11680", "name": "서울특별시 강남구" }
  ],
  "query": "강남구",
  "proxy": { "name": "k-skill-proxy", "cache": { "hit": false, "ttl_ms": 300000 } }
}
```

### 매매 실거래가 응답

```json
{
  "items": [
    {
      "name": "래미안 퍼스티지",
      "district": "반포동",
      "area_m2": 84.99,
      "floor": 12,
      "price_10k": 245000,
      "deal_date": "2024-03-15",
      "build_year": 2009,
      "deal_type": "중개거래"
    }
  ],
  "summary": {
    "median_price_10k": 230000,
    "min_price_10k": 180000,
    "max_price_10k": 310000,
    "sample_count": 42
  },
  "query": { "asset_type": "apartment", "deal_type": "trade", "lawd_cd": "11680", "deal_ymd": "202403" },
  "proxy": { "name": "k-skill-proxy", "cache": { "hit": false, "ttl_ms": 300000 } }
}
```

### 전월세 응답

매매와 동일 구조이나 아이템에 `deposit_10k`, `monthly_rent_10k`, `contract_type` 이 포함되고, summary에 `median_deposit_10k`, `monthly_rent_avg_10k` 등이 들어간다.

## Response policy

- 실거래가/전월세 요청이면 `region-code` endpoint로 행정구역 코드를 먼저 확인한 뒤 자산 타입별 endpoint로 조회한다.
- 아파트 매매는 `apartment/trade`, 아파트 전월세는 `apartment/rent` 를 우선 사용한다.
- 오피스텔/빌라/단독주택/상업업무용은 자산 타입에 맞는 endpoint로 라우팅한다.
- 사용자가 동/건물명/연월을 덜 줬으면 지역, 단지명, 기준 월을 먼저 보강한다.
- 실거래가와 호가를 섞어 말하지 않는다. 이 스킬은 국토교통부 기반 실거래/전월세 신고 데이터를 다룬다.

## Keep the answer compact

- 지역명 + 자산 타입 + 거래년월
- 거래 건수 (summary.sample_count)
- 가격 요약: 중위값, 최소, 최대
- 상위 3-5건 대표 거래 (이름, 면적, 층, 가격, 날짜)
- 전월세면 보증금 + 월세 요약도 포함

## Failure modes

- `lawd_cd` 또는 `deal_ymd` 형식이 잘못되면 400 응답
- 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없으면 503 응답
- upstream MOLIT API 오류면 502 + `molit_api_XXX` 에러 코드
- 해당 지역/기간에 데이터가 없으면 빈 `items` 배열 반환

## Done when

- 요청 자산 타입에 맞는 endpoint를 선택했다.
- 필요한 경우 `region-code` 로 지역코드를 먼저 확인했다.
- 실거래가/전월세 결과를 조회하고 요약했다.
- 원본 데이터 출처(국토교통부 실거래가 신고)를 함께 남겼다.

## Notes

- 원본 참고: `https://github.com/tae0y/real-estate-mcp/tree/main`
- 공식 데이터 출처: 공공데이터포털 (`https://www.data.go.kr`)
- 가격 단위: `price_10k`, `deposit_10k` = 만원 단위 (예: 245000 = 24억 5천만원)
- 취소된 거래는 서버에서 자동 필터링된다.
