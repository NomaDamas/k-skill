const BASE_URL = "https://www.coupang.com"
const BASE_MOBILE_URL = "https://m.coupang.com"

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function stripTags(value) {
  return normalizeWhitespace(decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " ")))
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function toAbsoluteUrl(value, baseUrl = BASE_URL) {
  const trimmed = String(value || "").trim()

  if (!trimmed) {
    return null
  }

  return new URL(decodeHtmlEntities(trimmed), baseUrl).toString()
}

function toNumber(value) {
  const digits = String(value || "").replace(/[^\d.-]/g, "")

  if (!digits) {
    return null
  }

  const normalized = Number(digits)
  return Number.isFinite(normalized) ? normalized : null
}

function extractAttribute(block, name) {
  const match = String(block || "").match(new RegExp(`${escapeRegex(name)}=["']([^"']+)["']`, "i"))
  return match ? decodeHtmlEntities(match[1]) : null
}

function extractTextByClass(block, className) {
  const match = String(block || "").match(
    new RegExp(
      `<([a-z0-9:-]+)[^>]*class=["'][^"']*${escapeRegex(className)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i"
    )
  )

  return match ? stripTags(match[2]) : null
}

function extractTextsByClass(block, className) {
  return [...String(block || "").matchAll(
    new RegExp(
      `<([a-z0-9:-]+)[^>]*class=["'][^"']*${escapeRegex(className)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "gi"
    )
  )].map(([, , content]) => stripTags(content)).filter(Boolean)
}

function extractTextsByTagAndClass(block, tagName, className) {
  const tagPattern = escapeRegex(tagName)

  return [...String(block || "").matchAll(
    new RegExp(
      `<${tagPattern}[^>]*class=["'][^"']*${escapeRegex(className)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tagPattern}>`,
      "gi"
    )
  )].map((match) => stripTags(match[1])).filter(Boolean)
}

function parseJsonScripts(html, type) {
  return [...String(html || "").matchAll(
    new RegExp(`<script[^>]*type=["']${escapeRegex(type)}["'][^>]*>([\\s\\S]*?)<\\/script>`, "gi")
  )]
    .map((match) => match[1].trim())
    .map((raw) => {
      try {
        return JSON.parse(raw)
      } catch (_error) {
        return null
      }
    })
    .filter(Boolean)
}

function extractProductIdentifiersFromUrl(value) {
  if (!value) {
    return {
      productId: null,
      itemId: null,
      vendorItemId: null
    }
  }

  const url = new URL(toAbsoluteUrl(value))
  const pathMatch = url.pathname.match(/\/vp\/products\/(\d+)/)

  return {
    productId: pathMatch ? pathMatch[1] : null,
    itemId: url.searchParams.get("itemId"),
    vendorItemId: url.searchParams.get("vendorItemId")
  }
}

function buildSearchUrl(query, options = {}) {
  const keyword = String(query || "").trim()

  if (!keyword) {
    throw new Error("query is required.")
  }

  const base = options.mobile ? BASE_MOBILE_URL : BASE_URL
  const pathname = options.mobile ? "/nm/search" : "/np/search"
  const url = new URL(pathname, base)

  url.searchParams.set("q", keyword)

  if (options.page) {
    url.searchParams.set("page", String(options.page))
  }

  return url.toString()
}

function buildProductUrl(request = {}) {
  if (typeof request === "string") {
    return toAbsoluteUrl(request)
  }

  if (!request.productId) {
    throw new Error("productId is required.")
  }

  const base = request.mobile ? BASE_MOBILE_URL : BASE_URL
  const url = new URL(`/vp/products/${request.productId}`, base)

  if (request.itemId) {
    url.searchParams.set("itemId", String(request.itemId))
  }

  if (request.vendorItemId) {
    url.searchParams.set("vendorItemId", String(request.vendorItemId))
  }

  return url.toString()
}

function buildReviewsUrl(request = {}) {
  const productUrl = buildProductUrl(request)
  const url = new URL(productUrl)
  url.hash = "sdpReview"
  return url.toString()
}

function parseSearchResultsHtml(html, context = {}) {
  const ldItems = new Map(
    parseJsonScripts(html, "application/ld+json")
      .filter((block) => block["@type"] === "ItemList" && Array.isArray(block.itemListElement))
      .flatMap((block) => block.itemListElement)
      .map((entry) => [toAbsoluteUrl(entry.url), entry])
  )

  const items = [...String(html || "").matchAll(/<li[^>]*class=["'][^"']*search-product[^"']*["'][^>]*>[\s\S]*?<\/li>/gi)]
    .map((match, index) => {
      const block = match[0]
      const href = extractAttribute(block, "href")
      const productUrl = toAbsoluteUrl(href)
      const ld = ldItems.get(productUrl) || ldItems.get(productUrl && productUrl.replace(/&sourceType=SEARCH$/, "")) || null
      const { productId, itemId, vendorItemId } = extractProductIdentifiersFromUrl(productUrl)

      return {
        rank: toNumber(extractAttribute(block, "data-rank")) || ld?.position || index + 1,
        productId: extractAttribute(block, "data-product-id") || productId,
        itemId: extractAttribute(block, "data-item-id") || itemId,
        vendorItemId: extractAttribute(block, "data-vendor-item-id") || vendorItemId,
        productUrl,
        name: extractTextByClass(block, "name") || normalizeWhitespace(ld?.name),
        sellerName: extractTextByClass(block, "seller-name"),
        price: toNumber(extractTextByClass(block, "price-value")),
        originalPrice: toNumber(extractTextByClass(block, "base-price")),
        unitPrice: extractTextByClass(block, "unit-price"),
        currency: "KRW",
        rating: Number(extractTextByClass(block, "rating")) || null,
        ratingCount: toNumber(extractTextByClass(block, "rating-total-count")),
        badges: extractTextsByClass(block, "badge")
      }
    })
    .filter((item) => item.productUrl && item.name)
    .sort((left, right) => left.rank - right.rank)

  return {
    query: context.query || null,
    searchUrl: context.searchUrl || null,
    blocked: false,
    items
  }
}

function parseFactList(block) {
  return [...String(block || "").matchAll(/<li[^>]*>\s*<span[^>]*class=["'][^"']*label[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<span[^>]*class=["'][^"']*value[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi)]
    .reduce((result, [, label, value]) => {
      result[stripTags(label)] = stripTags(value)
      return result
    }, {})
}

function parseReviewItems(html) {
  return [...String(html || "").matchAll(/<article[^>]*class=["'][^"']*review-item[^"']*["'][^>]*>[\s\S]*?<\/article>/gi)].map((match) => {
    const block = match[0]

    return {
      reviewId: extractAttribute(block, "data-review-id"),
      author: extractTextByClass(block, "review-author"),
      rating: toNumber(extractTextByClass(block, "review-rating")),
      title: extractTextByClass(block, "review-title"),
      content: extractTextByClass(block, "review-content"),
      createdAt: extractTextByClass(block, "review-date"),
      helpfulCount: toNumber(extractTextByClass(block, "review-helpful-count")) || 0
    }
  })
}

function parseSeller(wrapper) {
  const vendorMatch = String(wrapper || "").match(
    /<div[^>]*class=["'][^"']*prod-sale-vendor[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
  )

  if (!vendorMatch) {
    return {
      sellerName: null,
      sellerUrl: null
    }
  }

  return {
    sellerName: stripTags(vendorMatch[2]),
    sellerUrl: toAbsoluteUrl(vendorMatch[1])
  }
}

function parseProductDetailHtml(html, context = {}) {
  const productSchema = parseJsonScripts(html, "application/ld+json").find((block) => block["@type"] === "Product") || {}
  const productUrl = context.productUrl ? buildProductUrl(context.productUrl) : null
  const identifiers = extractProductIdentifiersFromUrl(productUrl)
  const wrapper = String(html || "")
  const reviewSectionMatch = String(html || "").match(/<section[^>]*id=["']sdpReview["'][^>]*>[\s\S]*?<\/section>/i)
  const reviewSection = reviewSectionMatch ? reviewSectionMatch[0] : String(html || "")
  const facts = parseFactList(wrapper)
  const aggregateRating = productSchema.aggregateRating || {}
  const offers = productSchema.offers || {}
  const seller = parseSeller(wrapper)

  return {
    productUrl,
    productId: extractAttribute(wrapper, "data-product-id") || identifiers.productId || productSchema.sku || null,
    itemId: extractAttribute(wrapper, "data-item-id") || identifiers.itemId || null,
    vendorItemId: extractAttribute(wrapper, "data-vendor-item-id") || identifiers.vendorItemId || null,
    title: extractTextByClass(wrapper, "prod-buy-header__title") || normalizeWhitespace(productSchema.name),
    brandName: normalizeWhitespace(productSchema.brand?.name),
    price: toNumber(extractTextByClass(wrapper, "total-price")) || toNumber(offers.price),
    originalPrice: toNumber(extractTextByClass(wrapper, "base-price")),
    discountRate: toNumber(extractTextByClass(wrapper, "discount-rate")),
    unitPrice: extractTextByClass(wrapper, "unit-price"),
    currency: offers.priceCurrency || "KRW",
    rating: Number(extractTextByClass(wrapper, "rating-star-num")) || toNumber(aggregateRating.ratingValue),
    ratingCount: toNumber(extractTextByClass(wrapper, "rating-total-count")) || toNumber(aggregateRating.reviewCount),
    sellerName: seller.sellerName,
    sellerUrl: seller.sellerUrl,
    badges: extractTextsByTagAndClass(wrapper, "span", "badge"),
    arrivalText: extractTextByClass(wrapper, "prod-shipping-info"),
    rewardCashText: extractTextByClass(wrapper, "prod-reward"),
    facts,
    reviewSummary: {
      averageRating: Number(extractTextByClass(reviewSection, "average-rating")) || null,
      totalCount: toNumber(extractTextByClass(reviewSection, "review-total-count")),
      keywords: extractTextsByClass(reviewSection, "review-keyword")
    },
    inlineReviews: parseReviewItems(reviewSection)
  }
}

function parseReviewsHtml(html, context = {}) {
  const reviewUrl = context.reviewUrl || null
  const identifiers = extractProductIdentifiersFromUrl(reviewUrl ? reviewUrl.replace(/#.*$/, "") : null)
  const sectionMatch = String(html || "").match(/<section[^>]*id=["']sdpReview["'][^>]*>[\s\S]*?<\/section>/i)
  const section = sectionMatch ? sectionMatch[0] : String(html || "")

  return {
    reviewUrl,
    productId: extractAttribute(section, "data-product-id") || identifiers.productId,
    itemId: extractAttribute(section, "data-item-id") || identifiers.itemId,
    vendorItemId: extractAttribute(section, "data-vendor-item-id") || identifiers.vendorItemId,
    summary: {
      averageRating: Number(extractTextByClass(section, "average-rating")) || null,
      totalCount: toNumber(extractTextByClass(section, "review-total-count")),
      currentPage: toNumber(extractTextByClass(section, "current-page")),
      totalPages: toNumber(extractTextByClass(section, "total-pages"))
    },
    items: parseReviewItems(section)
  }
}

module.exports = {
  BASE_MOBILE_URL,
  BASE_URL,
  buildProductUrl,
  buildReviewsUrl,
  buildSearchUrl,
  extractProductIdentifiersFromUrl,
  parseProductDetailHtml,
  parseReviewsHtml,
  parseSearchResultsHtml,
  stripTags,
  toAbsoluteUrl,
  toNumber
}
