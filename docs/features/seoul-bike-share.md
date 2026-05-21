# 서울 따릉이 실시간 대여소 조회 가이드

## 이 기능으로 할 수 있는 일

- 사용자 좌표 기준 가까운 따릉이 대여소 N 개 확인 (기본 5 개, 최대 50 개)
- 각 대여소의 잔여 자전거(`parkingBikeTotCnt`) 와 빈 거치대(`availableRacks = rackTotCnt - parkingBikeTotCnt`) 동시 확인
- 대여소 위경도·이름·거리(미터) 같이 확인
- 별도 사용자 `SEOUL_OPEN_API_KEY` 없이 `k-skill-proxy` 로 조회

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인
- 사용자 현재 위치(위도·경도, 또는 좌표로 환산 가능한 동·역명·랜드마크)

> 좌표가 없고 지명만 있으면, 스킬이 먼저 공용 `/v1/kakao-local/geocode?q=<지명>` 라우트로 좌표를 구한 뒤 `nearest` 를 호출한다 (Kakao 키는 서버에만 있어 사용자 키 불필요). 즉 "합정역 근처 따릉이"처럼 좌표 없이도 동작한다.

## 기본 경로

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/seoul-bike/nearest` 로 요청한다.

사용자는 별도 서울 열린데이터 광장 OpenAPI key 를 직접 발급받을 필요는 없다. upstream key 는 proxy 서버에서만 `SEOUL_OPEN_API_KEY` 로 관리한다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 쓴다.

## 입력값

### `/v1/seoul-bike/nearest` (위치 기반)

- `lat` — 위도 (33 ~ 39 사이)
- `lng` — 경도 (124 ~ 132 사이)
- `limit` (선택) — 가져올 대여소 개수, 기본 5, 최대 50
- `available`/`minBikes` (선택) — 빌리기: 자전거가 있는(또는 N대 이상) 대여소만
- `returnable`/`minRacks` (선택) — 반납: 빈 거치대가 있는(또는 N개 이상) 대여소만

### `/v1/seoul-bike/search` (대여소명/지명 검색)

- `query` (필수) — 대여소명/지명 키워드 (예: `망원역`, `여의나루`). 좌표 없이 이름으로 찾을 때.
- `limit` (선택) — 기본 5, 최대 50
- `available`/`minBikes`, `returnable`/`minRacks` (선택) — nearest 와 동일한 빌리기/반납 필터

### `/v1/seoul-bike/stations` (페이지 dump, 부가 라우트)

- `start` (선택) — 시작 인덱스, 기본 1
- `end` (선택) — 끝 인덱스, 기본 `start + 999`, 한 요청당 최대 1000 개

## 기본 흐름

1. client/skill 은 사용자 좌표를 받아 기본 hosted path 또는 `KSKILL_PROXY_BASE_URL` 아래 `/v1/seoul-bike/nearest` endpoint 를 호출한다.
2. proxy 는 서울 열린데이터 광장 `bikeList/1/1000/`, `bikeList/1001/2000/`, `bikeList/2001/3000/` 를 `SEOUL_OPEN_API_KEY` 와 함께 순차 호출해 전체 정류소를 모은다.
3. 사용자 좌표 기준 haversine 거리로 정렬해 상위 `limit` 개만 반환하며, 각 대여소에 `availableRacks` 와 `distanceMeters` 를 계산해 함께 노출한다.
4. `proxy.cache.hit` 메타데이터를 추가한다.

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-bike/nearest" \
  --data-urlencode 'lat=37.4979' \
  --data-urlencode 'lng=127.0276' \
  --data-urlencode 'limit=5'
```

예상 응답 (요약):

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
        "shared": "47",
        "distanceMeters": 42
      }
    ]
  },
  "query": { "lat": 37.4979, "lng": 127.0276, "limit": 5 },
  "proxy": {
    "cache": { "hit": false, "ttl_ms": 60000 },
    "requested_at": "2026-05-19T07:30:00.000Z"
  }
}
```

## fallback / 대체 흐름

- `KSKILL_PROXY_BASE_URL` 을 별도로 넣으면 해당 proxy 를 우선 사용한다.
- 기본 hosted path 는 `https://k-skill-proxy.nomadamas.org/v1/seoul-bike/nearest` 이다.
- self-host 운영자는 서버 쪽에만 `SEOUL_OPEN_API_KEY` 를 넣는다 (사용자 쪽에는 키가 필요 없다).

## 주의할 점

- 데이터는 실시간이지만 분 단위로 변동하므로, 사용자에게 답할 때 조회 시점을 함께 표시한다.
- 일일 호출 할당량 초과 시 다음 날 재시도하거나 nearest 라우트의 캐시 TTL 을 활용한다 (`/v1/seoul-bike/nearest` 는 좌표·limit 조합 기준 캐시).
- 좌표가 한국 영역 밖이면 `400 bad_request` 가 반환된다.
- 따릉이 서비스 권역 밖(서울 외 광역시·지방) 좌표를 넣으면 빈 대여소 목록이나 매우 먼 거리 결과가 나올 수 있다.

## 참고 표면

- 공식 API 안내: `https://data.seoul.go.kr/dataList/OA-13252/A/1/datasetView.do`
- 서울 열린데이터 광장: `https://data.seoul.go.kr`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
