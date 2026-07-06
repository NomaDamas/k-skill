---
name: court-payment-order-assistant
description: 법원 전자소송 지급명령 신청을 위해 채권자·채무자·청구금액·청구원인·증빙 정보를 인터뷰하고, 신청서 초안과 공식 전자소송 브라우저 입력 handoff를 준비한다.
license: MIT
metadata:
  category: legal
  locale: ko-KR
  phase: v1
---

# Court Payment Order Assistant

## What this skill does

대한민국 법원 전자소송 포털에서 **지급명령(독촉) 신청**을 준비해야 할 때, 사용자가 제공한 채권자·채무자·청구내용·증빙 정보를 정리해 신청서 초안, 누락 질문, 첨부 체크리스트, 브라우저 handoff 절차를 만든다.

이 스킬은 참고용 작성 보조다. 법률 자문, 승소 가능성 판단, 관할 확정, 최종 제출 대행을 하지 않는다.

## When to use

- "떼인 돈 지급명령 신청 준비해줘"
- "전자소송에서 지급명령 신청서 입력 도와줘"
- "채무자 정보랑 증빙으로 지급명령 초안 만들어줘"
- "로그인은 내가 할 테니 입력할 내용 정리해줘"

## Prerequisites

- Node.js 18+
- Aside Browser 우선 사용
- 사용자가 직접 처리할 것: 전자소송 로그인, 공동/금융인증서 또는 간편인증, 보안 프로그램, 전자서명, 인지대/송달료 결제, 최종 제출

## Public access path discovered

Official portal:

```text
https://ecfs.scourt.go.kr/psp/index.on
```

Observed public surface:

- 전자소송 포털은 공개 상태에서 로그인/사용자등록, `서류제출`, `민사 서류` 영역을 보여준다.
- 문서 작성은 로그인 이후 가능하다는 경계가 표시된다.
- 나홀로소송/도움말 영역에서 지급명령(독촉) 설명 진입점을 확인할 수 있다.
- `https://ecfs.scourt.go.kr/ecf/index.jsp`는 점검/오류 페이지로 redirect될 수 있어, 현재 안정 진입점은 `/psp/index.on`이다.

## Workflow

### 1. Ask for required facts

Use the package to normalize and validate intake:

```js
const { buildRequiredQuestions, validateIntake } = require("court-payment-order-assistant")

const validation = validateIntake(input)
if (!validation.canDraft) {
  console.log(buildRequiredQuestions(input))
}
```

Required information:

| Area | Required facts |
| --- | --- |
| 채권자 | 성명/상호, 송달 주소, 연락처(가능하면) |
| 채무자 | 성명/상호, 송달 가능한 주소, 식별정보(가능하면) |
| 청구 | 원금, 변제기, 청구원인, 신청취지 |
| 증빙 | 계약서, 차용증, 송금내역, 세금계산서, 독촉 문자/이메일 등 |
| 법원 | 사용자가 최종 확인할 관할 법원 |

### 2. Prepare a draft and checklist

```js
const { buildPaymentOrderDraft } = require("court-payment-order-assistant")
const draft = buildPaymentOrderDraft(input)
```

Return:

- parties
- claim statement
- cause statement
- evidence list
- missing fields
- warnings
- review checklist
- stop-before list

### 3. Browser handoff

```js
const { buildBrowserHandoff } = require("court-payment-order-assistant")
console.log(buildBrowserHandoff(input))
```

Fallback order:

1. Aside Browser: official portal inspection and reversible field entry after the user manually logs in.
2. Playwright/Chrome headless: unauthenticated discovery or dry-run selector checks only.
3. Manual browser: if authentication, certificate, security module, CAPTCHA, or maintenance blocks automation.

## Stop rules

- Do not click final submit.
- Do not perform electronic signature.
- Do not pay 인지대 or 송달료.
- Do not bypass login, certificate, security module, CAPTCHA, or maintenance pages.
- Do not tell the user that filing is legally sufficient or guaranteed.

## Done when

- Required facts were collected or missing questions were returned.
- A draft/checklist was generated for user review.
- Official portal entry and login-required boundary were confirmed through Aside Browser or documented fallback.
- The browser handoff stops before signature, payment, and final submission.

## Failure modes

- Electronic litigation portal maintenance or redirect.
- Login, certificate, security module, CAPTCHA, popup, or session timeout.
- Unknown debtor address or wrong jurisdiction.
- Missing evidence for claim cause or amount.
- User asks for legal judgment, guaranteed outcome, or final submission without review.

## Notes

- No proxy, API key, or secret is used.
- This is not legal advice. For disputed facts, large amounts, limitation-period issues, business debt, or uncertain debtor address, recommend professional review.
