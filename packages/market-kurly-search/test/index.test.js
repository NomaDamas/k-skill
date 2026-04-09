const test = require("node:test")
const assert = require("node:assert/strict")

const { countProducts, getProductDetail, searchProducts } = require("../src/index")
const {
  extractNextDataJson,
  findProductDetail,
  normalizeCountResponse,
  normalizeSearchResponse
} = require("../src/parse")

const searchPayload = {
  success: true,
  message: null,
  data: {
    meta: {
      pagination: {
        total: 2,
        count: 2,
        perPage: 96,
        currentPage: 1,
        totalPages: 1
      },
      actualKeyword: "딸기"
    },
    listSections: [
      {
        view: {
          sectionCode: "PRODUCT_LIST",
          version: "v1"
        },
        data: {
          items: [
            {
              no: 5048935,
              name: "금실 딸기 2종",
              shortDescription: "새콤달콤 제철 딸기",
              listImageUrl: "https://product-image.kurly.com/example-1.jpg",
              salesPrice: 13900,
              discountedPrice: 9900,
              discountRate: 28.0,
              isSoldOut: false,
              deliveryTypeNames: ["샛별배송"],
              reviewCount: 321,
              isPurchaseStatus: true
            },
            {
              no: 1234,
              name: "냉동 딸기 1kg",
              shortDescription: "스무디용 냉동 딸기",
              listImageUrl: "https://product-image.kurly.com/example-2.jpg",
              salesPrice: 8900,
              discountedPrice: null,
              discountRate: 0,
              isSoldOut: true,
              deliveryTypeNames: ["택배배송"],
              reviewCount: 12,
              isPurchaseStatus: false
            }
          ]
        }
      }
    ]
  }
}

const countPayload = {
  data: {
    count: 468
  }
}

const detailHtml = `<!doctype html><html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      product: {
        no: 5063110,
        name: "[연세우유 x 마켓컬리] 전용목장우유 900mL",
        shortDescription: "가격, 퀄리티 모두 만족스러운 1A등급 우유",
        basePrice: 2780,
        salesPrice: 2780,
        discountedPrice: null,
        discountRate: 0,
        isSoldOut: false,
        deliveryTypeNames: ["샛별배송(내일 아침)"],
        imageUrl: "https://product-image.kurly.com/example-detail.jpg"
      }
    }
  }
})}</script></body></html>`

const discountedDetailHtml = `<!doctype html><html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      product: {
        productNo: 5048935,
        name: "금실 딸기 2종",
        shortDescription: "새콤달콤 제철 딸기",
        basePrice: 9900,
        retailPrice: 13900,
        discountRate: 28,
        isSoldOut: false,
        deliveryTypeNames: ["샛별배송"],
        showablePrices: {
          salesPrice: 9900,
          basePrice: null,
          retailPrice: 13900,
          couponDiscountedPrice: null
        },
        mainImageUrl: "https://img-cf.kurly.com/shop/data/goods/1581671553838l0.jpg"
      }
    }
  }
})}</script></body></html>`

test("normalizeSearchResponse returns public Market Kurly product candidates", () => {
  const result = normalizeSearchResponse(searchPayload, "딸기")

  assert.equal(result.query, "딸기")
  assert.equal(result.pagination.total, 2)
  assert.equal(result.items[0].productNo, 5048935)
  assert.equal(result.items[0].currentPrice, 9900)
  assert.equal(result.items[0].originalPrice, 13900)
  assert.equal(result.items[0].discountRate, 28)
  assert.equal(result.items[0].isSoldOut, false)
  assert.equal(result.items[0].goodsUrl, "https://www.kurly.com/goods/5048935")
  assert.deepEqual(result.items[0].deliveryTypeNames, ["샛별배송"])
  assert.equal(result.items[1].currentPrice, 8900)
})

test("normalizeCountResponse extracts the numeric result count", () => {
  assert.deepEqual(normalizeCountResponse(countPayload, "우유"), {
    query: "우유",
    count: 468
  })
})

test("extractNextDataJson and findProductDetail parse the goods page payload", () => {
  const nextData = extractNextDataJson(detailHtml)
  const detail = findProductDetail(nextData)

  assert.equal(detail.productNo, 5063110)
  assert.equal(detail.name, "[연세우유 x 마켓컬리] 전용목장우유 900mL")
  assert.equal(detail.currentPrice, 2780)
  assert.equal(detail.originalPrice, 2780)
  assert.equal(detail.isSoldOut, false)
  assert.deepEqual(detail.deliveryTypeNames, ["샛별배송(내일 아침)"])
  assert.equal(detail.goodsUrl, "https://www.kurly.com/goods/5063110")
})

test("findProductDetail normalizes discounted goods page payloads", () => {
  const nextData = extractNextDataJson(discountedDetailHtml)
  const detail = findProductDetail(nextData)

  assert.equal(detail.productNo, 5048935)
  assert.equal(detail.currentPrice, 9900)
  assert.equal(detail.originalPrice, 13900)
  assert.equal(detail.basePrice, 13900)
  assert.equal(detail.salesPrice, 9900)
  assert.equal(detail.discountedPrice, 9900)
  assert.equal(detail.imageUrl, "https://img-cf.kurly.com/shop/data/goods/1581671553838l0.jpg")
  assert.deepEqual(detail.deliveryTypeNames, ["샛별배송"])
})

test("public client helpers consume injected fetch fixtures", async () => {
  const originalFetch = global.fetch
  const seen = []

  global.fetch = async (url) => {
    seen.push(String(url))

    if (String(url).includes("/search/v4/sites/market/normal-search")) {
      return makeJsonResponse(searchPayload)
    }

    if (String(url).includes("/search/v3/sites/market/normal-search/count")) {
      return makeJsonResponse(countPayload)
    }

    if (String(url).includes("/goods/5063110")) {
      return new Response(detailHtml, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      })
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const searchResult = await searchProducts("딸기")
    assert.equal(searchResult.items[0].productNo, 5048935)

    const countResult = await countProducts("우유")
    assert.equal(countResult.count, 468)

    const detailResult = await getProductDetail(5063110)
    assert.equal(detailResult.productNo, 5063110)
    assert.equal(detailResult.currentPrice, 2780)

    assert.ok(seen.some((url) => url.includes("keyword=%EB%94%B8%EA%B8%B0")))
    assert.ok(seen.some((url) => url.includes("allow_replace=true")))
    assert.ok(seen.some((url) => url.endsWith("/goods/5063110")))
  } finally {
    global.fetch = originalFetch
  }
})

test("searchProducts validates the keyword before sending the request", async () => {
  await assert.rejects(() => searchProducts("   "), /keyword is required\./)
  await assert.rejects(() => countProducts(""), /keyword is required\./)
  await assert.rejects(() => getProductDetail(""), /productNo is required\./)
})

function makeJsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  })
}
