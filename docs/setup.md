# 공통 설정 가이드

`k-skill` 전체 스킬을 설치한 뒤, 인증 정보가 필요한 기능(SRT 예매, KTX 예매, 한국 법령 검색의 로컬 CLI/MCP 경로용 `LAW_OC`, 한국 부동산 실거래가 조회의 로컬/self-host 경로용 `DATA_GO_KR_API_KEY`, self-host 프록시 운영용 서울 지하철/미세먼지 upstream key, 또는 배포 확인이 끝난 proxy URL 공유)이 있으면 이 절차를 진행하면 된다.

## Credential resolution order

모든 credential-bearing 스킬은 아래 우선순위를 따른다.

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

에이전트가 자체 vault를 사용 중이라면 기본 경로 설정을 건너뛰어도 된다.

## 기본 경로로 설정하기

에이전트가 별도 vault를 쓰지 않는 경우, 기본 fallback 파일을 만든다.

```bash
mkdir -p ~/.config/k-skill
cat > ~/.config/k-skill/secrets.env <<'EOF'
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
LAW_OC=replace-me
DATA_GO_KR_API_KEY=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
KSKILL_PROXY_BASE_URL=https://your-proxy.example.com
EOF
chmod 0600 ~/.config/k-skill/secrets.env
```

실제 값을 채운다.

서울 지하철 도착정보는 hosted public route rollout 이 끝나기 전까지 `KSKILL_PROXY_BASE_URL` 을 self-host 또는 배포 확인이 끝난 proxy URL 로 채워야 한다. 미세먼지만 쓴다면 이 값을 비워 두고 skill 기본 hosted path를 그대로 써도 된다.

한국 법령 검색의 로컬 CLI/MCP 경로용 `LAW_OC` 는 `korean-law-mcp` 로컬 실행에 쓴다. 로컬 CLI/MCP 경로는 `LAW_OC` 를 채운 뒤 `npm install -g korean-law-mcp` 와 `korean-law list` 로 설치 상태를 확인한다.

remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결한다. 다만 기존 `korean-law-mcp` 경로가 서비스 장애로 막히면 `법망`(`https://api.beopmang.org`) MCP/REST를 fallback으로 사용할 수 있다.

한국 부동산 실거래가 조회의 로컬/self-host 경로는 upstream `real-estate-mcp` 가 읽는 `DATA_GO_KR_API_KEY` 를 채운다. 2026-04-05 기준 upstream 문서에는 고정 public endpoint가 없어 self-host를 기본으로 보고, Cloudflare Tunnel/operator secret은 운영자별 값이라 기본 client secrets 파일에는 넣지 않는다.

## 확인

```bash
bash scripts/check-setup.sh
```

## 시크릿이 없을 때의 기본 응답

인증이 필요한 스킬에서 값이 비어 있으면 credential resolution order에 따라 확보한다.

- 어떤 값이 필요한지 정확한 변수 이름으로 알려주기
- resolution order에 따라 유저에게 확보 방법 안내하기

## 기능별로 필요한 값

| 기능 | 필요한 값 |
| --- | --- |
| SRT 예매 | `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD` |
| KTX 예매 | `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` |
| 한국 법령 검색 (로컬 CLI/MCP) | `LAW_OC` |
| 한국 법령 검색 (remote MCP endpoint) | 사용자 시크릿 불필요 (`url`만 등록, 장애 시 `법망` fallback 가능) |
| 한국 부동산 실거래가 조회 (로컬/stdio/self-host) | `DATA_GO_KR_API_KEY` |
| 한국 부동산 실거래가 조회 (공유 URL) | 사용자 시크릿 불필요, 대신 운영자가 self-host + Cloudflare Tunnel + launchd/systemd 를 준비 |
| 서울 지하철 도착정보 조회 | self-host 또는 배포 확인이 끝난 `KSKILL_PROXY_BASE_URL` |
| 사용자 위치 미세먼지 조회 | `KSKILL_PROXY_BASE_URL` 또는 `AIR_KOREA_OPEN_API_KEY` |

## 다음에 볼 문서

- [SRT 예매 가이드](features/srt-booking.md)
- [KTX 예매 가이드](features/ktx-booking.md)
- [서울 지하철 도착정보 가이드](features/seoul-subway-arrival.md)
- [사용자 위치 미세먼지 조회 가이드](features/fine-dust-location.md)
- [한국 법령 검색 가이드](features/korean-law-search.md)
- [한국 부동산 실거래가 조회 가이드](features/real-estate-search.md)
- [보안/시크릿 정책](security-and-secrets.md)

설치 기본 흐름은 "전체 스킬 설치 → 개별 기능 사용" 이다.
