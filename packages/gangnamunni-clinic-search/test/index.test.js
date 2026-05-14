const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")

const {
  buildSearchUrl,
  parseNextData,
  normalizeHospital,
  parseSearchHtml,
  searchClinics
} = require("../src/index")

const sampleNextData = {
  props: {
    pageProps: {
      keyword: "강남 성형외과",
      totalLength: 14216,
      hospitalTotalLength: 4,
      hospitals: [
        {
          id: 347,
          name: "강남삼성성형외과의원",
          rating: 9,
          ratingCount: 675,
          reviewCount: 764,
          pageCount: 0,
          profileImage: "https://image2.gnsister.com/images/hospital/profile/sample.jpg",
          mainImage: "https://image2.gnsister.com/images/hospital/main.jpg",
          supportingLangList: ["ko", "ja", "en"],
          assessmentState: "EFFORT",
          sido: "서울"
        },
        {
          id: 543,
          name: "강남서연성형외과의원",
          rating: 9.4,
          ratingCount: 39,
          reviewCount: 83,
          pageCount: 8,
          profileImage: "https://image2.gnsister.com/images/hospital/profile/other.jpg",
          mainImage: "https://image2.gnsister.com/images/hospital/other-main.jpg",
          supportingLangList: ["ko", "zh-Hans", "ja"],
          assessmentState: "EFFORT",
          sido: ""
        }
      ]
    }
  }
}

const sampleHtml = `<!doctype html><html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(sampleNextData).replace(/</g, "\\u003c")}</script>
</body></html>`

test("buildSearchUrl uses the public Gangnam Unni search page", () => {
  const url = buildSearchUrl("강남 성형외과")

  assert.equal(url, "https://www.gangnamunni.com/search?q=%EA%B0%95%EB%82%A8+%EC%84%B1%ED%98%95%EC%99%B8%EA%B3%BC")
})

test("parseNextData reads escaped Next.js JSON payloads", () => {
  const data = parseNextData(sampleHtml)

  assert.equal(data.props.pageProps.keyword, "강남 성형외과")
  assert.equal(data.props.pageProps.hospitals.length, 2)
})

test("parseNextData preserves literal entity-looking text inside valid JSON strings", () => {
  const data = {
    props: {
      pageProps: {
        hospitals: [{ id: 1, name: "A &quot; Clinic &amp; Care" }]
      }
    }
  }
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`

  const parsed = parseNextData(html)

  assert.equal(parsed.props.pageProps.hospitals[0].name, "A &quot; Clinic &amp; Care")
})

test("parseNextData falls back to entity-decoded legacy payloads", () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">{&quot;props&quot;:{&quot;pageProps&quot;:{&quot;keyword&quot;:&quot;강남&quot;}}}</script>`

  const parsed = parseNextData(html)

  assert.equal(parsed.props.pageProps.keyword, "강남")
})

test("parseNextData classifies login, captcha, blocked, and empty-shell failures", () => {
  assert.throws(() => parseNextData("로그인이 필요합니다"), /login required/i)
  assert.throws(() => parseNextData("captcha challenge"), /captcha/i)
  assert.throws(() => parseNextData("Access Denied"), /blocked/i)
  assert.throws(() => parseNextData("<html></html>"), /next data/i)
})

test("normalizeHospital publishes stable public clinic fields only", () => {
  assert.deepEqual(normalizeHospital(sampleNextData.props.pageProps.hospitals[0]), {
    id: 347,
    name: "강남삼성성형외과의원",
    rating: 9,
    ratingCount: 675,
    reviewCount: 764,
    pageCount: 0,
    languages: ["ko", "ja", "en"],
    assessmentState: "EFFORT",
    sido: "서울",
    profileImage: "https://image2.gnsister.com/images/hospital/profile/sample.jpg",
    mainImage: "https://image2.gnsister.com/images/hospital/main.jpg",
    url: "https://www.gangnamunni.com/hospitals/347"
  })
})

test("parseSearchHtml returns query metadata, limited clinic items, source, and warnings", () => {
  const result = parseSearchHtml(sampleHtml, { query: "강남 성형외과", limit: 1 })

  assert.equal(result.query, "강남 성형외과")
  assert.equal(result.totalLength, 14216)
  assert.equal(result.hospitalTotalLength, 4)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].name, "강남삼성성형외과의원")
  assert.deepEqual(result.sources, ["gangnamunni-search-next-data"])
  assert.match(result.warnings.join("\n"), /returned 1 of 2 parsed hospitals/)
})

test("searchClinics fetches the search page with a default timeout and parses clinics", async () => {
  const seen = []
  const fetcher = async (url, options) => {
    seen.push({ url: String(url), headers: options.headers, signal: options.signal })
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => sampleHtml
    }
  }

  const result = await searchClinics({ query: "강남 성형외과", limit: 2, fetcher })

  assert.equal(seen[0].url, buildSearchUrl("강남 성형외과"))
  assert.match(seen[0].headers["user-agent"], /k-skill\/gangnamunni-clinic-search/)
  assert.ok(seen[0].signal, "expected a default abort signal")
  assert.equal(result.items.length, 2)
})

test("searchClinics lets callers inject an abort signal", async () => {
  const controller = new AbortController()
  let seenSignal
  const fetcher = async (_url, options) => {
    seenSignal = options.signal
    return { ok: true, status: 200, statusText: "OK", text: async () => sampleHtml }
  }

  await searchClinics({ query: "강남", fetcher, signal: controller.signal })

  assert.equal(seenSignal, controller.signal)
})

test("searchClinics rejects missing query and failed upstream responses", async () => {
  await assert.rejects(() => searchClinics({ query: "" }), /query is required/)
  await assert.rejects(
    () => searchClinics({
      query: "강남",
      fetcher: async () => ({ ok: false, status: 503, statusText: "Service Unavailable" })
    }),
    (error) => {
      assert.match(error.message, /request failed.*503 Service Unavailable/)
      assert.match(error.message, /q=<redacted>/)
      assert.doesNotMatch(error.message, /%EA%B0%95%EB%82%A8|강남/)
      return true
    }
  )
})

test("CLI parses options and supports help", () => {
  const cli = require("../src/cli")

  assert.deepEqual(cli.parseArgs(["강남 성형외과", "--limit", "3", "--debug"]), {
    query: "강남 성형외과",
    limit: 3,
    debug: true
  })

  assert.equal(cli.formatError(new Error("plain failure"), { debug: false }), "plain failure")
  assert.match(cli.formatError(new Error("debug failure"), { debug: true }), /Error: debug failure/)

  const help = spawnSync(process.execPath, ["src/cli.js", "--help"], {
    cwd: __dirname + "/..",
    encoding: "utf8"
  })

  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage: gangnamunni-clinic-search/)
})
