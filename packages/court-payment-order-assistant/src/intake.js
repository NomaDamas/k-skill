"use strict"

const REQUIRED_FIELDS = [
  ["creditor.name", "채권자 성명/상호"],
  ["creditor.address", "채권자 주소"],
  ["debtor.name", "채무자 성명/상호"],
  ["debtor.address", "채무자 송달 가능 주소"],
  ["claim.amount", "청구금액"],
  ["claim.cause", "청구원인"],
  ["claim.demand", "신청취지"],
  ["evidence", "계약서, 송금내역, 세금계산서 등 소명자료"]
]

const BOUNDARIES = [
  "This helper does not give legal advice.",
  "The user must complete login, certificate authentication, electronic signature, payment, and final submit manually.",
  "Stop before final submit, electronic signature, filing fee payment, or any irreversible court filing action."
]

function normalizeIntake(input = {}) {
  return {
    creditor: normalizeParty(input.creditor),
    debtor: normalizeParty(input.debtor),
    claim: normalizeClaim(input.claim),
    evidence: normalizeEvidence(input.evidence),
    court: {
      name: clean(input.court && input.court.name),
      basis: clean(input.court && input.court.basis)
    }
  }
}

function validateIntake(input = {}) {
  const intake = normalizeIntake(input)
  const missingFields = REQUIRED_FIELDS
    .filter(([path]) => isEmptyValue(readPath(intake, path)))
    .map(([path, label]) => `${path}: ${label}`)
  const warnings = []
  if (!intake.debtor.address) warnings.push("채무자 주소가 불명확하면 지급명령 송달이 실패할 수 있습니다.")
  if (!intake.court.name) warnings.push("관할 법원은 사용자가 최종 확인해야 합니다.")
  return {
    canDraft: missingFields.length === 0,
    missingFields,
    warnings,
    boundaries: BOUNDARIES
  }
}

function buildRequiredQuestions(input = {}) {
  return validateIntake(input).missingFields.map((entry) => {
    const field = entry.split(":")[0]
    return { field, prompt: questionFor(field) }
  }).sort((left, right) => questionPriority(left.field) - questionPriority(right.field))
}

function normalizeParty(value = {}) {
  return {
    name: clean(value.name),
    address: clean(value.address),
    phone: clean(value.phone),
    registrationNumber: clean(value.registrationNumber)
  }
}

function normalizeClaim(value = {}) {
  return {
    amount: normalizeAmount(value.amount),
    cause: clean(value.cause),
    dueDate: normalizeDate(value.dueDate),
    demand: clean(value.demand),
    interest: clean(value.interest)
  }
}

function normalizeEvidence(value) {
  const entries = Array.isArray(value) ? value : []
  return entries.map((item) => ({
    title: clean(item.title || item.name),
    note: clean(item.note || item.description)
  })).filter((item) => item.title)
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === "") return 0
  const amount = Number(String(value).replace(/[,원\s]/g, ""))
  if (amount === 0) return 0
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError("claim.amount must be a positive integer KRW amount")
  return amount
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === "") return ""
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new RangeError("date must be YYYY-MM-DD")
  return text
}

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current && current[key], value)
}

function isEmptyValue(value) {
  if (Array.isArray(value)) return value.length === 0
  return value === undefined || value === null || value === "" || value === 0
}

function questionFor(field) {
  const questions = {
    "creditor.name": "채권자 성명 또는 법인명을 알려주세요.",
    "creditor.address": "채권자의 송달 가능한 주소를 알려주세요.",
    "debtor.name": "채무자 성명 또는 법인명을 알려주세요.",
    "debtor.address": "채무자의 송달 가능한 주소를 알려주세요.",
    "claim.amount": "청구할 원금 금액을 원 단위 숫자로 알려주세요.",
    "claim.cause": "돈을 받을 권리가 생긴 계약, 대여, 물품대금 등 원인을 날짜와 함께 설명해 주세요.",
    "claim.demand": "신청취지 문구 초안을 알려주세요.",
    evidence: "첨부할 계약서, 송금내역, 세금계산서, 문자 등 소명자료 목록을 알려주세요."
  }
  return questions[field] || `${field} 값을 알려주세요.`
}

function questionPriority(field) {
  if (field.startsWith("debtor.")) return 1
  if (field.startsWith("claim.")) return 2
  if (field === "evidence") return 3
  return 4
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

module.exports = { BOUNDARIES, buildRequiredQuestions, clean, normalizeIntake, validateIntake }
