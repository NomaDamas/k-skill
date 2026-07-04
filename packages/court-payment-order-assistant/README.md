# court-payment-order-assistant

Korean electronic litigation payment-order intake, draft, and browser handoff helpers for the `court-payment-order-assistant` k-skill.

## Scope

This package helps an agent ask for required party/claim/evidence information, prepare a reviewable 지급명령 draft checklist, and hand off reversible browser-entry steps for the official court e-filing portal.

It does not provide legal advice and does not perform login, certificate authentication, electronic signature, payment, or final submission.

## Usage

```js
const { buildPaymentOrderDraft, buildBrowserHandoff } = require("court-payment-order-assistant")

const input = {
  creditor: { name: "홍길동", address: "서울특별시 강남구 테헤란로 1" },
  debtor: { name: "김채무", address: "서울특별시 서초구 반포대로 2" },
  claim: {
    amount: "3500000",
    cause: "2026-05-01 물품대금 미지급",
    dueDate: "2026-06-01",
    demand: "채무자는 채권자에게 3,500,000원 및 지연손해금을 지급하라."
  },
  evidence: [{ title: "계약서" }, { title: "송금내역" }]
}

const draft = buildPaymentOrderDraft(input)

console.log(draft.reviewChecklist)
console.log(buildBrowserHandoff(input).stopRules)
```

## Public access path

- Official portal: `https://ecfs.scourt.go.kr/psp/index.on`
- Observed public surface: login/register, `서류제출`, `민사 서류`, and login-required document drafting boundary.
- Primary browser: BrowserOS/runtime CDP, attached to the user-launched BrowserOS GUI session (default `http://127.0.0.1:9100`). The skill never launches BrowserOS and never runs headless.
- Fallback: manual browser handoff with exact field values when BrowserOS CDP is unavailable or authentication/security modules appear.

## Boundaries

- Stop before electronic signature, filing-fee/payment screens, and final submit.
- User handles all login, certificate, CAPTCHA/security module, payment, and final review steps.
- The package returns drafts/checklists; it does not decide whether filing is legally appropriate.
- BrowserOS is used as a GUI/session browser over CDP, not as a headless backend, login solver, CAPTCHA bypass, payment solver, or stealth scraping browser.
- Handoff may describe reversible field entry only and must stop before irreversible steps.
