const KURLY_WEB_BASE_URL = "https://www.kurly.com"
const SEARCH_EMPTY_RESULT_ERROR = "No Market Kurly product candidates were returned."
const COUNT_EMPTY_RESULT_ERROR = "No Market Kurly result count was returned."
const DETAIL_EMPTY_RESULT_ERROR = "No Market Kurly product detail was returned."
const NEXT_DATA_MISSING_ERROR = "Market Kurly goods page did not include __NEXT_DATA__."

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function normalizeKeyword(query) {
  const normalized = String(query || "").trim()

  if (!normalized) {
    throw new Error("keyword is required.")
  }

  return normalized
}

function normalizeProductNo(productNo) {
  const normalized = String(productNo || "").trim()

  if (!normalized) {
    throw new Error("productNo is required.")
  }

  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : normalized
}

function buildGoodsUrl(productNo) {
  return `${KURLY_WEB_BASE_URL}/goods/${productNo}`
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value
    }
  }

  return null
}

function normalizeDeliveryTypes(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item || "").trim()).filter(Boolean)
}

function normalizeSearchItem(item) {
  const productNo = normalizeProductNo(item?.no)
  const salesPrice = toNumberOrNull(item?.salesPrice)
  const discountedPrice = toNumberOrNull(item?.discountedPrice)
  const basePrice = toNumberOrNull(item?.basePrice)
  const currentPrice = firstPresent(discountedPrice, salesPrice, basePrice)
  const originalPrice = firstPresent(salesPrice, basePrice, currentPrice)

  return {
    productNo,
    name: String(item?.name || ""),
    shortDescription: item?.shortDescription || null,
    currentPrice,
    originalPrice,
    salesPrice,
    discountedPrice,
    discountRate: toNumberOrNull(item?.discountRate),
    isSoldOut: Boolean(item?.isSoldOut),
    isPurchaseStatus: item?.isPurchaseStatus ?? null,
    deliveryTypeNames: normalizeDeliveryTypes(item?.deliveryTypeNames),
    reviewCount: toNumberOrNull(item?.reviewCount),
    imageUrl: item?.listImageUrl || item?.imageUrl || null,
    goodsUrl: buildGoodsUrl(productNo),
    raw: item
  }
}

function collectSearchItems(payload) {
  const sections = Array.isArray(payload?.data?.listSections) ? payload.data.listSections : []
  const items = []

  for (const section of sections) {
    if (Array.isArray(section?.data?.items)) {
      items.push(...section.data.items)
    }
  }

  return items
}

function normalizeSearchResponse(payload, query) {
  const items = collectSearchItems(payload)

  if (items.length === 0) {
    throw new Error(SEARCH_EMPTY_RESULT_ERROR)
  }

  return {
    query: normalizeKeyword(query),
    pagination: payload?.data?.meta?.pagination || null,
    items: items.map(normalizeSearchItem)
  }
}

function normalizeCountResponse(payload, query) {
  const count = toNumberOrNull(payload?.data?.count)

  if (count === null) {
    throw new Error(COUNT_EMPTY_RESULT_ERROR)
  }

  return {
    query: normalizeKeyword(query),
    count
  }
}

function extractNextDataJson(html) {
  const match = String(html || "").match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/u)

  if (!match) {
    throw new Error(NEXT_DATA_MISSING_ERROR)
  }

  return JSON.parse(match[1])
}

function hasDetailShape(candidate) {
  return Boolean(candidate) && typeof candidate === "object" && "name" in candidate && "isSoldOut" in candidate && "deliveryTypeNames" in candidate && ("no" in candidate || "productNo" in candidate)
}

function normalizeDetailCandidate(candidate) {
  const productNo = normalizeProductNo(firstPresent(candidate.productNo, candidate.no))
  const showablePrices = candidate?.showablePrices || {}
  const basePrice = toNumberOrNull(firstPresent(
    candidate.retailPrice,
    showablePrices.retailPrice,
    candidate.basePrice,
    showablePrices.basePrice
  ))
  const salesPrice = toNumberOrNull(firstPresent(candidate.salesPrice, showablePrices.salesPrice))
  const rawDiscountedPrice = toNumberOrNull(firstPresent(
    candidate.discountedPrice,
    showablePrices.discountedPrice,
    showablePrices.couponDiscountedPrice
  ))
  const discountedPrice = rawDiscountedPrice ?? (
    basePrice !== null && salesPrice !== null && basePrice > salesPrice
      ? salesPrice
      : null
  )
  const currentPrice = firstPresent(discountedPrice, salesPrice, basePrice)
  const originalPrice = firstPresent(basePrice, salesPrice, currentPrice)

  return {
    productNo,
    name: String(candidate.name || ""),
    shortDescription: candidate.shortDescription || null,
    currentPrice,
    originalPrice,
    basePrice,
    salesPrice,
    discountedPrice,
    discountRate: toNumberOrNull(candidate.discountRate),
    isSoldOut: Boolean(candidate.isSoldOut),
    deliveryTypeNames: normalizeDeliveryTypes(candidate.deliveryTypeNames),
    imageUrl: firstPresent(
      candidate.imageUrl,
      candidate.listImageUrl,
      candidate.productVerticalMediumUrl,
      candidate.mainImageUrl
    ),
    goodsUrl: buildGoodsUrl(productNo),
    raw: candidate
  }
}

function findProductDetail(nextData) {
  const stack = [nextData]

  while (stack.length > 0) {
    const current = stack.pop()

    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }

    if (!current || typeof current !== "object") {
      continue
    }

    if (hasDetailShape(current)) {
      return normalizeDetailCandidate(current)
    }

    stack.push(...Object.values(current))
  }

  throw new Error(DETAIL_EMPTY_RESULT_ERROR)
}

module.exports = {
  COUNT_EMPTY_RESULT_ERROR,
  DETAIL_EMPTY_RESULT_ERROR,
  KURLY_WEB_BASE_URL,
  NEXT_DATA_MISSING_ERROR,
  SEARCH_EMPTY_RESULT_ERROR,
  buildGoodsUrl,
  extractNextDataJson,
  findProductDetail,
  normalizeCountResponse,
  normalizeKeyword,
  normalizeProductNo,
  normalizeSearchResponse
}
