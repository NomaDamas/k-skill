---
name: naver-map-route
description: 네이버 지도(NAVER Cloud Platform Maps) 기반 출발지→목적지 자동차 길찾기·지오코딩·역지오코딩을 k-skill-proxy 경유로 조회한다. 수동 입력 MVP, mock 기본, live opt-in.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# Naver Map Route (네이버 지도 길찾기 MVP)

> ⚠️ **현재 미작동 (2026-05-25)**: NCP Maps 운영자 키가 프록시 서버에 아직 설정되지 않아 live 모드가 동작하지 않습니다. mock fallback만 사용 가능합니다. NCP 결제수단 등록 완료 후 키를 설정하면 이 안내를 제거합니다.

## What this skill does

사용자가 `/route` 또는 `/이동루트` 명령으로 출발지·목적지를 직접 입력하면, **NAVER Cloud Platform Maps Directions 5** 결과를 `k-skill-proxy` 경유로 조회하여 거리·소요 시간·통행료·연료비를 요약한다.

- 운영자가 NCP Maps key를 proxy 서버 쪽에만 보관하고, 사용자는 별도 key가 필요하지 않다.
- 기본 모드는 **mock**이다. 명시 활성화(`ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true` + `ROUTE_PLANNER_PROVIDER=naver`)될 때만 live proxy 호출을 수행한다.
- 키 누락·인증 실패 시 graceful fallback으로 mock 결과를 안내한다.

이슈 #268 의 MVP 수용 기준:

- [x] `/route` 수동 입력 정상 응답
- [x] `/이동루트` 수동 입력 정상 응답
- [x] 기본 mock 모드에서 안정 동작
- [x] live 명시 활성화 + 키 존재 시 naver provider 선택
- [x] 키 누락/실패 시 fallback 응답
- [x] secret/token/.env 원문 미노출

## When to use

- "/route 강남역에서 시청역" 같은 한 줄 수동 입력
- "/이동루트 출발: <주소> / 도착: <주소>"
- "강남역에서 시청까지 차로 얼마나 걸려?" (수동 좌표/주소 입력으로 변환 후 길찾기)
- 자동차 기준 경로 요약, 거리·소요 시간·통행료·연료비 확인

## When NOT to use

- 도보·자전거·대중교통 경로 (대중교통은 기존 `korean-transit-route` 스킬, 도보·자전거는 별도 스킬)
- 실시간 교통 변동을 1분 단위로 추적하는 작업 (proxy cache가 있음)
- 현재 위치 자동 인식 / 캘린더 연동 (MVP 범위 밖)

## Prerequisites

- Python 3 표준 라이브러리만 사용한다 (`urllib`, `argparse`, `json`).
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org`).
- optional: `ROUTE_PLANNER_PROVIDER=naver` (값이 `naver`일 때만 live provider 후보).
- optional: `ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true` (live 호출을 명시 허용).

## Required environment variables

사용자 머신에는 **필요 없다.** 운영자가 proxy 서버 쪽에 다음을 둔다:

- `NAVER_MAP_CLIENT_ID` — NCP Maps subaccount client id
- `NAVER_MAP_CLIENT_SECRET` — NCP Maps subaccount client secret

proxy 서버가 이 키 없이 가동되면 `/v1/naver-map/*` 라우트는 `503 upstream_not_configured` 를 돌려준다. 클라이언트는 이를 mock fallback 신호로 사용한다.

## Decision flow

```
provider 결정
├── ROUTE_PLANNER_ENABLE_LIVE_PROVIDER != "true"
│     → mock 결과 반환
├── ROUTE_PLANNER_PROVIDER != "naver"
│     → mock 결과 반환
└── live 시도
      ├── proxy /v1/naver-map/directions 호출
      ├── 503 / 502 / 네트워크 실패
      │     → mock fallback + warning 메모
      └── 정상 응답
            → 요약 + provider="naver"
```

## Proxy routes

| endpoint | upstream | 주요 입력 |
|---|---|---|
| `GET /v1/naver-map/directions` | NCP Maps Directions 5 (`/map-direction/v1/driving`) | `start=lng,lat`, `goal=lng,lat`, `waypoints` (최대 5), `option=trafast\|tracomfort\|traoptimal\|traavoidtoll\|traavoidcaronly`, `lang=ko` |
| `GET /v1/naver-map/geocode` | NCP Maps Geocoding (`/map-geocode/v2/geocode`) | `q`, `coordinate`, `filter`, `language`, `page`, `count` |
| `GET /v1/naver-map/reverse-geocode` | NCP Maps Reverse Geocoding (`/map-reversegeocode/v2/gc`) | `coords=lng,lat`, `orders=roadaddr,addr,legalcode,admcode`, `output=json` |

## Workflow

### 1. 사용자 입력 정리

- `/route <start>, <goal>` 또는 `/이동루트 출발: <start> 도착: <goal>` 패턴을 받는다.
- 좌표(`126.9706,37.5559`) 또는 주소(`강남역 1번 출구`) 둘 다 허용. 주소는 geocode 단계로 좌표를 얻는다.

### 2. mock 모드 (기본)

`ROUTE_PLANNER_ENABLE_LIVE_PROVIDER` 가 비어 있거나 `true`가 아니면 즉시 mock 결과를 만든다:

```json
{
  "provider": "mock",
  "start": { "label": "강남역", "lng": null, "lat": null },
  "goal": { "label": "시청역", "lng": null, "lat": null },
  "summary": {
    "distance_km": null,
    "duration_minutes": null,
    "toll_won": null,
    "fuel_won": null
  },
  "note": "live provider is disabled. Set ROUTE_PLANNER_PROVIDER=naver and ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true to call the proxy."
}
```

### 3. live 모드

`ROUTE_PLANNER_PROVIDER=naver` + `ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true`:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/naver-map/directions" \
  --data-urlencode 'start=126.9706,37.5559' \
  --data-urlencode 'goal=127.0276,37.4979' \
  --data-urlencode 'option=trafast'
```

응답에서 기본 `option=trafast` 기준 `route.trafast[0].summary` 를 읽고, 다른 option을 명시한 경우 `route[option][0].summary` 를 다음으로 매핑한다:

- `distance` (meter) → `distance_km = distance / 1000`
- `duration` (millisecond) → `duration_minutes = duration / 60000`
- `tollFare` → `toll_won`
- `fuelPrice` → `fuel_won`

### 4. 주소 → 좌표 변환 (필요할 때만)

사용자가 좌표를 모르고 주소만 줬을 때:

```bash
curl -fsS --get "${BASE}/v1/naver-map/geocode" \
  --data-urlencode 'q=강남역 1번 출구' \
  --data-urlencode 'count=1'
```

응답의 `addresses[0].x` (lng), `addresses[0].y` (lat) 를 사용한다.

### 5. 출력 포맷

```
[mock 모드]
경로 요약 (mock): 강남역 → 시청역
- 거리/소요시간/통행료 정보 없음
- live 활성화 방법: ROUTE_PLANNER_PROVIDER=naver, ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true

[live 모드]
경로 요약 (naver): 강남역(126.9706,37.5559) → 시청역(127.0276,37.4979)
- 거리: 12.3km
- 예상 소요시간: 25분
- 통행료: 1,200원
- 연료비: 1,500원
- 옵션: trafast
- 조회 시각: 2026-05-23T14:00:00.000Z
```

## Failure modes

- proxy upstream key 미설정 (`NAVER_MAP_CLIENT_ID/SECRET` 없음) → `503 upstream_not_configured` → mock fallback
- NCP Maps 인증 실패 (401/403) → proxy가 `503` 으로 변환 → mock fallback
- NCP Maps quota/rate-limit (`429`) → proxy가 `429 upstream_error` 로 보존 → mock fallback + 재시도 간격 안내
- 경로 미발견 (`code != 0`) → `502 upstream_semantic_error` → 메시지와 함께 안내
- 좌표 형식 오류 → `400 bad_request`
- 네트워크 실패 → `502 upstream_error` → mock fallback

## Done when

- 사용자가 `/route` 또는 `/이동루트` 로 출발지·목적지를 줬을 때, mock 또는 live 결과로 한 가지가 명확히 응답된다.
- live 응답에는 거리/시간/통행료/연료비/조회 시각이 정리되어 있다.
- secret/token/.env 원문은 응답에 절대 노출되지 않는다.
- live 실패 시 mock fallback 이 작동하고, fallback 임을 사용자에게 명시한다.

## Notes

- 본 MVP는 **자동차 경로**에 한정한다. 도보·자전거·대중교통은 별도 스킬을 사용한다.
- waypoints 는 최대 5개 (NCP Maps 정책).
- option=`trafast`(빠른 경로) 가 기본. 정확한 정의는 NCP Maps Directions 5 공식 문서를 참고.
- proxy 운영/환경변수 설정은 `docs/features/k-skill-proxy.md` 를 참고한다.
- 현재 위치 자동 인식·캘린더 읽기는 의도적으로 범위에서 제외된다(이슈 #268 OUT).
