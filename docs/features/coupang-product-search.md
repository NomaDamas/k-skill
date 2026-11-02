# 쿠팡 상품 검색

`coupang-product-search`는 `k-skill-proxy`의 공식 Coupang Partners API
프록시를 통해 상품을 조회한다. 로컬 MCP checkout이나 제3자 hosted fallback을
사용하지 않는다.

## 호출 경로

```text
skill → k-skill-proxy /v1/coupang/products/search
      → 서버 보관 COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY
      → Coupang Partners API /products/search
```

proxy 서버가 HMAC-SHA256 `Authorization` 헤더를 생성하므로 caller는 쿠팡
키를 볼 수도, 전달할 필요도 없다.

## 설정

프록시 운영 환경에 다음 두 변수를 설정한다.

```text
COUPANG_ACCESS_KEY=...
COUPANG_SECRET_KEY=...
```

둘 중 하나라도 없으면 endpoint는 `503 upstream_not_configured`를 반환한다.
키를 query string, shell argument, 문서, 로그에 넣지 않는다.

## 검색 API

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/coupang/products/search" \
  --data-urlencode 'keyword=무선청소기' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'subId=k-skill'
```

| query | 필수 | 설명 |
| --- | --- | --- |
| `keyword` 또는 `q` | 예 | 2~100자 |
| `limit` | 아니오 | 1~10, 기본 10 |
| `subId` | 아니오 | 제휴/호출 분석용 식별자 |

응답 `items`는 `product_id`, `title`, `price`, `price_text`, `url`,
`image_url`, `review_count`, `score`, `is_rocket`, `is_free_shipping`을
제공한다. 가격과 배송 상태는 실시간으로 바뀔 수 있다.

## 답변 규칙

- `is_rocket`으로 로켓배송 후보와 일반배송 후보를 구분한다.
- 예산이 있으면 `price`를 기준으로 필터링한다.
- 후보는 보통 3~5개로 요약한다.
- 상품 링크를 제공할 때 다음 고지를 함께 표시한다.

> 쿠팡 파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.

## 오류

- `400 bad_request`: 검색어가 없거나 너무 짧다.
- `503 upstream_not_configured`: 프록시 키 미설정.
- `502 upstream_forbidden`: 쿠팡 API 키 또는 권한 거부.
- `502 upstream_error` / `upstream_unavailable`: 쿠팡 API 장애 또는 네트워크 오류.

쿠팡 gateway는 권한 오류도 HTTP 200과 함께 envelope로 돌려준다. proxy는
envelope의 `rCode`(또는 `code`)가 0이 아니면 빈 검색 결과로 감추지 않고
`upstream`에 `status_code`와 `body_snippet`을 실은 502로 표면화하며, 그 실패
응답은 캐시하지 않는다.

오류를 임의의 scraping, 구형 MCP, 또는 다른 hosted endpoint로 우회하지 않는다.

## 출처

- [Coupang Open API HMAC 문서](https://developers.coupangcorp.com/hc/en-us/articles/360033461914-Creating-HMAC-Signature)
- [k-skill-proxy feature guide](./k-skill-proxy.md)
