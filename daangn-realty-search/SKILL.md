---
name: daangn-realty-search
description: 당근부동산(realty.daangn.com) 공개 웹 데이터로 지역 기반 부동산 매물 검색과 상세 확인을 수행한다. 문의/예약/계약 자동화는 제외한다.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1.5
---

# Daangn Realty Search

## What this skill does

당근부동산 지도 페이지(`realty.daangn.com/map/{name1}/{name2}/{name3}`)의 SSR `window.RELAY_STORE`(Relay 정규화 스토어)를 파싱해 매물 후보를 정리한다. 제목·주소·층수는 상세 페이지의 JSON-LD에서 보강한다. 외부 패키지 없이 Python 표준 라이브러리만 사용한다.

## When to use

- "당근부동산 매교동 월세 찾아봐"
- "수원 팔달구 상가 매물 봐줘" (`--expand`로 인접 동까지)
- "이 당근부동산 URL 상세 요약해줘"

## When not to use

- 당근 계정 로그인이 필요한 작업
- 채팅, 찜, 거래 제안, 문의, 예약, 계약, 구매처럼 상대방/계정에 영향을 주는 작업
- CAPTCHA/봇 차단/로그인벽 우회가 필요한 작업

## Prerequisites

- 인터넷 연결, Python 3.9+

## Data surfaces (2026-06 도메인 이전 대응)

- Region resolver: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>` → `{"locations":[{id,name1,name2,name3,name*Id,depth}]}`
- 매물 목록: `https://realty.daangn.com/map/{name1}/{name2}/{name3}` 의 `window.RELAY_STORE`
- 상세: `https://realty.daangn.com/articles/<id>` 의 `application/ld+json`

> ⚠️ **구버전(`www.daangn.com/kr/realty/?_data=routes/kr.realty._index`)은 2026-06부터 HTTP 204(빈 응답)로 폐기됨.** 절대 사용 금지.

## RELAY_STORE 파싱 경로 (검증됨)

```
ArticleFeedConnection.edges → ArticleFeedEdge.node → ArticleFeedCard.article → Article
```
- 스토어에 `ArticleFeedCard`가 직접 다 들어있어, **Card를 순회 → article ref 디레퍼런스**가 가장 견고하다.
- `Article`: `originalId`, `area`(㎡, **문자열일 수 있어 float 변환 필수**), `salesTypeV3`(→`*SalesTypeV2.type`), `trades`(→ Month/Buy/BorrowTrade)
- 가격 단위 = **만원**: `deposit`(보증금), `monthlyPay`(월세), `price`(매매가). 예: deposit 2000 = 2천만원, price 28700 = 2억8,700만.
- `window.RELAY_STORE`는 **JS 문자열로 이스케이프**돼 있다 → `json.loads(json.loads('"'+raw+'"'))` 2단 디코드.

## Trade 유형 & 평당 단가

| 거래유형 | typename | 가격 필드 | 평당 단가 |
|---|---|---|---|
| 월세(MONTH) | MonthTrade | deposit + monthlyPay | monthlyPay / 평 |
| 매매(BUY) | BuyTrade | price | price / 평 |
| 전세(BORROW) | BorrowTrade | deposit | deposit / 평 |

평 = ㎡ / 3.305785.

## salesType enum

`APART`, `OFFICETEL`, `STORE`, `OPEN_ONE_ROOM`, `SPLIT_ONE_ROOM`, `TWO_ROOM`, `HOUSE` 등.

## 층수 (상세 JSON-LD)

목록엔 층수가 없다. 상세 페이지 `Product.additionalProperty` 배열에서:
- `floor`(예 "8.0") / `topFloor`(예 "10") → `floor_label` = "8층/10층"
- `nearbySubwayStation` 도 함께 추출.
제목은 `Product.name`, 주소는 `Place.name`.

## Commands

```bash
# 기본 검색 (상위 5개 제목·층수 보강)
python3 daangn-realty-search/scripts/daangn_realty.py search --region "매교동" --limit 20

# 거래/용도 필터
python3 ... search --region "매교동" --trade-type BUY            # 매매만
python3 ... search --region "매교동" --sales-type STORE,OFFICETEL # 용도 콤마구분

# 인접 동까지 확장 (같은 구/시)
python3 ... search --region "매교동" --expand --expand-max 6

# 상세
python3 ... search --region "매교동" --titles 0   # 제목 보강 끄기(빠름)
python3 ... detail "https://realty.daangn.com/articles/2947028"
```

옵션: `--limit`(기본 20), `--titles N`(상세로 제목·층수 보강할 상위 N, 기본 5, 0=끔), `--expand`/`--expand-max`(기본 6).
기존 CLI 호환 옵션인 `--keyword`는 반환 매물의 공개 필드 텍스트를 필터링한다. `--only-verified`는 공개 피드에서 별도 인증 필드를 제공하지 않아 호환 목적으로만 허용한다.

## Output fields

매물: `article_id, salesType, area_sqm, area_pyeong, trades[{type,label,deposit_manwon,monthly_manwon,price_manwon,per_pyeong_manwon}], url, region, title, address, floor_label, nearby_subway, release_date`

`release_date`는 상세 페이지 JSON-LD의 `Product.releaseDate`(ISO 8601, UTC)이며 `--titles` 보강 대상 매물에만 채워진다. 최초 등록일인지 최근 끌어올리기/수정일인지는 당근 쪽 명세에 없어 확정할 수 없다.

## Region handling

지역명 → region API로 내부 id 해석. 동명이 여럿이면 정확일치 → 서울 depth=3 → 첫 후보 순. 응답에 `effective_region` 포함. `--expand`는 같은 `name2Id`(구/시) 인접 동을 모은다.

## Safety and scope

- 읽기 전용 검색/상세만. 로그인·채팅·거래·예약·계약 자동화 없음.
- 공개 표면이 바뀌거나 빈 응답/봇 차단이면 실패 모드로 보고하고 우회하지 않는다.
- 결과는 실시간 호가라 실거래와 다를 수 있으므로 source URL을 함께 제시.

## Failure modes

- `RELAY_STORE 없음` (sources note) → 페이지 구조 재변경 또는 봇 차단. HTML 구조 재확인 필요.
- 시군구(name2) 랜딩 URL은 매물이 없다 — **반드시 동(name3)까지** 있어야 articleFeed가 SSR로 채워진다.
- 동명이 넓거나 중복되면 다른 행정동 선택 가능.
- 상세는 삭제/비공개 글에서 실패할 수 있다.

## Done when

- 지역 id 해석 → map URL의 RELAY_STORE에서 매물 추출 → source URL·effective_region 포함.
- 인증/거래성 액션은 수행하지 않았다.

## Notes

- Windows stdout 한글 깨짐 방지: 지원 런타임에서는 `sys.stdout.reconfigure(encoding='utf-8')`를 적용한다.
- `area`·가격 필드가 문자열로 오는 케이스가 있어 모든 수치 연산 전 float 변환 가드.
