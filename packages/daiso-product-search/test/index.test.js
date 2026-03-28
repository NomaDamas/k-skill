const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  getOnlineStock,
  getStoreDetail,
  getStorePickupStock,
  lookupStoreProductAvailability,
  searchProducts,
  searchStores
} = require("../src/index")
const {
  buildSearchGoodsParams,
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

    const onlineStock = await getOnlineStock({ pdNo: "1049275" })
    assert.equal(onlineStock.quantity, 13047)

    const availability = await lookupStoreProductAvailability({
      storeQuery: "강남역2호점",
      productQuery: "VT 리들샷 100"
    })
    assert.equal(availability.selectedStore.strCd, "10224")
    assert.equal(availability.selectedProduct.pdNo, "1049275")
    assert.equal(availability.pickupStock.quantity, 3)
    assert.equal(availability.onlineStock.quantity, 13047)
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

function makeResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  })
}
