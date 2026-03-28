const {
  BASE_API_URL,
  BASE_SEARCH_URL,
  buildSearchGoodsParams,
  normalizeOnlineStockResponse,
  normalizeProductIdentifier,
  normalizeSearchGoodsResponse,
  normalizeStorePickupStockResponse,
  normalizeStoreSearchResponse
} = require("./parse")

const DEFAULT_BROWSER_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
}

function selectPickupPreferredProduct(products) {
  return products.find((product) => product.pickupAvailable) || products[0]
}

async function requestJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.")
  }

  const method = options.method || "GET"
  const headers = {
    ...DEFAULT_BROWSER_HEADERS,
    ...(options.headers || {})
  }
  const init = {
    method,
    headers,
    signal: options.signal
  }

  if (options.body !== undefined) {
    headers["content-type"] = "application/json"
    init.body = JSON.stringify(options.body)
  }

  const response = await fetchImpl(url, init)

  if (!response.ok) {
    throw new Error(`Daiso request failed with ${response.status} for ${url}`)
  }

  return response.json()
}

async function searchStores(query, options = {}) {
  const body = {
    keyword: String(query || "").trim(),
    pkupYn: options.pickupOnly ? "Y" : "",
    currentPage: Number(options.pageNum || 1),
    pageSize: Number(options.limit || 10)
  }
  const url = new URL(`${BASE_API_URL}/ms/msg/selStr`)
  const payload = await requestJson(url.toString(), {
    ...options,
    method: "POST",
    body
  })

  return {
    query: body.keyword,
    items: normalizeStoreSearchResponse(payload, body.keyword)
  }
}

async function getStoreDetail(strCd, options = {}) {
  const url = new URL(`${BASE_API_URL}/dl/dla-api/selStrInfo`)
  url.searchParams.set("strCd", String(strCd))

  return requestJson(url.toString(), options)
}

async function searchProducts(query, options = {}) {
  const url = new URL(`${BASE_SEARCH_URL}/SearchGoods`)
  const params = buildSearchGoodsParams(query, options)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const payload = await requestJson(url.toString(), options)
  return normalizeSearchGoodsResponse(payload, query)
}

async function getStorePickupStock(request, options = {}) {
  const payload = await requestJson(`${BASE_API_URL}/pd/pdh/selStrPkupStck`, {
    ...options,
    method: "POST",
    body: [
      {
        pdNo: String(request.pdNo),
        strCd: String(request.strCd)
      }
    ]
  })

  return normalizeStorePickupStockResponse(payload, request)
}

async function getOnlineStock(request, options = {}) {
  const normalizedRequest = {
    pdNo: String(request.pdNo),
    onldPdNo: normalizeProductIdentifier(request.onldPdNo) || String(request.pdNo)
  }
  const payload = await requestJson(`${BASE_API_URL}/pdo/selOnlStck`, {
    ...options,
    method: "POST",
    body: [normalizedRequest]
  })

  return normalizeOnlineStockResponse(payload, normalizedRequest)
}

async function lookupStoreProductAvailability(options = {}) {
  const storeQuery = String(options.storeQuery || "").trim()
  const productQuery = String(options.productQuery || "").trim()

  if (!storeQuery) {
    throw new Error("storeQuery is required.")
  }

  if (!productQuery) {
    throw new Error("productQuery is required.")
  }

  const [storeResult, productResult] = await Promise.all([
    searchStores(storeQuery, {
      ...options,
      pickupOnly: options.storePickupOnly,
      limit: options.storeLimit || 10
    }),
    searchProducts(productQuery, {
      ...options,
      limit: options.productLimit || 30,
      pickupOnly: options.productPickupOnly || false
    })
  ])

  const selectedStore = storeResult.items[0]
  const selectedProduct = selectPickupPreferredProduct(productResult.items)
  const [storeDetailPayload, pickupStock, onlineStock] = await Promise.all([
    getStoreDetail(selectedStore.strCd, options),
    getStorePickupStock({ pdNo: selectedProduct.pdNo, strCd: selectedStore.strCd }, options),
    options.includeOnlineStock === false
      ? Promise.resolve(null)
      : getOnlineStock(
          {
            pdNo: selectedProduct.pdNo,
            onldPdNo: selectedProduct.onldPdNo
          },
          options
        )
  ])

  return {
    storeQuery,
    productQuery,
    storeCandidates: storeResult.items,
    productCandidates: productResult.items,
    selectedStore,
    storeDetail: storeDetailPayload.data || null,
    selectedProduct,
    pickupStock,
    onlineStock
  }
}

module.exports = {
  getOnlineStock,
  getStoreDetail,
  getStorePickupStock,
  lookupStoreProductAvailability,
  searchProducts,
  searchStores
}
