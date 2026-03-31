const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  buildProductUrl,
  buildReviewsUrl,
  buildSearchUrl,
  detectBlockedAccess,
  getProductDetail,
  getProductReviews,
  parseProductDetailHtml: parseProductDetailHtmlFromEntrypoint,
  parseReviewsHtml: parseReviewsHtmlFromEntrypoint,
  parseSearchResultsHtml: parseSearchResultsHtmlFromEntrypoint,
  probeAutomation,
  searchProducts
} = require("../src/index")
const {
  parseProductDetailHtml,
  parseReviewsHtml,
  parseSearchResultsHtml
} = require("../src/parse")

const fixturesDir = path.join(__dirname, "fixtures")
const repoRoot = path.resolve(__dirname, "..", "..", "..")
const searchHtml = fs.readFileSync(path.join(fixturesDir, "search.html"), "utf8")
const detailHtml = fs.readFileSync(path.join(fixturesDir, "detail.html"), "utf8")
const reviewsHtml = fs.readFileSync(path.join(fixturesDir, "reviews.html"), "utf8")
const blockedHtml = fs.readFileSync(path.join(fixturesDir, "access-denied.html"), "utf8")
const privacyChallengeHtml = fs.readFileSync(path.join(fixturesDir, "privacy-challenge.html"), "utf8")
const coupangDocsFiles = [
  path.join(repoRoot, "packages/coupang-product-search/README.md"),
  path.join(repoRoot, "docs/features/coupang-product-search.md"),
  path.join(repoRoot, "coupang-product-search/SKILL.md")
]

test("buildSearchUrl and product/review URL helpers keep official Coupang URL shapes", () => {
  assert.equal(
    buildSearchUrl("생수"),
    "https://www.coupang.com/np/search?q=%EC%83%9D%EC%88%98"
  )
  assert.equal(
    buildSearchUrl("생수", { mobile: true, page: 2 }),
    "https://m.coupang.com/nm/search?q=%EC%83%9D%EC%88%98&page=2"
  )

  const productUrl = buildProductUrl({
    productId: "8279248260",
    itemId: "23867985514",
    vendorItemId: "91250239123"
  })

  assert.equal(
    productUrl,
    "https://www.coupang.com/vp/products/8279248260?itemId=23867985514&vendorItemId=91250239123"
  )
  assert.equal(buildReviewsUrl(productUrl), `${productUrl}#sdpReview`)
})

test("parseSearchResultsHtml normalizes official search cards into ranked product candidates", () => {
  const result = parseSearchResultsHtml(searchHtml, {
    query: "생수",
    searchUrl: buildSearchUrl("생수")
  })

  assert.equal(result.blocked, false)
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.items[0], {
    rank: 1,
    productId: "8279248260",
    itemId: "23867985514",
    vendorItemId: "91250239123",
    productUrl: "https://www.coupang.com/vp/products/8279248260?itemId=23867985514&vendorItemId=91250239123&sourceType=SEARCH",
    name: "웅진 빅토리아 탄산수 플레인, 500ml, 20개",
    sellerName: "웅진직영",
    price: 15900,
    originalPrice: 17900,
    unitPrice: "100ml당 159원",
    currency: "KRW",
    rating: 4.8,
    ratingCount: 12345,
    badges: ["로켓배송", "무료배송"]
  })
  assert.equal(result.items[1].sellerName, "쿠팡")
})

test("package entrypoint re-exports the parser helpers documented in the public API", () => {
  assert.equal(parseSearchResultsHtmlFromEntrypoint, parseSearchResultsHtml)
  assert.equal(parseProductDetailHtmlFromEntrypoint, parseProductDetailHtml)
  assert.equal(parseReviewsHtmlFromEntrypoint, parseReviewsHtml)
})

test("parseProductDetailHtml extracts product facts, price, review summary, and inline reviews", () => {
  const detail = parseProductDetailHtml(detailHtml, {
    productUrl: buildProductUrl({
      productId: "8279248260",
      itemId: "23867985514",
      vendorItemId: "91250239123"
    })
  })

  assert.equal(detail.title, "웅진 빅토리아 탄산수 플레인, 500ml, 20개")
  assert.equal(detail.productId, "8279248260")
  assert.equal(detail.itemId, "23867985514")
  assert.equal(detail.vendorItemId, "91250239123")
  assert.equal(detail.price, 15900)
  assert.equal(detail.originalPrice, 17900)
  assert.equal(detail.discountRate, 11)
  assert.equal(detail.unitPrice, "100ml당 159원")
  assert.equal(detail.currency, "KRW")
  assert.equal(detail.rating, 4.8)
  assert.equal(detail.ratingCount, 12345)
  assert.equal(detail.sellerName, "웅진직영")
  assert.equal(detail.arrivalText, "내일(수) 4/1 도착 보장")
  assert.deepEqual(detail.badges, ["로켓배송", "무료반품"])
  assert.equal(detail.rewardCashText, "최대 795원 캐시적립")
  assert.equal(detail.facts["제조국"], "대한민국")
  assert.equal(detail.reviewSummary.averageRating, 4.8)
  assert.equal(detail.reviewSummary.totalCount, 12345)
  assert.deepEqual(detail.reviewSummary.keywords, ["탄산이 강해요", "가격이 좋아요"])
  assert.equal(detail.inlineReviews[0].reviewId, "rvw1")
  assert.equal(detail.inlineReviews[0].helpfulCount, 12)
})

test("parseReviewsHtml extracts normalized review items and summary metadata", () => {
  const reviews = parseReviewsHtml(reviewsHtml, {
    reviewUrl: buildReviewsUrl(
      buildProductUrl({
        productId: "8279248260",
        itemId: "23867985514",
        vendorItemId: "91250239123"
      })
    )
  })

  assert.equal(reviews.productId, "8279248260")
  assert.equal(reviews.summary.averageRating, 4.8)
  assert.equal(reviews.summary.totalCount, 12345)
  assert.equal(reviews.summary.currentPage, 1)
  assert.equal(reviews.summary.totalPages, 6173)
  assert.equal(reviews.items.length, 2)
  assert.equal(reviews.items[1].author, "j***")
  assert.equal(reviews.items[1].rating, 4)
  assert.equal(reviews.items[1].helpfulCount, 3)
})

test("public client helpers can consume injected browser HTML resolvers", async () => {
  const search = await searchProducts("생수", {
    fetchHtml: async (url) => {
      assert.match(String(url), /np\/search\?q=/)
      return searchHtml
    }
  })

  const detail = await getProductDetail(
    {
      productId: "8279248260",
      itemId: "23867985514",
      vendorItemId: "91250239123"
    },
    {
      fetchHtml: async (url) => {
        assert.match(String(url), /vp\/products\/8279248260/)
        return detailHtml
      }
    }
  )

  const reviews = await getProductReviews(detail.productUrl, {
    fetchHtml: async (url) => {
      assert.match(String(url), /#sdpReview$/)
      return reviewsHtml
    }
  })

  assert.equal(search.items[0].productId, "8279248260")
  assert.equal(detail.title, "웅진 빅토리아 탄산수 플레인, 500ml, 20개")
  assert.equal(reviews.items[0].reviewId, "rvw1")
})

test("detectBlockedAccess and probeAutomation classify direct fetch/headless failures conservatively", async () => {
  const detection = detectBlockedAccess(blockedHtml, { status: 200 })
  const challenge = detectBlockedAccess(privacyChallengeHtml, { status: 200 })

  assert.equal(detection.blocked, true)
  assert.equal(detection.reason, "access-denied-html")
  assert.match(detection.snippet, /Access Denied/)
  assert.equal(challenge.blocked, true)
  assert.equal(challenge.reason, "challenge-html")

  const report = await probeAutomation("생수", {
    fetchImpl: async (url) => {
      if (String(url).includes("m.coupang.com")) {
        return new Response(privacyChallengeHtml, { status: 200 })
      }

      return new Response(blockedHtml, { status: 403 })
    },
    browserFetchHtml: async (url) => {
      assert.match(String(url), /m\.coupang\.com\/nm\/search/)
      return blockedHtml
    }
  })

  assert.equal(report.query, "생수")
  assert.equal(report.directDesktop.blocked, true)
  assert.equal(report.directDesktop.status, 403)
  assert.equal(report.directMobile.blocked, true)
  assert.equal(report.directMobile.reason, "challenge-html")
  assert.equal(report.browser.blocked, true)
  assert.equal(report.browser.reason, "access-denied-html")
})

test("probeAutomation keeps 403 access-denied mobile responses blocked", async () => {
  const report = await probeAutomation("생수", {
    fetchImpl: async () => new Response(blockedHtml, { status: 403 })
  })

  assert.equal(report.directDesktop.blocked, true)
  assert.equal(report.directDesktop.reason, "access-denied-html")
  assert.equal(report.directDesktop.status, 403)
  assert.equal(report.directMobile.blocked, true)
  assert.equal(report.directMobile.reason, "access-denied-html")
  assert.equal(report.directMobile.status, 403)
  assert.equal(report.browser, null)
})

test("repo docs describe Coupang anti-bot outcomes as variable blocked results", () => {
  for (const file of coupangDocsFiles) {
    const contents = fs.readFileSync(file, "utf8")

    assert.match(
      contents,
      /status\/reason.*vary|status\/reason.*달라질 수|차단 응답.*달라질 수|blocked shape.*vary/i,
      file
    )
    assert.doesNotMatch(contents, /mobile direct HTTP.*200 challenge HTML|m\.coupang\.com.*200 challenge HTML/i, file)
  }
})

test("repo docs explain that probeAutomation leaves browser null without browserFetchHtml", () => {
  for (const file of coupangDocsFiles) {
    const contents = fs.readFileSync(file, "utf8")

    assert.match(contents, /browserFetchHtml/i, file)
    assert.match(
      contents,
      /browser[^.\n]*null|browser === null|browser 값은 .*null/i,
      file
    )
  }
})

test("repo docs label populated browser probe results as injected manual or external verification", () => {
  for (const file of coupangDocsFiles) {
    const contents = fs.readFileSync(file, "utf8")

    assert.match(
      contents,
      /browserFetchHtml[^.\n]*(manual|external|수동|외부)|(?:manual|external|수동|외부)[^.\n]*browserFetchHtml/i,
      file
    )
  }
})
