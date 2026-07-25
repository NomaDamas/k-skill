# Security And Secrets

`k-skill`은 **필요한 환경변수 이름만 선언**하고, 그 값을 어떻게 공급하느냐는 에이전트의 자유에 맡긴다.

## Credential broker (default path)

Dolshoi Cloud(`apps/cloud-api`)에서 스킬이 실행될 때, 기본적으로 credential 평문 값은 에이전트에게 **전달되지 않는다**. 대신 cloud-api 가 값을 복호화해 in-process 에 보관하고, 에이전트에게는 불투명(opaque) capability 핸들만 넘긴다.

- 핸들에 들어가는 건 오직 `{capabilityId, envName, allowedHosts}` 세 필드다. credential 값은 어디에도 노출되지 않는다.
- 허용된 호스트에 HTTPS 요청을 보낼 때, 에이전트는 capability id 와 함께 cloud-api 의 loopback route 를 호출한다. cloud-api 가 `Authorization: Bearer <value>` 헤더를 **서버 사이드에서 주입**하고, upstream 응답만 에이전트에게 돌려준다. 에이전트는 값을 절대 못 본다.
- 허용 호스트 목록은 SKILL.md 의 `broker_allowed_hosts` 블록에서 읽는다 (YAML list, exact hostname 만 허용, 와일드카드·포트·scheme 불가). 누락 또는 빈 리스트면 이 스킬의 credential은 capability가 **아예 프로비전되지 않는다**. fail-closed.
- capability 는 `(accountId, container)` 에 scoped 되고, per-turn TTL(5분) 과 최대 5회 사용 한도를 갖는다. turn 이 끝나면 broker key 와 capability 가 함께 폐기된다.

이 경로는 저장소 compromis(ciphertext at rest)와 Hermes 모델 compromis(평문이 stream/handle에 없음)를 막는다. 다만 cloud-api 호스트 전체 compromis는 방어하지 못한다. 호스트가 털리면 decrypted 값이 process memory 에서 읽힐 수 있다. 이것은 honest residual risk 로 받아들인다.

신뢰 경계 세부 사항과 broker route 주소는 cloud-api 의 `apps/cloud-api/docker/README.md` 와 `docs/internal/bitwarden-credential-engine.md` (Pattern B) 를 참고한다.

### Structured credential fields

Dolshoi Cloud stores the environment-variable bindings for a credential as a
structured object with optional `username`, `password`, and `value` fields.
The names are metadata; the secret values stay encrypted in cloud-api.

- `login` uses the username/password pair only when the skill explicitly opts
  into `legacy_env_injection: true`. Login credentials are not sent through the
  scalar Bearer broker.
- `api_key` uses the `value` field through the broker. A legacy `envName` is
  treated as the `value` binding during migration.
- `note` is never injected into an agent turn.

Skills should declare only the environment-variable names they need. The
broker handle remains opaque and contains no field values.

## Legacy plaintext env (opt-in)

아래 섹션들이 설명하는 `~/.config/k-skill/secrets.env` 평문 경로는 기본값이 아니다. 이 경로를 켜려면 SKILL.md frontmatter 에 `legacy_env_injection: true` 를 **명시적으로** 적어야 한다 (YAML `yes`/`on` 등은 무시되고 리터럴 `true` 만 인정). 새 스킬은 기본값(`false`)을 그대로 써서 broker 경로를 타는 것을 권장한다.

평문 주입이 켜진 스킬은 turn 종료 후 `secrets.env` 가 즉시 정리되고, 모든 읽기/쓰기가 audit log 에 기록된다. 다만 값이 에이전트 컨테이너 filesystem 에 잠깐이라도 평문으로 존재하므로 broker 경로보다 신뢰 폭이 넓다. 필요한 경우에만 켠다.

## Credential resolution order

모든 credential-bearing 스킬은 아래 우선순위를 따른다.

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

기본 경로에 저장하는 것은 fallback일 뿐, 강제가 아니다.

## Default secrets file

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

- 어떤 값이 비어 있는지 정확한 환경변수 이름으로 사용자에게 알려준다
- credential resolution order에 따라 확보한다
- 대체 사이트, 대체 API, 하드코딩 같은 우회 경로를 찾지 않는다
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하지 않는다

## Forbidden patterns

- 실제 비밀값이 들어있는 파일을 git에 두기
- 스킬 문서 안에 예시용 실비밀번호를 쓰기
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하기

## Threat model

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

이 레포의 credential-bearing skill은 전부 이 정책을 전제로 작성한다. 자세한 공통 설치 절차는 [공통 설정 가이드](setup.md)를 본다.
