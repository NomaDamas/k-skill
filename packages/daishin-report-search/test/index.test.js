const test = require("node:test")
const assert = require("node:assert/strict")

const {
  buildReportUrls,
  fetchReport,
  listReports,
  parseReportHtml,
  parseTimestamp,
  parseTreePaths
} = require("../src/index")
const { parseArgs } = require("../src/cli")

const TREE_URL = "https://api.github.com/repos/jay-jo-0/github_pages_repo/git/trees/main?recursive=1"

function jsonResponse(value, ok = true, responseOptions = {}) {
  const headers = responseOptions.headers || {}
  const getHeader = (name) => {
    const normalized = String(name).toLowerCase()
    if (headers[normalized]) return headers[normalized]
    return normalized === "content-type" && ok ? "application/json" : null
  }
  return {
    ok,
    status: responseOptions.status || (ok ? 200 : 500),
    statusText: responseOptions.statusText || (ok ? "OK" : "Server Error"),
    headers: { get: getHeader },
    text: async () => JSON.stringify(value),
    json: async () => value
  }
}

function textResponse(value, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    headers: { get: () => "text/html; charset=utf-8" },
    text: async () => value
  }
}

function timestampPath(prefix, index) {
  const day = String((index % 28) + 1).padStart(2, "0")
  const hour = String(Math.floor(index / 28) % 24).padStart(2, "0")
  const minute = String(Math.floor(index / (28 * 24)) % 60).padStart(2, "0")
  const second = String(index % 60).padStart(2, "0")
  return `${prefix}${day}${hour}${minute}${second}.html`
}

test("parseTimestamp parses timestamp filenames into ISO-like metadata", () => {
  assert.deepEqual(parseTimestamp("20260511082352.html"), {
    id: "20260511082352",
    path: "20260511082352.html",
    date: "2026-05-11",
    time: "08:23:52",
    timestamp: "2026-05-11T08:23:52+09:00",
    epochMs: Date.parse("2026-05-10T23:23:52.000Z"),
    isExplain: false
  })
  assert.equal(parseTimestamp("20260511082352_explain.html").isExplain, true)
  assert.equal(parseTimestamp("README.md"), null)
})

test("parseTreePaths filters timestamp reports and pairs explanation pages", () => {
  const reports = parseTreePaths([
    "nested/ignored.html",
    "20260511082352.html",
    "20260511082352_explain.html",
    "20260512010102_explain.html",
    "20260512010102.html",
    "README.md"
  ])

  assert.deepEqual(reports.map((report) => report.id), ["20260512010102", "20260511082352"])
  assert.equal(reports[0].explainPath, "20260512010102_explain.html")
  assert.equal(reports[1].hasExplain, true)
})

test("buildReportUrls returns GitHub Pages, raw, and API URLs", () => {
  assert.deepEqual(buildReportUrls("20260511082352.html"), {
    pageUrl: "https://jay-jo-0.github.io/github_pages_repo/20260511082352.html",
    rawUrl: "https://raw.githubusercontent.com/Jay-jo-0/github_pages_repo/main/20260511082352.html",
    apiUrl: "https://api.github.com/repos/jay-jo-0/github_pages_repo/contents/20260511082352.html?ref=main"
  })
})

test("parseReportHtml extracts title, headings, text, rating table, and excerpt", () => {
  const parsed = parseReportHtml(`<!doctype html><html><head><title>[대신증권 류형근] 반도체업</title></head>
    <body><h1>[대신증권 류형근] [Issue & News] 반도체업: 새로운 역사</h1>
    <h2>반도체, 더 올라갑니다</h2><p>삼성전자와 SK하이닉스의 목표주가를 상향합니다.</p>
    <table><tr><th>종목명</th><th>투자의견</th><th>목표주가</th></tr><tr><td>삼성전자</td><td>Buy</td><td>450,000원</td></tr></table></body></html>`)

  assert.equal(parsed.title, "[대신증권 류형근] [Issue & News] 반도체업: 새로운 역사")
  assert.deepEqual(parsed.headings, ["[대신증권 류형근] [Issue & News] 반도체업: 새로운 역사", "반도체, 더 올라갑니다"])
  assert.match(parsed.text, /삼성전자와 SK하이닉스/)
  assert.deepEqual(parsed.ratingTargets, [{ 종목명: "삼성전자", 투자의견: "Buy", 목표주가: "450,000원" }])
  assert.ok(parsed.excerpt.length <= 300)
})

test("listReports reads the GitHub tree, sorts latest first, fetches selected titles, and preserves warnings", async () => {
  const calls = []
  const fetcher = async (url) => {
    calls.push(url)
    if (url === TREE_URL) {
      return jsonResponse({
        truncated: false,
        tree: [
          { path: "20260511082352.html", type: "blob" },
          { path: "20260511082352_explain.html", type: "blob" },
          { path: "20260514074108.html", type: "blob" },
          { path: "assets/logo.png", type: "blob" }
        ]
      })
    }
    if (url.endsWith("20260514074108.html")) return textResponse("<h1>[JAEMINI] 미국 장마감 시황 26.05.14</h1><p>시장 요약</p>")
    if (url.endsWith("20260511082352.html")) return textResponse("<h1>[대신증권 류형근] 반도체업</h1><p>반도체 리포트</p>")
    throw new Error(`unexpected url ${url}`)
  }

  const result = await listReports({ limit: 2, fetcher })

  assert.equal(result.source.treeUrl, TREE_URL)
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.items.map((item) => item.id), ["20260514074108", "20260511082352"])
  assert.equal(result.items[0].title, "[JAEMINI] 미국 장마감 시황 26.05.14")
  assert.equal(result.items[1].hasExplain, true)
  assert.equal(result.items[1].explainUrl, "https://jay-jo-0.github.io/github_pages_repo/20260511082352_explain.html")
  assert.equal(result.warnings.length, 0)
  assert.ok(calls.some((url) => url.includes("git/trees/main?recursive=1")))
})

test("listReports can query detail text beyond the first page until it finds matches", async () => {
  const fetcher = async (url) => {
    if (url === TREE_URL) {
      return jsonResponse({
        tree: [
          { path: "20260514074108.html", type: "blob" },
          { path: "20260511082352.html", type: "blob" }
        ]
      })
    }
    if (url.endsWith("20260514074108.html")) return textResponse("<h1>미국 장마감 시황</h1><p>시장</p>")
    if (url.endsWith("20260511082352.html")) return textResponse("<h1>[대신증권 류형근] 반도체업</h1><p>삼성전자 목표주가 상향</p>")
    throw new Error(`unexpected url ${url}`)
  }

  const result = await listReports({ query: "삼성전자", limit: 1, maxInspect: 2, fetcher })

  assert.deepEqual(result.items.map((item) => item.id), ["20260511082352"])
  assert.equal(result.query, "삼성전자")
})

test("listReports clamps non-finite and huge numeric options before inspecting reports", async () => {
  const detailCalls = []
  const tree = Array.from({ length: 600 }, (_, index) => ({ path: timestampPath("202605", index), type: "blob" }))
  const fetcher = async (url) => {
    if (url === TREE_URL) return jsonResponse({ tree })
    detailCalls.push(url)
    return textResponse("<h1>시장 요약</h1><p>일반 내용</p>")
  }

  const result = await listReports({ query: "없는검색어", limit: Infinity, maxInspect: 1e9, fetcher })

  assert.equal(result.count, 0)
  assert.equal(detailCalls.length, 500)
  assert.equal(result.source.inspectedReports, 500)
  assert.match(result.warnings.at(-1), /inspection budget exhausted after 500 of 600 report pages/)

  const hugeLimitResult = await listReports({ limit: 1e9, fetcher })
  assert.equal(hugeLimitResult.items.length, 50)
})

test("listReports falls back to defaults for invalid, zero, and negative numeric options", async () => {
  const detailCalls = []
  const tree = Array.from({ length: 60 }, (_, index) => ({ path: timestampPath("202604", index), type: "blob" }))
  const fetcher = async (url) => {
    if (url === TREE_URL) return jsonResponse({ tree })
    detailCalls.push(url)
    return textResponse("<h1>시장 요약</h1><p>일반 내용</p>")
  }

  const result = await listReports({ query: "없는검색어", limit: Number.NaN, maxInspect: -25, fetcher })

  assert.equal(result.count, 0)
  assert.equal(detailCalls.length, 50)
  assert.equal(result.source.inspectedReports, 50)

  const zeroLimit = await listReports({ limit: 0, maxInspect: 0, fetcher })
  assert.equal(zeroLimit.items.length, 10)
})

test("parseArgs preserves numeric option text for library validation", () => {
  assert.deepEqual(parseArgs(["--limit", "Infinity", "--max-inspect", "1e9"]), {
    limit: "Infinity",
    maxInspect: "1e9"
  })
})

test("parseReportHtml preserves malformed numeric entities instead of throwing", () => {
  const parsed = parseReportHtml("<h1>&#999999999999; &#x110000; &#65; &#x41;</h1><p>본문</p>")

  assert.match(parsed.title, /&#999999999999;/)
  assert.match(parsed.title, /&#x110000;/)
  assert.match(parsed.title, /A A/)
  assert.match(parsed.text, /본문/)
})

test("listReports returns structured source errors for GitHub tree rate limits", async () => {
  const reset = String(Math.floor(Date.parse("2026-05-14T01:00:00Z") / 1000))
  const fetcher = async (url) => {
    assert.equal(url, TREE_URL)
    return jsonResponse(
      { message: "API rate limit exceeded" },
      false,
      {
        status: 403,
        statusText: "rate limit exceeded",
        headers: {
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": reset
        }
      }
    )
  }

  const result = await listReports({ limit: 3, fetcher })

  assert.equal(result.count, 0)
  assert.deepEqual(result.items, [])
  assert.equal(result.source.totalReportsDiscovered, 0)
  assert.equal(result.source.inspectedReports, 0)
  assert.equal(result.source.error.status, 403)
  assert.equal(result.source.error.kind, "rate_limit")
  assert.equal(result.source.error.rateLimit.limit, "60")
  assert.equal(result.source.error.rateLimit.remaining, "0")
  assert.equal(result.source.error.rateLimit.reset, reset)
  assert.equal(result.source.error.rateLimit.resetAt, "2026-05-14T01:00:00.000Z")
  assert.match(result.warnings[0], /GitHub tree discovery failed: HTTP 403 rate limit exceeded/)
})

test("listReports classifies GitHub 429 responses as structured rate limits", async () => {
  const fetcher = async () => jsonResponse(
    { message: "Too Many Requests" },
    false,
    {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "retry-after": "42" }
    }
  )

  const result = await listReports({ limit: 1, fetcher })

  assert.equal(result.count, 0)
  assert.equal(result.source.error.status, 429)
  assert.equal(result.source.error.kind, "rate_limit")
  assert.equal(result.source.error.rateLimit.retryAfter, "42")
  assert.match(result.warnings[0], /GitHub tree discovery failed: HTTP 429 Too Many Requests/)
})

test("listReports sends caller GitHub headers and token to discovery requests", async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url, headers: init.headers })
    if (url === TREE_URL) return jsonResponse({ tree: [{ path: "20260511082352.html", type: "blob" }] })
    return textResponse("<h1>헤더 테스트</h1><p>본문</p>")
  }

  const result = await listReports({
    limit: 1,
    githubToken: "test-token",
    githubHeaders: { "x-github-api-version": "2022-11-28" },
    fetcher
  })

  assert.equal(result.items.length, 1)
  assert.equal(calls[0].headers.authorization, "Bearer test-token")
  assert.equal(calls[0].headers["x-github-api-version"], "2022-11-28")
  assert.equal(calls[1].headers.authorization, undefined)
  assert.equal(calls[1].headers["x-github-api-version"], undefined)
})

test("fetchReport does not forward caller GitHub auth to raw detail requests", async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url, headers: init.headers })
    return textResponse("<h1>권한 범위 테스트</h1><p>본문</p>")
  }

  const report = await fetchReport("20260511082352", {
    githubToken: "test-token",
    githubHeaders: { "x-github-api-version": "2022-11-28" },
    fetcher
  })

  assert.equal(report.title, "권한 범위 테스트")
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /raw\.githubusercontent\.com/)
  assert.equal(calls[0].headers.authorization, undefined)
  assert.equal(calls[0].headers["x-github-api-version"], undefined)
})

test("fetchReport falls back to GitHub contents API when raw exact report fetch fails", async () => {
  const calls = []
  const html = Buffer.from("<h1>콘텐츠 API 원문</h1><p>fallback body</p>", "utf8").toString("base64")
  const fetcher = async (url, init = {}) => {
    calls.push({ url, headers: init.headers })
    if (url.includes("raw.githubusercontent.com")) {
      return textResponse("not found", false)
    }
    if (url.includes("/contents/20260511082352.html")) {
      return jsonResponse({ content: html, encoding: "base64" })
    }
    throw new Error(`unexpected url ${url}`)
  }

  const report = await fetchReport("20260511082352", {
    githubToken: "test-token",
    githubHeaders: { "x-github-api-version": "2022-11-28" },
    fetcher
  })

  assert.equal(report.title, "콘텐츠 API 원문")
  assert.match(report.text, /fallback body/)
  assert.match(calls[0].url, /raw\.githubusercontent\.com/)
  assert.equal(calls[0].headers.authorization, undefined)
  assert.match(calls[1].url, /api\.github\.com/)
  assert.equal(calls[1].headers.authorization, "Bearer test-token")
  assert.equal(calls[1].headers["x-github-api-version"], "2022-11-28")
})

test("listReports reports the actual number of inspected detail pages", async () => {
  const detailCalls = []
  const tree = Array.from({ length: 10 }, (_, index) => ({ path: timestampPath("202603", index), type: "blob" }))
  const fetcher = async (url) => {
    if (url === TREE_URL) return jsonResponse({ tree })
    detailCalls.push(url)
    return textResponse("<h1>시장 요약</h1><p>일반 내용</p>")
  }

  const result = await listReports({ limit: 2, fetcher })

  assert.equal(result.items.length, 2)
  assert.equal(detailCalls.length, 2)
  assert.equal(result.source.inspectedReports, 2)
})

test("fetchReport returns detail plus optional explanation page", async () => {
  const fetcher = async (url) => {
    if (url.endsWith("20260511082352.html")) return textResponse("<h1>원문 리포트</h1><p>원문 내용</p>")
    if (url.endsWith("20260511082352_explain.html")) return textResponse("<h1>쉬운 설명</h1><p>설명 내용</p>")
    throw new Error(`unexpected url ${url}`)
  }

  const report = await fetchReport("20260511082352", { includeExplain: true, fetcher })

  assert.equal(report.id, "20260511082352")
  assert.equal(report.title, "원문 리포트")
  assert.equal(report.explain.title, "쉬운 설명")
  assert.match(report.text, /원문 내용/)
  assert.match(report.explain.text, /설명 내용/)
})
