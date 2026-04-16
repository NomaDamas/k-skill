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
- `python3` 3.10+
- 이 저장소의 helper `scripts/kakaotalk_mac.py`
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
3. `user_id` 자동 감지가 실패하면 helper `python3 scripts/kakaotalk_mac.py auth --refresh` 로 복구한다.
4. 읽기/검색은 JSON 모드로 실행한 뒤 사람이 읽기 쉽게 요약한다.
5. 전송은 먼저 `--me` 또는 `--dry-run` 으로 테스트한다.
6. 다른 사람에게 보내는 메시지는 항상 최종 확인 후에만 전송한다.

## 예시

```bash
kakaocli status
kakaocli auth
python3 scripts/kakaotalk_mac.py auth --refresh
python3 scripts/kakaotalk_mac.py chats --limit 10 --json
python3 scripts/kakaotalk_mac.py messages --chat "지수" --since 1d --json
python3 scripts/kakaotalk_mac.py search "회의" --json
kakaocli chats --limit 10 --json
kakaocli messages --chat "지수" --since 1d --json
kakaocli search "회의" --json
kakaocli send --me _ "테스트 메시지"
kakaocli send --dry-run "팀 공지방" "오늘 3시에 만나요"
```

## helper 가 해결하는 문제

`kakaocli auth` 실패가 항상 “DB 파일이 없음”을 의미하지는 않는다. 실제 Mac 환경에서는:

- container 안에 `KakaoTalk.db` 라는 이름 대신 **78자 hex 파일**이 DB 로 존재할 수 있다.
- `kakaocli status` 는 정상이어도 `auth` 는 `user_id 자동 감지 실패` 로 끝날 수 있다.
- 이 경우 plist 의 `AlertKakaoIDsList` 후보만으로는 부족하고, `DESIGNATEDFRIENDSREVISION:<SHA-512(user_id)>` 에서 실제 `user_id` 를 더 오래 찾아야 할 수 있다.

helper `scripts/kakaotalk_mac.py` 는 그 얇은 read-only 어댑터 역할을 한다.

- plist 에서 후보 `user_id` 와 active hash 를 읽는다.
- hash recovery 가 필요하면 더 긴 검색으로 실제 `user_id` 를 찾는다.
- 검증된 DB 경로와 SQLCipher key 를 `~/.cache/k-skill/kakaotalk-mac-auth.json` 에 캐시한다.
- 이후 read-only helper 명령 `chats`, `messages`, `search`, `schema` 를 cached `--db` / `--key` 와 함께 다시 실행한다.

## 주의할 점

- **Full Disk Access** 가 없으면 읽기 명령도 실패할 수 있다.
- **Accessibility** 가 없으면 전송과 harvest 계열 자동화가 실패한다.
- macOS 전용이므로 Windows/Linux 대체 구현으로 넘어가지 않는다.
- 다른 사람에게 보내는 메시지는 자동 전송하지 말고 확인을 먼저 받는다.
- helper cache 는 로컬 auth material 을 담으므로 본인 장비에서만 보관한다.
- 기본 `auth` 텍스트 출력은 key 를 다시 보여주지 않는다. 자동화가 필요할 때만 `--format json` 또는 `--format shell` 을 사용한다.
