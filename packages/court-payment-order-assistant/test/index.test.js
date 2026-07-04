const assert = require("node:assert/strict")
const test = require("node:test")

const { STOP_CODES } = require("k-skill-browser-runtime")
const {
  buildBrowserHandoff,
  buildPaymentOrderDraft,
  buildRequiredQuestions,
  normalizeIntake,
  validateIntake
} = require("../src")

const completeInput = {
  creditor: {
    name: "홍길동",
    address: "서울특별시 강남구 테헤란로 1",
    phone: "010-1111-2222"
  },
  debtor: {
    name: "김채무",
    address: "서울특별시 서초구 반포대로 2"
  },
  claim: {
    amount: "3500000",
    cause: "2026-05-01 물품대금 미지급",
    dueDate: "2026-06-01",
    demand: "채무자는 채권자에게 3,500,000원 및 이에 대한 지연손해금을 지급하라."
  },
  evidence: [
    { title: "계약서", note: "물품 공급 계약" },
    { title: "세금계산서", note: "청구 금액 확인" }
  ],
  court: {
    name: "서울중앙지방법원"
  }
}

test("Given incomplete intake When validating Then missing fields and manual-only boundaries are returned", () => {
  const result = validateIntake({ creditor: { name: "홍길동" }, claim: { amount: "1000" } })

  assert.equal(result.canDraft, false)
  assert.match(result.missingFields.join("\n"), /debtor.name/)
  assert.match(result.missingFields.join("\n"), /claim.cause/)
  assert.match(result.boundaries.join("\n"), /final submit/)
})

test("Given incomplete intake When drafting Then no fake zero-won claim is emitted", () => {
  const draft = buildPaymentOrderDraft({})

  assert.equal(draft.status, "needs_more_information")
  assert.equal(draft.claimStatement, "")
  assert.ok(draft.missingFields.length > 0)
})

test("Given complete intake When normalizing Then money and dates are canonical", () => {
  const intake = normalizeIntake(completeInput)

  assert.equal(intake.claim.amount, 3500000)
  assert.equal(intake.claim.dueDate, "2026-06-01")
  assert.equal(intake.evidence.length, 2)
})

test("Given complete intake When drafting Then the output includes checklist and no final submission", () => {
  const draft = buildPaymentOrderDraft(completeInput)

  assert.equal(draft.status, "ready_for_user_review")
  assert.match(draft.claimStatement, /3,500,000원/)
  assert.match(draft.reviewChecklist.join("\n"), /채무자 주소/)
  assert.match(draft.stopBefore.join("\n"), /제출|서명|결제/)
})

test("Given missing data When asking questions Then required debtor and claim prompts are prioritized", () => {
  const questions = buildRequiredQuestions({ creditor: { name: "홍길동" } })

  assert.match(questions[0].field, /debtor/)
  assert.ok(questions.some((question) => question.field === "claim.amount"))
})

test("Given browser handoff When building instructions Then BrowserOS/runtime CDP is primary, shared stop codes present, and submission is blocked", () => {
  const handoff = buildBrowserHandoff(completeInput)

  // BrowserOS/runtime CDP is the first handoff channel; fallback is manual, not local headless launch.
  assert.deepEqual(
    handoff.fallbackOrder.map((step) => step.channel),
    ["browseros-cdp", "manual-browser"]
  )
  const primary = handoff.fallbackOrder[0]
  assert.equal(primary.provider, "browseros")
  assert.equal(primary.cdpUrl, "http://127.0.0.1:9100")
  assert.equal(primary.launchesBrowser, false)
  assert.equal(handoff.runtimeProvider, "browseros")
  assert.equal(handoff.browserosCdpUrl, "http://127.0.0.1:9100")
  assert.equal(handoff.launchesBrowser, false)
  assert.match(handoff.entryUrl, /ecfs\.scourt\.go\.kr\/psp\/index\.on/)
  assert.equal(handoff.fallbackOrder.slice(1).some((step) => /headless|playwright|chrome/i.test(step.channel + " " + step.purpose)), false)

  // Shared stop codes from k-skill-browser-runtime are present and agents can branch on them.
  const expectedCodes = [
    STOP_CODES.AUTH_REQUIRED,
    STOP_CODES.CAPTCHA_DETECTED,
    STOP_CODES.PAYMENT_REQUIRED,
    STOP_CODES.ELECTRONIC_SIGNATURE,
    STOP_CODES.IRREVERSIBLE_BOUNDARY,
    STOP_CODES.MANUAL_HANDOFF
  ]
  assert.deepEqual(handoff.stopCodes, expectedCodes)
  assert.deepEqual(
    handoff.stopRulesStructured.map((entry) => entry.code),
    expectedCodes
  )
  for (const code of expectedCodes) {
    const entry = handoff.stopRulesStructured.find((item) => item.code === code)
    assert.ok(entry && typeof entry.rule === "string" && entry.rule.length > 0, `missing rule for ${code}`)
  }

  // Irreversible-action safety strings remain in human-readable stopRules.
  assert.match(handoff.stopRules.join("\n"), /최종 제출|전자서명|인지대/)

  // No auto-submit/login automation/payment/e-signature bypass wording is introduced in agent steps.
  const stepsJoined = handoff.steps.join("\n")
  assert.doesNotMatch(stepsJoined, /자동 제출|자동 로그인|자동 결제|자동 서명/)
  assert.doesNotMatch(stepsJoined, /automatically (submit|log in|pay|sign)/i)
  // Stop rules describe boundaries (do-NOT wording), not automation instructions.
  assert.doesNotMatch(handoff.stopRules.join("\n"), /자동으로|automatically submit|log in automatically|pay automatically/)
})
