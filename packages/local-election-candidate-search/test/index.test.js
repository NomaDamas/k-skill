const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")

const {
  ELECTION_CODE_ALIASES,
  buildSearchRequest,
  normalizeSearchOptions,
  parseSearchHtml,
  searchCandidates
} = require("../src/index")

const SEARCH_HTML = `<!doctype html><html><body>
<div class="resultDiv">
  <div class="result" data-birthday="19610104">
    <p class="name"><strong>오세훈</strong><span class="hanja">(吳世&#21234;)</span> <span class="date"> 1961년 01월 04일(남) </span></p>
    <div class="list" data-election-type="4" data-old-election-type="1"
      data-election-code="3" data-election-name="20260603"
      data-city-code="1100" data-sgg-city-code="3110000"
      data-town-code="1" data-sgg-town-code="3110000"
      data-town-code-from-sgg="1" data-proportional-representation-code="200"
      data-date-code='0' data-time-code='0'>
      <div class="t">
        <button type="button" class="tt cursorPointer markClick" aria-expanded="false"><mark>[2026.06.03] 제9회 전국동시지방선거</mark></button>
        국민의힘<span class="slash"> /</span>
        시·도지사선거 <span class="slash"> /</span> 서울특별시
      </div>
      <button type="button" class="more">자세히보기</button>
      <div class="box">
        <table class="data"><tbody>
          <tr><td class="th"><p>직업</p></td><td>서울특별시장</td><td class="th" rowspan="2"><p>경력</p></td><td rowspan="2"><p>(현)제39대 서울특별시장</p><p>(전)제16대 국회의원</p></td></tr>
          <tr><td class="th"><p>학력</p></td><td>고려대학교 대학원 법학과 졸업(법학박사)</td></tr>
        </tbody></table>
      </div>
    </div>
  </div>
  <div class="result" data-birthday="19370604">
    <p class="name"><strong>김동연</strong><span class="hanja">(金東蓮)</span> <span class="date"> 1937년 06월 04일(여) </span></p>
    <div class="list" data-election-type="4" data-old-election-type="1"
      data-election-code="6" data-election-name="20140604"
      data-city-code="1100" data-sgg-city-code="6112001"
      data-town-code="1120" data-sgg-town-code="6112001"
      data-town-code-from-sgg="1120" data-proportional-representation-code="200"
      data-date-code='0' data-time-code='0'>
      <div class="t">
        <button type="button" class="tt cursorPointer markClick" aria-expanded="false"><mark>[2014.06.04] 제6회 전국동시지방선거</mark></button>
        새누리당<span class="slash"> /</span>
        구·시·군의회의원선거<span class="slash"> /</span> 서울특별시(동작구가선거구)<span class="slash"> /</span> 2,371표 (9.55%)
      </div>
      <div class="box"><table class="data"><tbody>
        <tr><td class="th"><p>직업</p></td><td>동작구의회의원</td><td class="th" rowspan="2"><p>경력</p></td><td rowspan="2"><p>(전)한나라당 동작구(갑) 여성부장</p><p>(현)동작구의회의원(5,6대)</p></td></tr>
        <tr><td class="th"><p>학력</p></td><td>부산동래여자고등학교 졸업</td></tr>
      </tbody></table></div>
    </div>
    <div class="list" data-election-code="2" data-election-name="20240410" data-city-code="4100">
      <div class="t"><button><mark>[2024.04.10] 제22대 국회의원선거</mark></button>개혁신당<span class="slash"> /</span> 국회의원선거<span class="slash"> /</span> 경기도</div>
    </div>
  </div>
</div>
</body></html>`

const EMPTY_HTML = `<!doctype html><html><body><article class="content"><div class="resultDiv"></div><script>fn_firstView();</script></article></body></html>`
const BLOCKED_HTML = `<!doctype html><html><body><h1>서비스 점검 안내</h1><p>NetFunnel 대기열 또는 로그인 확인 후 다시 이용해 주세요.</p></body></html>`

test("normalizeSearchOptions requires an exact candidate name and defaults to local elections", () => {
  const options = normalizeSearchOptions({ q: " 오세훈 ", limit: "200" })

  assert.equal(options.name, "오세훈")
  assert.equal(options.localOnly, true)
  assert.equal(options.limit, 100)
  assert.equal(options.electionCode, null)
  assert.throws(() => normalizeSearchOptions({ q: "" }), /candidate name/)
  assert.throws(() => normalizeSearchOptions({ q: "가".repeat(31) }), /30 characters/)
})

test("normalizeSearchOptions maps Korean election aliases", () => {
  const governor = normalizeSearchOptions({ name: "오세훈", election: "시도지사", city: "서울" })
  const council = normalizeSearchOptions({ name: "김동연", electionCode: "기초의원" })

  assert.equal(governor.electionCode, "3")
  assert.equal(governor.region, "서울")
  assert.equal(council.electionCode, "6")
  assert.equal(ELECTION_CODE_ALIASES.get("교육감"), "11")
  assert.throws(() => normalizeSearchOptions({ name: "오세훈", election: "대통령" }), /Unsupported local election type/)
})

test("buildSearchRequest posts to the official NEC integrated candidate search", () => {
  const request = buildSearchRequest({ name: "오세훈" })

  assert.equal(request.url, "https://info.nec.go.kr/search/searchCandidate.xhtml")
  assert.equal(request.method, "POST")
  assert.equal(request.headers["content-type"], "application/x-www-form-urlencoded;charset=UTF-8")
  assert.equal(new URLSearchParams(request.body).get("searchKeyword"), "오세훈")
})

test("parseSearchHtml returns local election candidate entries with profile fields", () => {
  const result = parseSearchHtml(SEARCH_HTML, { name: "오세훈" })

  assert.equal(result.summary.returned_count, 2)
  assert.equal(result.items[0].name, "오세훈")
  assert.equal(result.items[0].hanja, "吳世勲")
  assert.equal(result.items[0].birth_date, "1961-01-04")
  assert.equal(result.items[0].gender, "남")
  assert.equal(result.items[0].election_date, "2026-06-03")
  assert.equal(result.items[0].election_name, "제9회 전국동시지방선거")
  assert.equal(result.items[0].election_type, "시·도지사선거")
  assert.equal(result.items[0].party, "국민의힘")
  assert.equal(result.items[0].district, "서울특별시")
  assert.equal(result.items[0].job, "서울특별시장")
  assert.match(result.items[0].career.join("\n"), /제39대 서울특별시장/)
  assert.equal(result.items[1].votes, 2371)
  assert.equal(result.items[1].vote_share, "9.55%")
})

test("parseSearchHtml filters non-local elections by default and can include all", () => {
  const local = parseSearchHtml(SEARCH_HTML, { name: "김동연" })
  const all = parseSearchHtml(SEARCH_HTML, { name: "김동연", localOnly: false })

  assert.equal(local.items.length, 2)
  assert.equal(local.items.every((item) => item.is_local_election), true)
  assert.equal(all.items.length, 3)
  assert.equal(all.items.at(-1).election_type, "국회의원선거")
})

test("parseSearchHtml supports election/date/region filters", () => {
  const result = parseSearchHtml(SEARCH_HTML, { name: "김동연", electionCode: "기초의원", electionDate: "2014.06.04", region: "동작" })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].election_code, "6")
  assert.equal(result.items[0].district, "서울특별시(동작구가선거구)")
})

test("parseSearchHtml reports empty and blocked pages as explicit failure modes", () => {
  const empty = parseSearchHtml(EMPTY_HTML, { name: "없는후보" })
  const blocked = parseSearchHtml(BLOCKED_HTML, { name: "오세훈" })

  assert.equal(empty.items.length, 0)
  assert.match(empty.warnings.join("\n"), /no candidate results/i)
  assert.equal(blocked.items.length, 0)
  assert.match(blocked.warnings.join("\n"), /unexpected NEC search HTML.*NetFunnel.*로그인.*점검/i)
})

test("searchCandidates uses injectable fetch for deterministic behavior", async () => {
  const calls = []
  const result = await searchCandidates({ name: "오세훈" }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200, text: async () => SEARCH_HTML }
    }
  })

  assert.equal(calls[0].url, "https://info.nec.go.kr/search/searchCandidate.xhtml")
  assert.equal(calls[0].init.method, "POST")
  assert.equal(result.items[0].name, "오세훈")
})

test("CLI prints JSON search results", () => {
  const cli = require.resolve("../src/cli")
  const proc = spawnSync(process.execPath, [cli, "오세훈", "--fixture", "test/fixture-search.html", "--limit", "1"], {
    cwd: require("node:path").join(__dirname, ".."),
    encoding: "utf8"
  })

  assert.equal(proc.status, 0, proc.stderr)
  const data = JSON.parse(proc.stdout)
  assert.equal(data.items.length, 1)
  assert.equal(data.items[0].name, "오세훈")
})
