---
name: k-skill-setup
description: Install and verify the common cross-platform secret-management setup for all k-skill packages with sops plus age. Use this before any credential-bearing k-skill such as SRT, KTX, or Seoul subway.
license: MIT
metadata:
  category: setup
  locale: ko-KR
  phase: v1
---

# k-skill Setup

## Purpose

모든 `k-skill` 공통 선행 작업을 처리한다.

- `sops + age` 설치
- age key 생성
- 공통 secrets 파일 생성
- 암호화 확인
- 런타임 주입 확인

## Why this is the default setup path

- 계정 가입이 필요 없다
- macOS, Linux, Windows 모두 가능하다
- 스킬은 비밀값 위치를 몰라도 되고, 표준 환경변수 이름만 보면 된다
- 비밀값은 저장소에 평문으로 두지 않아도 된다

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
  - path_regex: .*secrets\.env$
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

### 5. Verify runtime injection

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" \
  'test -n "$KSKILL_SRT_ID" || test -n "$KSKILL_KTX_ID" || test -n "$SEOUL_OPEN_API_KEY"'
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

## Notes

- 비밀값이 필요한 스킬은 이 setup skill을 먼저 보게 한다
- 저장소 안에는 plaintext secret file을 두지 않는다
