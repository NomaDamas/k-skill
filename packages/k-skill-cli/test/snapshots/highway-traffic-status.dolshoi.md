# highway-traffic-status — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 고속도로 교통량·소통·CCTV 조회

## What this skill does

- 한국도로공사 공공데이터포털(`data.ex.co.kr`)의 실시간 교통량 API로 전국 고속도로 콘존(구간)별 속도, 교통량, 소통등급(원활/서행/정체)을 조회한다.
- 국가교통정보센터 ITS(`openapi.its.go.kr`)의 CCTV 정보 API로 좌표 범위 내 고속도로 CCTV 이름·좌표·HLS 스트림 URL을 조회한다.

이 스킬은 **조회 전용**이다. 경로 안내, 내비게이션, 통행료 계산은 범위 밖이다.

## When to use

- "지금 경부고속도로 막혀?"
- "서울 요금소 쪽 정체 상황 알려줘"
- "서해안선 상행 소통 어때?"
- "판교 근처 고속도로 CCTV 보여줘"

## When not to use

- 대중교통 길찾기 → `korean-transit-route`
- 자동차 경로/내비게이션 → `kakao-map`
- 시내 도로·일반국도 상세 소통 (v1은 고속도로 중심)

## Prerequisites

- Python 3.9+ (stdlib only, 외부 패키지 없음)
- 사용자 API 키 **불필요** — 두 upstream 모두 공개 데모 키(`test`)로 동작함을 확인했다 (2026-07-21). 공개 엔드포인트이므로 k-skill-proxy를 경유하지 않고 직접 호출한다.

선택 환경변수 (데모 키 회수/쿼터 대비):

- `KSKILL_EXDATA_API_KEY` — data.ex.co.kr 개인 인증키 (https://data.ex.co.kr 회원가입 후 발급)
- `KSKILL_ITS_API_KEY` — openapi.its.go.kr 개인 인증키 (https://www.its.go.kr/opendata)

`~/.config/k-skill/secrets.env` 의 같은 이름 키도 읽는다.

## Workflow

### 1. 실시간 소통/교통량 조회

```bash
python3 highway-traffic-status/scripts/highway_traffic.py traffic --route 경부 --text
```

- `--route`: 노선명 일부(`경부`, `서해안`) 또는 노선번호(`0010`)
- `--keyword`: 구간(콘존) 이름 키워드 (예: `서울TG`, `양재`)
- `--limit N`: 출력 행 수 (기본 30)
- `--text` 없이 실행하면 구조화 JSON을 출력한다.

JSON 출력 필드: `route_name`, `route_no`, `conzone_name`, `direction`(상행/하행), `speed_kmh`, `traffic_volume`, `travel_time_sec`, `congestion`(원활/서행/정체), `observed_at`.

### 2. CCTV 메타데이터 조회

좌표 범위(경도 `--min-x`/`--max-x`, 위도 `--min-y`/`--max-y`)가 필수다. 사용자가 지명을 말하면 대략적인 bounding box로 변환해 호출한다.

```bash
python3 highway-traffic-status/scripts/highway_traffic.py cctv \
  --min-x 126.9 --max-x 127.2 --min-y 37.3 --max-y 37.6 --text
```

- 응답의 `url`은 HLS 스트림 주소다. 스트림 재생은 사용자 환경(브라우저/플레이어) 몫이며 스킬은 메타데이터만 제공한다.
- `--road-type`: `ex`(고속도로, 기본) / `its`(국도) / `all`

### 3. 결과 요약 규칙

- 소통 상태는 upstream `grade`를 그대로 원활/서행/정체로 표시하고, 자체 판단을 덧붙이지 않는다.
- `observed_at` 기준 시각을 함께 알려준다 (실시간 스냅샷임을 명시).
- 운전 중 조작 금지: 사용자가 운전 중으로 보이면 음성/동승자 확인을 권한다.

## Data sources & fallback order

1. `https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=<key>&type=json` — 전국 VDS 실시간 스냅샷. 필터(노선/구간)는 helper가 클라이언트 측에서 수행한다.
2. `https://openapi.its.go.kr:9443/cctvInfo?apiKey=<key>&type=ex&cctvType=1&minX=..&getType=json` — 성공 응답은 XML(문서와 달리 `getType=json`이어도 XML)이며 helper가 XML을 파싱한다.

두 표면 모두 데모 키 `test`가 유효하다. 개인 키가 환경변수에 있으면 그것을 우선 사용한다.

## Failure modes

| 상황 | 동작 |
| --- | --- |
| 빈 결과 (`result: "empty"`) | 조건에 맞는 구간/CCTV 없음 — 노선명·좌표 범위를 넓혀 재시도 안내 |
| 인증키 오류 (`인증키가 유효하지 않습니다` / ITS 401 resultCode 4005) | 데모 키 회수 가능성 안내, 개인 키 발급 후 환경변수 지정 안내 |
| upstream HTTP 오류/타임아웃 | 잠시 후 재시도 안내, 점검 가능성 언급 |
| JSON/XML 파싱 실패 | 차단 또는 형식 변경 가능성 — 이슈 보고 안내 |
| 좌표 범위 오류 | 한국 범위(경도 124~132, 위도 33~39.5) 및 min<max 검증 메시지 출력 |

## Notes

- upstream 데모 키 정책이 바뀌면 이 스킬은 개인 키(BYOK)로만 동작하게 된다. 그 시점에 proxy route 편입을 재검토한다.
- CCTV 스트림 URL은 시간이 지나면 만료될 수 있는 서명 URL이다. 재조회로 갱신한다.
