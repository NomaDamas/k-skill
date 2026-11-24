# 부트페이 알림톡

## What this skill does

부트페이 알림톡 REST API(`https://message.bootapi.com/alimtalk`)로 카카오 알림톡을 보낸다. 번들 helper `scripts/bootpay_alimtalk.py` 는 Python 표준 라이브러리만 쓴다.

- 연동 채널·승인 템플릿 상태 확인
- 공식 템플릿(검수 없이 바로 쓰는 공용 템플릿) 검색·추천, 자체 템플릿 조회
- 발송 미리보기: 필수 변수, 휴대폰 번호 형식, 발송 제외 목록, `ref_id` 중복, 예약 시각, 인원 상한을 검사하고 치환된 본문을 보여 준다
- 사용자 승인 후 단건·벌크 발송, 예약 취소
- 발송내역·결과·기간 집계 조회

사용자별로 과금되는 API라 `k-skill-proxy` 를 거치지 않는다. 사용자의 부트페이 키로 사용자 PC에서 바로 호출한다.

## When to use

- "고객한테 주문 완료 알림톡 보내줘"
- "재입고 알림에 쓸 공식 템플릿 찾아줘"
- "어제 보낸 알림톡 실패한 거 있어?"
- "내일 오전 10시에 예약 알림톡 걸어줘" / "그 예약 취소해줘"

## 사전 준비 (사용자가 해야 하는 것)

에이전트가 대신할 수 없다. 빠진 것이 있으면 어디서 하는지 알려 주고 멈춘다.

1. 부트페이 관리자(https://admin.bootpay.co.kr) 가입, 프로젝트의 Client Key · Secret Key 확인. 범위 키라면 알림톡 스코프(`user:alimtalk_*`)가 있어야 한다. 전체 권한(supervisor) 키는 모든 알림톡 API를 부를 수 있다
2. 카카오비즈니스(https://business.kakao.com/dashboard)에서 비즈니스 채널 전환, 채널 공개 ON, 검색 허용 ON
3. 부트페이 관리자에서 카카오 채널 연결 (채널 관리자 휴대폰으로 인증번호가 간다)
4. 부트페이 관리자에서 API 알림톡 충전 (선불 · 건당 과금, https://admin.bootpay.co.kr/notification/edit?cursor=subscribe)

## 인증/시크릿

```dotenv
KSKILL_BOOTPAY_CLIENT_KEY=...
KSKILL_BOOTPAY_SECRET_KEY=...
# 선택
KSKILL_BOOTPAY_ALIMTALK_SENDER_KEY=      # 연동 채널이 둘 이상일 때 보낼 채널의 발신 프로필 키
KSKILL_BOOTPAY_ALIMTALK_MAX_RECIPIENTS=  # 1회 발송 인원 상한. 기본 10 (새 프로젝트의 분당 한도)
```

`@bootpay/mcp` 와 같은 이름인 `BOOTPAY_COMMERCE_CLIENT_KEY` · `BOOTPAY_COMMERCE_SECRET_KEY` · `BOOTPAY_ALIMTALK_SENDER_KEY` 도 읽는다. 발신 프로필 키와 인원 상한은 사용자가 정하는 값이다. 에이전트가 대화 중에 바꾸지 않는다.

## Workflow

```bash
# 1. 키가 있는지 확인 (값은 출력하지 않는다)
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- config-check

# 2. 연동 채널과 승인 템플릿 수. next_steps 가 있으면 사용자에게 그대로 전한다
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- status

# 3. 템플릿 고르기
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- official-search --q 재입고
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- recommend --text "주문하신 상품이 출고됐어요"
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- official G_ORDER_COMPLETE_user
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- templates --ins approved

# 4. 미리보기 (보내지 않는다)
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- preview \
  --template G_ORDER_COMPLETE_user --to 01012345678 \
  --var company_name=부트페이몰 --var user_name=홍길동 --ref-id order-20260827-0001

# 5. 승인 후 발송
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- send \
  --template G_ORDER_COMPLETE_user --to 01012345678 \
  --var company_name=부트페이몰 --var user_name=홍길동 --ref-id order-20260827-0001 \
  --yes-i-understand

# 6. 결과 확인
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- message <receipt_id>
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- messages --status failed --s-at 2026-08-26T00:00:00+09:00
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- stats --s-at 2026-08-01T00:00:00+09:00
```

### 템플릿 고르는 규칙

- 공식 템플릿 코드는 `G_` 로 시작한다. 채널에 그룹키가 등록돼 있으면(`status` 의 `group_key_registered: true`) 검수 없이 바로 보낼 수 있다
- 자체 템플릿(`BT_`)은 `inspection_status` 가 `approved` 일 때만 나간다. 템플릿 등록·검수 요청은 이 스킬 범위 밖이다. 부트페이 관리자에서 한다
- `required_variables` 를 모두 채운다. `variable_examples` 는 미리보기용 예문이라 발송값이 아니다. 값을 지어내지 말고 사용자에게 받는다
- 알림톡은 정보성 메시지 전용이다. 광고·홍보 문구를 변수에 넣지 않는다

### 벌크 발송

수신자를 JSON 배열 파일로 만든다.

```json
[
  {"to": "01012345678", "variables": {"company_name": "부트페이몰", "user_name": "홍길동"}, "ref_id": "order-1"},
  {"to": "01087654321", "variables": {"company_name": "부트페이몰", "user_name": "김철수"}, "ref_id": "order-2"}
]
```

```bash
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- preview --template G_ORDER_COMPLETE_user --file recipients.json
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- send --template G_ORDER_COMPLETE_user --file recipients.json --yes-i-understand
```

발송 한도를 넘으면 벌크 요청 전체가 거부된다. 새 프로젝트의 한도는 분당 10 · 시간당 100 · 하루 500건이다. 상한보다 많으면 helper가 막는다. 나눠 보낸다.

### 예약 발송과 취소

`--reserved-at 2026-08-27T10:00:00+09:00` 처럼 시간대 오프셋을 붙인다. 서버는 해석하지 못한 값이나 지난 시각을 받으면 즉시 발송하므로, helper가 오프셋 없는 값·지난 시각·잘못된 형식을 먼저 막는다. 예약 취소는 `cancel <receipt_id> --yes-i-understand` 로 하고, 전송이 시작된 건은 취소되지 않는다.

### 승인 경계

- `send` 를 `--yes-i-understand` 없이 부르면 미리보기만 돌려준다. 그 미리보기(템플릿 · 수신자 수 · 치환된 본문 · 예약 시각)를 사용자에게 보여 주고 승인받은 뒤 같은 인자에 `--yes-i-understand` 만 붙인다
- 알림톡에는 샌드박스가 없다. 승인받은 발송은 실제 카카오톡으로 나가고 성공한 건마다 과금된다. 테스트는 사용자 본인 번호로 한 건만 보낸다
- `ref_id` 는 멱등 키다. 같은 값으로 다시 보내면 새로 나가지 않고 기존 접수가 돌아온다(실패 건만 재발송된다). 주문번호처럼 고유한 값을 쓰고, 비우면 helper가 `kskill-…` 값을 만들어 응답에 돌려준다

## Done when

- `status` 로 연동 채널과 승인 템플릿을 확인했다
- 발송 요청이면 `preview` 의 `blockers` 가 비어 있고, 사용자가 미리보기를 승인한 뒤 `send --yes-i-understand` 응답의 `receipt_id`(벌크는 `requested` 건수)와 `ref_ids` 를 사용자에게 전했다
- 접수 직후는 `requested` 다. 사용자가 결과를 원하면 `message <receipt_id>` 로 `success`/`failed` 가 확정된 상태를 보고한다
- 조회 요청이면 요청한 내역·집계를 보여 줬다

## Failure modes

helper는 실패하면 `ok:false` 와 `error_code` · `message` · `hint` · `request_id` 를 출력한다. `hint` 를 사용자에게 그대로 전한다.

- `CREDENTIALS_REQUIRED`: 키가 없다. 위 인증/시크릿 절을 안내한다
- `API_SCOPE_INVALID`: 범위 키에 알림톡 스코프가 없다
- `SENDER_NOT_LINKED`: 연동 채널이 없거나 `sender_key` 가 틀렸다. 사전 준비 2~3을 안내한다
- `TEMPLATE_NOT_APPROVED`: 자체 템플릿이 미승인이거나, 그룹키 없는 채널로 공식 템플릿을 보내려 했다
- `TEMPLATE_VARIABLE_MISSING`: 필수 변수가 비었다
- `NOTIFICATION_NEED_PAYMENT` · `MESSAGE_PREPAID_NOT_CHARGED` · `SERVICE_CHARGE_BALANCE_INSUFFICIENT`: 알림톡 충전 설정·잔액 문제다. 충전 화면 주소를 안내한다
- `RATE_LIMIT_EXCEEDED`: 발송 한도 초과. 나눠 보낸다
- `SEND_NOT_CANCELABLE`: 이미 전송에 들어간 건이다
- `UPSTREAM_UNAVAILABLE` + `accepted: unknown`: 서버가 접수했는지 모른다. 다시 보내기 전에 `messages --ref-id <값>` 으로 확인하고, 다시 보낼 때는 같은 `ref_id` 를 쓴다
- 발송 제외 목록에 있는 번호는 건너뛰고 과금하지 않는다. 미리보기 `warnings` 에 표시된다
- 채널 개설·비즈니스 심사·템플릿 검수는 카카오와 부트페이 관리자에서 사람이 하는 단계다. 우회하지 않는다

## 공식 문서

- 알림톡 개요·인증·스코프: https://commerce.bootpay.ai/alimtalk/overview
- 발송·운영(한도·발송내역·웹훅·발송 제외): https://commerce.bootpay.ai/alimtalk-ops/overview
- 단건 발송: https://commerce.bootpay.ai/alimtalk-ops/send/send
- 벌크 발송: https://commerce.bootpay.ai/alimtalk-ops/send/bulk
- 공식 템플릿 검색: https://commerce.bootpay.ai/alimtalk/official/search
