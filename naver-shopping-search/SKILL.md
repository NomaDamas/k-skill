---
name: naver-shopping-search
description: 네이버 쇼핑 공개 BFF JSON을 k-skill-proxy로 조회해 상품 후보, 최저가, 판매처 링크를 보수적으로 가격비교한다.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# Naver Shopping Search

## What this skill does

`k-skill-proxy`가 네이버 검색 Open API 쇼핑 검색(`shop.json`)을 우선 사용하고, 키가 없을 때만 네이버 쇼핑/검색의 로그인 없는 공개 BFF JSON endpoint를 **단일 검색 요청**으로 가져와 상품 후보를 정규화한다.

- 상품명/검색어로 네이버 쇼핑 후보를 찾는다.
- 현재 노출 가격, 판매처, 링크, 이미지, 리뷰/구매 수(노출될 때만)를 정리한다.
- 가격이 낮은 후보와 공식몰/브랜드몰 후보를 분리해서 비교할 수 있다.
- 주문, 장바구니, 찜, 로그인 세션 접근은 하지 않는다.

## When to use

- "네이버 쇼핑에서 에어팟 가격 비교해줘"
- "네이버 최저가로 커피머신 찾아줘"
- "네이버 쇼핑 링크랑 판매처별 가격을 비교해줘"
- "이 상품 네이버 쇼핑에서 얼마쯤 해?"

## When not to use

- 회원 전용가, 쿠폰 적용가, 네이버페이 개인화 혜택을 확정해야 하는 경우
- 주문/장바구니/찜/로그인이 필요한 액션
- 차단 우회, CAPTCHA 우회, fingerprint spoofing 등 접근 통제를 우회해야 하는 경우

## Required inputs

상품명 또는 검색어가 없으면 먼저 물어본다.

권장 질문:

> 찾을 네이버 쇼핑 상품명이나 검색어를 알려주세요. 예: 에어팟 프로 2세대, 아이폰 15 케이스

검색어가 너무 넓으면 브랜드/용량/모델명을 추가로 물어본다.

## Proxy endpoint

기본값은 public/read-only/no-auth 프록시다. 프록시 서버에 `NAVER_SEARCH_CLIENT_ID`와 `NAVER_SEARCH_CLIENT_SECRET`이 있으면 공식 Search API를 우선 사용한다.

```bash
curl -fsS --get "${KSKILL_PROXY_BASE_URL:-http://127.0.0.1:4020}/v1/naver-shopping/search" \
  --data-urlencode 'q=에어팟 프로 2세대' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'sort=rel'
```

쿼리 파라미터:

- `q` 또는 `query` — 검색어. 2글자 이상.
- `limit` — 반환 개수. 기본 10, 최대 40으로 clamp.
- `page` — 페이지. 기본 1. no-key BFF fallback에서는 BFF의 `page`를 요청하고 해당 페이지 카드만 정규화한다.
- `sort` — `rel`, `date`, `price_asc`, `price_dsc`, `review` 중 하나. 알 수 없는 값은 `rel`.
  - 공식 Search API 경로는 네이버 API sort를 사용한다. 단, 공식 API가 `review` 정렬을 지원하지 않아 `review` 요청은 upstream `sort=sim`으로 조회하고 `meta.sort_applied: "unsupported"`, `meta.upstream_sort: "sim"`으로 표시한다.
  - no-key BFF fallback은 `rel`은 BFF 노출 순서를 유지하고, `price_asc`/`price_dsc`/`review`는 선택된 BFF 페이지 카드 안에서 로컬 정렬한다. BFF 카드에 날짜 필드가 없어 `date`는 `meta.sort_applied: "unsupported"`로 표시하고 BFF 노출 순서를 유지한다.

응답 주요 필드:

- `items[].title`
- `items[].price` / `items[].price_text`
- `items[].mall_name`
- `items[].url`
- `items[].image_url`
- `items[].review_count`, `purchase_count`, `score` (노출될 때만)
- `meta.extraction` — `naver-openapi`, `bff-json`, `embedded-json`, `html-card`, `none`
- `meta.sort_applied` — `upstream`, `local`, `unsupported` 중 하나

## Workflow

1. 검색어를 확인한다.
2. `GET /v1/naver-shopping/search` 를 호출한다.
3. `items`가 있으면 요청 sort와 `meta.sort_applied`를 확인한 뒤 가격 낮은 순, 공식/브랜드몰 여부, 리뷰 수 등을 기준으로 3~5개 후보를 짧게 비교한다.
4. `meta.extraction`과 조회 시각 기준임을 함께 말한다.
5. `items`가 비었거나 upstream 차단/오류가 나면 우회 시도를 반복하지 말고, 검색어를 좁히거나 브라우저 수동 확인을 안내한다.

## Response style

- 가격은 "조회 시점 네이버 쇼핑 노출가"라고 표현한다.
- 배송비, 쿠폰, 옵션 추가금, 회원 혜택은 비로그인 공개 검색만으로 확정하지 않는다.
- 판매처 신뢰도는 노출된 판매처명/리뷰 수만 근거로 보수적으로 말한다.
- 최저가만 단정하지 말고 동률/옵션 차이를 조심한다.

## Failure modes

- 공식 Search API 키가 없어서 BFF fallback을 사용할 때는 네이버가 특정 IP/환경에 418/403 등 bot-block 응답을 줄 수 있다.
- no-key fallback은 `ns-portal.shopping.naver.com/api/v2/shopping-paged-slot?query=<검색어>&source=shp_gui` 공개 JSON path를 사용한다.
- 검색 결과 BFF JSON 스키마는 비공식 프론트엔드 표면이라 바뀔 수 있다.
- 가격/품절/배송 정보는 실시간으로 바뀐다.
- 프록시는 접근 통제 우회를 하지 않는다. 공식 Search API 또는 단일 공개 검색 요청 + 캐시 + rate limit만 사용한다.

## Done when

- 검색어를 확인했다.
- 네이버 쇼핑 후보를 최소 1개 이상 반환하거나, 왜 반환하지 못했는지 설명했다.
- 가격/판매처/링크를 조회 시점 기준으로 보수적으로 정리했다.
- 로그인/주문/차단 우회 범위를 벗어나지 않았다.
