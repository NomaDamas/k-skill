const GANGNAMUNNI_ORIGIN = "https://www.gangnamunni.com"
const GANGNAMUNNI_SEARCH_URL = `${GANGNAMUNNI_ORIGIN}/search`
const SOURCE_ID = "gangnamunni-search-next-data"

function buildSearchUrl(query) {
  const params = new URLSearchParams({ q: String(query || "") })
  return `${GANGNAMUNNI_SEARCH_URL}?${params.toString()}`
}

async function searchClinics(options = {}) {
  const { query, limit = 5, fetcher = global.fetch, signal, timeoutMs = 10000 } = options
  const normalizedQuery = cleanText(query)
  if (!normalizedQuery) throw new Error("query is required for Gangnam Unni clinic search")
  if (!fetcher) throw new Error("fetch is required")

  const url = buildSearchUrl(normalizedQuery)
  const requestOptions = {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; k-skill/gangnamunni-clinic-search)",
      accept: "text/html,application/xhtml+xml"
    }
  }
  const requestSignal = signal || createTimeoutSignal(timeoutMs)
  if (requestSignal) requestOptions.signal = requestSignal

  const response = await fetcher(url, requestOptions)

  if (!response || !response.ok) {
    const status = response ? `${response.status} ${response.statusText || ""}`.trim() : "no response"
    throw new Error(`request failed for ${redactSearchUrl(url)}: ${status}`)
  }

  const html = await response.text()
  return parseSearchHtml(html, { query: normalizedQuery, limit, sourceUrl: url })
}

function parseSearchHtml(html, options = {}) {
  const { query = "", limit = 5, sourceUrl = buildSearchUrl(query) } = options
  const normalizedLimit = Math.max(1, Number(limit) || 5)
  const data = parseNextData(html)
  const pageProps = (((data || {}).props || {}).pageProps) || {}
  const hospitals = Array.isArray(pageProps.hospitals) ? pageProps.hospitals : []
  const parsed = hospitals.map(normalizeHospital).filter((item) => item.id && item.name)
  const items = parsed.slice(0, normalizedLimit)
  const warnings = []

  if (hospitals.length === 0 && Number(pageProps.hospitalTotalLength || 0) > 0) {
    warnings.push(`Gangnam Unni reported ${pageProps.hospitalTotalLength} hospitals but embedded no hospital list items`)
  }
  if (parsed.length > items.length) warnings.push(`returned ${items.length} of ${parsed.length} parsed hospitals; increase limit for more`)
  if (Number(pageProps.hospitalTotalLength || 0) > parsed.length) {
    warnings.push(`public search page embedded ${parsed.length} of ${pageProps.hospitalTotalLength} matching hospitals`)
  }

  return {
    query: cleanText(pageProps.keyword) || cleanText(query),
    totalLength: numericOrNull(pageProps.totalLength),
    hospitalTotalLength: numericOrNull(pageProps.hospitalTotalLength),
    sourceUrl,
    sources: [SOURCE_ID],
    warnings,
    items
  }
}

function parseNextData(html) {
  const source = String(html || "")
  classifyBlockedBody(source)
  const match = source.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) throw new Error("Gangnam Unni next data payload not found")
  const payload = match[1].trim()
  try {
    return JSON.parse(payload)
  } catch (rawError) {
    try {
      return JSON.parse(decodeHtmlEntities(payload))
    } catch (decodedError) {
      const message = `Gangnam Unni next data payload could not be parsed: ${rawError.message}`
      throw new Error(`${message}; decoded fallback failed: ${decodedError.message}`)
    }
  }
}

function createTimeoutSignal(timeoutMs) {
  const numericTimeoutMs = Number(timeoutMs)
  if (!Number.isFinite(numericTimeoutMs) || numericTimeoutMs <= 0) return null
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return null
  return AbortSignal.timeout(numericTimeoutMs)
}

function redactSearchUrl(value) {
  try {
    const url = new URL(String(value))
    const serialized = url.toString()
    return serialized.replace(/([?&]q=)[^&]*/i, "$1<redacted>")
  } catch {
    return String(value || "").replace(/([?&]q=)[^&]*/i, "$1<redacted>")
  }
}

function classifyBlockedBody(source) {
  const text = cleanText(htmlToText(source)).toLowerCase()
  if (!text) return
  if (/captcha|recaptcha|로봇이 아닙니다|자동화된 요청/.test(text)) throw new Error("Gangnam Unni captcha challenge encountered")
  if (/access denied|forbidden|request blocked|too many requests|temporarily blocked|접근이 제한/.test(text)) {
    throw new Error("Gangnam Unni request blocked")
  }
  if (/로그인(이|을)? 필요|sign in required|login required/.test(text)) throw new Error("Gangnam Unni login required")
}

function normalizeHospital(hospital) {
  const id = Number(hospital && hospital.id)
  return compactObject({
    id: Number.isFinite(id) ? id : null,
    name: cleanText(hospital && hospital.name),
    rating: numericOrNull(hospital && hospital.rating),
    ratingCount: numericOrNull(hospital && hospital.ratingCount),
    reviewCount: numericOrNull(hospital && hospital.reviewCount),
    pageCount: numericOrNull(hospital && hospital.pageCount),
    languages: Array.isArray(hospital && hospital.supportingLangList) ? hospital.supportingLangList.filter(Boolean) : [],
    assessmentState: cleanText(hospital && hospital.assessmentState),
    sido: cleanText(hospital && hospital.sido),
    profileImage: safeHttpsUrl(hospital && hospital.profileImage),
    mainImage: safeHttpsUrl(hospital && hospital.mainImage),
    url: Number.isFinite(id) ? `${GANGNAMUNNI_ORIGIN}/hospitals/${id}` : null
  })
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
    if (entry === null || entry === undefined || entry === "") return false
    if (Array.isArray(entry) && entry.length === 0) return false
    return true
  }))
}

function numericOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function safeHttpsUrl(value) {
  const text = cleanText(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim()
}

module.exports = {
  GANGNAMUNNI_ORIGIN,
  GANGNAMUNNI_SEARCH_URL,
  SOURCE_ID,
  buildSearchUrl,
  searchClinics,
  parseSearchHtml,
  parseNextData,
  normalizeHospital,
  createTimeoutSignal,
  redactSearchUrl,
  cleanText
}
