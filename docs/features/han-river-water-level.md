# 한강 수위 정보 가이드

## 이 기능으로 할 수 있는 일

- 한강홍수통제소(HRFCO) 관측소명/관측소코드 기준 현재 수위 확인
- 현재 유량(`FW`) 같이 확인
- 관심/주의/경보/심각 기준수위 같이 확인
- 별도 사용자 `ServiceKey` 없이 `k-skill-proxy` 로 조회

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인

## 기본 경로

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/han-river/water-level` 로 요청한다.

사용자는 별도 HRFCO `ServiceKey` 를 준비하지 않는다. upstream key는 proxy 서버에서만 `HRFCO_OPEN_API_KEY` 로 관리한다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 없으면 기본 hosted path를 사용한다.

## 입력값

- 기본: 관측소명/교량명 (`stationName`)
- 대체: 관측소코드 (`stationCode`)

예: `한강대교`, `잠수교`, `1018683`

## 기본 흐름

1. client/skill 은 기본 hosted path 또는 `KSKILL_PROXY_BASE_URL` 아래 `/v1/han-river/water-level` endpoint 를 호출한다.
2. proxy 는 HRFCO `waterlevel/info.json` 을 읽어 관측소명 → `WLOBSCD` 를 해석한다.
3. 해석된 `WLOBSCD` 로 `waterlevel/list/10M/{WLOBSCD}.json` 최신 10분 자료를 조회한다.
4. 관측시각, 수위(`WL`), 유량(`FW`), 기준수위 메타데이터를 요약해서 반환한다.
5. 관측소명이 여러 개에 걸리면 `ambiguous_station` + `candidate_stations` 를 반환한다.

## 예시

proxy URL 이 준비된 뒤 조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강대교'
```

관측소코드 직접 조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationCode=1018683'
```

애매한 관측소명 예시:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강'
```

예상 응답 예시:

```json
{
  "station_code": "1018683",
  "station_name": "한강대교",
  "agency_name": "한강홍수통제소",
  "address": "서울특별시 용산구 한강대교",
  "observed_at": "2026-04-05T19:00:00+09:00",
  "water_level": {
    "value_m": 0.66,
    "unit": "m"
  },
  "flow_rate": {
    "value_cms": 208.58,
    "unit": "m^3/s"
  },
  "thresholds": {
    "interest_level_m": 5.5,
    "warning_level_m": 8,
    "alarm_level_m": 10,
    "serious_level_m": 11,
    "plan_flood_level_m": 13
  },
  "special_report_station": true
}
```

## fallback / 대체 흐름

- `KSKILL_PROXY_BASE_URL` 을 별도로 넣으면 해당 proxy를 우선 사용한다.
- 기본 hosted path는 `https://k-skill-proxy.nomadamas.org/v1/han-river/water-level` 이다.
- self-host 운영자는 서버 쪽에만 `HRFCO_OPEN_API_KEY` 를 넣는다.
- 사용자/client 쪽 secrets 파일에는 HRFCO key 를 넣지 않는다.

## 주의할 점

- HRFCO 레퍼런스는 이 데이터를 원시자료로 설명하므로 조회 시각을 함께 적는다.
- 기본 endpoint 는 현재값 중심이라 기간별 시계열은 직접 노출하지 않는다.
- 관측소명이 너무 넓으면 `candidate_stations` 로 좁힌 뒤 다시 조회한다.
- 최신 자료는 보통 10분 단위지만 관측소별 수집 지연이 있을 수 있다.
- 별도 proxy를 쓸 때만 `KSKILL_PROXY_BASE_URL` 을 명시한다.

## 참고 표면

- 공식 레퍼런스: `https://www.hrfco.go.kr/web/openapiPage/reference.do`
- 인증키 안내: `https://www.hrfco.go.kr/web/openapiPage/certifyKey.do`
- 정책: `https://www.hrfco.go.kr/web/openapi/policy.do`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
