# 다나와 최저가 비교 (`danawa-price-search`)

다나와 공개 검색/가격비교 표면을 사용해 상품 후보를 찾고, 쇼핑몰별 가격을 배송비 포함 실구매가 기준으로 비교하는 스킬입니다.

## 사용 시나리오

- "다나와에서 맥북 에어 M4 최저가 비교해줘"
- "이 다나와 pcode 쇼핑몰별 가격 표로 보여줘"
- "배송비랑 카드할인까지 포함해서 어디가 제일 싼지 봐줘"

## 구현 표면

브라우저 자동화나 로그인을 사용하지 않습니다.

1. 검색: `https://search.danawa.com/dsearch.php?query=...`
2. 상품 상세 확인: `https://prod.danawa.com/info/?pcode=...`
3. 쇼핑몰별 가격비교 AJAX: `https://prod.danawa.com/info/ajax/getAllPriceCompareMallList.ajax.php`

## 로컬 실행

```bash
python3 danawa-price-search/scripts/danawa_search.py search "맥북 에어 M4" --limit 5
python3 danawa-price-search/scripts/danawa_search.py offers 28208783 --limit 10
python3 danawa-price-search/scripts/danawa_search.py compare "갤럭시 S25" --limit 3 --offers 5
```

## 출력 해석

`offers`와 `compare` 결과에는 다음 필드가 포함됩니다.

- `mall`: 쇼핑몰명
- `price`: 표시 가격
- `shipping_fee`: 배송비 숫자. 무료배송이면 `0`, 파싱 불가면 `null`
- `is_free_shipping`: 무료배송 여부
- `total_price`: 가격 + 배송비 기준 실구매가 후보
- `card_price`: 카드 적용 표시가
- `card_discount`: 표시가와 카드가 차액
- `installment`: 무이자 할부 문구
- `payment_badges`: Danawa가 가격 옆에 노출한 결제조건 배지의 표시 라벨 목록. 배지 텍스트가 비어 있고 `.ico.cash`처럼 클래스만 있는 경우도 정규화 라벨을 합성합니다 (예: `["현금"]`, `["쿠폰"]`, `["포인트"]`, `["카드"]`, `["할인"]`, `["멤버십"]`)
- `payment_condition_types`: 화이트리스트 배지를 정규화한 조건 타입 목록 (`cash`/`point`/`coupon`/`card`/`discount`/`membership`)
- `payment_condition_label`: 사용자 응답용 결제조건 라벨. 복수 조건이면 쉼표로 연결
- `cash_only` / `point_only` / `coupon_only` / `card_only_badge` / `discount_badge` / `membership_badge`: 각각 현금·포인트·쿠폰·특정 카드·할인·멤버십 조건 가격 여부
- `is_conditional_price`: `payment_condition_types`가 하나 이상 있으면 True. 일반 카드 결제로는 가격이 다르거나 적용 불가할 수 있음
- `url`: 다나와 경유 링크

`count`, `normal_count`, `conditional_count`는 `limit` 적용 후 실제 반환된 `offers[]` 기준입니다.

사용자에게는 `total_price` 기준으로 정렬한 Markdown 표를 먼저 보여주고, 카드가는 별도 열에 표시합니다.

## 주의사항

- 다나와의 공개 HTML/AJAX 구조가 바뀌면 selector와 파싱 규칙을 갱신해야 합니다.
- 자동 구매, 로그인, CAPTCHA 우회, 결제 단계 자동화는 이 스킬의 범위가 아닙니다.
- 동일 상품명이라도 옵션/용량/모델명이 섞일 수 있으므로 검색 후보를 먼저 확인한 뒤 가격비교를 진행합니다.
- 결제조건 배지(현금/쿠폰/포인트/할인/특정 카드/멤버십 한정)는 사용자 응답 표에 반드시 `payment_condition_label` 기반 라벨로 표시해야 합니다. 정렬은 `total_price` 단일 기준이라 조건부 가격이 1위로 올라올 수 있고, 라벨이 없으면 카드 결제 사용자에게 적용 불가능한 가격을 일반 최저가로 안내하게 됩니다.
