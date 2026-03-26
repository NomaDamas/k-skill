# 카카오톡 Mac CLI 가이드

## 이 기능으로 할 수 있는 일

- macOS에서 카카오톡 최근 대화 목록 확인
- 특정 채팅방 최근 메시지 읽기
- 키워드로 전체 대화 검색
- 나와의 채팅으로 안전하게 테스트 전송
- 사용자 확인 후 특정 채팅방으로 메시지 전송

## 먼저 필요한 것

- macOS
- KakaoTalk for Mac 설치
- Homebrew
- `brew install silver-flight-group/tap/kakaocli`
- 터미널 앱에 **Full Disk Access** 와 **Accessibility** 권한 부여

카카오톡 앱이 없으면 `mas` 로 먼저 설치할 수 있다.

```bash
brew install mas
mas account
mas install 869223134
```

## 입력값

- 채팅방 이름
- 검색 키워드
- 최근 범위(`--since 1h`, `--since 7d` 등)
- 전송 메시지 본문
- 테스트 여부(`--me`, `--dry-run`)

## 기본 흐름

1. KakaoTalk for Mac 과 `kakaocli` 가 설치되어 있는지 확인한다.
2. `kakaocli status`, `kakaocli auth` 로 권한과 DB 접근이 되는지 먼저 확인한다.
3. 읽기/검색은 JSON 모드로 실행한 뒤 사람이 읽기 쉽게 요약한다.
4. 전송은 먼저 `--me` 또는 `--dry-run` 으로 테스트한다.
5. 다른 사람에게 보내는 메시지는 항상 최종 확인 후에만 전송한다.

## 예시

```bash
kakaocli status
kakaocli auth
kakaocli chats --limit 10 --json
kakaocli messages --chat "지수" --since 1d --json
kakaocli search "회의" --json
kakaocli send --me _ "테스트 메시지"
kakaocli send --dry-run "팀 공지방" "오늘 3시에 만나요"
```

## 주의할 점

- **Full Disk Access** 가 없으면 읽기 명령도 실패할 수 있다.
- **Accessibility** 가 없으면 전송과 harvest 계열 자동화가 실패한다.
- macOS 전용이므로 Windows/Linux 대체 구현으로 넘어가지 않는다.
- 다른 사람에게 보내는 메시지는 자동 전송하지 말고 확인을 먼저 받는다.
