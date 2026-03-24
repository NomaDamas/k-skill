# Security And Secrets

`k-skill`은 인증이 필요한 스킬에서 비밀번호나 토큰을 채팅창에 직접 붙여 넣는 방식을 허용하지 않는다. 기본 원칙은 "비밀값은 런타임 주입만 허용"이다.

## Required

- `op` installed
- signed in to 1Password
- shared vault or personal vault with the needed credentials

## Allowed patterns

### 1. `op run` with secret references

`.env.op` 같은 파일에는 실제 비밀번호를 넣지 말고 `op://...` 참조만 둔다.

```dotenv
KSKILL_SRT_ID=op://Private/k-skill-srt/username
KSKILL_SRT_PASSWORD=op://Private/k-skill-srt/password
KSKILL_KTX_ID=op://Private/k-skill-ktx/username
KSKILL_KTX_PASSWORD=op://Private/k-skill-ktx/password
SEOUL_OPEN_API_KEY=op://Private/k-skill-seoul-openapi/credential
```

실행은 항상 다음 패턴으로 한다.

```bash
op run --env-file=.env.op -- <command>
```

### 2. `op read` for one-off reads

단발성 확인이 필요할 때만 사용한다.

```bash
op read "op://Private/k-skill-srt/username"
```

## Forbidden patterns

- 채팅 메시지에 비밀번호/토큰을 직접 붙여 넣기
- 실제 비밀값이 들어있는 `.env` 파일을 git에 두기
- 셸 히스토리에 남는 `export PASSWORD=...`
- 스킬 문서 안에 예시용 실비밀번호를 쓰기

## Suggested vault items

- `k-skill-srt`
- `k-skill-ktx`
- `k-skill-seoul-openapi`

필드는 최소한 다음으로 맞춘다.

- `username`
- `password`
- `credential`

## Why 1Password CLI

- `op run`, `op read`, `op inject`로 런타임 주입 경로가 명확하다
- 에이전트가 평문 비밀값 대신 secret reference를 다루기 쉽다
- 팀 공유 vault와 개인 vault를 둘 다 지원한다

이 레포의 credential-bearing skill은 전부 이 정책을 전제로 작성한다.
