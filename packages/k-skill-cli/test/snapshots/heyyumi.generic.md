# heyyumi — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- Resolve credentials in this order: already-injected environment variables, then the host vault, then `~/.config/k-skill/secrets.env` (mode `0600`). If the value is missing, request it through the safest input surface the host provides and store it in the vault or dotenv; never echo it back.
- Complete search and reversible reservation steps that the documented portable workflow supports, then report the confirmation, purchase deadline, and the exact official surface where the user finishes payment. Do not automate payment here.

# HeyYumi (헤이유미) 예약 가능한 맛집 검색 · 식당 예약

## What this skill does

헤이유미 공식 CLI(`heyyumi`, npm, https://github.com/hmp-dev/heyyumi-cli)로 한국 식당·카페·바를 찾고, 예약 요청을 보낸 뒤 매장의 수락/거절/만료까지 확인한다. 같은 CLI로 "지금 자리 있어요? 웨이팅 몇 분이에요?" 같은 실시간 문의도 매장에 보낸다.

- 구글 로그인 한 번이면 쓴다. 키를 직접 발급하거나 붙여 넣을 필요 없다.
- 공식 CLI만 쓴다. 크롤링·화면 스크래핑은 하지 않고, k-skill-proxy도 쓰지 않는다. 호출은 사용자 머신에서 헤이유미 서버로 직접 간다.
- 예약에 선결제는 없다.

## When to use

- "을지로 힙한 카페 찾아서 예약해줘", "홍제동 저녁 2명 파스타집 예약 가능한 곳"
- "이 식당 예약돼? 지금 10명 앉을 수 있어? 웨이팅 몇 분이야?"
- "판교에서 주차되고 아이랑 가기 좋은 한식집", "제주시 몸국 파는 집" 같은 조건·메뉴로 식당 찾기
- "Find a bibimbap place near Myeongdong"처럼 외국어로 묻는 경우

쓰지 않는 경우: 매출 기반 순위가 목적이면 `bccard-eatpl-search`, 길찾기·지도는 `kakao-map`, KTX·버스 예약은 해당 스킬.

## Run

```bash
npx -y heyyumi <command> [flags]
```

`@0`처럼 버전 범위를 붙이지 않는다. 범위를 붙이면 npx가 처음 받은 사본을 계속 써서 새 버전이 안 들어온다.

출력은 stdout의 JSON이고 진행 로그는 stderr로 간다. 종료 코드는 `0` 정상, `1` 서버/도구 오류, `2` 사용법 오류, `3` 로그인 필요다. 오류 JSON은 `error.code`, `error.message`, `error.next`를 가진다.

### 1. 헤이유미 규칙 읽기 (작업마다 처음 한 번)

```bash
npx -y heyyumi guide            # 헤이유미 서버가 주는 최신 사용 규칙
npx -y heyyumi guide reserve    # 예약 요청을 보내기 전에
npx -y heyyumi guide live       # 실시간 문의를 보내기 전에
```

검색·예약·답변 규칙은 헤이유미 서버가 내려 준다. 이 문서보다 항상 최신이므로, 이 문서와 다르면 `guide`를 따른다. 규칙에 나오는 도구 이름(`search_places`, `request_reservation` 등)은 출력의 `commands`에 적힌 CLI 명령으로 실행한다.

### 2. 로그인 (머신당 한 번)

```bash
npx -y heyyumi status                 # signedIn 여부 확인
npx -y heyyumi login                  # 브라우저에서 구글 로그인, 끝나면 스스로 종료
npx -y heyyumi login --no-browser     # 로그인 URL만 stderr로 출력
```

`status`가 `signedIn:false`거나 어떤 명령이 종료 코드 3을 내면 `login`을 실행한다. **로그인과 약관 동의는 사용자가 직접 한다.** 에이전트가 구글 로그인 화면을 대신 누르지 않는다. `--no-browser`일 때는 stderr의 URL을 사용자에게 주고 같은 컴퓨터의 브라우저에서 열게 한다(콜백이 `127.0.0.1`로 돌아오므로 원격 셸에서는 안 된다). 토큰은 `~/.config/heyyumi/credentials.json`(0600)에 저장되고 자동 갱신된다. `logout`으로 지운다.

이미 대시보드 키(`hmp_...`)가 있으면 `HEYYUMI_API_KEY`로 넘겨도 된다. 키·토큰은 채팅에 출력하지 않는다.

### 3. 후보 찾기 (부작용 없음)

```bash
npx -y heyyumi search --region 을지로 --subtype coffee --atmosphere trendy --page-size 8
npx -y heyyumi search 파스타 --region 홍제동 --open_at "2026-10-25 19:00"
npx -y heyyumi place 324146172
```

전체 필터는 `npx -y heyyumi tools search_places`로 본다. 오타 난 플래그는 CLI가 거절하고 비슷한 이름을 알려 준다. 결과에 사용자에게 전할 안내 문구가 붙어 오면 사용자 언어로 전한다.

### 4. 예약 요청 (`clarify` 승인 후에만)

1. `npx -y heyyumi guide reserve`를 읽고 필요한 정보를 모은다. 빠진 값은 사용자에게 묻고 지어내지 않는다.
2. **`clarify`로 매장명·주소, 날짜·시각(요일 포함), 인원, 예약자 이름·번호, 요청사항을 보여 주고 "이 내용으로 매장에 예약 요청을 보낼까요? 선결제는 없고 실제 매장으로 전달됩니다"라고 승인받는다.** CLI에는 전송 없는 미리보기가 없어서 `reserve`를 실행하는 순간이 곧 전송이다.
3. 승인 후에만 실행한다.

```bash
npx -y heyyumi reserve 324146172 --time "2026-10-25 19:00" --party 2 --name "홍길동" --phone 010-1234-5678
```

4. 출력에 `cli.next`가 있으면 그 명령을 실행하고, 결과는 `guide reserve`에 적힌 대로 전한다. 확정 전에는 "예약 완료"라고 말하지 않는다. 네트워크 오류로 같은 요청을 다시 보낼 때는 `--idempotency-key`를 같은 값으로 준다.

### 5. 실시간 문의 (`clarify` 승인 후에만)

```bash
npx -y heyyumi guide live
npx -y heyyumi live PLACE_ID --kind wait --topic "웨이팅"
npx -y heyyumi live-wait QUERY_ID
```

예약처럼 승인받은 뒤 실행한다. 문의는 매장 휴대폰으로 바로 간다.

## Done when

- 검색 요청: 조건에 맞는 후보를 근거와 함께 제시했다.
- 예약 요청: 사용자 승인 후 `reserve`를 보냈고, 매장의 답이나 이후 확인 방법을 보고했다.
- 사용자가 승인하지 않았거나 필수 정보가 비어 있으면 **보내지 않은 상태로 끝냈다**고 밝혔다.

## Failure modes

| 증상 | 처리 |
| --- | --- |
| 종료 코드 3 | `login` 안내(사용자가 구글 로그인). `invalid_api_key`면 키를 확인하거나 unset 후 `login` |
| 종료 코드 2, `usage`/`unknown_option` | 메시지의 제안대로 플래그를 고친다 |
| 종료 코드 1, 그 밖의 `error.code` | `error.message`를 사용자 언어로 전하고 `error.next`나 `guide`가 안내하는 대로 한다. 같은 요청을 자동으로 되풀이하지 않는다 |
| `Unknown command "guide"` | 오래된 CLI 사본이다. `npx -y heyyumi@latest guide`로 실행한다 |

## Boundaries

- 개인의 대화형 사용을 위한 스킬이다. 무료는 개인 사용 기준이며 하루 질문 한도가 있다. 회사 제품·서비스에 넣는 상업 이용과 대량 수집은 헤이유미 별도 라이선스 대상이라 이 스킬로 하지 않는다. 대량 목록 요청이 막히면 조건을 좁힌다.
- 토큰·키·연락처를 저장소, 로그, 채팅에 남기지 않는다. 결제·카드 정보는 다루지 않는다(선결제 없음).
- 이 스킬은 헤이유미 공식 기능이 아니며 제휴 관계를 주장하지 않는다. 출처를 "헤이유미(HeyYumi)"로 표기한다.
