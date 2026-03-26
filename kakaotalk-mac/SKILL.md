---
name: kakaotalk-mac
description: Use kakaocli on macOS to read KakaoTalk chats, search messages, and send replies after explicit confirmation.
license: MIT
metadata:
  category: messaging
  locale: ko-KR
  phase: v1.5
---

# KakaoTalk Mac CLI

## What this skill does

`kakaocli` 를 사용해 macOS에서 카카오톡 대화 목록을 확인하고, 메시지를 검색하고, 필요할 때 답장을 보낸다.

이 스킬은 **macOS + 카카오톡 Mac 앱 설치**를 전제로 한다. 공식 Kakao API를 쓰는 것이 아니라 로컬 데이터베이스 읽기와 macOS 접근성 자동화 위에서 동작하므로, 권한과 안전 규칙을 먼저 확인해야 한다.

## When to use

- "카카오톡 최근 대화 목록 보여줘"
- "특정 채팅방 최근 메시지 찾아줘"
- "카카오톡 메시지 검색해줘"
- "내 카톡으로 테스트 메시지 보내줘"
- "답장 초안은 만들되 실제 전송 전에는 꼭 확인받아"

## When not to use

- macOS가 아닌 환경
- 카카오톡 Mac 앱이 설치되어 있지 않은 환경
- 사용자 확인 없이 다른 사람에게 메시지를 바로 보내야 하는 작업
- 카카오 공식 API 범위 안에서 해결 가능한 서버-투-서버 연동 작업

## Prerequisites

- macOS
- KakaoTalk for Mac 설치
- Homebrew
- Mac App Store 로그인(`mas` 사용 시)
- `kakaocli` 설치
- 터미널 앱에 **Full Disk Access** 와 **Accessibility** 권한 부여

## Inputs

- 채팅방 이름 또는 검색 키워드
- 읽기 범위: 최근 N개, `--since 1h`, `--since 7d` 등
- 전송할 메시지 본문
- 테스트 여부 (`--me`, `--dry-run`)

## Workflow

### 0. Install KakaoTalk for Mac first when missing

카카오톡 Mac 앱이 없으면 먼저 설치한다. `mas` 를 쓰려면 App Store 로그인 상태여야 한다.

```bash
brew install mas
mas account
mas install 869223134
```

`mas install` 이 막히면 App Store 앱에서 먼저 로그인한 뒤 다시 시도한다.

### 1. Install `kakaocli`

공식 저장소 기준 권장 설치는 Homebrew tap 이다.

```bash
brew install silver-flight-group/tap/kakaocli
```

설치 후 바로 상태를 확인한다.

```bash
kakaocli status
```

### 2. Grant the required macOS permissions

**System Settings > Privacy & Security** 에서 현재 사용하는 터미널 앱(iTerm, Terminal, Warp 등)에 아래 권한을 준다.

- **Full Disk Access**: 카카오톡 로컬 데이터베이스 읽기용
- **Accessibility**: 메시지 전송, harvest, inspect 같은 UI 자동화용

기본 규칙:

- `status` / `auth` / `chats` 같은 읽기 명령도 Full Disk Access 가 필요하다.
- `send`, `harvest`, `inspect` 류 작업은 Accessibility 권한까지 필요하다.

### 3. Verify read access before attempting side effects

먼저 읽기 경로가 되는지 확인한다.

```bash
kakaocli status
kakaocli auth
kakaocli chats --limit 10 --json
```

`auth` 가 성공하면 읽기 경로는 준비된 것이다.

### 4. Read or search messages

```bash
kakaocli messages --chat "지수" --since 1h --json
kakaocli search "점심" --json
```

응답은 가능하면 JSON 모드로 받고, 사람이 읽기 쉽게 다시 요약한다.

### 5. Use safe testing before real sends

실제 전송 전에 먼저 자기 자신에게 테스트하거나 dry-run 으로 확인한다.

```bash
kakaocli send --me _ "테스트 메시지"
kakaocli send --dry-run "채팅방 이름" "보낼 문장"
```

`--me` 는 나와의 채팅으로 보내므로 가장 안전한 테스트 경로다.

### 6. Confirm before sending to other people

다른 사람이나 단체방으로 보내기 전에는 반드시 사용자의 최종 확인을 받는다.

확인 전에는 아래만 준비한다.

- 대상 채팅방 이름
- 전송할 문장
- 왜 이 문장을 보내는지 한 줄 설명

확인을 받았을 때만 전송한다.

```bash
kakaocli send "채팅방 이름" "보낼 문장"
```

### 7. Use login storage only when the user explicitly wants auto-login

자동 로그인 편의를 원할 때만 자격증명을 저장한다.

```bash
kakaocli login
kakaocli login --status
```

비밀번호를 채팅창에 보내라고 요구하지 않는다. 사용자가 직접 로컬 터미널에서 입력하게 한다.

## Done when

- 읽기 요청이면 상태 확인 + 대화/메시지 조회 결과가 정리되어 있다
- 검색 요청이면 키워드 기준 결과가 정리되어 있다
- 전송 요청이면 테스트(`--me` 또는 `--dry-run`)와 사용자 확인이 끝난 뒤 실제 전송 여부가 명확하다

## Failure modes

- KakaoTalk for Mac 미설치
- App Store 로그인 누락으로 `mas install` 실패
- Full Disk Access 미부여
- Accessibility 미부여
- 채팅방 이름 substring 이 애매해서 잘못된 후보가 여러 개 잡힘

## Notes

- 이 스킬은 macOS 전용이다.
- 다른 사람에게 보내는 메시지는 항상 confirm before sending 원칙을 지킨다.
- 첫 검증은 `kakaocli status` 와 `kakaocli auth` 부터 시작하는 편이 안전하다.
