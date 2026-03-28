# 설치 방법

## 기본 설치 흐름

권장 순서는 아래와 같다.

1. `k-skill` 전체 스킬을 먼저 설치한다.
2. 설치가 끝나면 `k-skill-setup` 스킬을 사용해 공통 설정을 마친다.
3. 그 다음 필요한 기능 스킬을 호출한다.

인증이 필요한 기능만 따로 설치 흐름을 분기하지 않는다. 일단 전체 스킬을 설치해 두고, 실제 시크릿/환경 준비는 `k-skill-setup` 에 맡기는 것을 기본으로 한다.

## 에이전트에게 맡기기

Codex나 Claude Code에 아래 문장을 그대로 붙여 넣으면 된다.

```text
이 레포의 설치 문서를 읽고 k-skill 전체 스킬을 먼저 설치해줘. 설치가 끝나면 k-skill-setup 스킬을 사용해서 sops + age, 공통 secrets 파일, 런타임 주입 확인까지 이어서 진행해줘. 끝나면 설치된 스킬과 다음 단계만 짧게 정리해.
```

## 직접 설치

`skills` 설치 명령은 아래 셋 중 하나만 있으면 된다.

```bash
npx --yes skills add <owner/repo> --list
pnpm dlx skills add <owner/repo> --list
bunx skills add <owner/repo> --list
```

권장: 전체 스킬 먼저 설치

```bash
npx --yes skills add <owner/repo> --all -g
```

설치 후 `k-skill-setup` 을 호출해 공통 설정을 진행한다.

```text
k-skill-setup 스킬을 사용해서 공통 설정을 진행해줘.
```

선택 설치가 꼭 필요할 때만(예: 조회형만 먼저 테스트):

```bash
npx --yes skills add <owner/repo> \
  --skill hwp \
  --skill kbo-results \
  --skill lotto-results \
  --skill kakaotalk-mac \
  --skill fine-dust-location \
  --skill daiso-product-search \
  --skill blue-ribbon-nearby \
  --skill zipcode-search \
  --skill delivery-tracking
```

인증이 필요한 기능만 부분 설치할 때도 `k-skill-setup` 은 같이 넣는다.

```bash
npx --yes skills add <owner/repo> \
  --skill k-skill-setup \
  --skill srt-booking \
  --skill ktx-booking \
  --skill seoul-subway-arrival \
  --skill fine-dust-location
```

로컬 저장소에서 바로 전체 설치 테스트:

```bash
npx --yes skills add . --all -g
```

## 로컬 테스트

현재 디렉터리에서 바로 확인:

```bash
npx --yes skills add . --list
```

설치 반영 확인:

```bash
npx --yes skills ls -g
```

유지보수자가 패키지/릴리스 설정까지 같이 검증하려면:

```bash
npm install
npm run ci
```

## 패키지가 없을 때의 기본 동작

스킬 실행에 필요한 Node/Python 패키지가 없으면 다른 방법으로 우회하지 말고 전역 설치를 먼저 시도하는 것을 기본으로 합니다.

### Node 패키지

```bash
npm install -g @ohah/hwpjs kbo-game k-lotto
export NODE_PATH="$(npm root -g)"
```

### macOS 바이너리

카카오톡 Mac CLI는 npm 패키지가 아니라 Homebrew tap 설치를 사용한다.

```bash
brew install silver-flight-group/tap/kakaocli
```

### Python 패키지

```bash
python3 -m pip install SRTrain korail2 pycryptodome
```

운영체제 정책이나 권한 때문에 전역 설치가 막히면, 임의의 대체 구현으로 넘어가지 말고 그 차단 사유를 사용자에게 설명한 뒤 다음 설치 단계를 정합니다.

## npx도 없으면

`npx`, `pnpm dlx`, `bunx` 중 아무것도 없으면 먼저 Node.js 계열 런타임을 설치해야 한다.

- `npx`를 쓰려면 Node.js + npm
- `pnpm dlx`를 쓰려면 pnpm
- `bunx`를 쓰려면 Bun

## setup이 필요한 기능

먼저 `k-skill-setup`을 따라야 하는 스킬:

- `srt-booking`
- `ktx-booking`
- `seoul-subway-arrival`
- `fine-dust-location`

관련 문서:

- [공통 설정 가이드](setup.md)
- [보안/시크릿 정책](security-and-secrets.md)
