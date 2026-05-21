---
name: seoul-bike-share
description: Look up Seoul public bike (따릉이) stations in real time with the official Seoul Open Data API. Use when the user asks where the nearest bike-share dock is, how many bikes are available, or where to return a bike nearby.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# Seoul Bike Share

## What this skill does

서울 열린데이터 광장의 공공자전거(따릉이) 실시간 대여정보 Open API 를 `k-skill-proxy` 경유로 조회해, 사용자 좌표 기준 가까운 대여소·잔여 자전거·반납 가능 거치대를 요약한다.

## When to use

- "여의도역 근처 따릉이 몇 대 있어?"
- "지금 강남역 가까운 따릉이 대여소 보여줘"
- "여기서 반납할 수 있는 빈 거치대 있는 데 알려줘"
- "홍대입구 1번 출구 따릉이 자전거 남았어?"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치를 알려주세요. 위도·경도, 동네, 역명, 랜드마크 중 편한 형식으로 보내주시면 가까운 따릉이 대여소를 찾아볼게요.`
- 의도가 애매하면: `자전거를 빌리려는 거예요, 반납하려는 거예요? 답변에 따라 잔여 자전거 또는 빈 거치대를 우선 보여드릴게요.`

좌표가 아닌 동·역명·랜드마크가 들어오면 **먼저 지오코딩**으로 좌표를 구한다 (아래 Workflow 의 "Geocode place names" 단계). 지오코딩이 실패하면 사용자에게 위경도를 다시 묻거나, `search` 라우트로 대여소명 검색을 시도한다.

## Prerequisites

- optional: `jq`
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.)

## Required environment variables

- 없음. `KSKILL_PROXY_BASE_URL` 은 선택 사항이며, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.

사용자가 개인 서울 열린데이터 광장 OpenAPI key 를 직접 발급할 필요는 없다. `/v1/seoul-bike/*` route 는 기본 hosted proxy 에서 호출하고, upstream key 는 proxy 서버 쪽에만 보관한다.

### Proxy resolution order

1. **`KSKILL_PROXY_BASE_URL` 이 있으면** 그 값을 사용한다.
2. **없거나 빈 값이면** 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.
3. **직접 proxy 를 운영하는 경우에만** proxy 서버 upstream key 를 서버 쪽에만 설정한다.

클라이언트/사용자 쪽에서 upstream key 를 직접 다루지 않는다.

## Inputs

- `lat`, `lng` (필수, nearest 라우트) — 위경도 (소수점)
- `limit` (선택, nearest/search 라우트) — 가져올 대여소 개수, 기본 5, 최대 50
- `query` (필수, search 라우트) — 대여소명/지명 키워드 (예: `망원역`, `강남`)
- `available` (선택, nearest/search) — `true` 면 자전거가 1대 이상 있는 대여소만 (**빌리기**)
- `minBikes` (선택, nearest/search) — 최소 자전거 수 (예: `2`). "지금 빌릴 수 있는 데만" 의도면 `available=true` 또는 `minBikes=1`
- `returnable` (선택, nearest/search) — `true` 면 빈 거치대가 1개 이상인 대여소만 (**반납**)
- `minRacks` (선택, nearest/search) — 최소 빈 거치대 수. "반납할 데" 의도면 `returnable=true` 또는 `minRacks=1`. `minBikes` 와 함께 주면 둘 다 만족하는 대여소만
- `start`, `end` (선택, stations 라우트) — 페이지 범위, 최대 1000개 / 요청

## Workflow

### 1. Resolve the proxy base URL

`KSKILL_PROXY_BASE_URL` 이 있으면 그 값을 사용하고, 없거나 비어 있으면 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.

### 1.5. Geocode place names (좌표가 없을 때)

사용자가 좌표 대신 동·역명·랜드마크("성수동 카페거리", "합정역", "여의도한강공원")를 줬다면, 기존 `k-skill-proxy` 의 Kakao Local geocode 라우트로 먼저 좌표를 구한다. (이 라우트는 `korean-transit-route` 등이 쓰는 공용 라우트이며, Kakao 키는 서버에만 있다.)

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/kakao-local/geocode" --data-urlencode 'q=합정역'
```

응답은 Kakao 형식이다. 첫 결과의 `documents[0].y`(위도) → `lat`, `documents[0].x`(경도) → `lng` 로 쓴다.

```jsonc
{ "documents": [ { "x": "126.9135", "y": "37.5495", "address_name": "서울 마포구 ..." } ] }
```

지오코딩 결과가 없으면 사용자에게 더 구체적인 지명/좌표를 묻거나, 역명·대여소명이면 2단계의 `search` 라우트를 쓴다.

### 2. Choose the route

- **위치 기반 가까운 대여소 (90% 케이스)**: `/v1/seoul-bike/nearest`
- **대여소명/지명으로 찾을 때** (좌표 없이 "망원역 따릉이"): `/v1/seoul-bike/search`
- **전체 페이지 dump 가 필요할 때만**: `/v1/seoul-bike/stations`

대여소명 검색 예시:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-bike/search" \
  --data-urlencode 'query=망원역' \
  --data-urlencode 'limit=5'
```

search 결과에는 `distanceMeters` 가 없고(좌표 기준점 없음), 대신 잔여 자전거·빈 거치대는 동일하게 포함된다.

### 3. Query the nearest endpoint

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-bike/nearest" \
  --data-urlencode 'lat=37.4979' \
  --data-urlencode 'lng=127.0276' \
  --data-urlencode 'limit=5'
```

응답 예시 (요약):

```json
{
  "rentBikeStatus": {
    "list_total_count": 2789,
    "RESULT": { "CODE": "INFO-000" },
    "row": [
      {
        "stationId": "ST-1234",
        "stationName": "강남역 6번 출구",
        "stationLatitude": 37.4981,
        "stationLongitude": 127.0278,
        "parkingBikeTotCnt": 7,
        "rackTotCnt": 15,
        "availableRacks": 8,
        "distanceMeters": 42
      }
    ]
  }
}
```

### 4. Summarize for the user

- 대여소명 + 거리(미터)
- 잔여 자전거 수 (`parkingBikeTotCnt`) — 빌리려는 사용자에게 핵심
- 반납 가능한 빈 거치대 수 (`availableRacks = rackTotCnt - parkingBikeTotCnt`) — 반납하려는 사용자에게 핵심
- live data 기준 시각 (호출 시점)

### 5. Be conservative about live data

실시간 데이터는 분 단위로 바뀔 수 있으므로, 답변에는 조회 시점을 같이 적는다.

## Done when

- 사용자 좌표 기준 가까운 대여소 목록과 잔여 자전거·빈 거치대 수가 정리되어 있다
- live data 기준 시점이 명시되어 있다
- upstream key 가 클라이언트에 노출되지 않았다

## Failure modes

- proxy upstream key 미설정 → `503 upstream_not_configured`
- 일일 할당량 초과 → 정부 API 가 빈 응답 또는 오류 코드 반환
- 좌표가 한국 영역 밖 (lat < 33 or > 39, lng < 124 or > 132) → `400 bad_request`
- 좌표 환산 실패 (지명만 들어왔는데 지오코딩이 안 됨) → 사용자에게 위경도 재질문

## Notes

- 서울 열린데이터 광장은 공공자전거 실시간 데이터에 **일일 호출 제한** 이 있다 (계정·dataset 별로 상이, 대개 1,000회/일)
- proxy 운영/환경변수 설정은 `docs/features/k-skill-proxy.md` 를 참고한다
- nearest 라우트는 proxy 측에서 전체 페이지를 합쳐 haversine 거리로 정렬한 뒤 상위 N 개만 반환하므로 클라이언트 응답 크기가 작다
- endpoint path 는 API 버전 변경 가능성이 있으므로 실패 시 dataset console 의 최신 샘플 URL 을 다시 확인한다
