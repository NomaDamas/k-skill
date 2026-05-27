# 당근 중고거래 검색 가이드 (`daangn-used-goods-search`)

당근 중고거래 공개 웹 데이터 표면을 사용해 키워드·지역 기반 매물을 검색하고, 개별 매물 상세를 읽기 전용으로 확인하는 스킬입니다.

## 사용 시나리오

- "당근에서 합정동 맥북 매물 찾아봐"
- "이 당근 중고거래 URL 상세 요약해줘"
- "아이폰 15 Pro 중고 매물 중 판매중인 것만 봐줘"

## 구현 표면

브라우저 자동화, 로그인, 채팅, 찜, 거래 제안, 구매 자동화를 사용하지 않습니다.

1. 지역 해석: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>`
2. 검색: `https://www.daangn.com/kr/buy-sell/all/?in=<지역명>-<id>&search=<키워드>&only_on_sale=true&_data=routes/kr.buy-sell._index`
3. 상세: `<매물 URL>?_data=routes%2Fkr.buy-sell.%24buy_sell_id`

## 로컬 실행

```bash
python3 daangn-used-goods-search/scripts/daangn_used_goods.py search "맥북" --region "합정동" --limit 5
python3 daangn-used-goods-search/scripts/daangn_used_goods.py detail "https://www.daangn.com/kr/buy-sell/.../"
```

## 지역 필터

지역명은 바로 URL에 넣지 않고 당근 region API로 내부 id를 먼저 조회합니다.

```text
합정동 → 서울특별시 마포구 합정동, id=231 → in=합정동-231
```

동일 지명이 여러 곳에 있으면 정확 일치 후보, 서울 동 단위 후보, 첫 번째 후보 순으로 선택합니다. 결과에는 적용 지역(`effective_region`)과 원본 URL을 함께 남깁니다.

## 출력 해석

검색 결과는 `title`, `price`, `price_text`, `status`, `region`, `url` 중심으로 1차 후보를 고릅니다. 조회수, 채팅수, 설명 같은 상세 판단은 상세 조회 결과의 `product` 원문을 확인한 뒤 정리합니다.

## 제한사항

- 공개 Remix `_data` route 이름이나 JSON shape가 바뀌면 실패할 수 있습니다.
- 삭제·판매완료·비공개 전환된 글은 상세 조회가 실패할 수 있습니다.
- CAPTCHA, 로그인벽, 봇 차단이 나오면 실패 모드로 보고하고 우회하지 않습니다.
- 상대방에게 영향을 주는 채팅, 찜, 거래 제안, 구매 자동화는 범위 밖입니다.
