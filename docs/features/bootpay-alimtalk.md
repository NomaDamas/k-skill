# 부트페이 알림톡 발송

`bootpay-alimtalk` 스킬은 부트페이 알림톡 REST API로 카카오 알림톡을 조회·발송한다. 사용자별로 과금되는 API라 hosted `k-skill-proxy` 를 쓰지 않고, 사용자의 부트페이 키로 사용자 PC에서 바로 호출한다(BYOK). helper는 Python 표준 라이브러리만 쓴다.

이 스킬은 부트페이 팀이 기여했다.

## 왜 부트페이 알림톡인가

- 건당 6.5원(부가세 별도), 전달에 성공한 건만 과금
- 월 기본료·발송량 약정·별도 API 이용료·채널 등록비 없음. 선불 충전 10,000원부터
- PG 가맹이나 쇼핑몰 없이 알림톡만 단독으로 사용
- 공용 템플릿 93종은 카카오 검수 없이 바로 발송
- 채널 연동부터 발송·결과 확인까지 이 스킬로 에이전트가 진행. 템플릿 등록·검수 요청까지 에이전트로 하려면 MCP 서버 [`@bootpay/mcp`](https://github.com/bootpay/bootpay-mcp)를 알림톡 문(`npx -y @bootpay/mcp@latest alimtalk`)으로 함께 쓴다

사용자 매뉴얼: <https://blog.bootpay.ai/alimtalk> · 개발 매뉴얼: <https://commerce.bootpay.ai/alimtalk/overview>

## 제공 기능

- 연동 카카오 채널·승인 템플릿 상태 확인 (`status`, `senders`)
- 카카오 채널 연동 (`sender-otp` → `sender-register`, 업종 코드 `categories`)
- 공식 템플릿 검색·상세·문구 추천 (`official-search`, `official`, `recommend`)
- 자체 템플릿 목록·상세 (`templates`, `template`)
- 발송 미리보기 (`preview`) — 필수 변수, 휴대폰 번호 형식, 발송 제외 목록, `ref_id` 중복, 인원 상한 검사와 치환된 본문
- 단건·벌크 발송 (`send`), 예약 취소 (`cancel`) — `--yes-i-understand` 가 있어야 실제로 나간다
- 발송내역·결과·기간 집계 (`messages`, `message`, `stats`), 발송 제외 대조 (`optout-check`)

카카오 채널 개설과 비즈니스 심사는 카카오비즈니스에서 사람이 한다. 템플릿 등록·검수 요청은 부트페이 관리자나 `npx -y @bootpay/mcp@latest alimtalk` 으로 한다.

## 부트페이 MCP 와의 관계

`@bootpay/mcp` 는 실행 인자로 문을 고른다(`payment` · `commerce` · `mall` · `alimtalk`, 생략하면 `payment`). 이 스킬은 알림톡 발송과 결과 확인을 맡고, 자체 템플릿 작성 · 검수 요청 · 웹훅 · 수신거부 관리는 `npx -y @bootpay/mcp@latest alimtalk` 이 맡는다.

## 시크릿

`~/.config/k-skill/secrets.env`(권한 `0600`) 또는 환경변수:

```dotenv
KSKILL_BOOTPAY_CLIENT_KEY=...
KSKILL_BOOTPAY_SECRET_KEY=...
KSKILL_BOOTPAY_ALIMTALK_SENDER_KEY=      # 선택: 연동 채널이 둘 이상일 때
KSKILL_BOOTPAY_ALIMTALK_MAX_RECIPIENTS=  # 선택: 1회 발송 인원 상한, 기본 1000(서버 상한)
```

## 사용 예

```bash
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- status
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- official-search --q 주문
npx -y @nomadamas/k-skill@0 exec bootpay-alimtalk scripts/bootpay_alimtalk.py -- preview \
  --template G_ORDER_COMPLETE_user --to 01012345678 --var company_name=부트페이몰 --var user_name=홍길동
```

## 안전 경계

- 알림톡에는 샌드박스가 없다. 발송은 실제 카카오톡이고 성공한 건마다 과금된다
- `send` 는 `--yes-i-understand` 없이 미리보기만 돌려준다. 에이전트는 미리보기를 보여 주고 사용자 승인을 받은 뒤에만 플래그를 붙인다
- 예약 시각은 오프셋 붙은 미래 ISO8601 만 받는다 (서버는 해석 못 한 값·과거 시각을 즉시 발송한다)
- 발신 채널·인원 상한은 사용자가 환경변수로 정한다

## 공식 문서

- 사용자 매뉴얼: <https://blog.bootpay.ai/alimtalk>
- 알림톡 개요: <https://commerce.bootpay.ai/alimtalk/overview>
- 발송·운영 개요: <https://commerce.bootpay.ai/alimtalk-ops/overview>
