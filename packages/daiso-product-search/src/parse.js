const BASE_API_URL = "https://www.daisomall.co.kr/api"
const BASE_SEARCH_URL = "https://www.daisomall.co.kr/ssn/search"
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu
const STORE_EMPTY_RESULT_ERROR = "No Daiso store candidates were returned."
const PRODUCT_EMPTY_RESULT_ERROR = "No Daiso product candidates were returned."

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_WORD_PATTERN, "")
}

function tokenize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s,/()\-]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
}

function formatStoreTime(raw) {
  const digits = String(raw || "").replace(/\D/g, "")

  if (digits.length !== 4) {
    return null
  }

  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
}

function toNumberOrNull(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function firstPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value
    }
  }

  return null
}

function normalizeProductIdentifier(value) {
  const normalized = String(value ?? "").trim()

  if (!normalized || normalized === "0" || normalized.toLowerCase() === "null") {
    return null
  }

  return normalized
}

function firstPresentProductIdentifier(...values) {
  for (const value of values) {
    const normalized = normalizeProductIdentifier(value)

    if (normalized) {
      return normalized
    }
  }

  return null
}

function normalizeDistanceKm(value) {
  const normalized = toNumberOrNull(value)

  if (normalized === null) {
    return null
  }

  return normalized <= 1000 ? normalized : null
}

function splitBrandPath(value) {
  const parts = String(value || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    raw: String(value || ""),
    parts,
    displayName: parts.length > 0 ? parts[parts.length - 1] : null
  }
}

function normalizeStoreItem(item) {
  return {
    strCd: String(item.strCd),
    name: item.strNm || "",
    address: [item.strAddr, item.strDtlAddr].filter(Boolean).join(" "),
    phone: item.strTno || null,
    pickupAvailable: item.pkupYn === "Y",
    useAvailable: item.useYn === "Y",
    pointUsable: item.pntUseYn === "Y",
    pointAccrual: item.pntAcmYn === "Y",
    openTime: formatStoreTime(item.opngTime),
    closeTime: formatStoreTime(item.clsngTime),
    distanceKm: normalizeDistanceKm(item.km),
    latitude: toNumberOrNull(item.strLttd),
    longitude: toNumberOrNull(item.strLitd),
    raw: item
  }
}

function scoreStoreMatch(query, store) {
  const normalizedQuery = normalizeText(query)
  const normalizedName = normalizeText(store.name)
  const normalizedAddress = normalizeText(store.address)

  if (!normalizedQuery) {
    return 0
  }

  if (normalizedQuery === normalizedName) {
    return 1000 + normalizedName.length
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 900 + normalizedQuery.length
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 860 + normalizedQuery.length
  }

  if (normalizedAddress.includes(normalizedQuery)) {
    return 720 + normalizedQuery.length
  }

  let score = 0
  for (const token of tokenize(query)) {
    const normalizedToken = normalizeText(token)

    if (!normalizedToken) {
      continue
    }

    if (normalizedName.includes(normalizedToken)) {
      score += 120 + normalizedToken.length
      continue
    }

    if (normalizedAddress.includes(normalizedToken)) {
      score += 80 + normalizedToken.length
    }
  }

  return score
}

function sortStoreCandidates(query, stores) {
  return [...stores].sort((left, right) => {
    const leftScore = scoreStoreMatch(query, left)
    const rightScore = scoreStoreMatch(query, right)

    if (rightScore !== leftScore) {
      return rightScore - leftScore
    }

    return left.name.localeCompare(right.name, "ko")
  })
}

function normalizeStoreSearchResponse(payload, query) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    throw new Error(STORE_EMPTY_RESULT_ERROR)
  }

  const stores = payload.data.map(normalizeStoreItem)

  if (stores.length === 0) {
    throw new Error(STORE_EMPTY_RESULT_ERROR)
  }

  return sortStoreCandidates(query, stores)
}

function buildSearchGoodsParams(query, options = {}) {
  if (!String(query || "").trim()) {
    throw new Error("search term is required.")
  }

  return {
    searchTerm: String(query).trim(),
    searchQuery: options.searchQuery || "",
    pageNum: String(options.pageNum || 1),
    brndCd: options.brandCode || "",
    cntPerPage: String(options.limit || 30),
    userId: options.userId || "",
    newPdYn: options.newOnly ? "Y" : "",
    massOrPsblYn: options.massOrderOnly ? "Y" : "",
    pkupOrPsblYn: options.pickupOnly ? "Y" : "",
    fdrmOrPsblYn: options.parcelOnly ? "Y" : "",
    quickOrPsblYn: options.quickOnly ? "Y" : "",
    searchSort: options.searchSort || "",
    isCategory: options.isCategory === false ? "0" : "1"
  }
}

function normalizeProductItem(item) {
  const brand = splitBrandPath(item.brndNm)
  const onldPdNo =
    firstPresentProductIdentifier(
      item.onldPdNo,
      item.onlPdNo,
      item.masterPdNo,
      item.mappBoxPdNo,
      item.MASTER_PD_NO,
      item.MAPP_BOX_PD_NO,
      item.pdNo
    ) || String(item.pdNo)
  const quickOrPsblYn = firstPresentValue(item.quickOrPsblYn, item.QUICK_OR_PSBL_YN)
  const smallCategoryName = firstPresentValue(item.exhSmallCtgrNm, item.exhCtgrNm)

  return {
    pdNo: String(item.pdNo),
    onldPdNo,
    name: item.pdNm || "",
    displayName: item.exhPdNm || item.pdNm || "",
    price: Number(item.pdPrc || 0),
    brand,
    avgRating: toNumberOrNull(item.avgStscVal),
    reviewCount: Number(item.revwCnt || 0),
    pickupAvailable: item.pkupOrPsblYn === "Y",
    parcelAvailable: item.pdsOrPsblYn === "Y",
    quickAvailable: quickOrPsblYn === "Y",
    massOrderAvailable: item.massOrPsblYn === "Y",
    isNew: item.newPdYn === "Y",
    totalSales: Number(item.totOrQy || 0),
    largeCategoryName: item.exhLargeCtgrNm || null,
    middleCategoryName: item.exhMiddleCtgrNm || null,
    smallCategoryName,
    raw: item
  }
}

function scoreProductMatch(query, product) {
  const normalizedQuery = normalizeText(query)
  const normalizedDisplayName = normalizeText(product.displayName)
  const normalizedName = normalizeText(product.name)

  if (!normalizedQuery) {
    return 0
  }

  if (normalizedQuery === normalizedDisplayName || normalizedQuery === normalizedName) {
    return 1000 + normalizedDisplayName.length
  }

  if (normalizedDisplayName.startsWith(normalizedQuery)) {
    return 920 + normalizedQuery.length
  }

  if (normalizedDisplayName.includes(normalizedQuery)) {
    return 880 + normalizedQuery.length
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 840 + normalizedQuery.length
  }

  let score = 0
  for (const token of tokenize(query)) {
    const normalizedToken = normalizeText(token)

    if (!normalizedToken) {
      continue
    }

    if (normalizedDisplayName.includes(normalizedToken)) {
      score += 150 + normalizedToken.length
      continue
    }

    if (normalizedName.includes(normalizedToken)) {
      score += 120 + normalizedToken.length
      continue
    }

    if (product.brand.displayName && normalizeText(product.brand.displayName).includes(normalizedToken)) {
      score += 60 + normalizedToken.length
    }
  }

  return score
}

function sortProductCandidates(query, products) {
  return [...products].sort((left, right) => {
    const leftScore = scoreProductMatch(query, left)
    const rightScore = scoreProductMatch(query, right)

    if (rightScore !== leftScore) {
      return rightScore - leftScore
    }

    if (right.reviewCount !== left.reviewCount) {
      return right.reviewCount - left.reviewCount
    }

    return left.displayName.localeCompare(right.displayName, "ko")
  })
}

function normalizeSearchGoodsResponse(payload, query) {
  const results = Array.isArray(payload?.resultSet?.result) ? payload.resultSet.result : []
  const primaryResult = results.find(
    (result) => Array.isArray(result?.resultDocuments) && result.resultDocuments.length > 0,
  )
  const documents = primaryResult?.resultDocuments

  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error(PRODUCT_EMPTY_RESULT_ERROR)
  }

  return {
    totalSize: Number(primaryResult.totalSize || documents.length),
    relationKeyword: primaryResult.data?.relationKeyword || null,
    items: sortProductCandidates(query, documents.map(normalizeProductItem))
  }
}

function normalizeStorePickupStockResponse(payload, request) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("No Daiso pickup stock rows were returned.")
  }

  const item = payload.data[0]
  const quantity = Number(item.stck || 0)

  return {
    pdNo: String(item.pdNo || request.pdNo),
    strCd: String(item.strCd || request.strCd),
    quantity,
    inStock: quantity > 0,
    saleStatusCode: item.sleStsCd || null,
    raw: item
  }
}

function normalizeOnlineStockResponse(payload, request) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("No Daiso online stock rows were returned.")
  }

  const item = payload.data[0]
  const quantity = Number(item.stck || 0)

  return {
    pdNo: String(item.pdNo || request.pdNo),
    onldPdNo:
      firstPresentProductIdentifier(item.onldPdNo, request.onldPdNo, request.pdNo) || String(request.pdNo),
    quantity,
    inStock: quantity > 0,
    raw: item
  }
}

module.exports = {
  BASE_API_URL,
  BASE_SEARCH_URL,
  PRODUCT_EMPTY_RESULT_ERROR,
  STORE_EMPTY_RESULT_ERROR,
  buildSearchGoodsParams,
  normalizeOnlineStockResponse,
  normalizeProductIdentifier,
  normalizeProductItem,
  normalizeSearchGoodsResponse,
  normalizeStoreItem,
  normalizeStorePickupStockResponse,
  normalizeDistanceKm,
  normalizeStoreSearchResponse,
  normalizeText,
  scoreProductMatch,
  scoreStoreMatch,
  sortProductCandidates,
  sortStoreCandidates
}
