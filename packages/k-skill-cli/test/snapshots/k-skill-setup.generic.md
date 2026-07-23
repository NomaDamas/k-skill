# k-skill-setup — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Resolve credentials in this order: already-injected environment variables, then the host vault, then `~/.config/k-skill/secrets.env` (mode `0600`). If the value is missing, request it through the safest input surface the host provides and store it in the vault or dotenv; never echo it back.
- Use `k-skill-browser-runtime` (provider `auto`: BrowserOS CDP, then Aside CLI, then user-launched Chrome CDP) for logged-in or rendered-page automation. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
- This skill produces local artifacts (documents, conversions, corrections, generated text). Completion means the requested artifact is actually created/edited and its location or content is reported. No external side effects are involved unless explicitly documented.

# k-skill Setup

## Purpose

전체 `k-skill` 설치가 끝난 뒤, 공통 후속 작업을 처리한다.

- credential 확보 (에이전트 vault 또는 기본 secrets.env)
- 런타임 환경변수 확인
- 선택 사항: 주기적인 업데이트 확인 자동화
- 선택 사항: GitHub star 여부 확인 및 동의 시 실행

이 스킬의 기본 정책:

- 시크릿이 없으면 필요한 값 이름을 사용자에게 정확히 알려준다
- credential resolution order에 따라 확보한다
- 필요한 패키지가 없으면 대체 구현을 찾기보다 전역 설치를 먼저 시도한다
- `cron`, `launchd`, `schtasks`, `gh` 같은 지속성/외부 상태 변경은 자동으로 하지 말고 먼저 사용자 동의를 받는다
- GitHub star는 사용자가 명시적으로 동의했을 때만 실행한다

## Dolshoi-first runtime policy

돌쇠는 credential, browser, action을 서로 독립적인 capability로 감지한다.

1. `DOLSHOI_ACTION_BROKER_URL`과 실행 가능한 `vault-run`이 모두 있으면 credential action mode다.
2. 필요한 login capability가 이미 provision되어 있으면 `vault-run <capability_id> <action> [args...]`를 사용한다.
3. capability가 없으면 username/password/key를 채팅으로 묻지 말고 `request_vault_credential` tool로 앱 vault 입력 UI를 호출한다.
4. 내장 browser tool이 CloakBrowser를 제공하거나 `CLOAKBROWSER_PEEK_TOKEN`이 있으면 browser action은 CloakBrowser를 우선한다.
5. 조회 결과가 실제 action의 입력이면 공식 표면에서 장바구니, 예약, 신청서 작성, 연락 초안 등 가역적 단계를 이어서 수행한다.
6. 결제, 실제 메시지/메일 전송, 최종 제출, 취소 같은 비가역 효과 직전에만 `clarify`로 대상·금액/payload·효과를 승인받고, 승인되면 같은 turn에 실행한다.

## Generic credential resolution order

돌쇠 credential mode가 아닐 때만 아래 portable fallback을 따른다.

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

기본 경로에 저장하는 것은 fallback일 뿐, 강제가 아니다.

## Standard file location

- secrets file (기본 fallback): `~/.config/k-skill/secrets.env`

## Install

이 스킬은 `k-skill` 전체 스킬 설치가 끝난 뒤 실행하는 것을 기본으로 한다.

예:

```bash
npx --yes skills add <owner/repo> --all -g
```

설치가 끝나면 이 스킬을 호출해 아래 setup 단계를 이어간다.

## Setup steps

### 1. Create the default secrets file (generic fallback only)

돌쇠 credential mode나 다른 host vault를 쓰지 않는 경우에만 기본 fallback 파일을 만든다.

```bash
mkdir -p ~/.config/k-skill
cat > ~/.config/k-skill/secrets.env <<'EOF'
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
KSKILL_FORESTTRIP_ID=replace-me
KSKILL_FORESTTRIP_PASSWORD=replace-me
KSKILL_EV_CHARGER_API_KEY=replace-me
KSKILL_BUILDING_REGISTER_API_KEY=replace-me
KSKILL_RISS_API_KEY=replace-me
LAW_OC=replace-me
KIPRIS_PLUS_API_KEY=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
KSKILL_PROXY_BASE_URL=
EOF
chmod 0600 ~/.config/k-skill/secrets.env
```

호스트가 제공하는 가장 안전한 입력 표면으로 실제 값을 받아 채운다. 돌쇠에서는 이 파일을 만들거나 평문 값을 묻지 않는다.

서울 지하철 도착정보, 서울 실시간 혼잡도 조회, 서울 따릉이 실시간 대여소 조회, 한국 날씨, 미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL` 을 비워 두면 기본 hosted path(`k-skill-proxy.nomadamas.org`)를 그대로 쓴다. 전기차 충전소와 건축물대장 표제부 조회도 같은 기본 hosted path를 쓴다. 별도 self-host proxy를 쓸 때만 `KSKILL_PROXY_BASE_URL` 을 채운다.

한국 법령 검색은 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)의 `/v1/korean-law/...` endpoint를 경유하므로 사용자 쪽 `LAW_OC` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `LAW_OC` 를 채운다(무료 발급: `https://open.law.go.kr`).

한국 부동산 실거래가 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다.

한국 주식 정보 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `KRX_API_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `KRX_API_KEY` 를 사용한다.

도서관 도서 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA4LIBRARY_AUTH_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `DATA4LIBRARY_AUTH_KEY` 를 사용한다.

생활쓰레기 배출정보 조회는 `k-skill-proxy`의 `/v1/household-waste/info` 라우트를 호출하고, `serviceKey`(`DATA_GO_KR_API_KEY`)는 proxy 서버에서 주입/관리하므로 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다.

학교 급식 식단 조회는 `k-skill-proxy`의 `/v1/neis/school-search`·`/v1/neis/school-meal`을 호출하고, `KEDU_INFO_KEY`는 프록시 서버에만 두므로 사용자 쪽에 둘 필요가 없다.

도서관 도서 조회는 `k-skill-proxy`의 `/v1/data4library/*` 라우트를 호출하고, `DATA4LIBRARY_AUTH_KEY`는 프록시 서버에만 두므로 사용자 쪽에 둘 필요가 없다.

근처 가장 싼 주유소 찾기는 기본 hosted proxy를 경유하므로 사용자 쪽 `OPINET_API_KEY` 가 불필요하다.

의약품 안전 체크는 `k-skill-proxy`의 `/v1/mfds/drug-safety/lookup` 라우트를 호출하고, `DATA_GO_KR_API_KEY` 는 프록시 서버에서만 주입/관리하므로 사용자 쪽에 둘 필요가 없다.

식품 안전 체크는 `k-skill-proxy`의 `/v1/mfds/food-safety/search` 라우트를 호출하고, `DATA_GO_KR_API_KEY` 및 선택적 `FOODSAFETYKOREA_API_KEY` 는 프록시 서버에서만 주입/관리하므로 사용자 쪽에 둘 필요가 없다.

창업진흥원 K-Startup 조회는 `k-skill-proxy`의 `/v1/kstartup/*` 라우트를 호출하고, `ServiceKey`(`DATA_GO_KR_API_KEY`)는 프록시 서버에서만 주입/관리하므로 일반 조회는 사용자 쪽에 키가 필요 없다. `--direct` 호출을 쓸 때만 `KSKILL_KSTARTUP_API_KEY` 를 채운다.

전기차 충전소 조회는 `k-skill-proxy`의 `/v1/ev-charger/info`·`/v1/ev-charger/status`를 호출하므로 일반 사용자는 키가 필요 없다. `--direct`에서만 `KSKILL_EV_CHARGER_API_KEY` 또는 `DATA_GO_KR_API_KEY`를 사용하고, 데이터셋 `15076352` 활용신청은 별도로 해야 한다(자동승인).

건축물대장 표제부 조회는 `k-skill-proxy`의 `/v1/building-register/title`을 호출하므로 일반 사용자는 키가 필요 없다. 주소 입력은 같은 proxy의 Kakao geocode를 먼저 사용한다. `--direct`에서만 `KSKILL_BUILDING_REGISTER_API_KEY` 또는 `DATA_GO_KR_API_KEY`를 사용하고 데이터셋 `15134735` 활용신청을 별도로 해야 한다(자동승인).

KERIS/RISS 학술자료 검색은 RISS 검색 API가 기관 전용 키를 요구해 `k-skill-proxy`를 거치지 않는다. 사용자가 직접 발급받은 `KSKILL_RISS_API_KEY`(호환 `RISS_API_KEY`)를 설정해 상류를 호출한다. RISS 키는 비영리 기관/대학에만 발급되며 RISS 검색에는 `DATA_GO_KR_API_KEY`를 사용하지 않는다.

한국 특허 정보 검색은 KIPRIS Plus Open API 경로를 쓸 때 `KIPRIS_PLUS_API_KEY` 를 채운다. helper는 이 값을 읽어 실제 요청에서 `ServiceKey` 쿼리 파라미터로 보낸다. 공공데이터포털에서 복사한 percent-encoded key도 그대로 넣어도 된다.

### Missing secret response template

인증 스킬에서 값이 빠졌을 때는 credential resolution order에 따라 확보한다.

필요한 값 예:

- SRT: `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD`
- KTX: `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD`
- 자연휴양림 빈 객실 조회: `KSKILL_FORESTTRIP_ID`, `KSKILL_FORESTTRIP_PASSWORD`
- 한국 법령 검색: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `LAW_OC`)
- 한국 부동산 실거래가 조회: 사용자 시크릿 불필요 (기본 hosted proxy 사용)
- 한국 특허 정보 검색: `KIPRIS_PLUS_API_KEY`
- 한국 주식 정보 조회: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `KRX_API_KEY`)
- 생활쓰레기 배출정보 조회: 사용자 시크릿 불필요 (`serviceKey`는 proxy 서버 주입, 호출 시 `pageNo=1`·`numOfRows=100` 필수)
- 학교 급식 식단 조회: 사용자 시크릿 불필요 (`KEDU_INFO_KEY`는 proxy 서버만)
- 도서관 도서 조회: 사용자 시크릿 불필요 (`DATA4LIBRARY_AUTH_KEY`는 proxy 서버만)
- 의약품 안전 체크: 사용자 시크릿 불필요 (`DATA_GO_KR_API_KEY`는 proxy 서버만)
- 식품 안전 체크: 사용자 시크릿 불필요 (`DATA_GO_KR_API_KEY`와 선택적 `FOODSAFETYKOREA_API_KEY`는 proxy 서버만)
- 창업진흥원 K-Startup 조회: 사용자 시크릿 불필요 (`DATA_GO_KR_API_KEY`는 proxy 서버만; `--direct` 호출 때만 `KSKILL_KSTARTUP_API_KEY`)
- 전기차 충전소 위치·상태 조회: 사용자 시크릿 불필요 (hosted proxy 사용; `--direct` 때만 `KSKILL_EV_CHARGER_API_KEY` 또는 `DATA_GO_KR_API_KEY`)
- 건축물대장 표제부 조회: 사용자 시크릿 불필요 (hosted proxy 사용; `--direct` 때만 `KSKILL_BUILDING_REGISTER_API_KEY` 또는 `DATA_GO_KR_API_KEY`)
- KERIS/RISS 학술자료 검색: 사용자 본인 `KSKILL_RISS_API_KEY`(호환 `RISS_API_KEY`) 필요 (RISS 검색 API는 비영리 기관/대학 전용 키로 직접 호출, proxy 미사용)
- 근처 가장 싼 주유소 찾기: 사용자 시크릿 불필요 (기본 hosted proxy 사용)
- 서울 지하철: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `SEOUL_OPEN_API_KEY`)
- 서울 실시간 혼잡도: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `SEOUL_OPEN_API_KEY`)
- 한국 날씨: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `KMA_OPEN_API_KEY`)
- 사용자 위치 미세먼지 조회: `KSKILL_PROXY_BASE_URL` 또는 `AIR_KOREA_OPEN_API_KEY`

시크릿이 비어 있다는 이유로 다른 서비스나 비공식 우회 경로를 자동 선택하지 않는다.

### 2. Verify runtime environment

이 스킬은 `SKILL.md` 단일 파일로 설치될 수 있으므로 별도 스크립트 파일에 의존하지 않고 아래 검증을 직접 실행한다.

```bash
secrets_file="$HOME/.config/k-skill/secrets.env"
if [ ! -f "$secrets_file" ]; then
  echo "missing secrets file: $secrets_file"
  echo "next steps:"
  echo "  1. create ~/.config/k-skill/secrets.env with your credentials"
  echo "  2. chmod 0600 ~/.config/k-skill/secrets.env"
else
  perms=$(stat -f '%Lp' "$secrets_file" 2>/dev/null || stat -c '%a' "$secrets_file" 2>/dev/null)
  if [ "$perms" != "600" ]; then
    echo "insecure permissions on $secrets_file: $perms (expected 600)"
    echo "run: chmod 0600 $secrets_file"
  else
    echo "k-skill setup looks usable"
  fi
fi
```

repo 전체를 clone받은 경우에는 같은 검증을 `bash scripts/check-setup.sh` 로 실행해도 된다.

### 3. Offer scheduled update checks

setup이 끝나면 사용자에게 주기적인 업데이트 확인 자동화를 원하는지 먼저 묻는다. 원하지 않으면 건너뛴다.

기본 정책:

- 자동 설치가 아니라 `업데이트 확인` 만 기본으로 제안한다
- 지속성 있는 시스템 변경(`crontab`, `launchd`, `schtasks`)은 동의 없이 적용하지 않는다
- 기본 확인 명령은 `npx --yes skills check`
- 사용자가 명시적으로 `자동 업데이트` 를 원할 때만 `npx --yes skills update` 기반 스케줄을 별도로 제안한다
- 주의: `skills` CLI 버전에 따라 `check`에 `-g` 같은 옵션을 붙이면 확인을 넘어 설치본을 덮어쓸 수 있다. 자동화 스크립트에는 옵션 없는 `npx --yes skills check` 만 사용하고, 실제 업데이트 적용은 사용자가 검토 후 직접 실행하도록 안내한다

macOS / Linux 예시:

```bash
mkdir -p ~/.config/k-skill/bin ~/.config/k-skill/logs
cat > ~/.config/k-skill/bin/check-skill-updates.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.config/k-skill/logs"
{
  date '+[%Y-%m-%d %H:%M:%S]'
  npx --yes skills check
  printf '\n'
} >> "$HOME/.config/k-skill/logs/skills-check.log" 2>&1
EOF
chmod +x ~/.config/k-skill/bin/check-skill-updates.sh
(crontab -l 2>/dev/null; echo "0 9 * * * $HOME/.config/k-skill/bin/check-skill-updates.sh") | crontab -
```

Windows 예시:

```powershell
New-Item -ItemType Directory -Force "$HOME/.config/k-skill/bin" | Out-Null
New-Item -ItemType Directory -Force "$HOME/.config/k-skill/logs" | Out-Null
@'
npx --yes skills check >> "$HOME/.config/k-skill/logs/skills-check.log" 2>&1
'@ | Set-Content "$HOME/.config/k-skill/bin/check-skill-updates.cmd"
schtasks /Create /SC DAILY /TN "k-skill-update-check" /TR "\"$HOME/.config/k-skill/bin/check-skill-updates.cmd\"" /ST 09:00 /F
```

설정 후에는 로그 위치를 짧게 알려준다:

- `~/.config/k-skill/logs/skills-check.log`

### 4. Offer GitHub starring with explicit consent

setup 마지막에는 다음처럼 짧게 묻는다.

```text
k-skill 저장소(NomaDamas/k-skill)에 GitHub star를 눌러드릴까요?
원하시면 `gh` 로 바로 처리하고, 원하지 않으면 건너뜁니다.
```

규칙:

- 사용자가 명시적으로 동의하기 전에는 star API를 호출하지 않는다
- `gh` 가 없거나 인증되지 않았으면 설치/로그인 안내만 하고 자동 우회하지 않는다
- star 대상 저장소는 `NomaDamas/k-skill` 이다

동의했고 `gh auth status` 가 정상이면 GitHub API로 star를 실행한다. (`gh` CLI에는 `repo star` 서브커맨드가 없다.)

```bash
# 이미 star 여부 확인: 204 = 이미 star, 404 = 아직
gh api user/starred/NomaDamas/k-skill >/dev/null 2>&1 && echo "already starred" || echo "not starred yet"

# star 실행
gh api -X PUT user/starred/NomaDamas/k-skill
```

성공하면 짧게 완료만 알린다.

## Completion checklist

- `~/.config/k-skill/secrets.env` exists with permission `0600` (또는 에이전트가 자체 vault로 credential을 관리 중)
- 필요한 환경변수가 설정되어 있다
- 사용자가 원한 경우에만 업데이트 확인 자동화 또는 GitHub star가 설정되었다

## Notes

- 기본 흐름은 "전체 스킬 설치 → 이 setup skill 실행 → 개별 기능 사용" 이다
- 저장소 안에는 secret file을 두지 않는다
