# 서울 따릉이 실시간 대여소 조회 가이드

## 이 기능으로 할 수 있는 일

- 현재 좌표 주변 따릉이 대여소의 대여 가능 자전거 수 확인
- 빈 거치대 수(`rackTotCnt - parkingBikeTotCnt`) 확인
- 대여소 이름 키워드로 실시간 상태 검색
- 별도 사용자 `SEOUL_OPEN_API_KEY` 없이 `k-skill-proxy` 로 조회

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인

## 기본 경로

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/seoul-bike/*` 로 요청한다.

사용자는 별도 서울 열린데이터 광장 OpenAPI key 를 직접 발급받을 필요가 없다. upstream key 는 proxy 서버에서만 `SEOUL_OPEN_API_KEY` 로 관리한다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 쓴다.

## Proxy routes

| endpoint | upstream / 동작 | 주요 입력 |
|---|---|---|
| `GET /v1/seoul-bike/realtime` | 서울 열린데이터 광장 `bikeList` 실시간 대여정보 페이지 | `startIndex`, `endIndex` |
| `GET /v1/seoul-bike/stations` | 서울 열린데이터 광장 `tbCycleStationInfo` 대여소 마스터 페이지 | `startIndex`, `endIndex` |
| `GET /v1/seoul-bike/nearby` | proxy 가 realtime 행을 좌표 반경으로 필터링 | `lat`, `lon`, `radius_m`, `limit` |

## 기본 흐름

1. client/skill 은 기본 hosted path 또는 `KSKILL_PROXY_BASE_URL` 아래 `/v1/seoul-bike/nearby` endpoint 를 호출한다.
2. proxy 는 서울 열린데이터 광장 `bikeList` 를 `SEOUL_OPEN_API_KEY` 와 함께 호출한다.
3. proxy 는 좌표와 반경을 기준으로 대여소를 정렬하고 `available_bikes`, `empty_docks`, `distance_m` 을 반환한다.
4. 응답에는 `proxy.cache.hit`, `proxy.requested_at` 메타데이터가 붙는다.

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-bike/nearby" \
  --data-urlencode 'lat=37.5717' \
  --data-urlencode 'lon=126.9763' \
  --data-urlencode 'radius_m=500' \
  --data-urlencode 'limit=5'
```

스킬 CLI 사용 예시:

```bash
python3 seoul-bike/scripts/seoul_bike.py nearby --lat 37.5717 --lon 126.9763 --radius-m 500
python3 seoul-bike/scripts/seoul_bike.py search "광화문" --limit 5
```

예상 응답 요약:

```text
따릉이 주변 대여소 2곳
기준 좌표: 37.5717, 126.9763 / 반경 500m
- 101. 광화문역 1번출구 앞: 대여 가능 4대, 빈 거치대 11개, 거리 0m
조회 시각: 2026-05-21T06:10:00.000Z
```

## fallback / 대체 흐름

- `KSKILL_PROXY_BASE_URL` 을 별도로 넣으면 해당 proxy 를 우선 사용한다.
- 기본 hosted path 는 `https://k-skill-proxy.nomadamas.org/v1/seoul-bike/*` 이다.
- self-host 운영자는 서버 쪽에만 `SEOUL_OPEN_API_KEY` 를 넣는다. 사용자 쪽에는 키가 필요 없다.

## 주의할 점

- 실시간 데이터는 계속 변하므로 답변에는 조회 시각을 함께 적는다.
- 예약/대여 자동화는 하지 않는다. 조회 전용 스킬이다.
- 서울 열린데이터 광장 quota 초과나 일시 장애가 있을 수 있다.
- 반경 안에 대여소가 없으면 `items: []` 가 정상적으로 반환될 수 있다.

## 참고 표면

- 서울 열린데이터 광장: `https://data.seoul.go.kr`
- 따릉이 실시간 대여정보: `bikeList`
- 따릉이 대여소 정보: `tbCycleStationInfo`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
