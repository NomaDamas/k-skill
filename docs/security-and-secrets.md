# Security And Secrets

`k-skill`은 **필요한 환경변수 이름만 선언**하고, 그 값을 어떻게 공급하느냐는 에이전트의 자유에 맡긴다.

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
LAW_OC=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
KSKILL_PROXY_BASE_URL=https://your-proxy.example.com
```

서울 지하철 도착정보는 hosted public route rollout 이 끝나기 전까지 self-host 또는 배포 확인이 끝난 proxy URL 만 넣는다. 미세먼지, 한강 수위, 주유소 가격, 한국 주식 정보 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 쓰므로 사용자 쪽 키가 불필요하다.

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
- `LAW_OC`
- `AIR_KOREA_OPEN_API_KEY`
- `KRX_API_KEY`
- `KSKILL_PROXY_BASE_URL`

`LAW_OC` 는 `korean-law-mcp` 가 법제처 Open API 를 호출할 때 쓰는 표준 변수명이다. 이 값은 로컬 CLI/로컬 MCP server 경로에서만 사용자 쪽에 필요하고, upstream remote MCP endpoint 예시는 사용자 `LAW_OC` 없이 `url`만 등록한다. `DATA_GO_KR_API_KEY` 는 프록시 운영자 문맥에서만 서버에 넣는다. 부동산 실거래가 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 키가 불필요하다. 한국 주식 정보 조회도 기본 hosted proxy를 경유하므로 사용자 쪽 `KRX_API_KEY` 가 불필요하다. `KRX_API_KEY` 는 self-host proxy 운영자 문맥에서만 서버에 넣는다. 근처 가장 싼 주유소 찾기는 기본 hosted proxy를 경유하므로 사용자 쪽 `OPINET_API_KEY` 가 불필요하다. `OPINET_API_KEY` 는 프록시 운영자 문맥에서만 서버에 넣는다. public 공유용 Cloudflare Tunnel/Auth0/operator secret은 사용자 기본 secrets 파일에 넣지 않는다. 프록시 운영자 문맥에서는 upstream 환경변수 `SEOUL_OPEN_API_KEY`, `AIR_KOREA_OPEN_API_KEY`, `HRFCO_OPEN_API_KEY`, `OPINET_API_KEY`, `DATA_GO_KR_API_KEY`, `KRX_API_KEY` 를 사용할 수 있다. 다만 일반 사용자/client 쪽 기본 secrets 파일에는 넣지 않는다. `KSKILL_PROXY_BASE_URL` 은 서울 지하철 route가 실제 배포된 proxy URL 로만 넣는다. 미세먼지, 한강 수위, 주유소 가격, 한국 주식 정보 조회는 이 값이 없으면 기본 hosted path(`k-skill-proxy.nomadamas.org`)를 사용한다.

이 레포의 credential-bearing skill은 전부 이 정책을 전제로 작성한다. 자세한 공통 설치 절차는 [공통 설정 가이드](setup.md)를 본다.
