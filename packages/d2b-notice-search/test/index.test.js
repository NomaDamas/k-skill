const test = require("node:test")
const assert = require("node:assert/strict")

const {
  D2B_HOME_URL,
  buildAsideSearchScript,
  buildPlaywrightSearchScript,
  normalizeSearchOptions,
  parseBrowserSearchOutput,
  parseNoticeListText
} = require("../src")

const SAMPLE_VISIBLE_TEXT = `
입찰공고목록
* 총 1 건
1 물품 경쟁입찰 정상공고 2026-07-01 2026UMM054815524-01 2026UMM15524 15524
(266131-E) 26년 노트북 태블릿형 도입사업(리스자산) 국군재정관리단 해당없음 2026-07-08 11:00 2026-07-09 10:30 일반경쟁 전자입찰 공개예정
순번 업무구분 입찰구분 공고구분 공고일자 G2B공고번호-차수 통합참조번호 판단번호(구매요청번호) 입찰건명(사업명) 발주기관
`

test("Given visible D2B result text When parsing Then notice metadata is extracted", () => {
  const result = parseNoticeListText(SAMPLE_VISIBLE_TEXT, {
    query: "노트북",
    sourceUrl: "https://www.d2b.go.kr/mainBidAnnounceList.do"
  })

  assert.equal(result.query, "노트북")
  assert.equal(result.total_count, 1)
  assert.equal(result.items.length, 1)
  assert.deepEqual(result.items[0], {
    sequence: 1,
    business_category: "물품",
    bid_category: "경쟁입찰",
    notice_type: "정상공고",
    notice_date: "2026-07-01",
    g2b_notice_number: "2026UMM054815524-01",
    integrated_reference_number: "2026UMM15524",
    purchase_request_number: "15524",
    title: "(266131-E) 26년 노트북 태블릿형 도입사업(리스자산)",
    agency: "국군재정관리단",
    production_capacity_due_at: null,
    registration_due_at: "2026-07-08 11:00",
    bid_due_at: "2026-07-09 10:30",
    contract_method: "일반경쟁",
    bid_form: "전자입찰",
    base_price_status: "공개예정"
  })
})

test("Given production capacity deadline When parsing Then registration deadline is not shifted", () => {
  const visibleText = `
  * 총 1 건
  1 물품 경쟁입찰 긴급공고 2026-07-02 2026ABC000000001-01 2026ABC00001 90001
  시험 장비 구매 국군재정관리단 2026-07-05 17:00 2026-07-08 11:00 2026-07-09 10:30 제한경쟁 전자입찰 공개
  순번 업무구분 입찰구분
  `

  const result = parseNoticeListText(visibleText)

  assert.equal(result.items[0].production_capacity_due_at, "2026-07-05 17:00")
  assert.equal(result.items[0].registration_due_at, "2026-07-08 11:00")
  assert.equal(result.items[0].bid_due_at, "2026-07-09 10:30")
})

test("Given Korean aliases When normalizing options Then D2B control values are returned", () => {
  const options = normalizeSearchOptions({
    keyword: " 노트북 ",
    businessCategory: ["물품", "용역"],
    noticeType: "긴급공고",
    dateField: "공고일자",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    pageSize: 100
  })

  assert.deepEqual(options, {
    keyword: "노트북",
    noticeType: "B",
    dateField: "2",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    g2bNoticeNumber: "",
    agency: "",
    pageSize: 100,
    businessCategories: ["goods", "service"]
  })
})

test("Given invalid dates When normalizing options Then the caller gets a clear error", () => {
  assert.throws(
    () => normalizeSearchOptions({ startDate: "2026-08-01", endDate: "2026-07-01" }),
    /startDate must be on or before endDate/
  )
  assert.throws(() => normalizeSearchOptions({ startDate: "20260701" }), /YYYY-MM-DD/)
  assert.throws(() => normalizeSearchOptions({ startDate: "2026-01-01", endDate: "2027-01-02" }), /12 months/)
})

test("Given documented date aliases When normalizing options Then they map to D2B values", () => {
  assert.equal(normalizeSearchOptions({ dateField: "opening" }).dateField, "1")
  assert.equal(normalizeSearchOptions({ dateField: "notice" }).dateField, "2")
})

test("Given search options When generating Aside script Then it drives the official public form", () => {
  const script = buildAsideSearchScript({ keyword: "노트북", businessCategory: "물품" })

  assert.match(script, new RegExp(D2B_HOME_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(script, /openTab/)
  assert.match(script, /#anmt_name/)
  assert.match(script, /#btn_search/)
  assert.doesNotMatch(script, /login/i)
  assert.doesNotMatch(script, /sealedBidAnnounceList\.do\/json/)
})

test("Given no notice type When generating browser script Then it does not select a nonexistent all value", () => {
  const script = buildAsideSearchScript({ keyword: "노트북" })

  assert.match(script, /"noticeType":""/)
  assert.match(script, /if \(options\.noticeType\) await page\.locator\("#anmt_divs"\)\.selectOption/)
  assert.doesNotMatch(script, /selectOption\("all"\)/)
})

test("Given explicit all notice type When generating browser script Then it also avoids the nonexistent all value", () => {
  const script = buildAsideSearchScript({ keyword: "노트북", noticeType: "전체" })

  assert.match(script, /"noticeType":""/)
  assert.doesNotMatch(script, /selectOption\("all"\)/)
})

test("Given date filters When generating browser script Then readonly date inputs are set by event", () => {
  const script = buildAsideSearchScript({ keyword: "노트북", startDate: "2026-07-01", endDate: "2026-08-30" })

  assert.match(script, /setInputValue\(page, "#datepicker_from", options\.startDate\)/)
  assert.match(script, /removeAttribute\("readonly"\)/)
  assert.match(script, /dispatchEvent\(new Event\("change"/)
})

test("Given search options When generating Playwright script Then it is usable outside Aside", () => {
  const script = buildPlaywrightSearchScript({ keyword: "노트북" })

  assert.match(script, /browser\.newPage/)
  assert.match(script, /runD2BNoticeSearch/)
})

test("Given Aside JSON output When parsing Then visibleText is converted to normalized results", () => {
  const result = parseBrowserSearchOutput({
    url: "https://www.d2b.go.kr/mainBidAnnounceList.do",
    visibleText: SAMPLE_VISIBLE_TEXT
  }, { keyword: "노트북" })

  assert.equal(result.count, 1)
  assert.equal(result.items[0].g2b_notice_number, "2026UMM054815524-01")
})
