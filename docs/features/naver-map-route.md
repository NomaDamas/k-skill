# 네이버맵 길찾기 가이드

> ⚠️ **현재 미작동 (2026-05-25)**: NCP Maps 운영자 키(`NAVER_MAP_CLIENT_ID`/`NAVER_MAP_CLIENT_SECRET`)가 아직 프록시 서버에 설정되지 않아 모든 `/v1/naver-map/*` 라우트가 `503 upstream_not_configured`를 반환합니다. 스킬은 mock fallback으로 동작합니다. NCP 결제수단 등록이 완료되는 대로 키를 설정하고 이 안내를 제거할 예정입니다.

## 이 기능으로 할 수 있는 일

- 출발지·목적지를 좌표(`lng,lat`) 또는 주소로 받아 NAVER Cloud Platform Maps Directions 5 결과를 `k-skill-proxy` 경유로 조회
- 자동차 경로의 거리·소요 시간·통행료·연료비 요약
- 주소 → 좌표(Naver Geocoding), 좌표 → 주소(Reverse Geocoding) 보조 조회
- `/route`, `/이동루트` 명령으로 호출되는 instruction-level 워크플로

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인
- 사용자는 별도 NAVER Map key 발급 필요 없음
- 운영자(proxy 서버)는 NAVER_MAP_CLIENT_ID·NAVER_MAP_CLIENT_SECRET 보유

## 기본 경로

기본 hosted path: `https://k-skill-proxy.nomadamas.org/v1/naver-map/*`

`KSKILL_PROXY_BASE_URL` 환경변수로 override 가능.

## Provider 결정

| 환경변수 | 효과 |
|---|---|
| `ROUTE_PLANNER_PROVIDER=naver` | naver provider 활성화 후보 |
| `ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true` | live proxy 호출 명시 허용 |
| 둘 중 하나라도 미설정 | mock 결과 반환 |

이 게이트는 **기본을 mock으로 잠그는 안전장치**다. 명시 활성화 없이 운영자 proxy를 호출하지 않는다.

## Proxy routes

| endpoint | upstream | 주요 입력 |
|---|---|---|
| `GET /v1/naver-map/directions` | NCP Maps Directions 5 | `start=lng,lat`, `goal=lng,lat`, `waypoints` (`\|` 구분 최대 5), `option`(trafast 기본), `lang=ko` |
| `GET /v1/naver-map/geocode` | NCP Maps Geocoding | `q`, `coordinate`, `filter`, `language`, `page`, `count` |
| `GET /v1/naver-map/reverse-geocode` | NCP Maps Reverse Geocoding | `coords=lng,lat`, `orders=roadaddr,addr,legalcode,admcode`, `output=json` |

## 기본 흐름

1. client/skill 은 `/route` 또는 `/이동루트` 명령으로 출발지·목적지 수동 입력을 받는다.
2. provider 결정 게이트를 확인한다 (`ROUTE_PLANNER_*` 환경변수).
3. mock 모드: 형식만 갖춘 응답을 즉시 반환하고 `provider: "mock"` 표기.
4. live 모드:
   - 주소만 있으면 `/v1/naver-map/geocode` 로 좌표를 얻는다.
   - `/v1/naver-map/directions` 로 경로를 조회한다.
   - 기본 `option=trafast` 응답은 `route.trafast[0].summary` 를, 다른 option을 명시한 경우 `route[option][0].summary` 를 거리/시간/통행료/연료비로 매핑한다.
5. live 실패(503/502/네트워크) 시 mock fallback 으로 떨어지고, 사용자에게 fallback 임을 명시한다.

## 예시

mock 모드:

```bash
ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=  # 또는 미설정
# 결과
# {
#   "provider": "mock",
#   "start": { "label": "강남역" },
#   "goal": { "label": "시청역" },
#   "summary": { "distance_km": null, "duration_minutes": null, "toll_won": null, "fuel_won": null },
#   "note": "live provider is disabled."
# }
```

live 모드 (proxy 직접 호출 예시):

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/naver-map/directions" \
  --data-urlencode 'start=126.9706,37.5559' \
  --data-urlencode 'goal=127.0276,37.4979' \
  --data-urlencode 'option=trafast'
```

응답 예상 요약:

```text
경로 요약 (naver): 시청역(126.9706,37.5559) → 강남역(127.0276,37.4979)
- 거리: 12.3km
- 예상 소요시간: 25분
- 통행료: 1,200원
- 연료비: 1,500원
- 옵션: trafast
- 조회 시각: 2026-05-23T14:00:00.000Z
```

## fallback / 대체 흐름

- 키 누락(`503 upstream_not_configured`) → mock fallback + 사용자에게 안내
- 인증 실패(401/403) → proxy 가 `503` 으로 변환 → mock fallback
- quota/rate-limit(429) → proxy 가 `429 upstream_error` 로 보존 → mock fallback + 재시도 간격 안내
- 경로 미발견(`code != 0`) → `502 upstream_semantic_error` → 메시지와 함께 안내
- 네트워크 실패 → `502 upstream_error` → mock fallback
- 좌표 형식 오류 → `400 bad_request`

## 주의할 점

- 본 스킬은 **자동차 경로**에 한정한다. 도보·자전거·대중교통은 다른 스킬을 사용한다.
- 현재 위치 자동 인식과 캘린더 읽기는 의도적으로 범위에서 제외된다 (이슈 #268 OUT).
- waypoints 는 최대 5개 (NCP Maps 정책).
- option 값은 `trafast`(빠른 경로), `tracomfort`(편안), `traoptimal`(최적), `traavoidtoll`(통행료 회피), `traavoidcaronly`(자동차전용 회피) 중 하나.
- secret/token/.env 원문은 응답에 노출되지 않는다 (proxy가 키를 서버 측에서만 주입).

## 참고 표면

- NAVER Cloud Platform Maps Console: `https://www.ncloud.com/product/applicationService/maps`
- Maps Directions 5 endpoint: `https://maps.apigw.ntruss.com/map-direction/v1/driving`
- Maps Geocoding endpoint: `https://maps.apigw.ntruss.com/map-geocode/v2/geocode`
- Maps Reverse Geocoding endpoint: `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
