# 공통 설정 가이드

`k-skill` 전체 스킬을 설치한 뒤, `k-skill-setup` 스킬이 실제로 수행해야 하는 공통 설정 절차를 이 문서에 정리한다.

SRT 예매, KTX 예매, 서울 지하철 도착정보 조회, 사용자 위치 미세먼지 조회처럼 인증 정보가 필요한 기능은 설치 직후 이 절차를 진행하면 된다.

## 이 설정으로 해결하는 것

- `sops + age` 설치
- age key 생성
- 공통 secrets 파일 생성
- 암호화 확인
- 런타임 주입 확인

## 기본 경로

- age key: `~/.config/k-skill/age/keys.txt`
- encrypted secrets file: `~/.config/k-skill/secrets.env`

## 1) 필요한 도구 설치

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

도구가 없으면 다른 비밀 관리 방식으로 우회하지 말고, 이 도구들을 먼저 설치하는 것을 기본으로 합니다.

## 2) age key 만들기

```bash
mkdir -p ~/.config/k-skill/age
age-keygen -o ~/.config/k-skill/age/keys.txt
```

출력된 public key를 복사해 둡니다.

## 3) `.sops.yaml` 만들기

```yaml
creation_rules:
  - path_regex: .*secrets\.env(\.plain)?$
    age: age1replace-with-your-public-key
```

## 4) 공통 secrets 파일 만들기

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

실제 값을 채운 뒤 바로 암호화합니다.

```bash
cd ~/.config/k-skill
sops --encrypt --input-type dotenv --output-type dotenv \
  secrets.env.plain > secrets.env
rm secrets.env.plain
```

## 시크릿이 없을 때의 기본 응답

인증이 필요한 스킬에서 값이 비어 있으면 다음 식으로 안내하는 것을 기본으로 합니다.

- 어떤 값이 필요한지 정확한 변수 이름으로 알려주기
- 그 값을 채팅에 보내지 말라고 안내하기
- 아래 절차로 로컬에 직접 등록하게 하기

예:

```text
이 작업에는 KSKILL_SRT_ID, KSKILL_SRT_PASSWORD 가 필요합니다.
값을 채팅창에 붙여 넣지 말고, ~/.config/k-skill/secrets.env.plain 에 채운 뒤
sops 로 ~/.config/k-skill/secrets.env 로 암호화해 주세요.
끝나면 plaintext 파일은 지우고 bash scripts/check-setup.sh 로 다시 확인해 주세요.
```

## 5) 런타임 주입 확인

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" \
  'test -n "$KSKILL_SRT_ID" || test -n "$KSKILL_KTX_ID" || test -n "$SEOUL_OPEN_API_KEY" || test -n "$AIR_KOREA_OPEN_API_KEY"'
```

또는:

```bash
bash scripts/check-setup.sh
```

## 6) 실행 래퍼 두기

```bash
kskill-run() {
  SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
  sops exec-env "$HOME/.config/k-skill/secrets.env" "$@"
}
```

## 기능별로 필요한 값

| 기능 | 필요한 값 |
| --- | --- |
| SRT 예매 | `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD` |
| KTX 예매 | `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` |
| 서울 지하철 도착정보 조회 | `SEOUL_OPEN_API_KEY` |
| 사용자 위치 미세먼지 조회 | `AIR_KOREA_OPEN_API_KEY` |

## 다음에 볼 문서

- [SRT 예매 가이드](features/srt-booking.md)
- [KTX 예매 가이드](features/ktx-booking.md)
- [서울 지하철 도착정보 가이드](features/seoul-subway-arrival.md)
- [사용자 위치 미세먼지 조회 가이드](features/fine-dust-location.md)
- [보안/시크릿 정책](security-and-secrets.md)

설치 기본 흐름은 "전체 스킬 설치 → `k-skill-setup` 실행 → 개별 기능 사용" 입니다.
