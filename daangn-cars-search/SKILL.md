---
name: daangn-cars-search
description: 당근중고차 공개 웹 데이터 표면으로 지역·가격 조건 기반 차량 검색과 상세 조회를 수행한다. 문의/구매 자동화는 제외한다.
license: MIT
metadata:
  category: automotive
  locale: ko-KR
  phase: v1
---

# Daangn Cars Search

## What this skill does

당근중고차 공개 Remix `_data` JSON route를 사용해 차량 목록과 상세 정보를 읽기 전용으로 조회한다.

최종 사용자는 자연어로 요청해도 되고, 필요하면 아래의 Python helper를 직접 실행한다. 외부 패키지나 k-skill-proxy 없이 Python 표준 라이브러리만 사용한다.

## When to use

- "당근중고차 합정동 레이 찾아봐"
- "당근에서 천만원 이하 중고차 검색"
- "이 당근 중고차 URL 상세 봐줘"

## When not to use

- 당근 계정 로그인이 필요한 작업
- 채팅, 찜, 거래 제안, 문의, 지원, 예약, 계약, 구매처럼 상대방 또는 계정에 영향을 주는 작업
- CAPTCHA/봇 차단/로그인벽 우회가 필요한 작업

## Prerequisites

- 인터넷 연결
- Python 3.9+
- 이 저장소 루트에서 실행하거나, 스크립트 경로를 절대경로로 지정

## Data surfaces

- Region resolver: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>`
- Search `_data`: `/kr/cars/?in=<지역명>-<id>&onlyOnSale=1&_data=routes/kr.cars._index`
- Detail `_data`: `<car-url>?_data=routes%2Fkr.cars.%24car_post_id`

## Workflow

1. 사용자 요청에서 키워드, 지역명, 가격/거래 유형 같은 필터를 추출한다.
2. 지역명이 있으면 region resolver로 내부 region id를 찾는다.
3. 목록 검색은 category별 `_data` route를 호출한다.
4. 상세 URL이 주어지면 category별 detail route 또는 공개 HTML 메타를 조회한다.
5. 결과를 짧게 정리하되 source URL과 적용 지역을 보존한다.

## Commands

```bash
python3 daangn-cars-search/scripts/daangn_cars.py search "레이" --region "합정동" --limit 5
python3 daangn-cars-search/scripts/daangn_cars.py search --region "합정동" --price-max 10000000 --limit 5
python3 daangn-cars-search/scripts/daangn_cars.py detail "https://www.daangn.com/kr/cars/.../"
```

## Output fields

- title, price, price_text, region, status, driveDistance, carData, chatRoomCount, url
- detail: carPost 원문

## Region handling

지역 필터가 있으면 먼저 당근 지역 검색 API로 내부 지역 id를 해석한다.

```text
https://www.daangn.com/kr/api/v1/regions/keyword?keyword=합정동
→ 서울특별시 마포구 합정동, id=231
→ in=합정동-231
```

동일한 지명이 여러 지역에 있으면 다음 우선순위로 선택한다.

1. 사용자가 입력한 문자열이 `name`, `name1`, `name2`, `name3` 중 하나와 정확히 맞는 후보
2. 서울 `depth=3` 동 단위 후보
3. 첫 번째 후보

응답에는 항상 `effective_region` 또는 실제 적용된 지역명을 포함한다. 사용자의 의도와 다른 지역으로 보이면 결과를 단정하지 말고 후보 확인을 요청한다. IP/쿠키 기본 위치에 의존하지 않는다.

## Safety and scope

- 읽기 전용 검색/상세 조회만 수행한다.
- 로그인, 채팅, 찜, 거래 제안, 지원, 문의, 예약, 계약, 구매 자동화는 하지 않는다.
- 공개 웹 표면이 바뀌거나 빈 응답/봇 차단/로그인벽이 나오면 실패 모드로 보고하고 우회하지 않는다.
- 결과는 실시간 재고/공고 상태와 달라질 수 있으므로 source URL을 함께 제시한다.

## Failure modes

- 당근의 Remix route 이름이나 JSON shape가 변경되면 `_data` 조회가 실패할 수 있다.
- 지역명이 넓거나 중복되면 다른 행정동이 선택될 수 있다.
- 검색 결과가 0건이어도 사이트 정책/지역 기본값/필터 조합 때문일 수 있으므로 source URL을 보존한다.
- 상세 조회는 삭제/종료/비공개 전환된 글에서 실패할 수 있다.

## Done when

- 지역명이 있으면 지역 id를 해석하고 적용했다.
- 목록 조회 또는 상세 조회를 최소 1회 수행했다.
- 결과에 source URL과 effective region을 포함했다.
- 인증/거래성 액션은 수행하지 않았다.
