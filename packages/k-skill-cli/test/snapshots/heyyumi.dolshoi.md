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

# HeyYumi (헤이유미) 예약 가능한 맛집 검색 · 식당 예약

## What this skill does

헤이유미 공식 CLI(`heyyumi`, npm, https://github.com/hmp-dev/heyyumi-cli)로 한국 식당·카페·바를 찾고, **예약 가능한 매장에는 예약 요청을 보낸 뒤 사장님의 수락/거절/만료까지 확인**한다. 같은 CLI로 "지금 자리 있어요? 웨이팅 몇 분이에요?" 같은 실시간 문의도 사장님에게 보낸다.

- 구글 로그인 한 번이면 쓴다. 로그인할 때 사용자 전용 키가 자동으로 만들어진다. 직접 키를 발급하거나 붙여 넣을 필요 없다.
- 공식 CLI만 쓴다. 크롤링·화면 스크래핑은 하지 않고, k-skill-proxy도 쓰지 않는다. 호출은 사용자 머신에서 헤이유미 서버로 직접 간다.
- 예약은 선결제가 없다. 요청은 매장 사장님에게 가며 약 5분 안에 수락/거절이 정해진다.

## When to use

- "을지로 힙한 카페 찾아서 예약해줘", "홍제동 저녁 2명 파스타집 예약 가능한 곳"
- "이 식당 예약돼? 지금 10명 앉을 수 있어? 웨이팅 몇 분이야?"
- 예약 가능한 곳만 골라 달라는 요청, 주차·채식·영어 응대·분위기 조건 검색

쓰지 않는 경우: 매출 기반 순위가 목적이면 `bccard-eatpl-search`, 길찾기·지도는 `kakao-map`, KTX·버스 예약은 해당 스킬. 영업시간·주차 같은 정적 정보는 검색 결과로 답하고 실시간 문의로 사장님을 귀찮게 하지 않는다.

## Run

```bash
npx -y heyyumi@0 <command> [flags]
```

출력은 stdout의 JSON이고(파이프 시 한 줄, `--pretty`로 들여쓰기) 진행 로그는 stderr로 간다. 종료 코드: `0` 정상, `1` 서버/도구 오류, `2` 사용법 오류, `3` 로그인 필요. 오류 JSON은 `error.code`, `error.message`, `error.next`를 가진다.

### 1. 로그인 (머신당 한 번)

```bash
npx -y heyyumi@0 status          # signedIn 여부 확인
npx -y heyyumi@0 login           # 브라우저에서 구글 로그인, 끝나면 스스로 종료
npx -y heyyumi@0 login --no-browser   # 로그인 URL만 stderr로 출력(원격/에이전트 환경)
```

`status`가 `signedIn:false`거나 어떤 명령이 종료 코드 3(`login_required`)을 내면 `login`을 실행한다. **로그인과 약관 동의는 사용자가 직접 한다.** 에이전트가 구글 로그인 화면을 대신 누르지 않는다. `--no-browser`로 띄우면 stderr에 `https://heyyumi.ai/oauth/authorize?...` URL이 나오니 그 URL을 사용자에게 주고 같은 컴퓨터의 브라우저에서 열게 한다(콜백이 `127.0.0.1`로 돌아오므로 원격 셸에서는 안 된다). 로그인이 끝나면 프로세스가 스스로 끝난다(기본 5분 대기, `--timeout`). 토큰은 `~/.config/heyyumi/credentials.json`(0600)에 저장되고 자동 갱신된다. `logout`으로 지운다.

이미 대시보드 키(`hmp_...`)가 있으면 `HEYYUMI_API_KEY`로 넘겨도 된다(로그인 생략). 키·토큰은 채팅에 출력하지 않는다.

### 2. 후보 찾기 (부작용 없음)

```bash
npx -y heyyumi@0 regions 을지로                     # 지역 확인(좌표, placeCount)
npx -y heyyumi@0 search --region 을지로 --subtype coffee --atmosphere trendy --reservation_channel yumi --page-size 8
npx -y heyyumi@0 search 파스타 --region 홍제동 --reservation_channel yumi --open_at "2026-10-25 19:00"
npx -y heyyumi@0 nearby --lat 37.5662 --lng 126.991 --radius 800
npx -y heyyumi@0 place 324146172 --fields quality,contact_hours,edge
```

- **예약 가능한 곳만 보려면 `--reservation_channel yumi`.** 이것이 "여기서 예약 요청을 받는 매장"(`yumiBooking.canRequest=true`)이다. `--reservable true`는 예약 의사 표현일 뿐 요청 가능 보장이 아니다. 0건이면 서버가 조건을 넓히고 `meta.reservationFallback`에 안내문을 넣으니 그대로 사용자에게 전한다.
- 검색은 지역/음식과 함께 쓴다. 지역 없이 파트너 전체를 나열하면 `partner_scope_required`가 나온다.
- 플래그는 도구 필터 이름 그대로다(`--region`→`region_name`). 오타는 CLI가 거절하고 비슷한 이름을 알려 준다. 전체 어휘는 `npx -y heyyumi@0 tools search_places`.
- 자주 쓰는 값: `--subtype`(`coffee`, `dessert`, `bakery`, `brunch`, `korean`, `italian`, `cocktail_bar`, `korean_bbq` …, 쉼표=OR, 한국어도 됨), `--atmosphere`(`trendy`, `cozy`, `quiet`, `lively`, `view`, `spacious` …), `--recommended_for`(`date`, `group_dining`, `business_meeting` …), `--open_at`(한국시간 `"2026-10-25 19:00"`), 불리언은 값 없이 `--parking`.
- **`--atmosphere`는 순위 가중치일 뿐 걸러내지 않는다.** `meta.softenedFilters`에 나열된 조건은 "확정 매칭이 아니라 선호 정렬"이라고 사용자에게 알린다. "힙한" 같은 요청은 `atmosphere`에 `trendy`가 있는지, `aiSummary`, 메뉴, 리뷰 수, 인스타(`snsLinks`)로 근거를 보여 준다.
- 응답: 검색은 `{success, data:[...], meta, locationNote}`, 상세는 `{success, data:{...}}`. 매장 id는 `data[].id`.
- 결과 해석: `confidence`(0~1, 높을수록 신뢰), `freshnessScore`(0~1, 높을수록 최근), `possiblyClosed`/`closureSignal`이 있으면 알린다. `openNow`와 `hours`는 한국시간. 점수가 낮다고 폐업으로 단정하지 않는다.
- `locationNote`는 어느 지역을 검색했는지 한 줄로 알리라는 지시다. 행정동 코드·"읍/면" 같은 용어 없이 "을지로 상권을 찾았어요"처럼 말하고, 같은 이름의 다른 지역일 수 있으면 짧게 되묻는다.
- 후보는 이름, 주소, 가까운 역, 오늘/해당 시각 영업 여부, 예약 가능 여부(파트너 여부와 `requestHours`), `placeUrl`을 붙여 2~5곳으로 정리한다.

### 3. 예약 가능 여부 판단

검색·상세 결과의 `yumiBooking`을 읽는다.

| 값 | 의미 |
| --- | --- |
| `canRequest: true, partner: true, requestHours: "anytime"` | 유미 파트너. 언제든 요청 가능, 응답이 빠르고 실시간 문의도 가능 |
| `canRequest: true, partner: null, requestHours: "11:00-21:00 KST"` | 비파트너. **매일 11:00~21:00 KST에만 요청을 받는다.** 그 밖 시간이면 `reservation_requests_closed`와 `retryAfter` |
| `canRequest: false` 또는 `yumiBooking` 없음 | 이 CLI로는 예약 요청 불가. `reservationChannels`/`phone`/`bookingUrl`로 전화·외부 예약을 안내 |

예약 요청 가능 시각과 매장 영업시간은 별개다. 영업 요일·시간(`hours`, `openNow`)도 확인하고, 휴무 요일이나 영업 외 시간이면 사용자에게 알리고 시각을 바꾼다.

### 4. 예약 정보 모으기

필수: 매장(`PLACE_ID`), 날짜·시각(한국시간), 인원(`--party`), **예약자 휴대폰 번호(`--phone`)**. 이름(`--name`)은 강하게 권장하고, `--note`(알레르기·기념일·좌석)와 `--lang`은 선택이다. 한국 번호가 아니면 **`--email`이 필수**다(문자를 못 보내 이메일로 결과를 보낸다). 한국 번호 사용자에게는 이메일을 묻지 않는다.

빠진 값은 사용자에게 묻는다. 지어내지 않는다. "내일", "토요일"은 오늘 날짜 기준 절대 날짜로 바꿔 확인한다. `--time`은 `"2026-10-25 19:00"` 형식(한국시간)이며 날짜 없이 `"19:00"`만 주면 CLI가 거절한다. CLI에는 전송 없는 미리보기나 샌드박스가 없으므로 **`reserve`를 실행하는 순간이 곧 전송이다.**

### 5. 승인(`clarify`) → 전송

1. **`clarify`로 정확한 매장명·주소, 날짜·시각(요일 포함), 인원, 예약자 이름·번호(·이메일), 요청사항을 보여 주고 "이 내용으로 사장님에게 예약 요청을 보낼까요? 선결제는 없고 실제 매장으로 전달됩니다"라고 승인받는다.** 승인 전에는 `reserve`를 실행하지 않는다. 사장님 푸시와 손님 문자는 취소할 수 없다.
2. 승인 후에만 실행한다.

```bash
npx -y heyyumi@0 reserve 324146172 --time "2026-10-25 19:00" --party 2 --name "홍길동" --phone 010-1234-5678 --note "창가 자리"
```

3. 응답에 `reservationId`와 `cli.next`(`heyyumi wait <id>`)가 오면 **요청이 접수됐을 뿐 확정이 아니다.** 같은 요청을 다시 보내야 할 때(네트워크 오류 등)는 `--idempotency-key`를 같은 값으로 줘서 중복 예약을 막는다. 값이 다르면 새 예약이다.

### 6. 결과 확인

```bash
npx -y heyyumi@0 wait RESERVATION_ID --timeout 110
```

`confirmed` / `cancelled` / `expired` 중 하나가 나올 때까지 기다린다(사장님 응답 최대 약 5분). 끝나지 않고 `cli.next`가 오면 같은 명령을 다시 실행한다. 한 번 상태만 볼 때는 `reservation RESERVATION_ID`. 확정이면 매장·시각·인원을 다시 적어 알리고, 거절·만료면 다른 시각이나 다른 후보를 제안한다. **같은 시간을 자동으로 재요청하지 않는다.** `pending`에서 멈춘 채 "예약 완료"라고 말하지 않는다.

### 7. 실시간 문의 (선택, 사장님에게 푸시가 간다)

```bash
npx -y heyyumi@0 live PLACE_ID --kind wait --topic "웨이팅"
npx -y heyyumi@0 live PLACE_ID --kind seats --topic "party of 10"
npx -y heyyumi@0 live PLACE_ID --kind item --topic "바스크 치즈케이크"
npx -y heyyumi@0 live-wait QUERY_ID --timeout 110
```

예약과 같이 `clarify` 승인 후 실행한다. `--topic`은 문장이 아니라 짧은 토큰(실제 메뉴명, `웨이팅`)이다. 답에는 상태(`available`, `limited`, `unavailable`, `soon`, `not_offered`, `no_response`)와 확인 시각, 사장님 메모(예: 웨이팅 20분)가 있으니 함께 전한다. 파트너 매장에서만 된다.

## Done when

- 검색 요청: 조건에 맞는 후보를 신뢰도·최신성·예약 가능 여부와 함께 제시했다. 선호 정렬로만 반영된 조건은 그렇게 밝혔다.
- 예약 요청: 사용자 승인 후 `reserve`를 보냈고, `wait`로 **`confirmed`/`cancelled`/`expired`** 를 확인해 보고했다.
- 사용자가 승인하지 않았거나 필수 정보가 비어 있으면 **미전송 상태로 끝냈다**고 명시한다.

## Failure modes

| 증상 | 의미 | 처리 |
| --- | --- | --- |
| 종료 코드 3, `login_required` | 로그인 안 됨/만료/거절 | `login` 안내(사용자가 구글 로그인) |
| `invalid_api_key` | `HEYYUMI_API_KEY` 거절 | 키를 확인하거나 unset 후 `login` |
| 종료 코드 2, `usage`/`unknown_option` | 인자 오류·오타 | 메시지의 제안대로 수정. 오타 난 `--nme`가 이름 없는 예약이 되지 않도록 CLI가 거절한다 |
| `reservation_not_available` | 이 매장은 헤이유미로 예약 불가 | **재시도 금지.** 전화·외부 예약 안내 |
| `reservation_requests_closed` | 비파트너 매장 요청 시간(11:00~21:00 KST) 밖 | `retryAfter` 이후에 다시 안내 |
| `venue_closed_at_requested_time` | 요청 시각이 휴무/영업 외 | 다른 시각 제안 |
| `reservation_time_past` | 지난 시각 | 시각 확인 |
| `guest_phone_required` / `guest_email_required` | 연락처 누락 | 사용자에게 다시 묻기 |
| `live_status_not_available` | 사장님 앱이 없는 매장 | 재시도 금지, 검색 결과의 영업시간으로 답 |
| `partner_scope_required` | 지역 없이 파트너 나열 | 지역이나 음식을 받아 다시 검색 |
| `http_error`/`rpc_error`, 종료 코드 1 | 서버 오류·한도 | 메시지를 그대로 알리고 잠시 후 한 번만 재시도 |

## Boundaries

- 개인의 대화형 사용을 위한 스킬이다. 무료는 개인 사용 기준이며 하루 질문 한도가 있다. 회사 제품·서비스에 넣는 상업 이용과 대량 수집은 헤이유미 별도 라이선스 대상이라 이 스킬로 하지 않는다. 대량 목록 요청이 `bulk_export_required`로 막히면 조건을 좁힌다.
- 토큰·키·연락처를 저장소, 로그, 채팅에 남기지 않는다. 결제·카드 정보는 다루지 않는다(선결제 없음).
- 이 스킬은 헤이유미 공식 기능이 아니며 제휴 관계를 주장하지 않는다. 출처를 "헤이유미(HeyYumi)"로 표기한다.
