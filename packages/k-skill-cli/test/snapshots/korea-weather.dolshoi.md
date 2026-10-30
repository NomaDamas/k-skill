# korea-weather — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# Korea Weather

## What this skill does

기상청 단기예보 조회서비스(단기예보·초단기예보·초단기실황)를 `k-skill-proxy` 경유로 조회해서 한국 날씨를 요약한다.
사용자는 개인 OpenAPI key를 직접 발급할 필요가 없고, proxy 서버에만 `KMA_OPEN_API_KEY` 를 둔다.

## When to use

- "서울 시청 근처 지금 날씨 어때?" → `/v1/korea-weather/now` (초단기실황)
- "비 언제까지 오냐?" 처럼 앞으로 6시간 이내의 시간별 흐름 → `/v1/korea-weather/vsrt` (초단기예보)
- "부산 날씨 알려줘", "위도/경도 기준으로 한국 단기예보 보고 싶어" → `/v1/korea-weather/forecast` (단기예보)

## Prerequisites

- optional: `jq`
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.)

## Required environment variables

- 없음. `KSKILL_PROXY_BASE_URL` 은 선택 사항이며, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.

사용자가 공공데이터포털 기상청 API key를 직접 다룰 필요는 없다. `/v1/korea-weather/*` route는 기본 hosted proxy에서 호출하고, upstream `KMA_OPEN_API_KEY` 는 proxy 서버에서만 관리한다. 별도 proxy를 쓰는 경우에만 `KSKILL_PROXY_BASE_URL` 을 설정한다.

## Inputs

- 격자 좌표: `nx`, `ny`
- 또는 위도/경도: `lat`, `lon`
- 선택 사항: `baseDate`, `baseTime`

`baseDate` / `baseTime` 을 생략하면 proxy 가 KST 기준 최신 발표 시각을 자동으로 고른다. 조회 가능 시점은 route마다 다르다 (초단기예보는 매시 30분 발표 후 약 15분 뒤 HH:45, 초단기실황은 매시 정시 발표 후 약 10분 뒤 HH:10, 단기예보는 발표 후 약 10분).

## Workflow

### 1. Resolve the proxy base URL

`KSKILL_PROXY_BASE_URL` 이 있으면 그 값을 사용하고, 없거나 비어 있으면 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.

### 2. Pick the route

| route | upstream operation | 발표 주기 | 용도 |
| --- | --- | --- | --- |
| `/v1/korea-weather/now` | `getUltraSrtNcst` | 매시 정시 | 현재 관측 (초단기실황) |
| `/v1/korea-weather/vsrt` | `getUltraSrtFcst` | 매시 30분 | 앞으로 최대 6시간, 1시간 간격 6슬롯 (초단기예보) |
| `/v1/korea-weather/forecast` | `getVilageFcst` | 02/05/08/11/14/17/20/23시 | 오늘~+3일 단기예보 |

### 3. Query the endpoint

격자 좌표가 이미 있으면 그대로 넣고, 위도/경도만 있으면 proxy 에 그대로 넘긴다.

초단기예보 예시 (가장 최신 발표 기준 1시간 단위):

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/vsrt" \
  --data-urlencode 'lat=37.5665' \
  --data-urlencode 'lon=126.9780'
```

초단기실황 예시 (지금 관측값):

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/now" \
  --data-urlencode 'nx=60' \
  --data-urlencode 'ny=127'
```

단기예보 예시:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/forecast" \
  --data-urlencode 'nx=60' \
  --data-urlencode 'ny=127' \
  --data-urlencode 'baseDate=20260405' \
  --data-urlencode 'baseTime=0500'
```

### 4. Summarize the response conservatively

단기예보(`/forecast`)는 아래 항목을 우선 요약한다.

- `TMP`: 기온
- `SKY`: 하늘상태
- `PTY`: 강수형태
- `POP`: 강수확률
- `PCP`: 강수량
- `SNO`: 적설
- `REH`: 습도
- `WSD`: 풍속

초단기실황(`/now`)은 예보가 아닌 관측이라 `obsrValue` 필드를 쓰고, 아래 항목을 우선 요약한다.

- `T1H`: 기온
- `RN1`: 1시간 강수량
- `REH`: 습도
- `PTY`: 강수형태
- `VEC`: 풍향
- `WSD`: 풍속
- `UUU`: 동서 바람성분
- `VVV`: 남북 바람성분

초단기예보(`/vsrt`)는 `fcstDate` / `fcstTime` / `fcstValue` 필드를 쓰고, 아래 항목을 우선 요약한다.

- `T1H`: 기온
- `RN1`: 1시간 강수량
- `SKY`: 하늘상태
- `REH`: 습도
- `PTY`: 강수형태
- `LGT`: 낙뢰
- `VEC`: 풍향
- `WSD`: 풍속
- `UUU`: 동서 바람성분
- `VVV`: 남북 바람성분

`POP`·`SNO` 는 초단기 계열에 없고, `WAV`(파고)는 단기예보(`/forecast`)에만 있다. category 상세는 기상청 단기예보 조회서비스 활용가이드를 따른다.

응답에는 조회 시점과 `baseDate` / `baseTime`, 사용한 route 도 함께 적는다.

## Done when

- 요청 위치의 날씨 응답이 정리되어 있다
- 조회 시점과 예보 발표 시각, 사용한 route 가 명시되어 있다
- upstream key가 클라이언트에 노출되지 않았다

## Failure modes

- proxy upstream key 미설정 또는 hosted/self-host route 장애
- `nx` / `ny` 또는 `lat` / `lon` 이 불완전한 경우
- 기상청 quota 초과 또는 upstream 장애
- 선택한 발표 시각에 아직 예보가 준비되지 않은 경우 (초단기예보는 매시 30분 발표 후 약 15분, 초단기실황은 매시 정시 발표 후 약 10분부터 조회 가능). upstream이 HTTP 200과 함께 `resultCode` `03`(NODATA) 같은 semantic 오류를 돌려주면 proxy는 이를 `502`로 드러내고 cache하지 않으므로 잠시 후 재시도한다.

## Notes

- 공식 API는 `nx` / `ny` 격자를 쓰지만, proxy 는 `lat` / `lon` 도 받아 내부에서 격자로 변환한다.
- 단기예보 category 는 `TMP`, `SKY`, `PTY`, `POP`, `PCP`, `SNO`, `REH`, `WSD`, `WAV` 등을 중심으로 본다.
- 초단기실황(`/now`)은 `obsrValue`, 초단기예보(`/vsrt`)는 `fcstValue`(시각은 `fcstDate` / `fcstTime`) 필드를 쓰며, 둘 다 `T1H`·`RN1`·`PTY` 등 관측/초단기 category를 담는다.
- 초단기예보는 매시 30분 발표로 단기예보보다 최신이고, 6시간 이내 돌풍·소나기처럼 빠르게 변하는 날씨 확인에 쓴다.
- proxy 운영/환경변수 설정은 `docs/features/k-skill-proxy.md` 를 참고한다.
