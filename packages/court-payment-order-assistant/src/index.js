"use strict"

const { BOUNDARIES, buildRequiredQuestions, normalizeIntake, validateIntake } = require("./intake")

const COURT_PORTAL_URL = "https://ecfs.scourt.go.kr/psp/index.on"

function buildPaymentOrderDraft(input = {}) {
  const intake = normalizeIntake(input)
  const validation = validateIntake(intake)
  const claimStatement = validation.canDraft ? buildClaimStatement(intake) : ""
  return {
    status: validation.canDraft ? "ready_for_user_review" : "needs_more_information",
    parties: {
      creditor: intake.creditor,
      debtor: intake.debtor
    },
    court: intake.court,
    claimStatement,
    causeStatement: intake.claim.cause,
    evidenceList: intake.evidence,
    reviewChecklist: [
      "채권자 이름과 주소가 주민등록/사업자등록 정보와 일치하는지 확인",
      "채무자 주소가 실제 송달 가능한 최신 주소인지 확인",
      "청구금액, 변제기, 지연손해금 기산일이 증빙과 맞는지 확인",
      "계약서, 송금내역, 세금계산서, 독촉 문자 등 소명자료 파일 준비",
      "관할 법원과 인지대/송달료를 전자소송 화면에서 최종 확인"
    ],
    missingFields: validation.missingFields,
    warnings: validation.warnings,
    stopBefore: [
      "전자서명",
      "인지대/송달료 결제",
      "최종 제출",
      "사건 접수 후 취소가 어려운 단계"
    ],
    disclaimer: "참고용 초안이며 법률 자문이 아닙니다. 제출 전 본인이 원문과 증빙을 검토하거나 전문가에게 확인하세요."
  }
}

function buildBrowserHandoff(input = {}) {
  const draft = buildPaymentOrderDraft(input)
  return {
    entryUrl: COURT_PORTAL_URL,
    fallbackOrder: [
      { channel: "aside-browser", purpose: "Use the user's browser session to inspect the official electronic litigation portal and fill reversible draft fields after manual login." },
      { channel: "playwright-or-chrome-headless", purpose: "Use only for unauthenticated page discovery or dry-run selector checks; authenticated filing should stay in the user's browser." },
      { channel: "manual-browser", purpose: "If browser automation is blocked by certificate, security software, CAPTCHA, or maintenance, hand off exact field values for manual entry." }
    ],
    steps: [
      "Open the official electronic litigation portal.",
      "User manually logs in and handles certificate/security prompts.",
      "Navigate to 서류제출 > 민사 서류 > 지급명령 or 독촉 관련 신청서.",
      "Fill reversible draft fields from the prepared parties, claim, cause, and evidence checklist.",
      "Pause for user review before any irreversible action."
    ],
    draft,
    stopRules: [
      "Do not perform final submit.",
      "Do not perform electronic signature.",
      "Do not pay 인지대 or 송달료.",
      "Do not bypass login, certificate, security module, CAPTCHA, or maintenance pages."
    ]
  }
}

function buildClaimStatement(intake) {
  if (!intake.claim.amount || !intake.claim.demand) return ""
  const amount = intake.claim.amount.toLocaleString("ko-KR")
  const due = intake.claim.dueDate ? ` 변제기 ${intake.claim.dueDate}.` : ""
  const interest = intake.claim.interest ? ` 지연손해금: ${intake.claim.interest}.` : ""
  return `${intake.claim.demand} 청구원금 ${amount}원.${due}${interest}`
}

module.exports = {
  COURT_PORTAL_URL,
  buildBrowserHandoff,
  buildPaymentOrderDraft,
  buildRequiredQuestions,
  normalizeIntake,
  validateIntake
}
