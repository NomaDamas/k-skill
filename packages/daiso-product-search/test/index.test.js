const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  getOnlineStock,
  getStoreDetail,
  getStorePickupEligibility,
  getStorePickupStock,
  lookupStoreProductAvailability,
  searchProducts,
  searchStores
} = require("../src/index")
const {
  buildSearchGoodsParams,
  normalizePickupEligibilityResponse,
  normalizeSearchGoodsResponse,
  normalizeStorePickupStockResponse,
  normalizeStoreSearchResponse
} = require("../src/parse")

const fixturesDir = path.join(__dirname, "fixtures")
const storeSearchPayload = JSON.parse(fs.readFileSync(path.join(fixturesDir, "store-search.json"), "utf8"))
const searchGoodsPayload = JSON.parse(fs.readFileSync(path.join(fixturesDir, "search-goods.json"), "utf8"))
const storeDetailPayload = JSON.parse(fs.readFileSync(path.join(fixturesDir, "store-detail.json"), "utf8"))
const storePickupStockPayload = JSON.parse(fs.readFileSync(path.join(fixturesDir, "store-pickup-stock.json"), "utf8"))
const onlineStockPayload = JSON.parse(fs.readFileSync(path.join(fixturesDir, "online-stock.json"), "utf8"))
const storePickupEligibilityPayload = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "store-pickup-eligibility.json"), "utf8")
)
const liveSearchGoodsPayload = {
  resultSet: {
    result: [
      {
        totalSize: 1,
        resultDocuments: [
          {
            pdNo: "B202503122133",
            MASTER_PD_NO: "1049275",
            MAPP_BOX_PD_NO: "1049275",
            pdNm: "VT 리들샷 100 페이셜 부스팅 퍼스트 앰플 2ml*6개입",
            exhPdNm: "VT 리들샷 100 페이셜 부스팅 퍼스트 앰플 2ml*6개입",
            pdPrc: "3000",
            brndNm: "VT>00044>VT",
            avgStscVal: "4.8",
            revwCnt: "14138",
            newPdYn: "N",
            massOrPsblYn: "Y",
            pdsOrPsblYn: "Y",
            pkupOrPsblYn: "Y",
            QUICK_OR_PSBL_YN: "Y",
            totOrQy: "219485",
            exhLargeCtgrNm: "뷰티/위생",
            exhMiddleCtgrNm: "스킨케어",
            exhSmallCtgrNm: "에센스/세럼/앰플"
          }
        ]
      }
    ]
  }
}
const liveLookupSearchGoodsPayload = {
  resultSet: {
    result: [
      {
        totalSize: 2,
        resultDocuments: [
          {
            pdNo: "1049275",
            MASTER_PD_NO: "",
            MAPP_BOX_PD_NO: "0",
            pdNm: "VT 리들샷 100 페이셜 부스팅 퍼스트 앰플 2ml*6개입",
            exhPdNm: "VT 리들샷 100 페이셜 부스팅 퍼스트 앰플 2ml*6개입",
            pdPrc: "3000",
            brndNm: "VT>00044>VT",
            avgStscVal: "4.8",
            revwCnt: "14138",
            newPdYn: "N",
            massOrPsblYn: "Y",
            pdsOrPsblYn: "Y",
            pkupOrPsblYn: "Y",
            QUICK_OR_PSBL_YN: "Y",
            totOrQy: "219485",
            exhLargeCtgrNm: "뷰티/위생",
            exhMiddleCtgrNm: "스킨케어",
            exhSmallCtgrNm: "에센스/세럼/앰플"
          },
          liveSearchGoodsPayload.resultSet.result[0].resultDocuments[0]
        ]
      }
    ]
  }
}
const pickupSelectionSearchGoodsPayload = {
  resultSet: {
    result: [
      {
        totalSize: 2,
        resultDocuments: [
          {
            pdNo: "B1",
            MASTER_PD_NO: "1049275",
            MAPP_BOX_PD_NO: "1049275",
            pdNm: "VT 리들샷 100",
            exhPdNm: "VT 리들샷 100",
            pdPrc: "3000",
            brndNm: "VT>00044>VT",
            avgStscVal: "4.8",
            revwCnt: "500",
            newPdYn: "N",
            massOrPsblYn: "Y",
            pdsOrPsblYn: "Y",
            pkupOrPsblYn: "N",
            QUICK_OR_PSBL_YN: "Y",
            totOrQy: "219485",
            exhLargeCtgrNm: "뷰티/위생",
            exhMiddleCtgrNm: "스킨케어",
            exhSmallCtgrNm: "에센스/세럼/앰플"
          },
          {
            pdNo: "1049275",
            MASTER_PD_NO: "",
            MAPP_BOX_PD_NO: "1049275",
            pdNm: "VT 리들샷 100",
            exhPdNm: "VT 리들샷 100",
            pdPrc: "3000",
            brndNm: "VT>00044>VT",
            avgStscVal: "4.8",
            revwCnt: "100",
            newPdYn: "N",
            massOrPsblYn: "Y",
            pdsOrPsblYn: "Y",
            pkupOrPsblYn: "Y",
            QUICK_OR_PSBL_YN: "Y",
            totOrQy: "219485",
            exhLargeCtgrNm: "뷰티/위생",
            exhMiddleCtgrNm: "스킨케어",
            exhSmallCtgrNm: "에센스/세럼/앰플"
          }
        ]
      }
    ]
  }
}

test("normalizeStoreSearchResponse prefers the closest exact-name store match", () => {
  const items = normalizeStoreSearchResponse(storeSearchPayload, "강남역2호점")

  assert.equal(items[0].strCd, "10224")
  assert.equal(items[0].name, "강남역2호점")
  assert.equal(items[0].pickupAvailable, true)
  assert.equal(items[0].openTime, "10:00")
})

test("buildSearchGoodsParams keeps the official SearchGoods query contract", () => {
  assert.deepEqual(buildSearchGoodsParams("리들샷", { limit: 30, pickupOnly: true }), {
    searchTerm: "리들샷",
    searchQuery: "",
    pageNum: "1",
    brndCd: "",
    cntPerPage: "30",
    userId: "",
    newPdYn: "",
    massOrPsblYn: "",
    pkupOrPsblYn: "Y",
    fdrmOrPsblYn: "",
    quickOrPsblYn: "",
    searchSort: "",
    isCategory: "1"
  })
})

test("normalizeSearchGoodsResponse surfaces reusable product candidates", () => {
  const result = normalizeSearchGoodsResponse(searchGoodsPayload, "VT 리들샷 100")

  assert.equal(result.totalSize, 25)
  assert.equal(result.relationKeyword, "리들,앰플,브이티")
  assert.equal(result.items[0].pdNo, "1049275")
  assert.equal(result.items[0].brand.displayName, "VT")
  assert.equal(result.items[0].pickupAvailable, true)
})

test("normalizeSearchGoodsResponse accepts live Daiso field aliases and preserves the online stock identifier", () => {
  const result = normalizeSearchGoodsResponse(liveSearchGoodsPayload, "VT 리들샷 100")

  assert.equal(result.items[0].pdNo, "B202503122133")
  assert.equal(result.items[0].onldPdNo, "1049275")
  assert.equal(result.items[0].quickAvailable, true)
  assert.equal(result.items[0].smallCategoryName, "에센스/세럼/앰플")
})

test("normalizeSearchGoodsResponse ignores placeholder online stock identifiers from live SearchGoods rows", () => {
  const result = normalizeSearchGoodsResponse(liveLookupSearchGoodsPayload, "VT 리들샷 100")

  assert.equal(result.items[0].pdNo, "1049275")
  assert.equal(result.items[0].onldPdNo, "1049275")
  assert.equal(result.items[0].quickAvailable, true)
})

test("normalizeStorePickupStockResponse maps stock rows into a public availability shape", () => {
  const stock = normalizeStorePickupStockResponse(storePickupStockPayload, {
    pdNo: "1049275",
    strCd: "10224"
  })

  assert.equal(stock.quantity, 3)
  assert.equal(stock.inStock, true)
  assert.equal(stock.saleStatusCode, "1")
  assert.equal(stock.status, "available")
  assert.equal(stock.retrievalStatus, "resolved")
  assert.equal(stock.inventoryStatus, "in_stock")
})

test("normalizeStorePickupStockResponse separates retrieval status from zero-stock inventory status", () => {
  const stock = normalizeStorePickupStockResponse(
    {
      ...storePickupStockPayload,
      data: [
        {
          ...storePickupStockPayload.data[0],
          stck: "0"
        }
      ]
    },
    {
      pdNo: "1049275",
      strCd: "10224"
    }
  )

  assert.equal(stock.quantity, 0)
  assert.equal(stock.inStock, false)
  assert.equal(stock.status, "available")
  assert.equal(stock.retrievalStatus, "resolved")
  assert.equal(stock.inventoryStatus, "out_of_stock")
})

test("normalizeStorePickupStockResponse marks Daiso Unauthorized payloads as unavailable", () => {
  const stock = normalizeStorePickupStockResponse(
    { success: false, message: "Unauthorized" },
    {
      pdNo: "1049275",
      strCd: "10224"
    }
  )

  assert.deepEqual(stock, {
    pdNo: "1049275",
    strCd: "10224",
    quantity: null,
    inStock: null,
    status: "unavailable",
    retrievalStatus: "blocked",
    inventoryStatus: "unknown",
    reason: "unauthorized",
    message: "Daiso Mall blocked store pickup stock lookup with Unauthorized.",
    raw: { success: false, message: "Unauthorized" }
  })
})

test("public client helpers can consume injected fetch fixtures", async () => {
  const originalFetch = global.fetch

  global.fetch = async (url) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(searchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      return makeResponse(storePickupStockPayload)
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      return makeResponse(onlineStockPayload)
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const storeResult = await searchStores("강남역2호점")
    assert.equal(storeResult.items[0].strCd, "10224")

    const productResult = await searchProducts("VT 리들샷 100")
    assert.equal(productResult.items[0].pdNo, "1049275")

    const storeDetail = await getStoreDetail("10224")
    assert.equal(storeDetail.data.onlStrYn, "Y")

    const pickupStock = await getStorePickupStock({ pdNo: "1049275", strCd: "10224" })
    assert.equal(pickupStock.quantity, 3)
    assert.equal(pickupStock.inventoryStatus, "in_stock")

    const onlineStock = await getOnlineStock({ pdNo: "1049275" })
    assert.equal(onlineStock.quantity, 13047)
    assert.equal(onlineStock.referenceOnly, true)

    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })
    assert.equal(availability.selectedStore.strCd, "10224")
    assert.equal(availability.selectedProduct.pdNo, "1049275")
    assert.equal(availability.pickupStock.quantity, 3)
    assert.equal(availability.pickupStock.inventoryStatus, "in_stock")
    assert.equal(availability.onlineStock.quantity, 13047)
  } finally {
    global.fetch = originalFetch
  }
})

test("getStorePickupStock converts Daiso pickup-stock 401 responses to unavailable results", async () => {
  const originalFetch = global.fetch

  global.fetch = async (url) => {
    assert.match(String(url), /\/api\/pd\/pdh\/selStrPkupStck$/)
    return makeResponse({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const pickupStock = await getStorePickupStock({ pdNo: "1049275", strCd: "10224" })

    assert.equal(pickupStock.status, "unavailable")
    assert.equal(pickupStock.retrievalStatus, "blocked")
    assert.equal(pickupStock.inventoryStatus, "unknown")
    assert.equal(pickupStock.reason, "unauthorized")
    assert.equal(pickupStock.quantity, null)
    assert.equal(pickupStock.inStock, null)
  } finally {
    global.fetch = originalFetch
  }
})

test("lookupStoreProductAvailability keeps online-stock fallback when Daiso pickup stock is unauthorized", async () => {
  const originalFetch = global.fetch

  global.fetch = async (url) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo") && !String(url).includes("selPkupStr")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(searchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      return makeResponse({ success: false, message: "Unauthorized" }, { status: 403 })
    }

    if (String(url).includes("/api/ms/msg/selPkupStr")) {
      return makeResponse(storePickupEligibilityPayload)
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      return makeResponse(onlineStockPayload)
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })

    assert.equal(availability.pickupStock.status, "unavailable")
    assert.equal(availability.pickupStock.retrievalStatus, "blocked")
    assert.equal(availability.pickupStock.inventoryStatus, "unknown")
    assert.equal(availability.pickupStock.reason, "unauthorized")
    assert.equal(availability.onlineStock.quantity, 13047)
    assert.equal(availability.onlineStock.referenceOnly, true)
    assert.notEqual(availability.pickupEligibility, null)
    assert.equal(availability.pickupEligibility.pickupEligible, true)
    assert.equal(availability.pickupEligibility.matchedStore.strCd, "10224")
    assert.equal(availability.pickupEligibility.retrievalStatus, "resolved")
  } finally {
    global.fetch = originalFetch
  }
})

test("normalizePickupEligibilityResponse marks selected store as eligible when present in list", () => {
  const eligibility = normalizePickupEligibilityResponse(storePickupEligibilityPayload, {
    pdNo: "1049275",
    strCd: "10224"
  })

  assert.equal(eligibility.pickupEligible, true)
  assert.equal(eligibility.eligibleStoreCount, 1)
  assert.equal(eligibility.matchedStore.strCd, "10224")
  assert.equal(eligibility.matchedStore.name, "강남역2호점")
  assert.equal(eligibility.matchedStore.pickupAvailable, true)
  assert.equal(eligibility.matchedStore.openTime, "10:00")
  assert.equal(eligibility.retrievalStatus, "resolved")
})

test("normalizePickupEligibilityResponse marks selected store as NOT eligible when absent from list", () => {
  const eligibility = normalizePickupEligibilityResponse(storePickupEligibilityPayload, {
    pdNo: "1049275",
    strCd: "99999"
  })

  assert.equal(eligibility.pickupEligible, false)
  assert.equal(eligibility.eligibleStoreCount, 1)
  assert.equal(eligibility.matchedStore, null)
  assert.equal(eligibility.retrievalStatus, "resolved")
})

test("normalizePickupEligibilityResponse requires pickupAvailable for positive eligibility", () => {
  const payload = {
    ...storePickupEligibilityPayload,
    data: storePickupEligibilityPayload.data.map((item) => ({ ...item, pkupYn: "N" }))
  }

  const eligibility = normalizePickupEligibilityResponse(payload, {
    pdNo: "1049275",
    strCd: "10224",
    keyword: "강남역",
    pageSize: 50
  })

  assert.equal(eligibility.pickupEligible, false)
  assert.equal(eligibility.matchedStore.strCd, "10224")
  assert.equal(eligibility.matchedStore.pickupAvailable, false)
  assert.equal(eligibility.retrievalStatus, "resolved")
})

test("normalizePickupEligibilityResponse avoids a definitive miss when the first page may be incomplete", () => {
  const payload = {
    ...storePickupEligibilityPayload,
    data: [
      {
        ...storePickupEligibilityPayload.data[0],
        totalCnt: 2,
        currentPageCnt: 1,
        strCd: "10000",
        strNm: "서울테스트점"
      }
    ]
  }

  const eligibility = normalizePickupEligibilityResponse(payload, {
    pdNo: "1049275",
    strCd: "10224",
    keyword: "서울",
    pageSize: 1
  })

  assert.equal(eligibility.pickupEligible, null)
  assert.equal(eligibility.reason, "search_page_not_exhausted")
  assert.equal(eligibility.retrievalStatus, "insufficient_coverage")
  assert.equal(eligibility.searchedKeyword, "서울")
  assert.equal(eligibility.totalCount, 2)
})

test("normalizePickupEligibilityResponse handles upstream failure as blocked retrieval", () => {
  const eligibility = normalizePickupEligibilityResponse(
    { success: false, message: "Upstream error" },
    { pdNo: "1049275", strCd: "10224" }
  )

  assert.equal(eligibility.pickupEligible, null)
  assert.equal(eligibility.eligibleStoreCount, null)
  assert.equal(eligibility.eligibleStores.length, 0)
  assert.equal(eligibility.retrievalStatus, "blocked")
  assert.equal(eligibility.reason, "upstream_error")
})

test("getStorePickupEligibility posts pdNo and a derived store keyword to selPkupStr", async () => {
  const originalFetch = global.fetch
  let capturedBody = null
  let capturedUrl = null

  global.fetch = async (url, init = {}) => {
    capturedUrl = String(url)
    capturedBody = JSON.parse(init.body)
    return makeResponse(storePickupEligibilityPayload)
  }

  try {
    const eligibility = await getStorePickupEligibility({
      pdNo: "1049275",
      strCd: "10224",
      storeName: "강남역2호점"
    })

    assert.match(capturedUrl, /\/api\/ms\/msg\/selPkupStr$/)
    assert.equal(capturedBody.pdNo, "1049275")
    assert.equal(capturedBody.keyword, "강남역")
    assert.equal(capturedBody.currentPage, 1)
    assert.equal(typeof capturedBody.pageSize, "number")
    assert.equal(eligibility.pickupEligible, true)
    assert.equal(eligibility.matchedStore.strCd, "10224")
  } finally {
    global.fetch = originalFetch
  }
})

test("getStorePickupEligibility does not emit a definitive false without a store keyword", async () => {
  const originalFetch = global.fetch
  let fetchCalled = false

  global.fetch = async () => {
    fetchCalled = true
    return makeResponse({ ...storePickupEligibilityPayload, data: [] })
  }

  try {
    const eligibility = await getStorePickupEligibility({
      pdNo: "1049275",
      strCd: "10224"
    })

    assert.equal(fetchCalled, false)
    assert.equal(eligibility.pickupEligible, null)
    assert.equal(eligibility.retrievalStatus, "insufficient_coverage")
    assert.equal(eligibility.reason, "missing_search_keyword")
  } finally {
    global.fetch = originalFetch
  }
})

test("getStorePickupEligibility surfaces upstream HTTP errors as blocked retrieval", async () => {
  const originalFetch = global.fetch

  global.fetch = async () =>
    makeResponse({ success: false, message: "Internal Server Error" }, { status: 500 })

  try {
    const eligibility = await getStorePickupEligibility({
      pdNo: "1049275",
      strCd: "10224",
      storeName: "강남역2호점"
    })

    assert.equal(eligibility.pickupEligible, null)
    assert.equal(eligibility.retrievalStatus, "blocked")
    assert.equal(eligibility.reason, "upstream_error")
  } finally {
    global.fetch = originalFetch
  }
})

test("lookupStoreProductAvailability skips pickup eligibility lookup when pickup stock resolves", async () => {
  const originalFetch = global.fetch
  let eligibilityCalled = false

  global.fetch = async (url) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo") && !String(url).includes("selPkupStr")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(searchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      return makeResponse(storePickupStockPayload)
    }

    if (String(url).includes("/api/ms/msg/selPkupStr")) {
      eligibilityCalled = true
      return makeResponse(storePickupEligibilityPayload)
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      return makeResponse(onlineStockPayload)
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })

    assert.equal(availability.pickupStock.retrievalStatus, "resolved")
    assert.equal(eligibilityCalled, false)
    assert.equal(availability.pickupEligibility, null)
  } finally {
    global.fetch = originalFetch
  }
})

test("lookupStoreProductAvailability respects includePickupEligibility=false even when pickup stock is blocked", async () => {
  const originalFetch = global.fetch
  let eligibilityCalled = false

  global.fetch = async (url) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo") && !String(url).includes("selPkupStr")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(searchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      return makeResponse({ success: false, message: "Unauthorized" }, { status: 403 })
    }

    if (String(url).includes("/api/ms/msg/selPkupStr")) {
      eligibilityCalled = true
      return makeResponse(storePickupEligibilityPayload)
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      return makeResponse(onlineStockPayload)
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100",
      includePickupEligibility: false
    })

    assert.equal(availability.pickupStock.retrievalStatus, "blocked")
    assert.equal(eligibilityCalled, false)
    assert.equal(availability.pickupEligibility, null)
  } finally {
    global.fetch = originalFetch
  }
})

test("lookupStoreProductAvailability falls back to pdNo when live SearchGoods returns placeholder online stock ids", async () => {
  const originalFetch = global.fetch

  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(liveLookupSearchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      return makeResponse(storePickupStockPayload)
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      const requestBody = JSON.parse(init.body)
      assert.deepEqual(requestBody, [
        {
          pdNo: "1049275",
          onldPdNo: "1049275"
        }
      ])

      return makeResponse(onlineStockPayload)
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })

    assert.equal(availability.selectedProduct.pdNo, "1049275")
    assert.equal(availability.selectedProduct.onldPdNo, "1049275")
    assert.equal(availability.onlineStock.quantity, 13047)
  } finally {
    global.fetch = originalFetch
  }
})

test("lookupStoreProductAvailability prefers pickup-capable products over higher-ranked non-pickup matches", async () => {
  const originalFetch = global.fetch

  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(pickupSelectionSearchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      const requestBody = JSON.parse(init.body)
      assert.deepEqual(requestBody, [
        {
          pdNo: "1049275",
          strCd: "10224"
        }
      ])

      return makeResponse({
        data: [
          {
            pdNo: "1049275",
            strCd: "10224",
            stck: "7",
            sleStsCd: "1"
          }
        ]
      })
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      const requestBody = JSON.parse(init.body)
      assert.deepEqual(requestBody, [
        {
          pdNo: "1049275",
          onldPdNo: "1049275"
        }
      ])

      return makeResponse(onlineStockPayload)
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })

    assert.equal(availability.productCandidates[0].pdNo, "B1")
    assert.equal(availability.productCandidates[1].pdNo, "1049275")
    assert.equal(availability.selectedProduct.pdNo, "1049275")
    assert.equal(availability.selectedProduct.pickupAvailable, true)
    assert.equal(availability.pickupStock.quantity, 7)
  } finally {
    global.fetch = originalFetch
  }
})

test("lookupStoreProductAvailability reuses a product candidate's online stock identifier", async () => {
  const originalFetch = global.fetch
  const expectedOnlineRequest = {
    pdNo: "B202503122133",
    onldPdNo: "1049275"
  }

  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/ms/msg/selStr") && !String(url).includes("selStrInfo")) {
      return makeResponse(storeSearchPayload)
    }

    if (String(url).includes("/ssn/search/SearchGoods")) {
      return makeResponse(liveSearchGoodsPayload)
    }

    if (String(url).includes("/api/dl/dla-api/selStrInfo")) {
      return makeResponse(storeDetailPayload)
    }

    if (String(url).includes("/api/pd/pdh/selStrPkupStck")) {
      return makeResponse({
        data: [
          {
            pdNo: "B202503122133",
            strCd: "10224",
            stck: 3,
            sleStsCd: "1"
          }
        ]
      })
    }

    if (String(url).includes("/api/pdo/selOnlStck")) {
      const requestBody = JSON.parse(init.body)
      assert.deepEqual(requestBody, [expectedOnlineRequest])

      return makeResponse({
        data: [
          {
            pdNo: "B202503122133",
            onldPdNo: "1049275",
            stck: 11
          }
        ],
        success: true
      })
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })

    assert.equal(availability.selectedProduct.pdNo, "B202503122133")
    assert.equal(availability.selectedProduct.onldPdNo, "1049275")
    assert.equal(availability.onlineStock.quantity, 11)
    assert.equal(availability.onlineStock.onldPdNo, "1049275")
  } finally {
    global.fetch = originalFetch
  }
})

function makeResponse(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status || 200,
    headers: {
      "content-type": "application/json"
    }
  })
}
