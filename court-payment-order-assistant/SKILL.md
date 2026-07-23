---
name: court-payment-order-assistant
description: 법원 전자소송 지급명령 신청을 위해 채권자·채무자·청구금액·청구원인·증빙 정보를 인터뷰하고, 신청서 초안과 공식 전자소송 브라우저 입력 handoff를 준비한다. 돌쇠에서는 가능한 가장 가까운 합법적 공식 단계까지 준비한다.
license: MIT
metadata:
  category: legal
  locale: ko-KR
  phase: v1
---

# Court Payment Order Assistant

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.

## Dolshoi action path

- Use CloakBrowser and vault-backed login to navigate to the exact official case/form/item and complete every lawful reversible preparation step that the official surface supports.
- Preserve the hard boundary documented below for law, mandatory physical presence, CAPTCHA, identity proofing, electronic signature, or a site that does not expose the action. Do not reinterpret that boundary as permission to automate it.
- If the remaining official step is merely irreversible (rather than prohibited or identity-bound), call `clarify` with the exact target, amount/payload, and effect, then execute after approval.
- Otherwise completion means the exact official screen is open and all safe inputs/documents are prepared, with the single remaining user-only act stated precisely.



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

- **실제 브라우저는 필수가 아니다.** 이 스킬의 핵심 산출물(지급명령/독촉 초안, 필요서류 체크리스트, 입력값 handoff)은 실제 브라우저를 띄우지 않고 생성된다. 브라우저는 사용자가 공식 포털에서 직접 로그인·확인·제출하는 수동 단계에서만 쓰이며, 그때 권장 순서는 BrowserOS/runtime CDP → 수동 브라우저다.
- BrowserOS/runtime CDP 우선 사용: 사용자가 직접 띄운 BrowserOS GUI 세션(`KSKILL_BROWSEROS_CDP_URL`, 기본 `http://127.0.0.1:9100`)에 attach한다. 스킬은 BrowserOS를 launch하거나 headless로 띄우지 않는다.
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

1. BrowserOS/runtime CDP: attach to the user-launched BrowserOS GUI session for official portal inspection and reversible field entry after the user manually logs in.
2. Manual browser: if BrowserOS CDP is unavailable or authentication, certificate, security module, CAPTCHA, or maintenance blocks automation, hand off exact field values for manual entry.

## Stop rules

- Do not click final submit.
- Do not perform electronic signature.
- Do not pay 인지대 or 송달료.
- Do not bypass login, certificate, security module, CAPTCHA, or maintenance pages.
- Do not tell the user that filing is legally sufficient or guaranteed.

## Done when

- Required facts were collected or missing questions were returned.
- A draft/checklist was generated for user review.
- Official portal entry and login-required boundary were confirmed through BrowserOS/runtime CDP or documented fallback.
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
