"use strict"

function buildUnavailableBudget(reason = "공개 지급현황은 정확한 원화 예산 잔액을 제공하지 않습니다.") {
  return {
    exact_available: false,
    exact_amount_krw: null,
    reason,
    model_equivalent_estimate_krw: null,
    estimate_assumptions: []
  }
}

function estimateModelEquivalent({ remainingCount, subsidyPerVehicleKrw }) {
  const budget = buildUnavailableBudget()
  if (!Number.isFinite(remainingCount) || remainingCount < 0) return budget
  if (!Number.isFinite(subsidyPerVehicleKrw) || subsidyPerVehicleKrw <= 0) return budget

  budget.model_equivalent_estimate_krw = Math.round(remainingCount * subsidyPerVehicleKrw)
  budget.estimate_assumptions = [
    `공식 출고잔여대수 ${remainingCount}대가 모두 선택 모델에 배정된다고 가정`,
    `1대당 확인된 국비+지방비 ${Math.round(subsidyPerVehicleKrw)}원 적용`,
    "구매자 특성별 추가지원과 대상군 간 물량 전환은 반영하지 않음"
  ]
  return budget
}

module.exports = {
  buildUnavailableBudget,
  estimateModelEquivalent
}
