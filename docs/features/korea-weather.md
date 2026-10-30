# 한국 날씨 조회 가이드

## 이 기능으로 할 수 있는 일

- 한국 기상청 단기예보 조회서비스를 proxy 경유로 호출
- `nx` / `ny` 격자 또는 `lat` / `lon` 기준 단기예보 확인
- `/v1/korea-weather/vsrt`(초단기예보)·`/v1/korea-weather/now`(초단기실황)로 매시 최신 1시간 단위 조회
- 개인 OpenAPI key 없이 `TMP`, `SKY`, `PTY`, `POP` 같은 단기예보 category와 `T1H`, `RN1` 같은 초단기 category 요약

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용)

## 필요한 환경변수

- 없음. `KSKILL_PROXY_BASE_URL` 은 선택 사항이며, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.

사용자가 공공데이터포털 기상청 단기예보 API key를 직접 발급할 필요는 없다. `/v1/korea-weather/*` route는 기본 hosted proxy에서 호출하고, upstream `KMA_OPEN_API_KEY` 는 proxy 서버에서만 관리한다. 별도 proxy를 쓰는 경우에만 `KSKILL_PROXY_BASE_URL` 을 설정한다.

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
3. `baseDate` / `baseTime` 을 생략하면 proxy 가 KST 기준 최신 발표 시각을 자동으로 선택한다. 조회 가능 시점은 route마다 다르다 — 초단기예보는 매시 30분 발표 후 약 15분(HH:45), 초단기실황은 매시 정시 발표 후 약 10분(HH:10), 단기예보는 발표 후 약 10분.
4. 단기예보 응답의 `item[]` 에서 `TMP`, `SKY`, `PTY`, `POP`, `PCP`, `SNO`, `REH`, `WSD` 를 우선 요약한다. 초단기실황(`/now`)은 `obsrValue` 필드의 `T1H`, `RN1`, `REH`, `PTY`, `VEC`, `WSD`, `UUU`, `VVV` 를, 초단기예보(`/vsrt`)는 `fcstDate`/`fcstTime`/`fcstValue` 필드의 `T1H`, `RN1`, `SKY`, `REH`, `PTY`, `LGT`, `VEC`, `WSD`, `UUU`, `VVV` 를 요약한다 (`POP`, `SNO` 는 초단기 계열에 없고 `WAV` 는 단기예보에만 있다).

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

단기예보(`/forecast`, `item[].fcstValue`):

- `TMP`: 기온(℃)
- `SKY`: 하늘상태
- `PTY`: 강수형태
- `POP`: 강수확률(%)
- `PCP`: 강수량
- `SNO`: 적설
- `REH`: 습도(%)
- `WSD`: 풍속(m/s)
- `WAV`: 파고(M) — 해안 격자에서만 제공

초단기실황(`/now`, `item[].obsrValue`): `T1H`(기온), `RN1`(1시간 강수량), `REH`(습도), `PTY`(강수형태), `VEC`(풍향), `WSD`(풍속), `UUU`/`VVV`(동서·남북 바람성분).

초단기예보(`/vsrt`, `item[].fcstValue`, 시각은 `fcstDate`/`fcstTime`): `T1H`, `RN1`, `SKY`(하늘상태), `REH`, `PTY`, `LGT`(낙뢰), `VEC`, `WSD`, `UUU`, `VVV`.

`POP`, `SNO` 는 초단기 계열에 없고 `WAV` 는 단기예보(`/forecast`)에만 있으며, 초단기실황은 예보가 아닌 관측이라 `obsrValue` 를 쓴다. category 상세는 기상청 단기예보 조회서비스 활용가이드를 따른다.

## 주의할 점

- 단기예보와 초단기예보/초단기실황 모두 5km 격자 기반이라 행정구역 경계와 완전히 일치하지 않을 수 있다.
- 발표 시각 직후에는 최신 `baseTime` 이 아직 준비되지 않았을 수 있다. proxy 는 보수적으로 직전 발표 시각을 선택한다 (초단기예보는 매시 30분 발표 후 약 15분, 초단기실황은 매시 정시 발표 후 약 10분부터 조회 가능).
- 발표 직후처럼 아직 자료가 없는 시각을 조회하면 기상청이 HTTP 200과 함께 `resultCode` `03`(NODATA) 같은 semantic 오류를 돌려줄 수 있다. proxy 는 이런 semantic 오류를 cache하지 않고 `502`로 드러내므로, 잠시 후 재시도하면 최신 발표로 self-heal 된다.
- 초단기예보는 최대 6시간까지만 제공되므로 그 이후 구간은 `/v1/korea-weather/forecast` 를 본다.
- self-host proxy 설정은 [k-skill 프록시 서버 가이드](k-skill-proxy.md)를 본다.
