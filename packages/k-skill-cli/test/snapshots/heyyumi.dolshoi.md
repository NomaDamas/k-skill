# heyyumi — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- When booking is requested, continue past search results: use vault-backed login on the official surface, select the requested date/slot/seat, and complete reversible reservation or hold steps instead of stopping at a link.
- A successful reversible reservation or seat hold is a completed booking step: report the confirmation and any purchase deadline. If payment is required, call `clarify` with the exact itinerary/slot, party, seat/option, and total, then pay after approval and verify the receipt.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec heyyumi scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path heyyumi <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read heyyumi references/<file>`.

# HeyYumi (헤이유미) 맛집 검색 · 식당 예약

## What this skill does

헤이유미 공식 호스팅 MCP 서버(`https://mcp.heyyumi.ai/mcp`, Streamable HTTP)로 한국 식당·카페·바를 찾고, 같은 연결로 **예약 요청**과 **실시간 문의**(지금 메뉴 재고/웨이팅/즉시 착석)를 사장님에게 보낸다. **API 키 없이 구글 로그인만으로 쓸 수 있다.** k-skill-proxy는 쓰지 않는다. 헬퍼가 사용자 머신에서 헤이유미 서버로 직접 MCP 호출을 한다.

공식 표면만 쓴다. 크롤링·화면 스크래핑은 하지 않는다.

## When to use

- "홍제동에서 내일 저녁 2명 파스타집 예약해줘"
- "이 식당 지금 10명 앉을 수 있어? 웨이팅 얼마나?"
- 예약 가능한 식당만 골라 달라는 요청, 영어 응대·채식·주차 같은 조건 검색

쓰지 않는 경우: 매출 기반 순위/카드 데이터가 목적이면 `bccard-eatpl-search`, 길찾기·지도는 `kakao-map`. 영업시간·주차·반려동물 같은 정적 정보는 검색 결과로 답하고 실시간 문의로 사장님을 귀찮게 하지 않는다.

## Helper

```bash
npx -y @nomadamas/k-skill@0 exec heyyumi scripts/heyyumi.mjs -- <command> [options]
```

모든 명령은 JSON(`{ok, command, data, meta, units}` 또는 `{ok:false, error:{code, message, ...}}`)을 stdout에 출력한다.

| 명령 | 부작용 | 용도 |
| --- | --- | --- |
| `regions --dong 홍제동 [--sigungu 서대문구] [--sido 서울]` | 없음 | 동 이름 → 지역 코드·중심 좌표. 동명이동은 후보가 여러 개 나오므로 시도/시군구로 좁힌다 |
| `search --keyword ... [--region-code C] [--reservable true] [--reservation-channel yumi] [--open-at ...]` | 없음 | 매장 검색. 조건 플래그는 `npx -y @nomadamas/k-skill@0 read heyyumi references/search-filters.md` 참고 |
| `nearby --lat --lng [--radius 1000]` | 없음 | 좌표 주변 검색(가까운 순). `regions`의 center를 넣는다 |
| `place <place-id> [--fields core,contact_hours,quality]` | 없음 | 상세 |
| `reserve ... [--confirm]` | **있음** | 예약 요청. `--confirm` 없으면 전송 없이 미리보기 |
| `reservation-status <id> [--wait]` | 없음 | 상태 조회. `--wait`이면 서버에서 최대 약 25초 블록 |
| `live-ask ... [--confirm]` | **있음** | 사장님에게 실시간 문의. `--confirm` 없으면 미리보기 |
| `live-status <id> [--wait]` | 없음 | 답변 조회. `--wait`이면 서버에서 최대 약 25초 블록 |
| `login` | 로컬 토큰 파일 | 구글 로그인(OAuth), 아래 Auth 참고 |

내부적으로 MCP 도구 `resolve_regions`, `search_places`, `nearby_places`, `get_place`, `request_reservation`, `get_reservation`/`wait_for_reservation`, `request_live_status`, `get_live_status`/`wait_for_live_status`를 호출한다. `--wait`은 `wait_for_*`를 부른다. 아직 `pending`(`settled:false`)이면 같은 명령을 다시 호출한다. `--filter wifi=true`처럼 `key=value`를 반복해 `pet_friendly`, `private_room` 등 불리언 필터를 넘긴다. 샌드박스 모드는 없으므로 `--confirm`을 붙인 호출은 항상 실제 전송이다.

## Auth

우선순위: `KSKILL_HEYYUMI_API_KEY`(환경변수 또는 `~/.config/k-skill/secrets.env`, 선택) → `login`으로 저장한 구글 로그인 토큰.

**기본은 구글 로그인이다. 키는 필요 없다.**

1. 처음 쓰기 전에 `login`을 실행한다. 헬퍼가 헤이유미 인증 서버(`heyyumi.ai/.well-known/oauth-authorization-server`)에 동적 클라이언트 등록(RFC 7591) 후 PKCE(S256)와 `resource=https://mcp.heyyumi.ai`로 로컬 loopback 콜백을 열고 로그인 URL을 출력한다.
2. **사용자**가 그 URL을 같은 컴퓨터의 브라우저에서 열어 "이용약관과 개인정보처리방침에 동의" 체크 후 "Google로 계속하기"로 로그인·승인한다. 처음이면 헤이유미 계정이 자동 생성된다. 로그인·약관 동의는 사용자가 직접 하는 단계이며 에이전트가 대신 누르지 않는다.
3. 토큰은 `~/.config/k-skill/heyyumi-oauth.json`(0600)에 저장되고 만료 시 refresh된다. refresh까지 거절되면 `login_required`가 나오니 `login`을 다시 실행한다.

개인 대화형 사용은 무료이며 하루 약 20회 질문 한도가 있다(Plus 월 4,900원은 약 150회, 결제는 아직 준비 중). 한도를 넘으면 `rate_limited`가 나온다.

API 키(`hmp_...`, https://heyyumi.ai/dashboard)는 이미 가진 사람을 위한 대안이다. 같은 MCP 서버에 Bearer로 붙으며, 키가 있으면 로그인 토큰보다 우선한다. 키·토큰은 채팅에 붙여 넣게 하거나 출력하지 않는다.

## Workflow

### 1. 후보 찾기

- 동네 이름만 있으면 `regions --dong`으로 코드·좌표를 얻고, 후보가 여럿이면 사용자에게 시도/시군구를 확인한다.
- `search`로 조건을 건다. **예약이 목적이면 `--reservable true`** 를 기본으로 건다. `place`로 상세를 볼 때 `yumiBooking.canRequest`가 `true`인 매장만 예약 요청 대상이다.
- `--fields`는 필요한 만큼만 고른다(`core`=1토큰, `contact_hours`/`quality`=2, `edge`=4, `media`=8). 기본값은 `core,contact_hours`. 요청당 과금이며 `page_size`는 비용에 영향이 없다.
- 점수는 해석해서 보여 준다: `confidence`(0.3~0.98, 높을수록 신뢰), `freshnessScore`(0~1, 높을수록 최근). 낮다고 폐업으로 단정하지 않는다. `possiblyClosed`나 `closureSignal`이 있으면 사용자에게 알린다.
- 후보는 이름, 주소, 영업시간, 예약 가능 여부와 `placeUrl`을 붙여 2~5곳으로 정리한다.

### 2. 예약 정보 모으기

필수: 매장(`placeId`), 날짜·시각(한국시간, 오프셋 포함 ISO 8601 `2026-12-01T19:00:00+09:00`), 인원, **예약자 휴대폰 번호**. 이름은 강하게 권장, 요청사항(알레르기, 기념일, 좌석)은 선택이다. 번호가 한국 번호가 아니면(`+82`·`010` 이외) **이메일(`--email`)도 필수**다. 문자를 못 보내므로 결과를 이메일로 보낸다. 한국 번호 사용자에게는 이메일을 묻지 않는다. 빠진 값은 사용자에게 묻는다. 지어내지 않는다. 상대 날짜("내일")는 오늘 날짜로 절대 날짜로 바꿔 확인한다.

번호는 사장님의 노쇼·변경 연락에 쓰이고, 한국 번호면 진행 상황이 카카오톡/SMS로도 간다고 사용자에게 알린다.

### 3. 미리보기 → `clarify` → 전송

1. `reserve ...`를 `--confirm` 없이 실행해 `preview`를 만든다(전송 없음).
2. **`clarify`로 사용자에게 정확한 매장명, 날짜·시각, 인원, 연락처, 요청사항을 보여 주고 "이 내용으로 사장님에게 예약 요청을 보낼까요? 선결제는 없습니다"라고 승인받는다.** 승인 없이 `--confirm`을 붙이지 않는다. 문자와 사장님 푸시는 취소할 수 없는 외부 발송이다.
3. 승인 후 같은 인자에 `--confirm`을 붙여 실행한다. 멱등 키는 입력값에서 결정적으로 만들어지므로 같은 요청을 재시도해도 중복 예약이 생기지 않는다. 다른 시간·인원으로 다시 요청할 때는 값이 달라지므로 새 예약이 된다.
4. 응답은 `status: "pending"`이다. 이것은 **확정이 아니다.**

### 4. 결과 확인

`reservation-status <reservationId> --wait`를 `confirmed`/`cancelled`/`expired`/`no_show` 중 하나가 나올 때까지 반복한다(최대 약 5분). 사용자에게는 확정/거절/만료 중 최종 결과만 보고하고, 확정이면 매장·시각·인원을 다시 적는다. 만료·거절이면 다른 시간이나 다른 후보를 제안한다. 같은 시간을 자동으로 재요청하지 않는다.

### 5. 실시간 문의(선택)

"지금 그거 돼요?"류 질문(`--kind item` 재고, `wait` 웨이팅, `seats` 즉시 착석+`--topic "party of 10"`)은 `live-ask`로 보낸다. 사장님 앱에 푸시가 가므로 예약과 같은 방식으로 `clarify` 승인 후 `--confirm`을 붙인다. `--topic`은 문장이 아니라 짧은 토큰(실제 메뉴명, `wait`)이다. 답은 `live-status <queryId> --wait`로 받는다. 상태: `available`, `limited`, `unavailable`, `soon`, `not_offered`, `no_response`. 답에는 `verifiedAt`(확인 시각)과 사장님 메모(`note`, 예: 웨이팅 20분)가 같이 있으니 함께 전달한다. 이미 유효한 답이 있으면 서버가 재사용한다(`reused: true`).

## Done when

- 검색 요청: 조건에 맞는 후보를 신뢰도·최신성과 함께 제시했다.
- 예약 요청: 사용자 승인 후 요청을 전송했고, `reservation-status`로 **settled 결과(확정/거절/만료)** 를 확인해 보고했다. `pending`에서 멈춘 채 "예약 완료"라고 말하지 않는다.
- 사용자가 승인하지 않았거나 전송 전 조건이 충족되지 않았으면 미전송 상태로 끝냈다고 명시한다.

## Failure modes

| 코드 | 의미 | 처리 |
| --- | --- | --- |
| `missing_credentials` | 로그인/키 없음 | `login` 안내(구글 로그인) |
| `login_required` | 저장된 로그인이 만료·폐기됨 | `login` 재실행 |
| `unauthorized` (401/403) | 로그인 토큰 또는 키 거절 | `login` 재실행(키를 쓰는 중이면 키 확인) |
| `rate_limited` (429) | 하루 질문 한도(무료 약 20회) 등 | `retryAfter`가 있으면 그만큼 대기, 없으면 내일 다시 또는 Plus/API 키 안내 |
| `reservation_not_available` (422) | 이 매장은 헤이유미로 예약 불가 | **재시도 금지.** 전화 예약 등 다른 방법 안내 |
| `reservation_requests_closed` (422) | 비파트너 매장은 매일 11:00~21:00 KST만 접수 | `retryAfter` 이후에 다시 안내 |
| `venue_closed_at_requested_time` (422) | 요청 시각에 매장 휴무/영업 외 | 다른 시각 제안 |
| `live_status_not_available` (422) | 사장님 앱이 없는 매장 | 재시도 금지, 검색 결과의 영업시간 등으로 답 |
| `blocked: closed_now` | 지금 영업 시간이 아니라 문의 안 보냄 | 영업시간 안내 |
| `invalid_input` / `reservation_time_past` / `guest_phone_required` / `guest_email_required` | 입력 오류 | 값을 사용자에게 다시 확인해 수정. 같은 값으로 재시도하지 않는다 |
| `bulk_export_required` | 결과창 초과 | 조건을 좁힌다. 대량 수집은 하지 않는다 |
| `venue_not_found` / `reservation_not_found` | 매장/예약 없음 | `search`로 `placeId` 재확인 |
| `mcp_error` / `tool_error` | MCP 프로토콜 또는 도구 오류 | 메시지를 그대로 사용자에게 알리고 입력을 점검 |
| `upstream_error` (5xx) | 서버 오류 | 잠시 후 한 번 재시도 |

## Boundaries

- 개인의 대화형 사용(무료 하루 약 20회)을 위한 스킬이다. `login`은 로컬 loopback으로 돌아오므로 브라우저를 같은 컴퓨터에서 열어야 한다(원격 서버 셸이면 불가). 회사 제품·서비스에 넣는 상업 이용과 대량·전체 데이터 수집은 헤이유미 별도 라이선스/Bulk Export 대상이므로 이 스킬로 하지 않는다.
- 로그인 토큰·키·연락처를 저장소, 로그, 채팅에 남기지 않는다.
- 결제·카드 정보는 다루지 않는다(이 API는 선결제가 없다).
- 이 스킬은 헤이유미 공식 기능이 아니며 헤이유미와 제휴 관계를 주장하지 않는다. 출처를 "헤이유미(HeyYumi)"로 표기한다.
