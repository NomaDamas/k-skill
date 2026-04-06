# 한국 부동산 실거래가 조회 가이드

## 이 기능으로 할 수 있는 일

- 아파트 매매 실거래가 조회 (`/v1/real-estate/apartment/trade`)
- 아파트 전월세 조회 (`/v1/real-estate/apartment/rent`)
- 오피스텔/연립다세대/단독주택/상업업무용 실거래가 조회
- 지역코드 조회 (`/v1/real-estate/region-code`) 후 행정구역 기준 검색

## 가장 중요한 규칙

기본 경로는 `https://k-skill-proxy.nomadamas.org/v1/real-estate/...` 이다.
사용자는 별도 API key를 준비할 필요가 없다. upstream key는 proxy 서버에서만 주입한다.

## 먼저 필요한 것

없음. 인터넷 연결만 있으면 된다.

## 지역코드 검색

주소/행정구역이 애매하면 먼저 지역코드를 검색한다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/region-code' \
  --data-urlencode 'q=마포구'
```

응답에서 `lawd_cd` 를 확인한 후 실거래가 조회에 사용한다.

## 실거래가/전월세 조회

```bash
# 아파트 매매
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/apartment/trade' \
  --data-urlencode 'lawd_cd=11440' \
  --data-urlencode 'deal_ymd=202403'

# 아파트 전월세
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/apartment/rent' \
  --data-urlencode 'lawd_cd=11440' \
  --data-urlencode 'deal_ymd=202403'

# 오피스텔 매매
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/real-estate/officetel/trade' \
  --data-urlencode 'lawd_cd=11680' \
  --data-urlencode 'deal_ymd=202403'
```

지원하는 자산 타입: `apartment`, `officetel`, `villa`, `single-house`, `commercial`
지원하는 거래 타입: `trade`, `rent` (commercial은 trade만)

## 조회 흐름 권장 순서

1. 주소/행정구역이 애매하면 `/v1/real-estate/region-code?q=...` 부터 호출한다.
2. 아파트 매매면 `apartment/trade`, 전월세면 `apartment/rent` 를 쓴다.
3. 오피스텔/빌라/단독주택/상업업무용은 해당 전용 endpoint로 분기한다.
4. 사용자가 연월을 안 줬으면 기준 월을 먼저 확인한다.
5. 실거래가와 호가를 섞지 말고, 신고 기반 데이터라는 점을 짧게 명시한다.

## 참고 링크

- 원본 MCP 서버 (참고용): `https://github.com/tae0y/real-estate-mcp/tree/main`
- 공식 데이터 출처: 공공데이터포털 (`https://www.data.go.kr`)
