"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")

const {
  attachModelEstimate,
  classifyAvailability,
  estimateModelEquivalent,
  normalizeRegionKey,
  parseModelSubsidyRows,
  parseMoneyKrw,
  parseNumberCell,
  parseStatusRows,
  resolveVehicleType
} = require("../src")
const { parseArgs, formatStatus } = require("../src/cli")

test("parseNumberCell splits total and four official category slots", () => {
  assert.deepEqual(parseNumberCell("1,118\n(55)\n(0)\n(20)\n(1,043)"), {
    total: 1118,
    priority: 55,
    corporate: 0,
    reserved: 20,
    general: 1043
  })
})

test("parseNumberCell preserves negative category values", () => {
  assert.deepEqual(parseNumberCell("301 (-203) (-11) (7) (508)"), {
    total: 301,
    priority: -203,
    corporate: -11,
    reserved: 7,
    general: 508
  })
})

test("parseStatusRows parses the official ten-column row and flags inconsistent parts", () => {
  const rows = parseStatusRows([{
    cells: [
      "경기", "성남시", "전기승용", "본공고 1", "*일반: 출고등록순",
      "1,949 (0) (0) (0) (1,949)",
      "1,745 (550) (49) (60) (1,086)",
      "1,740 (549) (49) (60) (1,082)",
      "209 (0) (0) (0) (867)",
      "★ 공고 마감 ★ 추경예산 확보 후 재공고 예정"
    ],
    notice_files: [{ label: "본공고 1", onclick: "goDownloadFile('A')" }]
  }], { localName: "성남시", vehicleType: "passenger" })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].notice_count.total, 1949)
  assert.equal(rows[0].delivery_remaining_count.taxi, 0)
  assert.equal(rows[0].delivery_remaining_count.general, 867)
  assert.match(rows[0].warnings.join(" "), /합계/)
})

test("availability gives explicit closure text precedence over a positive remainder", () => {
  const result = classifyAvailability("일반 접수 마감, 추경 공고 예정", 20)
  assert.equal(result.label, "closed")
  assert.deepEqual(result.basis, ["note:closed", "note:scheduled"])
  assert.match(result.warnings[0], /양수/)
})

test("availability remains unknown when only a positive official count is known", () => {
  assert.equal(classifyAvailability("", 3).label, "unknown_with_remaining_count")
})

test("model subsidy parser treats plain official amounts as 만원", () => {
  const parsed = parseModelSubsidyRows({
    headers: ["구분", "제조사", "모델", "국비(만원)", "지방비(만원)", "합계(만원)"],
    rows: [
      ["승용", "제조사 A", "테스트 모델 A", "300", "120", "420"],
      ["승용", "제조사 B", "테스트 모델 B", "290", "116", "406"]
    ]
  }, { model: "테스트 모델 A" })

  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].national_subsidy_krw, 3000000)
  assert.equal(parsed.items[0].total_subsidy_krw, 4200000)
  assert.equal(parseMoneyKrw("1,200만원"), 12000000)
})

test("model equivalent is clearly separate from exact budget", () => {
  const budget = estimateModelEquivalent({ remainingCount: 10, subsidyPerVehicleKrw: 4200000 })
  assert.equal(budget.exact_available, false)
  assert.equal(budget.exact_amount_krw, null)
  assert.equal(budget.model_equivalent_estimate_krw, 42000000)
  assert.equal(estimateModelEquivalent({ remainingCount: 10 }).model_equivalent_estimate_krw, null)
})

test("attachModelEstimate uses model total subsidy", () => {
  const result = attachModelEstimate({
    availability: { official_remaining_count: 2 },
    remaining_budget: {}
  }, {
    total_subsidy_krw: 5000000
  })
  assert.equal(result.remaining_budget.model_equivalent_estimate_krw, 10000000)
})

test("region and vehicle aliases normalize user input", () => {
  assert.equal(normalizeRegionKey("경기도 성남시"), "경기성남시")
  assert.equal(resolveVehicleType("화물").key, "cargo")
  assert.equal(resolveVehicleType(undefined).key, "passenger")
})

test("CLI parses status and region-search arguments", () => {
  assert.deepEqual(parseArgs(["status", "--region", "경기 성남시", "--vehicle", "승용", "--year", "2026", "--json"]), {
    command: "status",
    region: "경기 성남시",
    vehicleType: "승용",
    year: "2026",
    json: true
  })
  assert.deepEqual(parseArgs(["regions", "중구"]), {
    command: "regions",
    query: "중구"
  })
})

test("human output always discloses that count is not exact budget", () => {
  const text = formatStatus({
    region: { sido_name: "경기", local_name: "성남시" },
    status: {
      vehicle_label: "전기승용",
      notice_count: { total: 10 },
      application_count: { total: 5 },
      delivered_count: { total: 4 },
      delivery_remaining_count: { total: 6 },
      application_method: "출고등록순",
      note: ""
    },
    source: { fetched_at: "2026-07-18T20:00:00+09:00", url: "https://ev.or.kr/" },
    availability: { label: "unknown_with_remaining_count" },
    warnings: []
  })
  assert.match(text, /정확한 원화 예산 잔액이 아닙니다/)
})

test("human output lists multiple matching model variants", () => {
  const text = formatStatus({
    region: { sido_name: "경기", local_name: "화성시" },
    status: {
      vehicle_label: "전기승용",
      notice_count: { total: 100 },
      application_count: { total: 20 },
      delivered_count: { total: 10 },
      delivery_remaining_count: { total: 90 },
      application_method: "출고등록순",
      note: "접수 중"
    },
    source: { fetched_at: "2026-07-18T20:00:00+09:00", url: "https://ev.or.kr/" },
    availability: { label: "open" },
    model_subsidy_candidates: [{
      manufacturer: "제조사",
      model: "테스트 모델 세부형",
      total_subsidy_krw: 7400000,
      remaining_equivalent_estimate_krw: 666000000
    }],
    warnings: []
  })

  assert.match(text, /테스트 모델 세부형/)
  assert.match(text, /7,400,000원/)
  assert.match(text, /666,000,000원/)
})
