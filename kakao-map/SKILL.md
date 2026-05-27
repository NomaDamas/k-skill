---
name: kakao-map
description: Kakao Local (장소 검색·주소-좌표 변환) + Kakao Mobility (자동차 길찾기) 를 k-skill-proxy 경유로 조회한다. 사용자 키 불필요.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# Kakao Map

## What this skill does

Kakao Developers의 두 API를 `k-skill-proxy` 경유로 묶어 다음 두 종류 질문에 답한다:

1. **장소 검색** — 키워드/카테고리/좌표 기준으로 가게·시설·랜드마크를 찾고, 좌표↔주소·행정구역을 변환한다 (Kakao Local REST API).
2. **자동차 길찾기** — 출발지·목적지 좌표를 받아 거리·소요시간·통행료·예상 택시 요금을 조회한다 (Kakao Mobility Directions API).

- 운영자 `KAKAO_REST_API_KEY` 를 proxy 서버에만 보관한다. 사용자는 키 발급 필요 없음.
- 두 API 모두 같은 Kakao REST API key (KakaoAK 헤더) 로 인증한다.
- 본 스킬은 **조회 전용**이다. 예약·결제·운전 자동화는 하지 않는다.

## When to use

- "강남역 근처 스타벅스 찾아줘" → keyword 검색 (x,y 중심)
- "역삼동 카페 카테고리로 보여줘" → category 검색 (FD6/CE7 등)
- "이 좌표가 어느 동/도로명 주소야?" → coord2address / coord2region
- "강남역에서 시청까지 자동차로 얼마나 걸려?" → Kakao Mobility directions
- "통행료 회피 경로로 알려줘" → avoid=toll (필요 시 priority=DISTANCE 병행)

## When NOT to use

- 대중교통(지하철·버스) 경로 → Kakao Mobility는 **자동차 전용**. 대중교통은 `korean-transit-route`(ODsay) 사용
- 도보·자전거 경로 (Kakao Mobility에 정식 API 없음)
- 실시간 교통 상황을 1분 단위로 추적 (proxy cache 가 있음)
- 카카오맵 외부 임베드/렌더링 (본 스킬은 데이터 조회만 함)
- 대량 인덱싱/스크래핑 (Kakao 약관 위반 + 일일 quota 초과 위험)

## Prerequisites

- Python 3 표준 라이브러리만 사용 가능. JS/curl 호출도 동일하게 지원.
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시 사용 시. 비우면 hosted `https://k-skill-proxy.nomadamas.org` 기본).

## Required environment variables

사용자 머신에는 **필요 없다.** 운영자 proxy 서버에 다음을 둔다:

- `KAKAO_REST_API_KEY` — Kakao Developers REST API 키 (Local + Mobility 공용)

키가 없으면 모든 `/v1/kakao-map/*` 및 `/v1/kakao-mobility/*` 라우트가 `503 upstream_not_configured` 를 돌려준다.

## Proxy routes

| endpoint | 용도 | 주요 입력 |
|---|---|---|
| `GET /v1/kakao-map/search/keyword` | 키워드 장소 검색 | `q`, optional `x`,`y`(중심좌표), `radius`(0~20000m), `category_group_code`, `sort`(accuracy\|distance), `page`(1~45), `size`(1~15) |
| `GET /v1/kakao-map/search/category` | 카테고리 장소 검색 (좌표 중심 필수) | `category_group_code`(예: FD6 음식점, CE7 카페), `x`, `y`, `radius`(기본 500), `sort`, `page`, `size` |
| `GET /v1/kakao-map/coord2address` | 좌표 → 도로명/지번 주소 | `x`, `y`, optional `input_coord`(WGS84 기본) |
| `GET /v1/kakao-map/coord2region` | 좌표 → 행정구역(시/도/시군구/동) | `x`, `y`, optional `input_coord` |
| `GET /v1/kakao-mobility/directions` | 자동차 길찾기 | `origin=x,y`, `destination=x,y`, optional `waypoints`(최대 5, `\|` 구분), `priority`(RECOMMEND\|TIME\|DISTANCE), `car_fuel`(GASOLINE\|DIESEL\|LPG), `car_hipass`(true\|false), `alternatives`(true\|false), `avoid`(ferries\|toll\|motorway\|schoolzone\|uturn; `\|` 구분) |

**Kakao 카테고리 그룹 코드** (자주 쓰는 것):

| 코드 | 의미 |
|---|---|
| MT1 | 대형마트 |
| CS2 | 편의점 |
| PK6 | 주차장 |
| OL7 | 주유소/충전소 |
| SW8 | 지하철역 |
| BK9 | 은행 |
| CT1 | 문화시설 |
| AT4 | 관광명소 |
| AD5 | 숙박 |
| FD6 | 음식점 |
| CE7 | 카페 |
| HP8 | 병원 |
| PM9 | 약국 |

## Workflow

### 1. 키워드 검색

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/kakao-map/search/keyword" \
  --data-urlencode 'q=스타벅스' \
  --data-urlencode 'x=127.0276' \
  --data-urlencode 'y=37.4979' \
  --data-urlencode 'radius=500' \
  --data-urlencode 'sort=distance'
```

응답의 `documents[]` 에서 `place_name`, `road_address_name`, `phone`, `place_url`, `distance` 를 추출해 사용자에게 보여준다.

### 2. 카테고리 검색

```bash
curl -fsS --get "${BASE}/v1/kakao-map/search/category" \
  --data-urlencode 'category_group_code=FD6' \
  --data-urlencode 'x=127.0276' \
  --data-urlencode 'y=37.4979' \
  --data-urlencode 'radius=300'
```

### 3. 좌표 → 주소

```bash
curl -fsS --get "${BASE}/v1/kakao-map/coord2address" \
  --data-urlencode 'x=127.0276' \
  --data-urlencode 'y=37.4979'
```

`documents[0].road_address.address_name`, `documents[0].address.address_name` 사용.

### 4. 좌표 → 행정구역

```bash
curl -fsS --get "${BASE}/v1/kakao-map/coord2region" \
  --data-urlencode 'x=127.0276' \
  --data-urlencode 'y=37.4979'
```

응답에 `region_type`(B=법정동, H=행정동) 별 결과가 들어있다.

### 5. 자동차 길찾기

```bash
curl -fsS --get "${BASE}/v1/kakao-mobility/directions" \
  --data-urlencode 'origin=126.9706,37.5559' \
  --data-urlencode 'destination=127.0276,37.4979' \
  --data-urlencode 'priority=RECOMMEND' \
  --data-urlencode 'avoid=toll'
```

응답에서 `routes[0].summary` 를 읽는다:

- `distance` (meter) → km 환산
- `duration` (second) → 분 환산
- `fare.taxi`, `fare.toll` → 원
- `priority` (요청한 값 echo)
- `avoid` 요청 시 `toll` 등 회피 옵션 적용

### 6. 출력 포맷

장소 검색:

```text
강남역 근처 스타벅스 5곳 (반경 500m, 가까운 순)
1) 스타벅스 강남R점 — 강남구 테헤란로 ... (120m, 02-...)
2) ...
```

자동차 길찾기:

```text
자동차 경로: (126.9706,37.5559) → (127.0276,37.4979)
- 거리: 12.3km / 예상 소요시간: 25분
- 통행료: 1,200원 / 예상 택시요금: 18,500원
- 옵션: RECOMMEND, avoid=toll
- 조회 시각: 2026-05-23T14:00:00.000Z
```

## Failure modes

- `KAKAO_REST_API_KEY` 미설정 → `503 upstream_not_configured`
- Kakao 인증 실패(401/403) → proxy가 `503` 으로 변환 (key revoke / 쿼터 초과 신호)
- 좌표/파라미터 형식 오류 → `400 bad_request`
- 출발지=도착지가 너무 가까움 (`result_code=104` 등) → `502 upstream_semantic_error` + `result_msg`
- Kakao 일일 쿼터 초과 → `502` 또는 `503` (proxy cache 가 있는 만큼 호출 빈도를 줄임)
- 네트워크 실패 → `502 upstream_error`

## Done when

- 사용자 질문에 맞는 endpoint 1~2개를 선택해 호출했고, 응답을 사람-읽기 좋게 정리했다.
- 좌표나 주소는 출처 endpoint를 함께 명시한다 (Kakao Local vs Kakao Mobility).
- secret/token/.env 원문은 노출되지 않았다.
- 자동차 외 이동 수단을 요청받으면 본 스킬의 범위 외임을 명시하고 `korean-transit-route` 등 대체 안내.

## Notes

- Kakao Mobility는 **자동차 전용** API다. 대중교통 길찾기는 별도 ODsay 기반 `korean-transit-route` 스킬을 쓴다.
- 무료 일일 쿼터(2026년 기준 Local 300,000건 / Mobility 1,000건) 안에서 proxy cache(기본 TTL 5분) + rate-limit(기본 60req/분) 으로 보호한다.
- proxy 운영/환경변수는 [k-skill 프록시 서버 가이드](../docs/features/k-skill-proxy.md) 참고.
- `/v1/kakao-local/geocode` (기존)도 같은 키를 쓰며 여전히 사용 가능하다 (address → keyword 자동 fallback). 본 스킬은 그 위에 keyword/category/coord 계열을 명시적으로 노출한다.
