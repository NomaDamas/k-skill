# Security And Secrets

`k-skill`은 필요한 credential metadata와 환경변수 이름만 선언한다. 값을 공급하는 경로와 신뢰 경계는 runtime별로 다르다.

## Dolshoi Cloud credential paths

Dolshoi Cloud(`apps/cloud-api`)는 `secrets.env`나 다른 파일의 credential 평문을 agent 환경에 자동 주입하지 않는다. Cloud skill은 아래 경로 중 목적에 맞는 하나를 사용한다.

### Scalar API-key broker (blind)

Scalar broker는 API key 하나를 허용된 HTTPS 요청의 `Authorization: Bearer` 헤더에 서버 사이드로 주입한다. cloud-api가 값을 복호화해 in-process에 보관하고, 에이전트에게는 불투명(opaque) capability 핸들만 넘긴다.

- 핸들에 들어가는 건 오직 `{capabilityId, envName, allowedHosts}` 세 필드다. credential 값은 어디에도 노출되지 않는다.
- 허용된 호스트에 HTTPS 요청을 보낼 때, 에이전트는 capability id와 함께 cloud-api의 internal route를 호출한다. cloud-api가 `Authorization: Bearer <value>` 헤더를 **서버 사이드에서 주입**하고 upstream 응답만 돌려준다. 에이전트는 값을 보지 않는다.
- 허용 호스트 목록은 SKILL.md 의 `broker_allowed_hosts` 블록에서 읽는다 (YAML list, exact hostname 만 허용, 와일드카드·포트·scheme 불가). 누락 또는 빈 리스트면 이 스킬의 credential은 capability가 **아예 프로비전되지 않는다**. fail-closed.
- capability 는 `(accountId, container)` 에 scoped 되고, per-turn TTL(5분) 과 최대 5회 사용 한도를 갖는다. turn 이 끝나면 broker key 와 capability 가 함께 폐기된다.

이 경로는 `api_key`의 scalar `value`에만 적용한다. Login username/password와 note는 scalar Bearer broker로 보내지 않는다.

### Credential Actions (`vault-run`)

Dolshoi Cloud는 모든 vault item에 turn-scoped `vault-run` capability를 제공한다.

- `vault-run <capability_id> search|seats|reserve|cancel|list` 같은 서비스별 action은 서버가 credential을 주입하고 business output만 반환하는 **blind action**이다. 제공되면 이 경로를 우선한다.
- 공통 `vault-run <capability_id> get`은 저장된 평문을 JSON으로 반환한다 (`login` → `{username, password}`, `api_key`/`note` → `{value}`). 이것은 blind broker가 아니라 **audited plaintext reveal**이다. 직접 CLI/스크립트 실행에 값이 꼭 필요할 때만 짧은 `set +x` subshell에서 명령 접두 환경변수로 사용하고, 채팅·로그·파일에 출력하지 않는다.
- capability와 broker key는 account/container/turn에 scope되며 만료·사용 제한을 가진다. `get`으로 반환된 값은 agent process memory를 통과하므로 blind action보다 신뢰 폭이 넓다.

저장소 compromise(ciphertext at rest)와 blind action 경로의 Hermes 모델 compromise(평문이 stream/handle에 없음)는 방어한다. `get`을 사용한 agent process나 cloud-api 호스트 전체 compromise는 방어하지 못한다.

신뢰 경계 세부 사항과 broker route 주소는 cloud-api 의 `apps/cloud-api/docker/README.md` 와 `docs/internal/bitwarden-credential-engine.md` (Pattern B) 를 참고한다.

### Structured credential fields

Dolshoi Cloud stores the environment-variable bindings for a credential as a
structured object with optional `username`, `password`, and `value` fields.
The names are metadata; the secret values stay encrypted in cloud-api.

- `login`은 service action 또는 공통 `get`에서 username/password pair로 사용한다. Scalar Bearer broker에는 보내지 않는다.
- `api_key`는 blind scalar broker에서 `value`를 쓰거나 공통 `get`으로 명시적으로 reveal할 수 있다.
- `note`는 scalar broker에 들어가지 않지만 공통 `get`으로 reveal할 수 있다.

Skills should declare only the environment-variable names they need. Opaque broker/action handles contain no field values; `get` output is the explicit exception and must be handled as plaintext.

## Generic/local/self-hosted credential resolution

아래 순서는 Dolshoi Cloud가 아닌 generic/local/self-hosted runtime에만 적용한다. Dolshoi Cloud는 위 broker/actions 경로를 사용하며 `secrets.env`를 agent 환경에 자동 주입하지 않는다.

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 사용자에게 host secret store 설정을 요청하고 멈춘다. 값을 채팅으로 받지 않는다.

`secrets.env`는 portable fallback일 뿐 강제가 아니며, Cloud credential contract가 아니다.

## Generic/local default secrets file

- 경로: `~/.config/k-skill/secrets.env`
- 형식: plain dotenv (`KEY=value`, 한 줄에 하나)
- 퍼미션: `0600` (owner-only read/write)

```dotenv
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
KSKILL_FORESTTRIP_ID=replace-me
KSKILL_FORESTTRIP_PASSWORD=replace-me
# 일반 KOSIS 조회는 hosted proxy 사용. direct/bigdata 또는 proxy 서버 운영 때만 필요.
KSKILL_KOSIS_API_KEY=replace-me
# 일반 K-Startup 조회는 hosted proxy 사용. --direct 호출 때만 필요.
KSKILL_KSTARTUP_API_KEY=replace-me
# EV 충전소 일반 조회는 hosted proxy 사용. --direct 호출 때만 필요.
KSKILL_EV_CHARGER_API_KEY=replace-me
# 건축물대장 일반 조회는 hosted proxy 사용. --direct 호출 때만 필요.
KSKILL_BUILDING_REGISTER_API_KEY=replace-me
# RISS 학술자료 검색은 사용자 본인의 RISS 검색 API 키로 직접 호출(비영리 기관/대학 발급).
KSKILL_RISS_API_KEY=replace-me
LAW_OC=replace-me
KIPRIS_PLUS_API_KEY=replace-me
NAVER_AD_API_KEY=replace-me
NAVER_AD_SECRET_KEY=replace-me
NAVER_AD_CUSTOMER_ID=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
# Kakao Local geocoding은 hosted proxy 사용. self-host proxy 운영 때만 필요.
KAKAO_REST_API_KEY=replace-me
# Popbill은 사용자별 과금/권한 API이므로 BYOK 로컬 호출 때만 채운다.
KSKILL_POPBILL_LINK_ID=replace-me
KSKILL_POPBILL_SECRET_KEY=replace-me
KSKILL_POPBILL_CORP_NUM=replace-me
KSKILL_POPBILL_USER_ID=
KSKILL_PROXY_BASE_URL=
```

서울 지하철 도착정보, 서울 실시간 혼잡도 조회, 서울 따릉이 실시간 대여소 조회, 한국 날씨 조회는 `KSKILL_PROXY_BASE_URL` 이 없거나 비어 있으면 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 쓰므로 사용자 쪽 키가 불필요하다. 미세먼지, 한강 수위, 주유소 가격, 전기차 충전소 위치·상태, 건축물대장 표제부, 한국 주식 정보 조회, KOSIS 일반 조회, Kakao Local geocoding, 의약품 안전 체크, 식품 안전 체크, 창업진흥원 K-Startup 조회도 기본 hosted proxy를 쓴다. 생활쓰레기 배출정보는 `k-skill-proxy`의 `/v1/household-waste/info` 라우트를 거쳐 `serviceKey`만 proxy 서버에서 주입하므로 사용자 쪽 키가 불필요하다.

## Missing secret handling policy

인증이 필요한 스킬에서 필요한 값이 없으면 우회하지 않는다.

- Dolshoi Cloud에서는 `vault-run credential-request request <항목이름> <login|api_key|note>`로 입력 폼을 띄우고 현재 턴을 멈춘다
- generic/local/self-hosted runtime에서는 필요한 환경변수 이름을 알리고 위 local resolution order에 따라 host secret store 설정을 요청한다
- 어느 runtime에서도 값을 채팅으로 받지 않는다
- 대체 사이트, 대체 API, 하드코딩 같은 우회 경로를 찾지 않는다
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하지 않는다

## Forbidden patterns

- 실제 비밀값이 들어있는 파일을 git에 두기
- 스킬 문서 안에 예시용 실비밀번호를 쓰기
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하기

## Generic/local `secrets.env` threat model

- `~/.config/k-skill/secrets.env`는 plain dotenv 파일이다
- 파일 퍼미션 `0600`으로 같은 머신의 다른 유저로부터 보호한다
- `.gitignore`로 git 노출을 방지한다
- 에이전트는 이 파일을 읽고 쓸 수 있다 — 이것은 의도된 동작이다
- OpenClaw/에이전트 환경에서 유저는 에이전트에게 credential을 위임하는 것을 전제로 사용한다

## Standard variable names

- `KSKILL_SRT_ID`
- `KSKILL_SRT_PASSWORD`
- `KSKILL_KTX_ID`
- `KSKILL_KTX_PASSWORD`
- `KSKILL_FORESTTRIP_ID`
- `KSKILL_FORESTTRIP_PASSWORD`
- `KSKILL_KOSIS_API_KEY` (KOSIS `bigdata`/`--direct`, 또는 proxy 서버 `KOSIS_API_KEY` 대체 env)
- `KSKILL_KSTARTUP_API_KEY` (창업진흥원 K-Startup `--direct` 호출용. 일반 조회는 hosted proxy의 `DATA_GO_KR_API_KEY` 가 처리)
- `KSKILL_EV_CHARGER_API_KEY` (전기차 충전소 `--direct` 호출용. 일반 조회는 hosted proxy가 처리; 데이터셋 `15076352` 활용신청 별도 필요)
- `KSKILL_BUILDING_REGISTER_API_KEY` (건축물대장 `--direct` 호출용. 일반/주소 조회는 hosted proxy가 처리; 데이터셋 `15134735` 활용신청 별도 필요)
- `KSKILL_RISS_API_KEY` (RISS 학술자료 검색용 사용자 본인 키; 호환 변수 `RISS_API_KEY`, `DATA_GO_KR_API_KEY`와 별개)
- `LAW_OC`
- `KIPRIS_PLUS_API_KEY`
- `AIR_KOREA_OPEN_API_KEY`
- `KAKAO_REST_API_KEY`
- `KRX_API_KEY`
- `KSKILL_POPBILL_LINK_ID`
- `KSKILL_POPBILL_SECRET_KEY`
- `KSKILL_POPBILL_CORP_NUM`
- `KSKILL_POPBILL_USER_ID`
- `KSKILL_PROXY_BASE_URL`

`KSKILL_RISS_API_KEY`는 RISS Open API 검색 전용 키다. RISS 검색 API는 기관 전용 키를 요구해 hosted proxy로 제공할 수 없으므로, `keris-academic-search` 스킬을 쓰려면 사용자 본인이 비영리 기관/대학 자격으로 키를 발급받아 설정해야 한다. 호환 목적으로 `RISS_API_KEY`도 허용하지만 `DATA_GO_KR_API_KEY`를 RISS 검색에 재사용하지 않는다.

`LAW_OC` 는 법제처 Open API(`open.law.go.kr`)를 호출할 때 쓰는 표준 식별자다. 한국 법령 검색은 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)의 `/v1/korean-law/...` 라우트가 `LAW_OC` 와 브라우저 User-Agent/Referer 를 proxy 서버에서만 주입하므로 사용자 쪽 키가 불필요하다. `LAW_OC` 는 self-host proxy 운영자 문맥에서만 서버에 넣는다. `DATA_GO_KR_API_KEY` 는 프록시 운영자 문맥에서만 서버에 넣는다. 부동산 실거래가 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 키가 불필요하다. 생활쓰레기 배출정보 조회는 `k-skill-proxy`의 `/v1/household-waste/info` 라우트를 거쳐 `serviceKey`(`DATA_GO_KR_API_KEY`)를 proxy 서버에서 주입하므로 사용자 쪽 키가 불필요하다. 의약품 안전 체크도 `k-skill-proxy`의 `/v1/mfds/drug-safety/lookup` 라우트를 거쳐 `DATA_GO_KR_API_KEY` 를 proxy 서버에서만 주입하므로 사용자 쪽 키가 불필요하다. 식품 안전 체크는 `k-skill-proxy`의 `/v1/mfds/food-safety/search` 라우트를 거쳐 `DATA_GO_KR_API_KEY` 및 선택적 `FOODSAFETYKOREA_API_KEY` 를 proxy 서버에서만 주입하므로 사용자 쪽 키가 불필요하다. 한국 주식 정보 조회도 기본 hosted proxy를 경유하므로 사용자 쪽 `KRX_API_KEY` 가 불필요하다. `KRX_API_KEY` 는 self-host proxy 운영자 문맥에서만 서버에 넣는다. KOSIS 일반 조회도 기본 hosted proxy를 경유하므로 사용자 쪽 KOSIS 키가 불필요하다. `KOSIS_API_KEY` 또는 `KSKILL_KOSIS_API_KEY` 는 self-host proxy 운영자, direct 호출, 또는 bigdata 호출 문맥에서만 쓴다. Kakao Local geocoding도 기본 hosted proxy를 경유하므로 사용자 쪽 `KAKAO_REST_API_KEY` 가 불필요하다. `KAKAO_REST_API_KEY` 는 self-host proxy 운영자 문맥에서만 서버에 넣는다. 근처 가장 싼 주유소 찾기는 기본 hosted proxy를 경유하므로 사용자 쪽 `OPINET_API_KEY` 가 불필요하다. `OPINET_API_KEY` 는 프록시 운영자 문맥에서만 서버에 넣는다. 창업진흥원 K-Startup 조회도 `k-skill-proxy`의 `/v1/kstartup/*` 라우트를 거쳐 `ServiceKey`(`DATA_GO_KR_API_KEY`)를 proxy 서버에서만 주입하므로 사용자 쪽 키가 불필요하다. `KSKILL_KSTARTUP_API_KEY` 는 `--direct` 호출 문맥에서만 사용자 쪽에 둔다. `KIPRIS_PLUS_API_KEY` 는 한국 특허 정보 검색 helper가 KIPRIS Plus Open API에 보낼 `ServiceKey` 값을 담는 표준 변수명이다. 공공데이터포털에서 복사한 percent-encoded key도 helper가 한 번 정규화한 뒤 요청한다. public 공유용 tunnel/auth/operator secret은 사용자 기본 secrets 파일에 넣지 않는다. 프록시 운영자 문맥에서는 upstream 환경변수 `SEOUL_OPEN_API_KEY`, `KMA_OPEN_API_KEY`, `AIR_KOREA_OPEN_API_KEY`, `HRFCO_OPEN_API_KEY`, `OPINET_API_KEY`, `DATA_GO_KR_API_KEY`, `FOODSAFETYKOREA_API_KEY`, `KRX_API_KEY`, `KOSIS_API_KEY`, `KAKAO_REST_API_KEY`, `LAW_OC` 를 사용할 수 있다. 다만 일반 사용자/client 쪽 기본 secrets 파일에는 넣지 않는다. `KSKILL_PROXY_BASE_URL` 은 별도 self-host proxy를 쓸 때만 넣는다. 서울 지하철, 서울 실시간 혼잡도, 서울 따릉이, 한국 날씨, 미세먼지, 한강 수위, 주유소 가격, 한국 주식 정보 조회, 한국 법령 검색, KOSIS 일반 조회, Kakao Local geocoding, 의약품 안전 체크, 식품 안전 체크는 이 값이 없거나 비어 있으면 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 사용한다.
`KSKILL_POPBILL_LINK_ID`, `KSKILL_POPBILL_SECRET_KEY`, `KSKILL_POPBILL_CORP_NUM`, `KSKILL_POPBILL_USER_ID` 는 팝빌 사용자별 과금/권한 API를 로컬 BYOK 방식으로 호출할 때만 사용한다. hosted proxy에 넣지 않고, 테스트/운영 환경을 혼동하지 않으며, 실제 SecretKey·사업자번호·수신자 연락처·계좌번호는 문서/PR/로그에 남기지 않는다.

이 레포의 credential-bearing skill은 Cloud와 generic/local/self-hosted 경로를 명시적으로 구분한다. 자세한 공통 설치 절차는 [공통 설정 가이드](setup.md)를 본다.
