"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")

const {
  extractModelSubsidySnapshot,
  extractStatusRows,
  getSubsidyStatusHttp,
  resolveRegionFromRows
} = require("../src/http")
const { decodePnpPayload, parsePnpAlphabets } = require("../src/pnp")

const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

test("pnp decoder derives the public substitution alphabet without executing upstream code", () => {
  const source = `var In=Array("${STANDARD_ALPHABET}"),zn={o0:In[0],o1:In[0],o2:In[0],o3:In[0],o4:In[0],o5:In[0],o6:In[0],dc:function(){}}`
  const alphabets = parsePnpAlphabets(source)
  const payload = `00${Buffer.from("화성시").toString("base64")}`
  assert.equal(decodePnpPayload(payload, alphabets).toString("utf8"), "화성시")
})

test("direct HTML parser extracts official status rows and resolves a neighborhood query to its municipality", () => {
  const html = `
    <table>
      <thead><tr><th>출고잔여 대수</th></tr></thead>
      <tbody>
        <tr>
          <td>경기</td><td>화성시</td><td>전기승용</td>
          <td><button onclick="goDownloadFile('2026','4159','A')">본공고 1</button></td>
          <td>출고등록순</td>
          <td>1,390 (100) (0) (50) (1,240)</td>
          <td>1,400 (100) (0) (50) (1,250)</td>
          <td>1,300 (90) (0) (40) (1,170)</td>
          <td>90 (10) (0) (10) (70)</td>
          <td>예산 소진으로 대상자선정 마감</td>
        </tr>
      </tbody>
    </table>`
  const rows = extractStatusRows(html)
  assert.equal(rows[0].local_code, "4159")
  assert.equal(rows[0].notice_files[0].label, "본공고 1")
  assert.deepEqual(resolveRegionFromRows("경기도 화성시 동탄", rows), {
    sidoName: "경기",
    sidoCode: "4100",
    localName: "화성시",
    localCode: "4159"
  })
})

test("direct HTML parser extracts the official model subsidy table", () => {
  const html = `
    <table>
      <thead>
        <tr>
          <th>차종</th><th>제조사</th><th>모델명</th>
          <th>국비 (만원)</th><th>지방비 (만원)</th><th>보조금 (만원)</th>
          <th>전환지원금 국비(만원)</th><th>전환지원금 지방비(만원)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>일반승용</td><td>제조사</td><td>테스트 모델 세부형 A</td>
          <td>555</td><td>185</td><td>740</td><td>100</td><td>33</td>
        </tr>
      </tbody>
    </table>`

  assert.deepEqual(extractModelSubsidySnapshot(html), {
    headers: [
      "차종",
      "제조사",
      "모델명",
      "국비 (만원)",
      "지방비 (만원)",
      "보조금 (만원)",
      "전환지원금 국비(만원)",
      "전환지원금 지방비(만원)"
    ],
    rows: [[
      "일반승용",
      "제조사",
      "테스트 모델 세부형 A",
      "555",
      "185",
      "740",
      "100",
      "33"
    ]]
  })
})

test("direct HTTP lookup returns all matching model variants without a browser", async () => {
  const statusHtml = `
    <table>
      <thead><tr><th>출고잔여 대수</th></tr></thead>
      <tbody>
        <tr>
          <td>경기</td><td>화성시</td><td>전기승용</td>
          <td><button onclick="goDownloadFile('2026','4159','A')">본공고 1</button></td>
          <td>출고등록순</td>
          <td>100 (0) (0) (0) (100)</td>
          <td>20 (0) (0) (0) (20)</td>
          <td>10 (0) (0) (0) (10)</td>
          <td>90 (0) (0) (0) (90)</td>
          <td>접수 중</td>
        </tr>
      </tbody>
    </table>`
  const modelHtml = `
    <table>
      <thead><tr>
        <th>차종</th><th>제조사</th><th>모델명</th>
        <th>국비 (만원)</th><th>지방비 (만원)</th><th>보조금 (만원)</th>
      </tr></thead>
      <tbody>
        <tr><td>일반승용</td><td>제조사</td><td>테스트 모델 세부형 A</td><td>248</td><td>82</td><td>330</td></tr>
        <tr><td>일반승용</td><td>제조사</td><td>테스트 모델 세부형 B</td><td>555</td><td>185</td><td>740</td></tr>
      </tbody>
    </table>`
  const requests = []
  const fetch = async (url, request) => {
    requests.push({ url: String(url), body: String(request.body) })
    return {
      ok: true,
      status: 200,
      text: async () => String(url).includes("psPopupLocalCarModelPrice")
        ? modelHtml
        : statusHtml
    }
  }

  const result = await getSubsidyStatusHttp({
    region: "경기도 화성시 동탄",
    vehicleType: "passenger",
    year: 2026,
    model: "테스트 모델",
    fetch
  })

  assert.equal(result.transport, "direct-http")
  assert.equal(result.model_subsidy_candidates.length, 2)
  assert.equal(result.model_subsidy_candidates[0].total_subsidy_krw, 3300000)
  assert.equal(result.model_subsidy_candidates[0].remaining_equivalent_estimate_krw, 297000000)
  assert.equal(result.model_lookup_error, undefined)
  assert.match(requests[1].body, /local_cd=4159/)
  assert.match(requests[1].body, /car_type=11/)
})
