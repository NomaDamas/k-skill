# 한국 날씨 조회 가이드

## 이 기능으로 할 수 있는 일

- 한국 기상청 단기예보 조회서비스를 proxy 경유로 호출
- `nx` / `ny` 격자 또는 `lat` / `lon` 기준 단기예보 확인
- `/v1/korea-weather/vsrt`(초단기예보)·`/v1/korea-weather/now`(초단기실황)로 매시 최신 1시간 단위 조회
- 개인 OpenAPI key 없이 `TMP`, `SKY`, `PTY`, `POP` 같은 핵심 날씨 category 요약

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용)

## 필요한 환경변수

- 없음. `KSKILL_PROXY_BASE_URL` 은 선택 사항이며, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.

사용자가 공공데이터포털 기상청 단기예보 API key를 직접 발급할 필요는 없다. `/v1/korea-weather/forecast` route는 기본 hosted proxy에서 호출하고, upstream `KMA_OPEN_API_KEY` 는 proxy 서버에서만 관리한다. 별도 proxy를 쓰는 경우에만 `KSKILL_PROXY_BASE_URL` 을 설정한다.

## 입력값

- 격자 좌표 `nx`, `ny`
- 또는 위도/경도 `lat`, `lon`
- 선택 사항: `baseDate`, `baseTime`, `pageNo`, `numOfRows`

## 기본 흐름

1. `KSKILL_PROXY_BASE_URL` 이 있으면 그 값을 사용하고, 없거나 비어 있으면 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.
2. 목적에 맞는 route를 고른다.
   - `/v1/korea-weather/now`: 초단기실황(getUltraSrtNcst) — 매시 정시 발표, 현재 관측
   - `/v1/korea-weather/vsrt`: 초단기예보(getUltraSrtFcst) — 매시 30분 발표, 최대 6시간 1시간 간격 6슬롯
   - `/v1/korea-weather/forecast`: 단기예보(getVilageFcst) — 02/05/08/11/14/17/20/23시 발표, 오늘~+3일
3. `baseDate` / `baseTime` 을 생략하면 proxy 가 KST 기준 최신 발표 시각을 자동으로 선택한다 (발표 후 약 10분부터 조회 가능).
4. 단기예보 응답의 `item[]` 에서 `TMP`, `SKY`, `PTY`, `POP`, `PCP`, `SNO`, `REH`, `WSD` 를 우선 요약한다. 초단기예보·초단기실황은 `T1H`, `RN1`, `PTY`, `SKY`, `VEC`, `WSD`, `WAV` 를 우선 요약한다 (`POP`, `REH`, `SNO` 는 초단기 계열에 없다).

## 예시

초단기예보 (가장 최신 발표 기준 1시간 단위):

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/vsrt" \
  --data-urlencode 'lat=37.5665' \
  --data-urlencode 'lon=126.9780'
```

초단기실황 (지금 관측값):

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/now" \
  --data-urlencode 'nx=60' \
  --data-urlencode 'ny=127'
```

위도/경도 기준 단기예보:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/forecast" \
  --data-urlencode 'lat=37.5665' \
  --data-urlencode 'lon=126.9780'
```

격자 좌표 기준:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/forecast" \
  --data-urlencode 'nx=60' \
  --data-urlencode 'ny=127' \
  --data-urlencode 'baseDate=20260405' \
  --data-urlencode 'baseTime=0500'
```

## Category 메모

- `TMP`: 기온(℃)
- `SKY`: 하늘상태
- `PTY`: 강수형태
- `POP`: 강수확률(%)
- `PCP`: 강수량
- `SNO`: 적설
- `REH`: 습도(%)
- `WSD`: 풍속(m/s)

## 주의할 점

- 단기예보와 초단기예보/초단기실황 모두 5km 격자 기반이라 행정구역 경계와 완전히 일치하지 않을 수 있다.
- 발표 시각 직후에는 최신 `baseTime` 이 아직 준비되지 않았을 수 있다. proxy 는 보수적으로 직전 발표 시각을 선택한다 (초단기예보는 매시 30분 발표, 초단기실황은 매시 정시 발표, 둘 다 발표 후 약 10분부터 조회 가능).
- 초단기예보는 최대 6시간까지만 제공되므로 그 이후 구간은 `/v1/korea-weather/forecast` 를 본다.
- self-host proxy 설정은 [k-skill 프록시 서버 가이드](k-skill-proxy.md)를 본다.
