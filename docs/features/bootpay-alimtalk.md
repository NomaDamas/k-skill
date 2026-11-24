# 부트페이 알림톡 발송

`bootpay-alimtalk` 스킬은 부트페이 알림톡 REST API로 카카오 알림톡을 조회·발송한다. 사용자별로 과금되는 API라 hosted `k-skill-proxy` 를 쓰지 않고, 사용자의 부트페이 키로 사용자 PC에서 바로 호출한다(BYOK). helper는 Python 표준 라이브러리만 쓴다.

이 스킬은 부트페이 팀이 기여했다.

## 제공 기능

- 연동 카카오 채널·승인 템플릿 상태 확인 (`status`, `senders`)
- 공식 템플릿 검색·상세·문구 추천 (`official-search`, `official`, `recommend`)
- 자체 템플릿 목록·상세 (`templates`, `template`)
- 발송 미리보기 (`preview`) — 필수 변수, 휴대폰 번호 형식, 발송 제외 목록, `ref_id` 중복, 인원 상한 검사와 치환된 본문
- 단건·벌크 발송 (`send`), 예약 취소 (`cancel`) — `--yes-i-understand` 가 있어야 실제로 나간다
- 발송내역·결과·기간 집계 (`messages`, `message`, `stats`), 발송 제외 대조 (`optout-check`)

채널 연결·템플릿 등록·검수 요청은 범위 밖이다. 부트페이 관리자에서 한다.

## 시크릿

`~/.config/k-skill/secrets.env`(권한 `0600`) 또는 환경변수:

```dotenv
KSKILL_BOOTPAY_CLIENT_KEY=...
KSKILL_BOOTPAY_SECRET_KEY=...
KSKILL_BOOTPAY_ALIMTALK_SENDER_KEY=      # 선택: 연동 채널이 둘 이상일 때
KSKILL_BOOTPAY_ALIMTALK_MAX_RECIPIENTS=  # 선택: 1회 발송 인원 상한, 기본 10
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

- 알림톡 개요: <https://commerce.bootpay.ai/alimtalk/overview>
- 발송·운영 개요: <https://commerce.bootpay.ai/alimtalk-ops/overview>
