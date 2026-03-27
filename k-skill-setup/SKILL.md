---
name: k-skill-setup
description: After installing the full k-skill bundle, configure and verify the shared cross-platform setup with sops plus age, then optionally wire update checks and GitHub starring with explicit user consent.
license: MIT
metadata:
  category: setup
  locale: ko-KR
  phase: v1
---

# k-skill Setup

## Purpose

전체 `k-skill` 설치가 끝난 뒤, 공통 후속 작업을 처리한다.

- `sops + age` 설치
- age key 생성
- 공통 secrets 파일 생성
- 암호화 확인
- 런타임 주입 확인
- 선택 사항: 주기적인 업데이트 확인 자동화
- 선택 사항: GitHub star 여부 확인 및 동의 시 실행

이 스킬의 기본 정책:

- 시크릿이 없으면 필요한 값 이름을 사용자에게 정확히 알려준다
- 값을 채팅창에 붙여 넣으라고 하지 않는다
- 로컬에 안전하게 등록하는 절차를 안내한 뒤 다시 진행한다
- 필요한 패키지가 없으면 대체 구현을 찾기보다 전역 설치를 먼저 시도한다
- `cron`, `launchd`, `schtasks`, `gh` 같은 지속성/외부 상태 변경은 자동으로 하지 말고 먼저 사용자 동의를 받는다
- GitHub star는 사용자가 명시적으로 동의했을 때만 실행한다

## Why this is the default setup path

- 계정 가입이 필요 없다
- macOS, Linux, Windows 모두 가능하다
- 스킬은 비밀값 위치를 몰라도 되고, 표준 환경변수 이름만 보면 된다
- 비밀값은 저장소에 평문으로 두지 않아도 된다
- 설치 단계와 시크릿/운영 자동화 단계를 분리할 수 있다

## Security model

중요한 한계:

- 암호화된 파일은 안전하게 저장할 수 있다
- 하지만 `sops exec-env ...` 로 실행된 프로세스는 복호화된 환경변수를 사용할 수 있다
- 즉, 에이전트가 "쓸 수는 있지만 절대로 읽을 수는 없는" 구조는 아니다

더 강한 모델이 필요하면 비밀값 자체를 넘기지 말고, 비밀값을 내부에서 소비하는 래퍼 명령만 노출해야 한다.

## Standard file locations

- age key: `~/.config/k-skill/age/keys.txt`
- encrypted secrets file: `~/.config/k-skill/secrets.env`

원하면 다른 위치를 써도 되지만, 기본 문서는 이 경로를 기준으로 한다.

## Install

이 스킬은 `k-skill` 전체 스킬 설치가 끝난 뒤 실행하는 것을 기본으로 한다.

예:

```bash
npx --yes skills add <owner/repo> --all -g
```

설치가 끝나면 이 스킬을 호출해 아래 setup 단계를 이어간다.

### macOS

```bash
brew install sops age
```

### Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y sops age
```

### Arch Linux

```bash
sudo pacman -S sops age
```

### Windows

```powershell
winget install Mozilla.SOPS FiloSottile.age
```

패키지 이름은 배포 채널에 따라 바뀔 수 있으니, 실패하면 공식 releases 페이지를 확인한다.

## Setup steps

### 1. Create an age key

```bash
mkdir -p ~/.config/k-skill/age
age-keygen -o ~/.config/k-skill/age/keys.txt
```

출력에 보이는 public key를 복사한다.

### 2. Create `.sops.yaml`

작업 디렉터리나 secrets 파일이 있는 디렉터리에 생성한다.

```yaml
creation_rules:
  - path_regex: .*secrets\.env(\.plain)?$
    age: age1replace-with-your-public-key
```

### 3. Create the plaintext env file once

```bash
mkdir -p ~/.config/k-skill
cat > ~/.config/k-skill/secrets.env.plain <<'EOF'
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
SEOUL_OPEN_API_KEY=replace-me
AIR_KOREA_OPEN_API_KEY=replace-me
EOF
```

실제 값을 채운다.

### 4. Encrypt it

```bash
cd ~/.config/k-skill
sops --encrypt --input-type dotenv --output-type dotenv \
  secrets.env.plain > secrets.env
rm secrets.env.plain
```

### Missing secret response template

인증 스킬에서 값이 빠졌을 때는 다음 식으로 안내한다.

```text
이 작업에는 <REQUIRED_SECRET_NAMES> 이 필요합니다.
값을 채팅창에 보내지 말고 ~/.config/k-skill/secrets.env.plain 에 직접 채운 뒤
sops 로 ~/.config/k-skill/secrets.env 로 암호화해 주세요.
암호화가 끝나면 plaintext 파일은 지우고 bash scripts/check-setup.sh 로 다시 확인해 주세요.
```

예를 들면:

- SRT: `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD`
- KTX: `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD`
- 서울 지하철: `SEOUL_OPEN_API_KEY`
- 사용자 위치 미세먼지 조회: `AIR_KOREA_OPEN_API_KEY`

시크릿이 비어 있다는 이유로 다른 서비스나 비공식 우회 경로를 자동 선택하지 않는다.

### 5. Verify runtime injection

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" \
  'test -n "$KSKILL_SRT_ID" || test -n "$KSKILL_KTX_ID" || test -n "$SEOUL_OPEN_API_KEY" || test -n "$AIR_KOREA_OPEN_API_KEY"'
```

또는 저장소에 들어있는 점검 스크립트를 쓴다.

```bash
bash scripts/check-setup.sh
```

### 6. Run tools with the encrypted file

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" '<your command>'
```

### 7. Offer scheduled update checks

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

### 8. Offer GitHub starring with explicit consent

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

## Recommended shell helper

```bash
kskill-run() {
  SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
  sops exec-env "$HOME/.config/k-skill/secrets.env" "$@"
}
```

예시:

```bash
kskill-run python your-script.py
```

## Completion checklist

- `sops --version` works
- `age-keygen --version` or `age --version` works
- `~/.config/k-skill/age/keys.txt` exists
- `~/.config/k-skill/secrets.env` exists and is encrypted
- `sops exec-env ...` can inject expected env vars
- 사용자가 원한 경우에만 업데이트 확인 자동화 또는 GitHub star가 설정되었다

## Notes

- 기본 흐름은 "전체 스킬 설치 → 이 setup skill 실행 → 개별 기능 사용" 이다
- 저장소 안에는 plaintext secret file을 두지 않는다
