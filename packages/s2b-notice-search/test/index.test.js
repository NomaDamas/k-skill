const assert = require("node:assert/strict")
const test = require("node:test")

const {
  buildBrowserAutomationInstructions,
  buildSearchRequest,
  normalizeSearchOptions,
  parseDetailHtml,
  parseListHtml
} = require("../src/index")

const listFixture = `
<table>
  <tbody>
    <tr>
      <td>1</td>
      <td>물품</td>
      <td><a href="#" onclick="fn_detail('EST-2026-001','N001'); return false;">급식실 냉장고 구매 견적요청</a></td>
      <td>서울가람초등학교</td>
      <td>진행중</td>
      <td>2026-06-01</td>
      <td>2026-06-10 15:00</td>
    </tr>
    <tr>
      <td>2</td>
      <td>용역</td>
      <td><a href="javascript:goView('BID-2026-002')">방과후 프로그램 위탁</a></td>
      <td>부산나래중학교</td>
      <td>마감</td>
      <td>2026.06.03</td>
      <td>2026.06.12 10:00</td>
    </tr>
  </tbody>
</table>`

const detailFixture = `
<html>
  <body>
    <h3>급식실 냉장고 구매 견적요청</h3>
    <table>
      <tr><th>공고번호</th><td>EST-2026-001</td><th>기관명</th><td>서울가람초등학교</td></tr>
      <tr><th>품목구분</th><td>물품</td><th>계약방법</th><td>1인 수의</td></tr>
      <tr><th>게시일</th><td>2026-06-01</td><th>견적마감일</th><td>2026-06-10 15:00</td></tr>
    </table>
    <div id="content">납품 장소는 행정실이며 설치 포함입니다.</div>
    <a onclick="downloadFile('A001','spec.pdf')">spec.pdf</a>
  </body>
</html>`

test("normalizes supported S2B search options and builds POST recipe", () => {
  // Given: mixed Korean aliases and dashed dates from a user request.
  const options = normalizeSearchOptions({
    keyword: "냉장고",
    organization: "가람초",
    dateStart: "2026-06-01",
    dateEnd: "2026-06-30",
    itemType: "물품",
    privateContract: "1인",
    region: "서울",
    page: "2"
  })

  // When: a browser/direct HTTP recipe is produced for the S2B list endpoint.
  const request = buildSearchRequest(options)

  // Then: the request is a form POST to the public notice path with normalized fields.
  assert.equal(options.dateStart, "20260601")
  assert.equal(options.dateEnd, "20260630")
  assert.equal(options.page, 2)
  assert.equal(request.method, "POST")
  assert.equal(request.formName, "tcmo001Form")
  assert.equal(request.path, "/S2BNCustomer/tcmo001.do")
  assert.equal(request.body.get("forwardName"), "list01")
  assert.equal(request.body.get("pageNo"), "2")
  assert.equal(request.body.get("process_yn"), "Y")
  assert.equal(request.body.get("search_yn"), "Y")
  assert.equal(request.body.get("tender_sep1"), "1")
  assert.equal(request.body.get("tender_name"), "냉장고")
  assert.equal(request.body.get("company_name_s"), "가람초")
  assert.equal(request.body.get("tender_sep2"), "2")
  assert.equal(request.body.get("tender_date_start"), "20260601")
  assert.equal(request.body.get("tender_date_end"), "20260630")
  assert.equal(request.body.get("tender_item"), "1")
  assert.equal(request.body.get("estimate_kind"), "1")
  assert.equal(request.body.get("areaKind"), "서울")
})

test("rejects invalid dates and date ranges longer than three calendar months", () => {
  // Given: malformed date input and an over-wide search window.
  // When/Then: normalization rejects both before a request recipe is built.
  assert.throws(
    () => normalizeSearchOptions({ dateStart: "2026-02-31", dateEnd: "2026-03-01" }),
    /invalid dateStart/
  )
  assert.throws(
    () => normalizeSearchOptions({ dateStart: "2026-0601", dateEnd: "2026-06-30" }),
    /invalid dateStart/
  )
  assert.throws(
    () => normalizeSearchOptions({ dateStart: "202606-01", dateEnd: "2026-06-30" }),
    /invalid dateStart/
  )
  assert.throws(
    () => normalizeSearchOptions({ dateStart: "2026-01-01", dateEnd: "2026-04-02" }),
    /3 calendar months/
  )
  assert.throws(
    () => normalizeSearchOptions({ dateStart: "2026-01-31", dateEnd: "2026-05-01" }),
    /3 calendar months/
  )
})

test("parses list fixture rows with detail action metadata", () => {
  // Given: fixture HTML shaped like the S2B notice list table.
  // When: rows are parsed.
  const rows = parseListHtml(listFixture)

  // Then: notice metadata and JavaScript detail arguments are extracted.
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    noticeCode: "EST-2026-001",
    estimateCode: "EST-2026-001",
    title: "급식실 냉장고 구매 견적요청",
    organization: "서울가람초등학교",
    status: "진행중",
    itemType: "물품",
    postedDate: "2026-06-01",
    deadline: "2026-06-10 15:00",
    detailAction: {
      functionName: "fn_detail",
      args: ["EST-2026-001", "N001"],
      raw: "fn_detail('EST-2026-001','N001'); return false;"
    }
  })
  assert.equal(rows[1].detailAction.functionName, "goView")
  assert.equal(rows[1].noticeCode, "BID-2026-002")
})

test("ignores S2B navigation rows when parsing a full page", () => {
  // Given: a full S2B page fragment where the top navigation table appears before the notice table.
  const fullPageFixture = `
  <html>
    <body>
      <table class="gnb">
        <tr>
          <td><a href="#" onclick="fncGoMenu('tgru')">1인수의 즉시견적</a></td>
          <td><a href="#" onclick="fncGoMenu('tomu1')">주문목록</a></td>
          <td>견적구매</td>
          <td>계약현황</td>
        </tr>
      </table>
      ${listFixture}
    </body>
  </html>`

  // When: the parser scans the whole page rather than an isolated result table.
  const rows = parseListHtml(fullPageFixture)

  // Then: only notice rows with date-bearing result data are returned.
  assert.equal(rows.length, 2)
  assert.equal(rows[0].title, "급식실 냉장고 구매 견적요청")
  assert.equal(rows[1].title, "방과후 프로그램 위탁")
})

test("parses detail fixture HTML into fields, content, and attachments", () => {
  // Given: an S2B-like detail fixture.
  // When: the detail parser runs.
  const detail = parseDetailHtml(detailFixture)

  // Then: table labels, body text, and action metadata are preserved.
  assert.equal(detail.title, "급식실 냉장고 구매 견적요청")
  assert.equal(detail.noticeCode, "EST-2026-001")
  assert.equal(detail.organization, "서울가람초등학교")
  assert.equal(detail.itemType, "물품")
  assert.equal(detail.privateContract, "1인 수의")
  assert.match(detail.contentText, /설치 포함/)
  assert.deepEqual(detail.attachments, [
    {
      filename: "spec.pdf",
      action: {
        functionName: "downloadFile",
        args: ["A001", "spec.pdf"],
        raw: "downloadFile('A001','spec.pdf')"
      }
    }
  ])
})

test("documents browser automation fallback order before direct HTTP", () => {
  // Given: normalized search input.
  const options = normalizeSearchOptions({ keyword: "책상", dateStart: "20260601", dateEnd: "20260630" })

  // When: automation instructions are generated.
  const instructions = buildBrowserAutomationInstructions(options)

  // Then: Aside Browser is preferred, Playwright/Chrome is fallback, and direct HTTP is last.
  assert.deepEqual(
    instructions.steps.map((step) => step.channel),
    ["aside-browser", "playwright-or-chrome-headless", "direct-http-best-effort"]
  )
  assert.match(instructions.steps[0].action, /snapshot/)
  assert.match(instructions.steps[1].action, /POST/)
  assert.match(instructions.steps[2].action, /session/)
})
