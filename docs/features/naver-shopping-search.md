# 네이버 쇼핑 가격비교 가이드

## 이 기능으로 할 수 있는 일

- 네이버 쇼핑 상품 검색
- 현재 노출 가격과 판매처 비교
- 상품 링크/이미지/리뷰 수 등 공개 노출 메타데이터 정리
- 가격 후보를 3~5개로 줄여 보수적으로 추천

## 먼저 필요한 것

- 인터넷 연결
- `k-skill-proxy` 실행 또는 `KSKILL_PROXY_BASE_URL`
- 네이버 로그인/사용자 계정은 필요 없음

## 공식/공개 표면

- 공개 BFF JSON: `https://ns-portal.shopping.naver.com/api/v2/shopping-paged-slot?query=<검색어>&source=shp_gui`
- 프록시 endpoint: `GET /v1/naver-shopping/search`

프록시에 `NAVER_SEARCH_CLIENT_ID`와 `NAVER_SEARCH_CLIENT_SECRET`이 있으면 네이버 검색 Open API의 쇼핑 검색(`shop.json`)을 우선 사용한다. 키가 없으면 네이버 검색/쇼핑 프론트엔드가 사용하는 공개 BFF JSON endpoint를 단일 요청으로 읽는다. BFF fallback은 스키마 변경이나 bot-block 응답이 있을 수 있으며, 접근 통제를 우회하지 않는다.

## 기본 호출

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/naver-shopping/search' \
  --data-urlencode 'q=에어팟 프로 2세대' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'sort=rel'
```

로컬 proxy:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/naver-shopping/search' \
  --data-urlencode 'q=아이폰 15 케이스' \
  --data-urlencode 'limit=5' \
  --data-urlencode 'sort=price_asc'
```

## 입력값

- `q` 또는 `query`: 검색어. 2글자 이상.
- `limit`: 반환 개수. 기본 10, 최대 40.
- `page`: 페이지. 기본 1. no-key BFF fallback은 BFF `page`를 요청하고 해당 페이지 카드만 정규화한다.
- `sort`: `rel`, `date`, `price_asc`, `price_dsc`, `review`.
  - 공식 Search API 경로는 네이버 API sort를 사용한다. 다만 공식 API가 `review` 정렬을 제공하지 않으므로 `review` 요청은 upstream `sort=sim`으로 조회하고 `meta.sort_applied: "unsupported"`, `meta.upstream_sort: "sim"`으로 표시한다.
  - no-key BFF fallback은 `rel`은 BFF 노출 순서를 유지하고, `price_asc`/`price_dsc`/`review`는 선택된 BFF 페이지 안에서 로컬 정렬한다.
  - BFF에는 날짜 정렬용 카드 필드가 없어 no-key `date` 요청은 `meta.sort_applied: "unsupported"`로 표시하고 BFF 노출 순서를 유지한다.

## 응답 예시

```json
{
  "items": [
    {
      "rank": 1,
      "product_id": "1234567890",
      "title": "애플 정품 20W USB-C 전원 어댑터",
      "price": 23900,
      "price_text": "23,900원",
      "mall_name": "Apple 공식스토어",
      "url": "https://search.shopping.naver.com/catalog/1234567890",
      "image_url": "https://shop-phinf.pstatic.net/main_1234567890.jpg",
      "category": ["디지털/가전", "휴대폰액세서리"],
      "review_count": 1234,
      "purchase_count": 56,
      "score": 4.8,
      "is_ad": false,
      "source": "bff-json"
    }
  ],
  "query": {
    "q": "애플 어댑터",
    "limit": 10,
    "page": 1,
    "sort": "rel"
  },
  "meta": {
    "query": "애플 어댑터",
    "extraction": "bff-json",
    "item_count": 1,
    "page": 1,
    "sort": "rel",
    "sort_applied": "upstream"
  }
}
```

## 기본 흐름

1. 상품명/검색어가 없으면 먼저 물어본다.
2. `q`로 프록시를 호출한다.
3. 가격, 판매처, 링크가 있는 후보만 비교한다.
4. 가격 낮은 순으로 정리하되, 광고 여부/공식몰/리뷰 수를 함께 언급한다.
5. 가격과 재고는 조회 시점 기준이며 쿠폰·배송비·옵션가는 확정하지 않는다고 말한다.

## 운영 팁

- 모델명, 용량, 색상, 세대 정보를 검색어에 포함하면 가격 비교 품질이 좋아진다.
- 네이버가 특정 서버/IP에 418/403 등을 반환하면 같은 요청을 반복해 우회하지 말고 사용자에게 수동 확인 또는 검색어 조정을 안내한다.
- no-key fallback은 기존 `search.shopping.naver.com/search/all` HTML 페이지가 아니라 `ns-portal.shopping.naver.com/api/v2/shopping-paged-slot` JSON path를 사용한다.
- no-key fallback의 가격/리뷰 정렬은 BFF가 반환한 선택 페이지 내부의 로컬 정렬이다. 전체 네이버 쇼핑 결과에 대한 전역 최저가/최다리뷰 정렬이 필요하면 공식 Search API 키를 설정한다.
- proxy route는 public/read-only/no-auth이며 cache와 rate limit을 사용한다.
- 운영 환경에는 가능하면 `NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET`을 설정해 공식 Search API 경로를 우선 사용한다.
