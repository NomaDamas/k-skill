---
name: k-skill-setup
description: After installing the full k-skill bundle, configure and verify the shared cross-platform setup, then optionally wire update checks and GitHub starring with explicit user consent.
license: MIT
metadata:
  category: setup
  locale: ko-KR
  phase: v1
---

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

## Credential resolution order

모든 credential-bearing 스킬은 아래 우선순위를 따른다.

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

### 1. Create the default secrets file (if no vault is in use)

에이전트가 자체 vault를 쓰지 않는 경우, 기본 fallback 파일을 만든다.

```bash
mkdir -p ~/.config/k-skill
cat > ~/.config/k-skill/secrets.env <<'EOF'
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
LAW_OC=replace-me
KIPRIS_PLUS_API_KEY=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
KSKILL_PROXY_BASE_URL=https://your-proxy.example.com
EOF
chmod 0600 ~/.config/k-skill/secrets.env
```

유저에게 물어서 실제 값을 채운다.

서울 지하철 도착정보와 한국 날씨 조회는 hosted public route rollout 이 끝나기 전까지 `KSKILL_PROXY_BASE_URL` 을 self-host 또는 배포 확인이 끝난 proxy URL 로 채운다. 미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회는 `KSKILL_PROXY_BASE_URL` 을 비워 두면 기본 hosted path(`k-skill-proxy.nomadamas.org`)를 그대로 쓴다.

한국 법령 검색은 로컬 `korean-law-mcp` 경로를 쓸 때만 `LAW_OC` 를 채운다. remote endpoint는 사용자 `LAW_OC` 없이 `url`만 등록하면 되고, 기존 경로 장애 시에는 `법망`(`https://api.beopmang.org`)을 fallback으로 안내한다.

한국 부동산 실거래가 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다.

한국 주식 정보 조회는 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 경유하므로 사용자 쪽 `KRX_API_KEY` 가 불필요하다. self-host proxy 운영자만 서버 환경변수 `KRX_API_KEY` 를 사용한다.

생활쓰레기 배출정보 조회는 `k-skill-proxy`의 `/v1/household-waste/info` 라우트를 호출하고, `serviceKey`(`DATA_GO_KR_API_KEY`)는 proxy 서버에서 주입/관리하므로 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다.

학교 급식 식단 조회는 `k-skill-proxy`의 `/v1/neis/school-search`·`/v1/neis/school-meal`을 호출하고, `KEDU_INFO_KEY`는 프록시 서버에만 두므로 사용자 쪽에 둘 필요가 없다.

근처 가장 싼 주유소 찾기는 기본 hosted proxy를 경유하므로 사용자 쪽 `OPINET_API_KEY` 가 불필요하다.


한국 특허 정보 검색은 KIPRIS Plus Open API 경로를 쓸 때 `KIPRIS_PLUS_API_KEY` 를 채운다. helper는 이 값을 읽어 실제 요청에서 `ServiceKey` 쿼리 파라미터로 보낸다. 공공데이터포털에서 복사한 percent-encoded key도 그대로 넣어도 된다.

### Missing secret response template

인증 스킬에서 값이 빠졌을 때는 credential resolution order에 따라 확보한다.

필요한 값 예:

- SRT: `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD`
- KTX: `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD`
- 로컬 한국 법령 검색: `LAW_OC` + `korean-law-mcp`
- 한국 법령 검색 remote endpoint: 사용자 `LAW_OC` 없이 `url`만 등록, 장애 시 `법망` fallback
- 한국 부동산 실거래가 조회: 사용자 시크릿 불필요 (기본 hosted proxy 사용)
- 한국 특허 정보 검색: `KIPRIS_PLUS_API_KEY`
- 한국 주식 정보 조회: 사용자 시크릿 불필요 (기본 hosted proxy 사용, 운영자만 `KRX_API_KEY`)
- 생활쓰레기 배출정보 조회: 사용자 시크릿 불필요 (`serviceKey`는 proxy 서버 주입, 호출 시 `pageNo=1`·`numOfRows=100` 필수)
- 학교 급식 식단 조회: 사용자 시크릿 불필요 (`KEDU_INFO_KEY`는 proxy 서버만)
- 근처 가장 싼 주유소 찾기: 사용자 시크릿 불필요 (기본 hosted proxy 사용)
- 서울 지하철: self-host 또는 배포 확인이 끝난 `KSKILL_PROXY_BASE_URL`
- 한국 날씨: self-host 또는 배포 확인이 끝난 `KSKILL_PROXY_BASE_URL`
- 사용자 위치 미세먼지 조회: `KSKILL_PROXY_BASE_URL` 또는 `AIR_KOREA_OPEN_API_KEY`

시크릿이 비어 있다는 이유로 다른 서비스나 비공식 우회 경로를 자동 선택하지 않는다.

### 2. Verify runtime environment

```bash
bash scripts/check-setup.sh
```

### 3. Offer scheduled update checks

setup이 끝나면 사용자에게 주기적인 업데이트 확인 자동화를 원하는지 먼저 묻는다. 원하지 않으면 건너뛴다.

기본 정책:

- 자동 설치가 아니라 `업데이트 확인` 만 기본으로 제안한다
- 지속성 있는 시스템 변경(`crontab`, `launchd`, `schtasks`)은 동의 없이 적용하지 않는다
- 기본 확인 명령은 `npx --yes skills check`
- 사용자가 명시적으로 `자동 업데이트` 를 원할 때만 `npx --yes skills update` 기반 스케줄을 별도로 제안한다

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

- 사용자가 명시적으로 동의하기 전에는 `gh repo star` 를 실행하지 않는다
- `gh` 가 없거나 인증되지 않았으면 설치/로그인 안내만 하고 자동 우회하지 않는다
- star 대상 저장소는 `NomaDamas/k-skill` 이다

동의했고 `gh auth status` 가 정상이면:

```bash
gh repo star NomaDamas/k-skill
```

성공하면 짧게 완료만 알린다.

## Completion checklist

- `~/.config/k-skill/secrets.env` exists with permission `0600` (또는 에이전트가 자체 vault로 credential을 관리 중)
- 필요한 환경변수가 설정되어 있다
- 사용자가 원한 경우에만 업데이트 확인 자동화 또는 GitHub star가 설정되었다

## Notes

- 기본 흐름은 "전체 스킬 설치 → 이 setup skill 실행 → 개별 기능 사용" 이다
- 저장소 안에는 secret file을 두지 않는다
