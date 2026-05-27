const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")

const {
  CATEGORY_CONFIGS,
  buildSearchUrl,
  buildDetailUrl,
  normalizeSearchOptions,
  normalizeDetailOptions,
  parseListHtml,
  parseAttachments,
  parseDetailHtml,
  searchNotices,
  getNoticeDetail
} = require("../src/index")

const LIST_HTML = `<!doctype html><html><body>
<form name="mainform" action="./list.do" method="post">
  <input type="hidden" name="page" id="page" value="1" />
  <input type="hidden" name="multi_itm_seq" value="2" />
  <select name="srchTp" id="s_keyword"><option value="0" selected>제목</option><option value="1">내용</option></select>
  <input type="text" value="행복주택" name="srchWord" />
</form>
<div class="topTxt"><p>총 <strong class="cBrown bold">95</strong> 건 [1/10페이지]</p></div>
<div id="listTb" class="listTable colRm"><table>
<caption>주택임대 공고 및 공지 목록</caption>
<thead><tr><th>번호</th><th>제목</th><th>담당부서</th><th>등록일</th><th>조회수</th></tr></thead>
<tbody>
<tr><td>95</td><td class="txtL"><a href="#" onclick="javascript:getDetailView('304371');return false;"><span class="icoNew">NEW</span> 행복주택 예비자 계약결과 알림</a></td><td>공공주택공급부</td><td class="num">2026-05-14</td><td class="num">872</td></tr>
<tr><td>94</td><td class="txtL"><a href="#" onclick="javascript:getDetailView('304346');return false;">행복주택 예비당첨자 게시</a></td><td>공공주택공급부</td><td class="num">2026-05-14</td><td class="num">1,210</td></tr>
</tbody></table></div>
</body></html>`

const DETAIL_HTML = `<!doctype html><html><body>
<script>
const initParam = { downList: [{"brdId":"GS0401","seq":"304371","fileSeq":"1","fileSize":"131614","oriFileNm":"2025년 2차 행복주택 예비3차 계약결과.pdf","fileTp":"A"},{"brdId":"GS0401","seq":"304371","fileSeq":"2","fileSize":"2816","oriFileNm":"추가 안내문.hwp","fileTp":"A"}] };
</script>
<div class="detailTable gs0401Table firgs0401Table"><table>
<caption>행복주택 예비자 계약결과 알림</caption>
<thead><tr><th scope="col" colspan="2">행복주택 예비자 계약결과 알림</th></tr></thead>
<tbody>
<tr><td colspan="2"><ul><li><strong>등록일 : </strong>2026-05-14</li><li><strong>조회수 : </strong>875</li></ul></td></tr>
<tr><th scope="row">첨부</th><td>
<!-- icon template should not be parsed as a real attachment
<a href="#" class="btnAttach v1">.pdf</a><a href="#" class="btnAttach v2">.hwp</a>
-->
<a href="#" class="btnAttach v1" onclick="existFile('0'); return false;">2025년 2차 행복주택 예비3차 계약결과.pdf</a>
<a href="/app/com/util/htmlConverter.do?brd_id=GS0401&amp;seq=304371&amp;data_tp=A&amp;file_seq=1" class="btn btnWhite h32 icoView">미리보기</a>
<a href="#" class="btnAttach v2" onclick="existFile('1'); return false;">추가 안내문.hwp</a>
<a href="/app/com/util/htmlConverter.do?brd_id=GS0401&amp;seq=304371&amp;data_tp=A&amp;file_seq=2" class="btn btnWhite h32 icoView">미리보기</a>
</td></tr>
<tr><td colspan="2" class="cont"><p>행복주택 예비자 계약결과알림</p><p>2025년 2차 행복주택 입주자모집 계약 결과입니다.</p></td></tr>
</tbody></table></div>
<form name="mainform"><input type="hidden" name="srchWord" id="srchWord" value="행복주택" /></form>
<ul class="personInfo"><li><span>담당부서</span> : 공공주택공급부</li></ul>
</body></html>`

const BLOCKED_HTML = `<!doctype html><html><body>
  <main>
    <h1>서비스 점검 안내</h1>
    <p>NetFunnel 대기열 또는 로그인 확인 후 다시 이용해 주세요.</p>
  </main>
</body></html>`

test("normalizeSearchOptions defaults keyword searches to SH title scope", () => {
  const options = normalizeSearchOptions({ keyword: "행복주택", limit: 50, page: "2" })

  assert.equal(options.keyword, "행복주택")
  assert.equal(options.srchTp, "0")
  assert.equal(options.page, 2)
  assert.equal(options.pageSize, 10)
  assert.equal(options.category, "rent")
})

test("normalizeSearchOptions maps content scope, category aliases, and status", () => {
  const options = normalizeSearchOptions({ q: "매입임대", searchType: "내용", category: "주거복지", status: "진행" })

  assert.equal(options.srchTp, "1")
  assert.equal(options.category, "purchase")
  assert.equal(options.status, "open")
})

test("normalizeSearchOptions rejects invalid bounded inputs", () => {
  assert.throws(() => normalizeSearchOptions({ q: "x".repeat(101) }), /100 characters/)
  assert.throws(() => normalizeSearchOptions({ page: "abc" }), /valid page/)
  assert.throws(() => normalizeSearchOptions({ category: "unknown" }), /Unsupported SH category/)
  assert.throws(() => normalizeSearchOptions({ status: "maybe" }), /Unsupported SH status/)
})

test("buildSearchUrl targets the public SH list page directly and sets srchTp", () => {
  const url = buildSearchUrl(normalizeSearchOptions({ q: "행복주택", category: "rent" }))

  assert.equal(url.hostname, "www.i-sh.co.kr")
  assert.equal(url.pathname, CATEGORY_CONFIGS.rent.path + "/list.do")
  assert.equal(url.searchParams.get("srchWord"), "행복주택")
  assert.equal(url.searchParams.get("srchTp"), "0")
  assert.equal(url.searchParams.get("multi_itm_seq"), "2")
})

test("buildSearchUrl normalizes public helper inputs before building URLs", () => {
  const koreanAlias = buildSearchUrl({ keyword: "행복주택", category: "임대", page: 1 })
  const englishAlias = buildSearchUrl({ keyword: "행복주택", category: "rent", page: 1 })

  assert.equal(koreanAlias.pathname, CATEGORY_CONFIGS.rent.path + "/list.do")
  assert.equal(koreanAlias.searchParams.get("srchWord"), "행복주택")
  assert.equal(koreanAlias.searchParams.get("srchTp"), "0")
  assert.equal(koreanAlias.searchParams.get("multi_itm_seq"), "2")
  assert.equal(englishAlias.searchParams.get("srchTp"), "0")
})

test("buildDetailUrl normalizes public helper inputs before building URLs", () => {
  const url = buildDetailUrl({ seq: "304371", category: "임대" })

  assert.equal(url.hostname, "www.i-sh.co.kr")
  assert.equal(url.pathname, CATEGORY_CONFIGS.rent.path + "/view.do")
  assert.equal(url.searchParams.get("multi_itm_seq"), "2")
  assert.equal(url.searchParams.get("seq"), "304371")
})

test("buildSearchUrl uses official category-specific board paths", () => {
  const sale = buildSearchUrl(normalizeSearchOptions({ category: "분양" }))
  const welfare = buildSearchUrl(normalizeSearchOptions({ category: "welfare" }))

  assert.equal(sale.pathname, CATEGORY_CONFIGS.sale.path + "/list.do")
  assert.equal(sale.searchParams.get("multi_itm_seq"), "1")
  assert.equal(welfare.pathname, CATEGORY_CONFIGS.purchase.path + "/list.do")
  assert.equal(welfare.searchParams.get("multi_itm_seq"), "512")
})

test("parseListHtml returns rows, total count, category, and detail URLs", () => {
  const result = parseListHtml(LIST_HTML, normalizeSearchOptions({ q: "행복주택", category: "rent" }))

  assert.equal(result.summary.total_count, 95)
  assert.equal(result.summary.returned_count, 2)
  assert.equal(result.items[0].seq, "304371")
  assert.equal(result.items[0].title, "행복주택 예비자 계약결과 알림")
  assert.equal(result.items[0].views, 872)
  assert.equal(result.items[0].is_new, true)
  assert.equal(result.items[0].category, "rent")
  assert.equal(result.items[0].category_name, "주택임대")
  assert.match(result.items[0].detail_url, /www\.i-sh\.co\.kr/)
})

test("parseListHtml normalizes public helper inputs before parsing", () => {
  const result = parseListHtml(LIST_HTML, { keyword: "행복주택", category: "임대", page: 1 })

  assert.equal(result.query.category, "rent")
  assert.equal(result.query.category_name, "주택임대")
  assert.equal(result.query.srch_tp, "0")
  assert.equal(result.summary.page, 1)
  assert.equal(result.summary.page_size, 10)
  assert.equal(result.items[0].category, "rent")
  assert.equal(result.items[0].category_name, "주택임대")
  assert.match(result.source.url, /srchTp=0/)
})

test("parseListHtml warns when SH returns block or maintenance HTML without list markup", () => {
  const result = parseListHtml(BLOCKED_HTML, { keyword: "행복주택", category: "임대" })

  assert.equal(result.summary.returned_count, 0)
  assert.equal(result.summary.total_count, null)
  assert.match(result.warnings.join("\n"), /unexpected SH list HTML.*NetFunnel.*로그인.*점검/i)
})

test("parseListHtml applies conservative status filtering after parsing", () => {
  const closed = parseListHtml(LIST_HTML, normalizeSearchOptions({ status: "closed" }))
  const open = parseListHtml(LIST_HTML, normalizeSearchOptions({ status: "open" }))

  assert.equal(closed.items.length, 1)
  assert.match(closed.items[0].title, /계약결과/)
  assert.equal(open.items.length, 0)
})

test("parseDetailHtml normalizes public helper inputs before parsing", () => {
  const detail = parseDetailHtml(DETAIL_HTML, { seq: "304371", category: "임대" })

  assert.equal(detail.seq, "304371")
  assert.equal(detail.category, "rent")
  assert.equal(detail.category_name, "주택임대")
  assert.equal(detail.attachments.length, 2)
  assert.match(detail.detail_url, /multi_itm_seq=2/)
})

test("parseDetailHtml warns when SH returns block or maintenance HTML without detail markup", () => {
  const detail = parseDetailHtml(BLOCKED_HTML, { seq: "304371", category: "임대" })

  assert.equal(detail.seq, "304371")
  assert.equal(detail.title, undefined)
  assert.deepEqual(detail.attachments, [])
  assert.match(detail.warnings.join("\n"), /unexpected SH detail HTML.*NetFunnel.*로그인.*점검/i)
})

test("parseAttachments exposes only SH-origin htmlConverter preview URLs", () => {
  const html = DETAIL_HTML.replace(
    "/app/com/util/htmlConverter.do?brd_id=GS0401&amp;seq=304371&amp;data_tp=A&amp;file_seq=1",
    "https://evil.example/htmlConverter.do?brd_id=GS0401&amp;seq=304371&amp;data_tp=A&amp;file_seq=1"
  )

  const attachments = parseAttachments(html)

  assert.equal(attachments[0].filename, "2025년 2차 행복주택 예비3차 계약결과.pdf")
  assert.equal(attachments[0].preview_url, undefined)
  assert.equal(attachments[0].file_seq, undefined)
  assert.equal(attachments[1].preview_url, "https://www.i-sh.co.kr/app/com/util/htmlConverter.do?brd_id=GS0401&seq=304371&data_tp=A&file_seq=2")
})

test("parseDetailHtml extracts real attachments by existFile onclick, not icon templates", () => {
  const detail = parseDetailHtml(DETAIL_HTML, normalizeDetailOptions({ seq: "304371", category: "rent" }))

  assert.equal(detail.seq, "304371")
  assert.equal(detail.title, "행복주택 예비자 계약결과 알림")
  assert.equal(detail.registered_date, "2026-05-14")
  assert.equal(detail.views, 875)
  assert.equal(detail.department, "공공주택공급부")
  assert.match(detail.content_text, /입주자모집 계약 결과/)
  assert.equal(detail.attachments.length, 2)
  assert.deepEqual(detail.attachments[0], {
    filename: "2025년 2차 행복주택 예비3차 계약결과.pdf",
    file_seq: "1",
    file_size: 131614,
    file_type: "A",
    preview_url: "https://www.i-sh.co.kr/app/com/util/htmlConverter.do?brd_id=GS0401&seq=304371&data_tp=A&file_seq=1"
  })
  assert.equal(Object.hasOwn(detail.attachments[0], "download_url"), false)
})

test("searchNotices and getNoticeDetail fetch official SH HTML with caller-injected fetch", async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    return { ok: true, status: 200, statusText: "OK", text: async () => String(url).includes("view.do") ? DETAIL_HTML : LIST_HTML }
  }

  const list = await searchNotices({ keyword: "행복주택", fetcher })
  const detail = await getNoticeDetail({ seq: list.items[0].seq, fetcher })

  assert.equal(calls[0].url, buildSearchUrl(normalizeSearchOptions({ keyword: "행복주택" })).toString())
  assert.match(calls[0].options.headers["user-agent"], /k-skill\/sh-notice-search/)
  assert.equal(list.items.length, 2)
  assert.equal(detail.notice.attachments.length, 2)
})

test("CLI parses options and prints help", () => {
  const cli = require("../src/cli")

  assert.deepEqual(cli.parseArgs(["행복주택", "--category", "임대", "--status", "마감", "--page", "5", "--limit", "20"]), {
    keyword: "행복주택",
    category: "임대",
    status: "마감",
    page: "5",
    limit: "20"
  })

  const help = spawnSync(process.execPath, ["src/cli.js", "--help"], {
    cwd: __dirname + "/..",
    encoding: "utf8"
  })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage: sh-notice-search/)
})
