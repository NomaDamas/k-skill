"use strict"

const { classifyAvailability } = require("./availability")
const { buildUnavailableBudget, estimateModelEquivalent } = require("./estimate")

const COUNT_KEYS = Object.freeze(["total", "priority", "corporate", "reserved", "general"])

function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim()
}

function normalizeRegionKey(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/경기도/g, "경기")
    .replace(/강원(?:특별자치)?도/g, "강원")
    .replace(/충청북도/g, "충북")
    .replace(/충청남도/g, "충남")
    .replace(/전라북도|전북특별자치도/g, "전북")
    .replace(/전라남도/g, "전남")
    .replace(/경상북도/g, "경북")
    .replace(/경상남도/g, "경남")
    .replace(/제주특별자치도|제주도/g, "제주")
    .replace(/특별자치도|특별자치시|광역시|특별시/g, "")
    .replace(/도$/g, "")
}

function parseNumberCell(value) {
  const text = normalizeText(value)
  const matches = text.match(/-?[\d,]+/g) || []
  const numbers = matches.slice(0, COUNT_KEYS.length).map((item) => Number(item.replace(/,/g, "")))
  while (numbers.length < COUNT_KEYS.length) numbers.push(null)
  return Object.fromEntries(COUNT_KEYS.map((key, index) => [key, Number.isFinite(numbers[index]) ? numbers[index] : null]))
}

function categoryCountsForVehicle(counts, vehicleType) {
  const output = { ...counts }
  if (vehicleType === "passenger") output.taxi = counts.reserved
  else if (vehicleType === "cargo") output.small_business = counts.reserved
  return output
}

function countWarnings(name, counts) {
  const warnings = []
  const parts = [counts.priority, counts.corporate, counts.reserved, counts.general]
  const finiteParts = parts.filter(Number.isFinite)
  if (finiteParts.some((value) => value < 0)) {
    warnings.push(`${name} 대상군 값에 음수가 포함되어 있습니다. 물량 전환 또는 초과 집행 여부를 비고와 함께 확인하세요.`)
  }
  if (Number.isFinite(counts.total) && finiteParts.length === parts.length) {
    const sum = finiteParts.reduce((total, value) => total + value, 0)
    if (sum !== counts.total) {
      warnings.push(`${name} 전체 ${counts.total}대와 대상군 합계 ${sum}대가 일치하지 않습니다.`)
    }
  }
  return warnings
}

function parseStatusRows(rawRows, options = {}) {
  const target = normalizeRegionKey(options.localName || options.region)
  const vehicleType = options.vehicleType || "passenger"
  const parsed = []

  for (const raw of Array.isArray(rawRows) ? rawRows : []) {
    const cells = Array.isArray(raw.cells) ? raw.cells.map(normalizeText) : []
    if (cells.length < 10) continue
    if (target && normalizeRegionKey(cells[1]) !== target) continue

    const noticeCount = categoryCountsForVehicle(parseNumberCell(cells[5]), vehicleType)
    const applicationCount = categoryCountsForVehicle(parseNumberCell(cells[6]), vehicleType)
    const deliveredCount = categoryCountsForVehicle(parseNumberCell(cells[7]), vehicleType)
    const remainingCount = categoryCountsForVehicle(parseNumberCell(cells[8]), vehicleType)
    const warnings = [
      ...countWarnings("민간공고대수", noticeCount),
      ...countWarnings("접수대수", applicationCount),
      ...countWarnings("출고대수", deliveredCount),
      ...countWarnings("출고잔여대수", remainingCount)
    ]
    if (
      Number.isFinite(noticeCount.total) &&
      Number.isFinite(deliveredCount.total) &&
      Number.isFinite(remainingCount.total) &&
      noticeCount.total - deliveredCount.total !== remainingCount.total
    ) {
      warnings.push("출고잔여대수가 민간공고대수-출고대수와 일치하지 않습니다.")
    }

    parsed.push({
      sido_name: cells[0],
      local_name: cells[1],
      vehicle_label: cells[2],
      notice_files: Array.isArray(raw.notice_files) ? raw.notice_files : [],
      application_method: cells[4],
      notice_count: noticeCount,
      application_count: applicationCount,
      delivered_count: deliveredCount,
      delivery_remaining_count: remainingCount,
      note: cells[9],
      warnings
    })
  }
  return parsed
}

function formatKst(date = new Date()) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return shifted.toISOString().replace("Z", "+09:00")
}

function buildStatusResult({ query, region, rows, sourceUrl, fetchedAt = new Date() }) {
  if (!rows.length) {
    const error = new Error(`지급현황 표에서 ${region.localName} 행을 찾지 못했습니다.`)
    error.code = "RESULT_EMPTY"
    throw error
  }

  const primary = rows[0]
  const remaining = primary.delivery_remaining_count.total
  const availability = classifyAvailability(primary.note, remaining)
  const pendingApplications = Number.isFinite(primary.application_count.total) && Number.isFinite(primary.delivered_count.total)
    ? primary.application_count.total - primary.delivered_count.total
    : null

  return {
    query,
    region: {
      sido_name: primary.sido_name || region.sidoName,
      sido_code: region.sidoCode,
      local_name: primary.local_name || region.localName,
      local_code: region.localCode
    },
    status: primary,
    rows,
    availability: {
      ...availability,
      official_remaining_count: remaining,
      pending_application_count: pendingApplications,
      actual_application_count_known: false
    },
    remaining_budget: buildUnavailableBudget("차종·구매자별 지급액과 예약·취소 내역이 달라 공개 지급현황만으로 정확한 원화 잔액을 계산할 수 없습니다."),
    source: {
      name: "환경부 무공해차 통합누리집",
      url: sourceUrl,
      fetched_at: formatKst(fetchedAt)
    },
    warnings: [...primary.warnings, ...availability.warnings]
  }
}

function parseMoneyKrw(value, defaultUnit = "만원") {
  const text = normalizeText(value)
  if (!text || /^[-–—]$/.test(text)) return null
  const match = text.match(/-?[\d,.]+/)
  if (!match) return null
  const number = Number(match[0].replace(/,/g, ""))
  if (!Number.isFinite(number)) return null
  if (/억원?/.test(text)) return Math.round(number * 100000000)
  if (/만원?/.test(text) || (!/[원억만]/.test(text) && defaultUnit === "만원")) return Math.round(number * 10000)
  return Math.round(number)
}

function parseModelSubsidyRows(snapshot, options = {}) {
  const headers = Array.isArray(snapshot && snapshot.headers) ? snapshot.headers.map(normalizeText) : []
  const rows = Array.isArray(snapshot && snapshot.rows) ? snapshot.rows : []
  const headerText = headers.join(" ")
  const defaultUnit = headerText.includes("만원") || !headerText.includes("원") ? "만원" : "원"
  const query = normalizeText(options.model).toLowerCase()

  const items = rows.flatMap((cellsValue) => {
    const cells = Array.isArray(cellsValue) ? cellsValue.map(normalizeText) : []
    if (cells.length < 6) return []
    const item = {
      vehicle_class: cells[0],
      manufacturer: cells[1],
      model: cells[2],
      national_subsidy_krw: parseMoneyKrw(cells[3], defaultUnit),
      local_subsidy_krw: parseMoneyKrw(cells[4], defaultUnit),
      total_subsidy_krw: parseMoneyKrw(cells[5], defaultUnit),
      raw: cells
    }
    if (!query) return [item]
    const haystack = `${item.manufacturer} ${item.model}`.toLowerCase()
    return haystack.includes(query) ? [item] : []
  })
  return { headers, items }
}

function attachModelEstimate(result, modelItem) {
  if (!modelItem) return result
  const subsidy = Number.isFinite(modelItem.total_subsidy_krw)
    ? modelItem.total_subsidy_krw
    : (modelItem.national_subsidy_krw || 0) + (modelItem.local_subsidy_krw || 0)
  return {
    ...result,
    model_subsidy: modelItem,
    remaining_budget: estimateModelEquivalent({
      remainingCount: result.availability.official_remaining_count,
      subsidyPerVehicleKrw: subsidy
    })
  }
}

module.exports = {
  COUNT_KEYS,
  attachModelEstimate,
  buildStatusResult,
  categoryCountsForVehicle,
  formatKst,
  normalizeRegionKey,
  normalizeText,
  parseModelSubsidyRows,
  parseMoneyKrw,
  parseNumberCell,
  parseStatusRows
}
