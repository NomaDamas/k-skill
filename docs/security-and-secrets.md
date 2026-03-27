# Security And Secrets

`k-skill`은 인증이 필요한 스킬에서 비밀번호나 토큰을 채팅창에 직접 붙여 넣는 방식을 허용하지 않는다. 기본 원칙은 "비밀값은 암호화된 파일로 보관하고, 런타임에만 주입"이다.

## Missing secret handling policy

인증이 필요한 스킬에서 필요한 값이 없으면 우회하지 않는다.

- 어떤 값이 비어 있는지 정확한 환경변수 이름으로 사용자에게 알려준다
- 그 값을 채팅창에 붙여 넣으라고 하지 않는다
- 대체 사이트, 대체 API, 하드코딩, 임시 평문 `.env` 파일 같은 우회 경로를 찾지 않는다
- 사용자가 직접 로컬에 안전하게 등록하도록 안내한 뒤 다시 진행한다

안내 기본형:

1. 필요한 값 이름을 짚는다. 예: `KSKILL_SRT_ID`, `KSKILL_SRT_PASSWORD`
2. `~/.config/k-skill/secrets.env.plain` 에 값을 적고
3. `sops`로 `~/.config/k-skill/secrets.env` 로 암호화한 뒤
4. plaintext 파일을 지우고
5. `bash scripts/check-setup.sh` 로 다시 확인하게 한다

즉, "시크릿이 없으면 사용자에게 필요한 정보를 요청하고, 안전한 등록 절차를 안내한 뒤 멈춘다"가 기본 동작이다.

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
AIR_KOREA_OPEN_API_KEY=replace-me
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
- 시크릿이 없다는 이유로 다른 서비스나 비공식 우회 수단을 자동 채택하기

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
- `AIR_KOREA_OPEN_API_KEY`

## Why sops plus age

- 가입과 클라우드 로그인이 필요 없다
- macOS, Linux, Windows 모두 가능하다
- dotenv 파일을 그대로 암호화할 수 있다
- `sops exec-env`로 런타임 주입 패턴이 단순하다

이 레포의 credential-bearing skill은 전부 이 정책을 전제로 작성한다. 자세한 공통 설치 절차는 [공통 설정 가이드](setup.md)를 본다.
