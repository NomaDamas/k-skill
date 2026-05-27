# 당근중고차 검색 가이드 (`daangn-cars-search`)

당근중고차 공개 웹 데이터 표면을 사용해 지역·키워드·가격 조건 기반 차량을 검색하고, 개별 차량 상세를 읽기 전용으로 확인하는 스킬입니다.

## 사용 시나리오

- "당근중고차 합정동 레이 찾아봐"
- "당근에서 천만원 이하 중고차 검색해줘"
- "이 당근 중고차 URL 상세 요약해줘"

## 구현 표면

브라우저 자동화, 로그인, 채팅, 문의, 구매 자동화를 사용하지 않습니다.

1. 지역 해석: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>`
2. 검색: `https://www.daangn.com/kr/cars/?in=<지역명>-<id>&onlyOnSale=1&_data=routes/kr.cars._index`
3. 상세: `<차량 URL>?_data=routes%2Fkr.cars.%24car_post_id`

## 로컬 실행

```bash
python3 daangn-cars-search/scripts/daangn_cars.py search "레이" --region "합정동" --limit 5
python3 daangn-cars-search/scripts/daangn_cars.py search --region "합정동" --price-max 10000000 --limit 5
python3 daangn-cars-search/scripts/daangn_cars.py detail "https://www.daangn.com/kr/cars/.../"
```

## 지역 필터

지역명은 당근 region API로 내부 id를 해석한 뒤 `in=<지역명>-<id>` 형태로 검색 URL에 넣습니다.

```text
합정동 → 서울특별시 마포구 합정동, id=231 → in=합정동-231
```

## 출력 해석

검색 결과는 `title`, `price`, `price_text`, `region`, `status`, `driveDistance`, `carData`, `chatRoomCount`, `url`을 우선 확인합니다. 차량 연식, 주행거리, 사고/정비 이력처럼 원문 의존도가 높은 정보는 상세 조회의 `carPost` 원문을 함께 확인합니다.

## 제한사항

- 공개 Remix `_data` route 이름이나 JSON shape가 바뀌면 실패할 수 있습니다.
- 문의, 시승 예약, 구매, 결제, 채팅 자동화는 실행하지 않습니다.
- 가격·판매 상태는 실시간으로 바뀔 수 있어 원문 URL을 함께 제시합니다.
