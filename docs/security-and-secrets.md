# Security And Secrets

`k-skill`은 인증이 필요한 스킬에서 비밀번호나 토큰을 채팅창에 직접 붙여 넣는 방식을 허용하지 않는다. 기본 원칙은 "비밀값은 암호화된 파일로 보관하고, 런타임에만 주입"이다.

## Required

- `sops`
- `age`
- local age private key
- encrypted dotenv file for `k-skill`

## Allowed patterns

### 1. `sops exec-env` with an encrypted dotenv file

평문 예시는 한 번만 작성하고, 바로 암호화해서 지운다.

```dotenv
KSKILL_SRT_ID=replace-me
KSKILL_SRT_PASSWORD=replace-me
KSKILL_KTX_ID=replace-me
KSKILL_KTX_PASSWORD=replace-me
SEOUL_OPEN_API_KEY=replace-me
```

실행은 항상 다음 패턴으로 한다.

```bash
SOPS_AGE_KEY_FILE="$HOME/.config/k-skill/age/keys.txt" \
sops exec-env "$HOME/.config/k-skill/secrets.env" '<command>'
```

### 2. `sops` encrypted file with repo-external storage

권장 기본 위치:

- encrypted secrets file: `~/.config/k-skill/secrets.env`
- age private key: `~/.config/k-skill/age/keys.txt`

이렇게 하면 저장소 안에 평문 비밀 파일을 둘 필요가 없다.

### 3. Wrapper commands that consume secrets internally

가장 강한 모델은 에이전트에게 secret 값을 직접 주지 않고, 내부에서만 secret을 소비하는 래퍼 명령을 두는 것이다.

예:

- `kskill-run srt-search ...`
- `kskill-run ktx-book ...`

이 경우 비밀값은 helper process 내부에서만 쓰인다.

## Forbidden patterns

- 채팅 메시지에 비밀번호/토큰을 직접 붙여 넣기
- 실제 비밀값이 들어있는 plaintext `.env` 파일을 git에 두기
- 셸 히스토리에 남는 `export PASSWORD=...`
- 스킬 문서 안에 예시용 실비밀번호를 쓰기

## Threat model notes

- `sops + age`는 저장 시점과 git 저장소에서의 노출을 줄여준다
- 하지만 `sops exec-env`로 실행된 프로세스는 복호화된 env var를 사용할 수 있다
- 즉 "에이전트가 쓸 수는 있지만 절대로 읽을 수는 없는" 구조는 아니다
- 그 수준이 필요하면 secret을 직접 주입하지 말고 capability wrapper를 둬야 한다

## Standard variable names

실제 환경변수 이름은 현재 다음을 사용한다.

- `KSKILL_SRT_ID`
- `KSKILL_SRT_PASSWORD`
- `KSKILL_KTX_ID`
- `KSKILL_KTX_PASSWORD`
- `SEOUL_OPEN_API_KEY`

## Why sops plus age

- 가입과 클라우드 로그인이 필요 없다
- macOS, Linux, Windows 모두 가능하다
- dotenv 파일을 그대로 암호화할 수 있다
- `sops exec-env`로 런타임 주입 패턴이 단순하다

이 레포의 credential-bearing skill은 전부 이 정책을 전제로 작성한다. 자세한 공통 설치 절차는 [`k-skill-setup/SKILL.md`](/Users/jeffrey/Projects/k-skill/k-skill-setup/SKILL.md)를 본다.
