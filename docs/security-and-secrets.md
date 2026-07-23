# Security And Secrets

`k-skill`은 필요한 secret 이름과 사용 목적만 선언한다. 돌쇠에서는 평문 값을 모델에 노출하지 않는 vault action이 기본이고, 다른 에이전트에서는 기존 환경변수/dotenv 흐름을 portable fallback으로 유지한다.

## Credential resolution order

모든 credential-bearing 스킬은 먼저 실행 capability를 감지한다.

1. **Dolshoi credential mode**: `DOLSHOI_ACTION_BROKER_URL`이 설정되고 `vault-run`이 실행 가능하면 provisioned capability를 사용한다. 모델은 ID/PW/key 원문을 묻거나 읽지 않는다.
2. **Dolshoi credential missing**: 필요한 capability가 없으면 `request_vault_credential` tool로 앱의 vault 입력 UI를 띄운다. 저장 후 같은 turn에 capability가 provision되면 원래 action을 즉시 재시도한다.
3. **Generic injected secret**: 돌쇠 mode가 아니고 이미 환경변수 또는 host vault injection이 있으면 그대로 사용한다.
4. **Generic fallback vault/dotenv**: 에이전트 vault(1Password, Bitwarden, macOS Keychain 등), 그 다음 `~/.config/k-skill/secrets.env`(퍼미션 `0600`)를 사용한다.
5. **Generic missing secret**: 호스트가 제공하는 가장 안전한 입력 표면으로 사용자에게 요청해 vault 또는 dotenv에 저장한다. 가능하면 채팅 평문 입력을 피한다.

`~/.config/k-skill/secrets.env`는 non-Dolshoi fallback일 뿐 기본값을 돌쇠에 강제하지 않는다.

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

- 돌쇠에서는 필요한 service/field를 `request_vault_credential`에 전달하고 평문 값을 채팅으로 요구하지 않는다
- 다른 런타임에서는 어떤 값이 비어 있는지 정확한 환경변수 이름으로 사용자에게 알려준다
- credential resolution order에 따라 확보한다
- 대체 사이트, 대체 API, 하드코딩 같은 우회 경로를 찾지 않는다
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하지 않는다

## Forbidden patterns

- 실제 비밀값이 들어있는 파일을 git에 두기
- 스킬 문서 안에 예시용 실비밀번호를 쓰기
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하기

## Threat model

- 돌쇠 cloud vault(Bitwarden/Vaultwarden)는 host-owned action broker를 통해서만 사용하고 모델에는 평문을 반환하지 않는다
- `vault-run` capability는 service/action 범위와 turn에 묶여 있으며, broker URL만 있거나 CLI만 있는 상태를 돌쇠 credential mode로 오인하지 않는다
- `~/.config/k-skill/secrets.env`는 plain dotenv 파일이다
- 파일 퍼미션 `0600`으로 같은 머신의 다른 유저로부터 보호한다
- `.gitignore`로 git 노출을 방지한다
- generic 에이전트는 이 파일을 읽고 쓸 수 있다 — 이것은 backward-compatible fallback이다
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

이 레포의 모든 top-level skill은 단독 설치에서도 이 경계를 알 수 있도록 동일한 portable runtime block을 포함한다. 상세 감지 계약은 [돌쇠 런타임 계약](dolshoi-runtime.md), 공통 설치 절차는 [공통 설정 가이드](setup.md)를 본다.
