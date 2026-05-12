---
name: danawa-price-search
description: 다나와 공개 검색/가격비교 표면으로 상품 후보를 찾고, 쇼핑몰별 최저가·배송비 포함 실구매가·카드 할인가·무이자 할부 정보를 보수적으로 비교한다.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# Danawa Price Search

## What this skill does

다나와의 로그인 없는 공개 검색/가격비교 표면을 읽기 전용으로 호출해 한국 쇼핑몰 가격을 비교한다.

- 상품명/검색어로 다나와 상품 후보와 `pcode`를 찾는다.
- 선택한 상품의 쇼핑몰별 오퍼를 조회한다.
- 상품가만이 아니라 배송비 포함 실구매가, 무료배송 여부, 카드 할인가, 무이자 할부 문구를 함께 정리한다.
- 구매, 로그인, 장바구니, 찜, 주문 액션은 하지 않는다.

## When to use

- "다나와에서 에어팟 최저가 찾아줘"
- "다나와 가격비교로 쇼핑몰별 가격 비교해줘"
- "무료배송인지, 카드 할인까지 보면 어디가 제일 싸?"
- "무이자 할부 붙은 최저가도 같이 봐줘"

## When not to use

- 실제 구매/주문/결제/로그인이 필요한 경우
- 회원 전용 쿠폰, 개인화 포인트, 앱 전용 혜택을 확정해야 하는 경우
- 대량 모니터링이나 고빈도 크롤링을 해야 하는 경우
- CAPTCHA, 접근 차단, fingerprint 우회를 해야 하는 경우

## Required inputs

상품명 또는 검색어가 필요하다. 검색어가 넓으면 브랜드, 모델명, 용량, 색상, 자급제/통신사 여부 등을 추가로 물어본다.

권장 질문:

> 찾을 다나와 상품명이나 모델명을 알려주세요. 예: 갤럭시 S25 울트라 256GB 자급제, 에어팟 프로 2세대 USB-C

## Public surfaces

현재 구현은 인증 없는 공개 표면만 사용한다.

- 검색 페이지: `https://search.danawa.com/dsearch.php?query=...`
- 상품 상세 페이지: `https://prod.danawa.com/info/?pcode=...`
- 가격비교 AJAX: `https://prod.danawa.com/info/ajax/getAllPriceCompareMallList.ajax.php`

AJAX endpoint는 HTML fragment를 반환한다. helper는 `.diff_item`, 쇼핑몰 로고 `alt`, `em.prc_c`/`em.prc_t`, 배송 문구, 카드 할인 라인, 무이자 할부 레이어, 다나와 bridge link를 파싱한다.

## Commands

스킬 디렉터리에서 실행한다.

```bash
python scripts/danawa_search.py search "에어팟 프로 2세대" --limit 8
python scripts/danawa_search.py offers 28208783 --limit 10
python scripts/danawa_search.py compare "에어팟 프로 2세대" --limit 5 --offers 5
```

helper는 JSON만 출력한다. 결과를 확인한 뒤 사용자에게는 한국어 표와 짧은 결론으로 정리한다.

## Output shape

### `search`

```json
{
  "query": "...",
  "source_url": "...",
  "count": 0,
  "items": []
}
```

각 `items[]` 주요 필드:

- `pcode`
- `title`
- `price`, `price_text`
- `mall_text`
- `url`
- `image_url`
- `spec`

### `offers`

```json
{
  "pcode": "...",
  "title": "...",
  "source_url": "...",
  "count": 0,
  "offers": []
}
```

각 `offers[]` 주요 필드:

- `mall`
- `price`, `price_text`
- `shipping`
- `is_free_shipping`
- `shipping_fee`
- `total_price`, `total_price_text`
- `card_price`, `card_price_text`
- `card_name`
- `card_discount`, `card_discount_text`
- `installment`
- `installment_detail`
- `url`

항상 무료배송 여부, 배송비 포함 실구매가, 카드별 할인 가격, 무이자 할부 문구를 함께 확인한다.

### `compare`

`compare`는 검색 결과를 먼저 가져온 뒤 각 후보 상품에 대해 `offers[]`를 best-effort로 붙인다. 검색 결과가 애매하면 상위 후보의 제목과 `pcode`를 먼저 보여주고 선택을 요청한다.

## Response style

Discord/Telegram/chat 응답에서는 표 형식을 우선한다.

```md
| 순위 | 판매처 | 상품가 | 배송 | 실구매가 | 카드할인가 | 무이자 | 링크 |
|---:|---|---:|---|---:|---:|---|---|
| 1 | G마켓 | 217,950원 | 무료배송 | 217,950원 | - | 최대 24개월 | 보기 |
| 2 | 옥션 | 305,722원 | 무료배송 | 305,722원 | 우리카드 303,720원 | 최대 24개월 | 보기 |
```

정렬 기준:

1. 기본 순위는 `total_price` 오름차순이다.
2. `card_price`가 있고 카드 적용 시 승자가 바뀌면 표 아래에 "카드 기준 최저가"를 별도로 적는다.
3. 무이자 할부는 결제 조건이 달라질 수 있으므로 Danawa 노출 문구 기준이라고 밝힌다.

요약 예시:

```md
최저 실구매가: G마켓 217,950원 / 무료배송
카드 기준 최저가: 옥션 우리카드 303,720원
무이자: G마켓·옥션 최대 24개월 표기
```

카드 할인 markup이 없으면 "카드 할인가 표기 없음"이라고 쓰고, 체크아웃 할인 자체가 없다고 단정하지 않는다.

## Workflow

1. 검색어를 확인한다.
2. `python scripts/danawa_search.py search "<검색어>" --limit 5`로 후보를 확인한다.
3. 후보가 명확하면 해당 `pcode`로 `offers`를 실행한다.
4. 후보가 애매하면 상위 3~5개 상품명/가격/`pcode`를 보여주고 선택을 요청한다.
5. 오퍼는 배송비 포함 실구매가 기준으로 표 정렬한다.
6. 카드 할인가가 있으면 카드 기준 최저가도 별도 요약한다.
7. 조회 시점 기준이며 가격/배송/카드 혜택은 변동될 수 있음을 짧게 덧붙인다.

## Failure modes

- 검색 결과가 0개면 검색어를 더 구체화한다.
- Danawa HTML/AJAX 구조가 바뀌면 selector가 깨져 `offers`가 비거나 필드가 누락될 수 있다.
- 검색 결과 가격과 오퍼 AJAX 가격은 갱신 시점·카드가·제휴 링크 기준 차이로 다를 수 있다.
- 카드 할인과 무이자 문구는 Danawa가 노출한 경우에만 확정적으로 보여준다.
- 공개 표면 기반이므로 고빈도 요청에는 throttling/backoff를 추가해야 한다.
- 접근 차단이나 CAPTCHA가 나오면 우회를 시도하지 말고 실패 모드로 보고한다.

## Done when

- 검색어 또는 모델명을 확인했다.
- 상품 후보를 최소 1개 이상 반환하거나, 반환 실패 이유를 설명했다.
- 쇼핑몰별 상품가, 배송비, 실구매가, 카드 할인가, 무이자 문구를 조회 시점 기준으로 정리했다.
- 사용자 응답은 표 형식으로 제공했다.
- 로그인/구매/차단 우회 범위를 벗어나지 않았다.
