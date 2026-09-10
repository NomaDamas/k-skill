# k-skill-setup — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Resolve credentials in this order: already-injected environment variables, then the host vault, then `~/.config/k-skill/secrets.env` (mode `0600`). If the value is missing, request it through the safest input surface the host provides and store it in the vault or dotenv; never echo it back.
- Use `k-skill-browser-runtime` (provider `auto`) for logged-in or rendered-page automation. On macOS it tries Aside Browser first, then BrowserOS CDP, then user-launched Chrome/Chromium CDP; on other platforms it tries BrowserOS CDP, then Aside Browser, then user-launched Chrome/Chromium CDP. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
- This skill operates or configures the k-skill installation itself. Inspect current state, apply the requested reversible setup/update/repair operation, and verify the installed CLI, skill directories, browser runtime, proxy connectivity, and credential-provider integration that the request covers.
- Do not change unrelated user configuration. Before deleting data, replacing user-managed files, changing persistent update automation, or performing another irreversible operation, call `clarify` with the exact paths and effect.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec k-skill-setup scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path k-skill-setup <relative-path>` only when another tool explicitly requires a filesystem path.

# k-skill Setup

## Purpose

`k-skill` 스킬 설치부터 CLI 런타임, credential, 환경 검증까지 한 번에 정리한다.
이미 설치된 항목은 확인만 하고 건너뛴다.

기본 원칙:

- Node.js 18 이상과 `npx`를 사용한다.
- credential은 환경변수, agent vault, `~/.config/k-skill/secrets.env` 순으로 확인한다.
- Dolshoi credential mode에서는 평문 credential을 요청하거나 파일에 직접 저장하지 않는다.
- 설치, 예약 작업, GitHub star처럼 외부 상태를 바꾸는 작업은 실행 전에 동의를 받는다.
- 사용자가 승인한 범위만 실행하고 별도 helper, 요약, AI/CLI 예약 작업을 추가하지 않는다.

## 1. Install the skills

일반적인 Claude Code, Codex, OpenCode, OpenClaw 등에서는 `skills` CLI로 전체 스킬을
전역 설치하는 경로를 권장한다.

```bash
npx --yes skills add NomaDamas/k-skill --all -g
```

목록을 먼저 보거나 일부 스킬만 설치하려면:

```bash
npx --yes skills add NomaDamas/k-skill --list
npx --yes skills add NomaDamas/k-skill --skill <skill-name> -g
```

Claude Code에서는 marketplace plugin으로 전체 번들을 설치하는 경로도 지원한다.
Claude Code 안에서 다음 명령을 실행한다.

```text
/plugin marketplace add NomaDamas/k-skill
/plugin install k-skill@k-skill
```

plugin으로 설치한 스킬은 `/k-skill:<스킬 이름>`으로 호출한다.
예: `/k-skill:k-skill-setup`, `/k-skill:lotto-results`.

두 설치 방식을 중복 실행할 필요는 없다. 현재 agent에서 스킬이 이미 보이면 설치를
다시 하지 말고 다음 단계로 진행한다.

## 2. Use the k-skill CLI

설치되는 `SKILL.md`는 스킬 선택과 최소 안전 규칙을 담은 adapter다. 전체 instruction
조립과 bundled `scripts/`, `references/` 접근은 `@nomadamas/k-skill` CLI가 담당한다.

기본 경로는 `npx`이며 CLI를 별도로 설치할 필요는 없다.

```bash
npx -y @nomadamas/k-skill@0 instruct k-skill-setup
npx -y @nomadamas/k-skill@0 list
```

반복 사용으로 전역 명령이 필요할 때만 선택적으로 설치한다.

```bash
npm install -g @nomadamas/k-skill@0
k-skill instruct k-skill-setup
```

bundled helper와 reference는 항상 CLI를 통해 사용한다.

```bash
npx -y @nomadamas/k-skill@0 exec <skill-name> scripts/<file> -- <args>
npx -y @nomadamas/k-skill@0 read <skill-name> references/<file>
```

설치된 스킬 디렉터리나 repository 상대 경로에서 helper를 직접 실행하지 않는다.

## 3. Resolve credentials

각 스킬이 요구하는 값만 준비한다. 모든 credential을 미리 요구하지 않는다.

credential resolution order:

1. 현재 프로세스 환경변수
2. agent가 제공하는 secret vault
3. 기본 fallback `~/.config/k-skill/secrets.env`
4. 필요한 값이 없으면 정확한 환경변수 이름과 발급처를 안내

Dolshoi credential mode:

- `DOLSHOI_ACTION_BROKER_URL`과 usable `vault-run`이 모두 있을 때만 활성화한다.
- plaintext credential을 묻거나 출력하거나 `secrets.env`를 만들지 않는다.
- 필요한 credential이 없으면 `request_vault_credential`을 사용한다.

Generic mode에서 fallback 파일이 필요하면:

```bash
mkdir -p ~/.config/k-skill
touch ~/.config/k-skill/secrets.env
chmod 0600 ~/.config/k-skill/secrets.env
```

실제 값은 사용자가 이용 중인 가장 안전한 입력 표면으로 받는다. 대화에 평문 값을
붙여 넣도록 요구하지 않는다.

`KSKILL_PROXY_BASE_URL`을 비워 두면 `k-skill-proxy` 기반 스킬은 기본 hosted endpoint를 사용한다.
사용자가 직접 운영하는 proxy가 있을 때만 URL을 설정한다.

```bash
KSKILL_PROXY_BASE_URL=
# KSKILL_PROXY_BASE_URL=https://your-proxy.example.com
```

무료 hosted proxy로 처리되는 기능에는 사용자 upstream API key를 요구하지 않는다.
로그인 기반 스킬은 해당 스킬의 공식 로그인/browser 절차를 따르며 credential을
`secrets.env`에 복사하도록 요구하지 않는다.

Hosted proxy 기본 계약:

- 미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL`을 비워 두면 기본 hosted endpoint를 사용한다.
- 서울 지하철: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `SEOUL_OPEN_API_KEY`).
- 생활쓰레기 배출정보 조회: 사용자 시크릿 불필요. `/v1/household-waste/info`와 운영자 서버의 `DATA_GO_KR_API_KEY`를 사용한다.
- 학교 급식 식단 조회: 사용자 시크릿 불필요. `/v1/neis/school-search`, `/v1/neis/school-meal`과 운영자 서버의 `KEDU_INFO_KEY`를 사용한다.
- 한국 법령 검색은 기본 hosted proxy를 사용하며, 운영자만 서버 환경변수 `LAW_OC`를 설정한다.
- 한국 특허 정보 검색: `KIPRIS_PLUS_API_KEY`는 운영자 서버에만 둔다.
- 한국 주식 정보 조회는 proxy가 운영자 `KRX_API_KEY`를 사용하므로 사용자 키가 불필요하다.
- 부동산 실거래가 조회와 주유소 가격 조회도 hosted proxy 기본 경로에서는 사용자 upstream key가 불필요하다.

## 4. Verify the setup

bundled 검증 helper를 CLI로 실행한다.

```bash
npx -y @nomadamas/k-skill@0 exec k-skill-setup scripts/check-setup.sh --
```

Generic mode에서 `secrets.env`가 필요하지 않은 구성이라면 파일 부재 자체를 전체 설치
실패로 단정하지 않는다. 실제 사용할 스킬의 필수 환경변수와 CLI 실행 가능 여부를 함께
확인한다.

최소 확인:

```bash
node --version
npx -y @nomadamas/k-skill@0 list
npx -y @nomadamas/k-skill@0 instruct k-skill-setup
```

확인이 끝나면 다음만 짧게 보고한다.

- 사용한 스킬 설치 방식 (`skills` 또는 Claude Code plugin)
- CLI 사용 방식 (`npx` 기본 또는 선택적 global install)
- 준비된 credential과 아직 필요한 환경변수 이름
- 검증 성공/실패와 사용자가 해야 할 다음 한 단계

## 5. Optional update checks

주기적인 업데이트 확인을 원하는지 먼저 묻는다. 원하지 않으면 건너뛴다.

정책:

- 기본 명령은 설치를 변경하지 않는 `npx --yes skills check`다.
- `check`에 `-g` 같은 추가 옵션을 붙이지 않는다.
- 자동 업데이트는 사용자가 명시적으로 요청한 경우에만 별도로 논의한다.
- 사용자가 승인한 확인 작업만 생성한다.
- 별도 요약 작업, helper script, `claude -p` 같은 AI/CLI 작업을 함께 만들지 않는다.

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

사용자가 이 확인 작업 하나만 승인했다면 `k-skill-update-check` 외의 예약 작업이나
추가 스크립트를 만들지 않는다.

## 6. Optional GitHub star

마지막에 한 번만 묻는다.

```text
k-skill 저장소(NomaDamas/k-skill)에 GitHub star를 눌러드릴까요?
```

동의한 경우에만 실행한다.

```bash
gh api -X PUT /user/starred/NomaDamas/k-skill
```

동의하지 않거나 `gh` 인증이 없으면 건너뛴다.
