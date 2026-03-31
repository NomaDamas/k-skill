const {
  BASE_MOBILE_URL,
  BASE_URL,
  buildProductUrl,
  buildReviewsUrl,
  buildSearchUrl,
  parseProductDetailHtml,
  parseReviewsHtml,
  parseSearchResultsHtml,
  stripTags
} = require("./parse")

const DESKTOP_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
}
const MOBILE_HEADERS = {
  accept: DESKTOP_HEADERS.accept,
  "accept-language": DESKTOP_HEADERS["accept-language"],
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
}

function detectBlockedAccess(html, metadata = {}) {
  const raw = String(html || "")
  const snippet = stripTags(raw).slice(0, 240)
  const lowered = raw.toLowerCase()

  if (/access denied/i.test(raw) || /you don't have permission to access/i.test(raw) || lowered.includes("errors.edgesuite.net")) {
    return {
      blocked: true,
      reason: "access-denied-html",
      status: metadata.status ?? null,
      snippet
    }
  }

  if (
    lowered.includes("powered and protected by privacy") ||
    lowered.includes("location.reload(true)") ||
    lowered.includes("__chl_done") ||
    lowered.includes("just a moment")
  ) {
    return {
      blocked: true,
      reason: "challenge-html",
      status: metadata.status ?? null,
      snippet
    }
  }

  if (Number(metadata.status) >= 403) {
    return {
      blocked: true,
      reason: `http-status-${metadata.status}`,
      status: metadata.status,
      snippet
    }
  }

  return {
    blocked: false,
    reason: null,
    status: metadata.status ?? null,
    snippet
  }
}

function buildBlockedError(url, detection) {
  const error = new Error(`Coupang access appears blocked for ${url}`)
  error.code = "COUPANG_ACCESS_BLOCKED"
  error.url = url
  error.detection = detection
  return error
}

async function requestHtml(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.")
  }

  const isMobile = String(url).startsWith(BASE_MOBILE_URL)
  const response = await fetchImpl(url, {
    headers: {
      ...(isMobile ? MOBILE_HEADERS : DESKTOP_HEADERS),
      ...(options.headers || {})
    },
    signal: options.signal
  })
  const html = await response.text()
  const detection = detectBlockedAccess(html, { status: response.status })

  if (!response.ok || detection.blocked) {
    throw buildBlockedError(url, detection)
  }

  return html
}

async function resolveHtml(url, options = {}) {
  if (typeof options.html === "string") {
    return options.html
  }

  if (typeof options.fetchHtml === "function") {
    return options.fetchHtml(url, options)
  }

  return requestHtml(url, options)
}

async function searchProducts(query, options = {}) {
  const mobile = options.mobile === true
  const searchUrl = buildSearchUrl(query, {
    mobile,
    page: options.page
  })
  const html = await resolveHtml(searchUrl, options)
  const detection = detectBlockedAccess(html, { status: 200 })

  if (detection.blocked) {
    throw buildBlockedError(searchUrl, detection)
  }

  return parseSearchResultsHtml(html, {
    query: String(query || "").trim(),
    searchUrl
  })
}

async function getProductDetail(request, options = {}) {
  const productUrl = buildProductUrl(request)
  const html = await resolveHtml(productUrl, options)
  const detection = detectBlockedAccess(html, { status: 200 })

  if (detection.blocked) {
    throw buildBlockedError(productUrl, detection)
  }

  return parseProductDetailHtml(html, { productUrl })
}

async function getProductReviews(request, options = {}) {
  const reviewUrl = buildReviewsUrl(request)
  const html = await resolveHtml(reviewUrl, options)
  const detection = detectBlockedAccess(html, { status: 200 })

  if (detection.blocked) {
    throw buildBlockedError(reviewUrl, detection)
  }

  return parseReviewsHtml(html, { reviewUrl })
}

async function probeUrl(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch

  if (typeof fetchImpl !== "function") {
    return {
      url,
      blocked: true,
      reason: "missing-fetch-implementation",
      status: null,
      snippet: ""
    }
  }

  try {
    const response = await fetchImpl(url, {
      headers: {
        ...(String(url).startsWith(BASE_MOBILE_URL) ? MOBILE_HEADERS : DESKTOP_HEADERS),
        ...(options.headers || {})
      },
      signal: options.signal
    })
    const html = await response.text()
    return {
      url,
      ...detectBlockedAccess(html, { status: response.status })
    }
  } catch (error) {
    return {
      url,
      blocked: true,
      reason: "network-error",
      status: null,
      snippet: String(error.message || error)
    }
  }
}

async function probeAutomation(query, options = {}) {
  const directDesktopUrl = buildSearchUrl(query)
  const directMobileUrl = buildSearchUrl(query, { mobile: true })
  const [directDesktop, directMobile] = await Promise.all([
    probeUrl(directDesktopUrl, options),
    probeUrl(directMobileUrl, options)
  ])

  let browser = null
  if (typeof options.browserFetchHtml === "function") {
    try {
      const html = await options.browserFetchHtml(directMobileUrl, options)
      browser = {
        url: directMobileUrl,
        ...detectBlockedAccess(html, { status: 200 })
      }
    } catch (error) {
      browser = {
        url: directMobileUrl,
        blocked: true,
        reason: "browser-fetch-error",
        status: null,
        snippet: String(error.message || error)
      }
    }
  }

  return {
    query: String(query || "").trim(),
    directDesktop,
    directMobile,
    browser
  }
}

module.exports = {
  BASE_MOBILE_URL,
  BASE_URL,
  buildProductUrl,
  buildReviewsUrl,
  buildSearchUrl,
  detectBlockedAccess,
  getProductDetail,
  getProductReviews,
  parseProductDetailHtml,
  parseReviewsHtml,
  parseSearchResultsHtml,
  probeAutomation,
  searchProducts
}
