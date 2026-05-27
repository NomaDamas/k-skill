# 카카오맵 가이드

## 이 기능으로 할 수 있는 일

- **장소 검색**: 키워드(`스타벅스`)·카테고리(`FD6`=음식점)·좌표 중심으로 가게·시설 검색 (Kakao Local API)
- **좌표 ↔ 주소 변환**: 좌표 → 도로명/지번 주소, 좌표 → 행정구역(법정동/행정동)
- **자동차 길찾기**: 출발지·목적지 좌표 기준 거리·소요시간·통행료·예상 택시 요금 (Kakao Mobility Directions)
- 모두 `k-skill-proxy` 경유. 사용자 키 발급 불필요.

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인
- 사용자는 별도 Kakao Developers 앱 생성/키 발급 필요 없음
- 운영자(proxy 서버)는 `KAKAO_REST_API_KEY` 보유

## 기본 경로

기본 hosted path: `https://k-skill-proxy.nomadamas.org/v1/kakao-map/*`, `https://k-skill-proxy.nomadamas.org/v1/kakao-mobility/*`

`KSKILL_PROXY_BASE_URL` 환경변수로 override 가능.

## Proxy routes

| endpoint | upstream | 주요 입력 |
|---|---|---|
| `GET /v1/kakao-map/search/keyword` | `https://dapi.kakao.com/v2/local/search/keyword.json` | `q`, `x`, `y`, `radius`, `category_group_code`, `sort`, `page`, `size` |
| `GET /v1/kakao-map/search/category` | `https://dapi.kakao.com/v2/local/search/category.json` | `category_group_code`, `x`, `y`, `radius`, `sort`, `page`, `size` |
| `GET /v1/kakao-map/coord2address` | `https://dapi.kakao.com/v2/local/geo/coord2address.json` | `x`, `y`, `input_coord` |
| `GET /v1/kakao-map/coord2region` | `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json` | `x`, `y`, `input_coord` |
| `GET /v1/kakao-mobility/directions` | `https://apis-navi.kakaomobility.com/v1/directions` | `origin=x,y`, `destination=x,y`, `waypoints`, `priority`(RECOMMEND\|TIME\|DISTANCE), `car_fuel`, `car_hipass`, `alternatives`, `avoid`(ferries\|toll\|motorway\|schoolzone\|uturn; `\|` 구분) |

## 기본 흐름

1. 사용자가 장소 키워드/카테고리/좌표/길찾기 질문을 한다.
2. 적합한 endpoint를 골라 proxy 로 호출한다 (위 표 참고).
3. proxy는 `KAKAO_REST_API_KEY` 를 서버측에서만 `Authorization: KakaoAK ...` 헤더로 주입한다.
4. 응답에서 핵심 필드만 추려 사용자에게 정리해 전달한다.
5. 성공 응답은 proxy cache(기본 TTL 5분)로 보관해 다음 동일 쿼리를 빠르게 돌려준다.

## 예시

키워드 검색:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/kakao-map/search/keyword" \
  --data-urlencode 'q=스타벅스' \
  --data-urlencode 'x=127.0276' \
  --data-urlencode 'y=37.4979' \
  --data-urlencode 'radius=500' \
  --data-urlencode 'sort=distance'
```

좌표 → 주소:

```bash
curl -fsS --get "${BASE}/v1/kakao-map/coord2address" \
  --data-urlencode 'x=127.0276' \
  --data-urlencode 'y=37.4979'
```

자동차 길찾기:

```bash
curl -fsS --get "${BASE}/v1/kakao-mobility/directions" \
  --data-urlencode 'origin=126.9706,37.5559' \
  --data-urlencode 'destination=127.0276,37.4979' \
  --data-urlencode 'priority=RECOMMEND' \
  --data-urlencode 'avoid=toll'
```

응답 요약(예):

```text
자동차 경로: (126.9706,37.5559) → (127.0276,37.4979)
- 거리: 12.3km / 예상 소요시간: 25분
- 통행료: 1,200원 / 예상 택시요금: 18,500원
- 옵션: RECOMMEND, avoid=toll
```

## fallback / 대체 흐름

- 키 누락(`503 upstream_not_configured`) → 사용자에게 운영자 설정 필요 안내
- 인증 실패(401/403) → `503` 으로 변환 (key revoke / 쿼터 초과)
- 좌표 형식 오류 / 미존재 카테고리 코드 → `400 bad_request`
- 경로 미발견·출발지=도착지 근접 등 semantic 실패 → `502 upstream_semantic_error` + `result_msg`
- 네트워크 실패 → `502 upstream_error`

## 주의할 점

- Kakao Mobility는 **자동차 전용**이다. 대중교통 길찾기는 [한국 대중교통 길찾기 가이드](korean-transit-route.md) 를 쓴다.
- 카테고리 검색은 좌표 중심(`x`, `y`)이 필수다.
- waypoints 는 최대 5개 (Kakao Mobility 정책).
- 통행료 회피는 `avoid=toll`을 사용한다. `priority=DISTANCE`는 최단거리 우선순위일 뿐 통행료 회피와 동의어가 아니다.
- Kakao Mobility 무료 일일 쿼터는 1,000건 수준이다. proxy cache + rate-limit이 보호 역할을 하지만, 대량 호출은 자제한다.
- 본 스킬은 데이터 조회 전용이다. 예약·결제·자동 운전은 하지 않는다.
- secret/token/.env 원문은 응답에 노출되지 않는다 (proxy가 키를 서버측에서만 주입).

## 참고 표면

- Kakao Developers Console: `https://developers.kakao.com`
- Kakao Local API 문서: `https://developers.kakao.com/docs/latest/ko/local/dev-guide`
- Kakao Mobility 안내: `https://developers.kakao.com/docs/latest/ko/kakaonavi/common`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
