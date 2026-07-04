"use strict"

const { BOUNDARIES, buildRequiredQuestions, normalizeIntake, validateIntake } = require("./intake")
const { STOP_CODES } = require("k-skill-browser-runtime")

const COURT_PORTAL_URL = "https://ecfs.scourt.go.kr/psp/index.on"

// BrowserOS is the primary browser handoff target: a user-launched BrowserOS
// GUI session attached over CDP. The skill never launches BrowserOS and never
// runs headless. The default CDP URL matches k-skill-browser-runtime.
const BROWSEROS_PROVIDER = "browseros"
const BROWSEROS_DEFAULT_CDP_URL = "http://127.0.0.1:9100"

// Shared stop-rule taxonomy for court-payment browser handoff. The codes are
// k-skill-browser-runtime STOP_CODES so agents can branch on the same
// structured reasons across skills. Human-readable `rule` strings remain for
// existing consumers/tests and preserve irreversible-action safety wording.
const HANDOFF_STOP_RULES = [
  {
    code: STOP_CODES.AUTH_REQUIRED,
    rule: "Do not bypass login, certificate(공동인증서), or security module prompts; the user must authenticate manually."
  },
  {
    code: STOP_CODES.CAPTCHA_DETECTED,
    rule: "Do not solve CAPTCHA or bot-check challenges; hand off to the user."
  },
  {
    code: STOP_CODES.PAYMENT_REQUIRED,
    rule: "Do not pay 인지대 or 송달료; the user completes filing-fee payment manually."
  },
  {
    code: STOP_CODES.ELECTRONIC_SIGNATURE,
    rule: "Do not perform 전자서명(electronic signature); the user signs manually."
  },
  {
    code: STOP_CODES.IRREVERSIBLE_BOUNDARY,
    rule: "Do not perform 최종 제출(final submit) or any irreversible court filing action."
  },
  {
    code: STOP_CODES.MANUAL_HANDOFF,
    rule: "If automation is blocked by certificate, security software, CAPTCHA, or maintenance, hand off exact field values for manual entry."
  }
]

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
    runtimeProvider: BROWSEROS_PROVIDER,
    browserosCdpUrl: BROWSEROS_DEFAULT_CDP_URL,
    launchesBrowser: false,
    fallbackOrder: [
      {
        channel: "browseros-cdp",
        provider: BROWSEROS_PROVIDER,
        cdpUrl: BROWSEROS_DEFAULT_CDP_URL,
        launchesBrowser: false,
        purpose: "Attach over CDP to the user-launched BrowserOS GUI session (default http://127.0.0.1:9100) to inspect the official electronic litigation portal and fill reversible draft fields after manual login. Never launch BrowserOS and never run headless."
      },
      {
        channel: "manual-browser",
        purpose: "If browser automation is blocked by certificate, security software, CAPTCHA, or maintenance, hand off exact field values for manual entry."
      }
    ],
    steps: [
      "Attach over CDP to the user-launched BrowserOS GUI session (do not launch BrowserOS and do not run headless).",
      "User manually logs in and handles certificate/security prompts.",
      "Navigate to 서류제출 > 민사 서류 > 지급명령 or 독촉 관련 신청서.",
      "Fill reversible draft fields from the prepared parties, claim, cause, and evidence checklist.",
      "Pause for user review before any irreversible action; if BrowserOS CDP is unavailable, hand off exact field values for manual browser entry."
    ],
    draft,
    stopCodes: HANDOFF_STOP_RULES.map((entry) => entry.code),
    stopRules: HANDOFF_STOP_RULES.map((entry) => entry.rule),
    stopRulesStructured: HANDOFF_STOP_RULES
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
  BROWSEROS_DEFAULT_CDP_URL,
  HANDOFF_STOP_RULES,
  buildBrowserHandoff,
  buildPaymentOrderDraft,
  buildRequiredQuestions,
  normalizeIntake,
  validateIntake
}
