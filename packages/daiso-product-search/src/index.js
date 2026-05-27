const crypto = require("node:crypto")
const {
  BASE_API_URL,
  BASE_SEARCH_URL,
  buildSearchGoodsParams,
  normalizeOnlineStockResponse,
  normalizePickupEligibilityResponse,
  normalizeProductIdentifier,
  normalizeSearchGoodsResponse,
  normalizeStorePickupStockResponse,
  normalizeStoreSearchResponse
} = require("./parse")

class DaisoRequestError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = "DaisoRequestError"
    this.status = options.status || null
    this.payload = options.payload || null
    this.url = options.url || null
  }
}

const DEFAULT_BROWSER_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
}

const PRE_AUTH_ENC_KEY = Buffer.from("PRE_AUTH_ENC_KEY", "utf8")

function selectPickupPreferredProduct(products) {
  return products.find((product) => product.pickupAvailable) || products[0]
}

async function requestText(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.")
  }

  const response = await fetchImpl(url, {
    method: options.method || "GET",
    headers: { ...DEFAULT_BROWSER_HEADERS, ...(options.headers || {}) },
    signal: options.signal
  })

  const text = await response.text()

  if (!response.ok) {
    throw new DaisoRequestError(`Daiso request failed with ${response.status} for ${url}`, {
      status: response.status,
      url
    })
  }

  return { text, response }
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
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new DaisoRequestError(`Daiso request failed with ${response.status} for ${url}`, {
      status: response.status,
      payload,
      url
    })
  }

  return payload
}

async function buildBearerToken(options = {}) {
  const { text: jwt, response } = await requestText(`${BASE_API_URL}/auth/request`, options)
  const uid = response.headers.get("x-dm-uid") || ""
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-128-cbc", PRE_AUTH_ENC_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(jwt.trim(), "utf8"), cipher.final()])
  const bearer = Buffer.from(iv).toString("base64") + Buffer.from(encrypted).toString("base64")
  return { bearer, uid }
}

function isAuthBlockedError(error) {
  return error instanceof DaisoRequestError && (error.status === 401 || error.status === 403)
}

function normalizeAuthBlockedStock(request, error) {
  return normalizeStorePickupStockResponse(
    {
      success: false,
      message: "Unauthorized",
      status: error && error.status,
      upstreamPayload: error && error.payload ? error.payload : null
    },
    request
  )
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
  const body = [{ pdNo: String(request.pdNo), strCd: String(request.strCd) }]

  async function requestStockWithFreshToken() {
    const { bearer, uid } = await buildBearerToken(options)
    const payload = await requestJson(`${BASE_API_URL}/pd/pdh/selStrPkupStck`, {
      ...options,
      method: "POST",
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${bearer}`,
        "X-DM-UID": uid
      },
      body
    })

    return normalizeStorePickupStockResponse(payload, request)
  }

  try {
    return await requestStockWithFreshToken()
  } catch (error) {
    if (!isAuthBlockedError(error)) {
      throw error
    }
  }

  try {
    return await requestStockWithFreshToken()
  } catch (error) {
    if (isAuthBlockedError(error)) {
      return normalizeAuthBlockedStock(request, error)
    }

    throw error
  }
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

function buildPickupEligibilityKeyword(value) {
  return String(value || "")
    .replace(/\d+\s*호점\s*$/u, "")
    .replace(/[(].*?[)]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

async function getStorePickupEligibility(request, options = {}) {
  const pdNo = String(request.pdNo || "").trim()
  const strCd = String(request.strCd || "").trim()
  const explicitKeyword =
    typeof request.keyword === "string" && request.keyword.trim() ? request.keyword.trim() : null
  const derivedKeyword = explicitKeyword || buildPickupEligibilityKeyword(request.storeName)
  const pageSize = Number(request.pageSize || 50)

  if (!pdNo) {
    throw new Error("pdNo is required.")
  }

  if (strCd && !derivedKeyword) {
    return {
      pdNo,
      strCd,
      pickupEligible: null,
      eligibleStoreCount: null,
      eligibleStores: [],
      matchedStore: null,
      searchedKeyword: "",
      pageSize,
      totalCount: null,
      retrievalStatus: "insufficient_coverage",
      reason: "missing_search_keyword",
      raw: null
    }
  }

  try {
    const payload = await requestJson(`${BASE_API_URL}/ms/msg/selPkupStr`, {
      ...options,
      method: "POST",
      body: {
        pdNo,
        keyword: derivedKeyword || "",
        currentPage: 1,
        pageSize
      }
    })

    return normalizePickupEligibilityResponse(payload, {
      pdNo,
      strCd,
      keyword: derivedKeyword || "",
      pageSize
    })
  } catch (error) {
    if (error instanceof DaisoRequestError) {
      return normalizePickupEligibilityResponse(
        error.payload || { success: false, message: `HTTP ${error.status}` },
        { pdNo, strCd, keyword: derivedKeyword || "", pageSize }
      )
    }

    throw error
  }
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
  const onlineStockPromise =
    options.includeOnlineStock === false
      ? Promise.resolve(null)
      : getOnlineStock(
          {
            pdNo: selectedProduct.pdNo,
            onldPdNo: selectedProduct.onldPdNo
          },
          options
        ).catch(() => null)
  const [storeDetailPayload, pickupStock] = await Promise.all([
    getStoreDetail(selectedStore.strCd, options),
    getStorePickupStock({ pdNo: selectedProduct.pdNo, strCd: selectedStore.strCd }, options)
  ])

  let pickupEligibility = null

  if (
    options.includePickupEligibility !== false &&
    pickupStock &&
    pickupStock.retrievalStatus === "blocked"
  ) {
    pickupEligibility = await getStorePickupEligibility(
      {
        pdNo: selectedProduct.pdNo,
        strCd: selectedStore.strCd,
        storeName: selectedStore.name
      },
      options
    )
  }

  const onlineStock = await onlineStockPromise

  return {
    storeQuery,
    productQuery,
    storeCandidates: storeResult.items,
    productCandidates: productResult.items,
    selectedStore,
    storeDetail: storeDetailPayload.data || null,
    selectedProduct,
    pickupStock,
    pickupEligibility,
    onlineStock
  }
}

module.exports = {
  getOnlineStock,
  getStoreDetail,
  getStorePickupEligibility,
  getStorePickupStock,
  lookupStoreProductAvailability,
  searchProducts,
  searchStores
}
