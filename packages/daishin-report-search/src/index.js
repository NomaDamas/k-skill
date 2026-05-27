const OWNER = "Jay-jo-0"
const API_OWNER = "jay-jo-0"
const REPO = "github_pages_repo"
const BRANCH = "main"
const PAGES_BASE_URL = "https://jay-jo-0.github.io/github_pages_repo"
const RAW_BASE_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`
const API_BASE_URL = `https://api.github.com/repos/${API_OWNER}/${REPO}`
const TREE_URL = `${API_BASE_URL}/git/trees/${BRANCH}?recursive=1`
const REPORT_PATH_PATTERN = /^(\d{14})(?:_explain)?\.html$/
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const DEFAULT_MAX_INSPECT = 50
const MAX_INSPECT = 500

async function listReports(options = {}) {
  const {
    query = "",
    limit = 10,
    maxInspect,
    includeHtml = false,
    fetcher = global.fetch
  } = options

  if (!fetcher) throw new Error("fetch is required")

  const normalizedLimit = parsePositiveInteger(limit, DEFAULT_LIMIT, MAX_LIMIT)
  const normalizedQuery = String(query || "").trim()
  const defaultInspectBudget = Math.max(DEFAULT_MAX_INSPECT, normalizedLimit * 5)
  const normalizedMaxInspect = parsePositiveInteger(maxInspect, defaultInspectBudget, MAX_INSPECT)
  const inspectBudget = Math.max(normalizedLimit, normalizedMaxInspect)
  const warnings = []

  let tree
  try {
    tree = await fetchJson(fetcher, TREE_URL, options)
  } catch (error) {
    warnings.push(`GitHub tree discovery failed: ${error.message}`)
    return {
      query: normalizedQuery,
      count: 0,
      items: [],
      warnings,
      source: buildSource(0, 0, error)
    }
  }
  if (tree.truncated) warnings.push("github tree response was truncated; latest report list may be incomplete")

  const paths = Array.isArray(tree.tree)
    ? tree.tree.filter((entry) => entry && entry.type === "blob").map((entry) => entry.path)
    : []
  const candidates = parseTreePaths(paths)
  const items = []
  let inspectedReports = 0

  for (const candidate of candidates.slice(0, inspectBudget)) {
    let item = { ...candidate, ...buildReportUrls(candidate.path) }
    if (candidate.hasExplain) {
      item.explainUrl = buildReportUrls(candidate.explainPath).pageUrl
      item.explainRawUrl = buildReportUrls(candidate.explainPath).rawUrl
    }

    try {
      inspectedReports += 1
      const html = await fetchText(fetcher, item.rawUrl, options)
      const parsed = parseReportHtml(html)
      item = {
        ...item,
        title: parsed.title || item.id,
        headings: parsed.headings,
        excerpt: parsed.excerpt,
        ratingTargets: parsed.ratingTargets
      }
      if (includeHtml) item.html = html
      if (matchesQuery({ ...item, text: parsed.text }, normalizedQuery)) items.push(item)
    } catch (error) {
      warnings.push(`report detail failed for ${item.path}: ${error.message}`)
      if (!normalizedQuery) items.push({ ...item, title: item.id })
    }

    if (items.length >= normalizedLimit) break
  }

  if (items.length < normalizedLimit && candidates.length > inspectBudget) {
    warnings.push(`inspection budget exhausted after ${inspectBudget} of ${candidates.length} report pages`)
  }

  return {
    query: normalizedQuery,
    count: items.length,
    items,
    warnings,
    source: buildSource(candidates.length, inspectedReports)
  }
}

async function fetchReport(idOrPath, options = {}) {
  const { includeExplain = false, includeHtml = false, fetcher = global.fetch } = options
  if (!fetcher) throw new Error("fetch is required")

  const path = normalizeReportPath(idOrPath)
  const meta = parseTimestamp(path)
  if (!meta || meta.isExplain) throw new Error(`invalid report id or path: ${idOrPath}`)

  const urls = buildReportUrls(path)
  const html = await fetchReportHtml(fetcher, urls, options)
  const parsed = parseReportHtml(html)
  const report = {
    ...meta,
    ...urls,
    title: parsed.title || meta.id,
    headings: parsed.headings,
    text: parsed.text,
    excerpt: parsed.excerpt,
    ratingTargets: parsed.ratingTargets
  }
  if (includeHtml) report.html = html

  if (includeExplain) {
    const explainPath = `${meta.id}_explain.html`
    const explainUrls = buildReportUrls(explainPath)
    try {
      const explainHtml = await fetchReportHtml(fetcher, explainUrls, options)
      const explainParsed = parseReportHtml(explainHtml)
      report.explain = {
        ...parseTimestamp(explainPath),
        ...explainUrls,
        title: explainParsed.title || `${meta.id} explanation`,
        headings: explainParsed.headings,
        text: explainParsed.text,
        excerpt: explainParsed.excerpt,
        ratingTargets: explainParsed.ratingTargets
      }
      if (includeHtml) report.explain.html = explainHtml
    } catch (error) {
      report.explain = null
      report.warnings = [`explanation page failed for ${explainPath}: ${error.message}`]
    }
  }

  return report
}

function parseTreePaths(paths) {
  const byId = new Map()
  for (const path of paths) {
    const meta = parseTimestamp(path)
    if (!meta) continue
    const record = byId.get(meta.id) || { id: meta.id }
    if (meta.isExplain) {
      record.explainPath = meta.path
      record.hasExplain = true
    } else {
      Object.assign(record, meta)
      record.hasExplain = Boolean(record.hasExplain)
    }
    byId.set(meta.id, record)
  }

  return [...byId.values()]
    .filter((record) => record.path)
    .map((record) => ({ ...record, hasExplain: Boolean(record.explainPath) }))
    .sort((a, b) => b.id.localeCompare(a.id))
}

function parseTimestamp(path) {
  const match = String(path || "").match(REPORT_PATH_PATTERN)
  if (!match) return null
  const id = match[1]
  const isExplain = String(path).includes("_explain.html")
  const year = id.slice(0, 4)
  const month = id.slice(4, 6)
  const day = id.slice(6, 8)
  const hour = id.slice(8, 10)
  const minute = id.slice(10, 12)
  const second = id.slice(12, 14)
  const timestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`

  return {
    id,
    path: String(path),
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
    timestamp,
    epochMs: Date.parse(timestamp),
    isExplain
  }
}

function buildReportUrls(path, options = {}) {
  const branch = options.branch || BRANCH
  const encodedPath = encodeReportPath(path)
  return {
    pageUrl: `${PAGES_BASE_URL}/${encodedPath}`,
    rawUrl: `https://raw.githubusercontent.com/${OWNER}/${REPO}/${branch}/${encodedPath}`,
    apiUrl: `${API_BASE_URL}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
  }
}

function parseReportHtml(html) {
  const withoutScripts = String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  const title = firstText(withoutScripts, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    || firstText(withoutScripts, /<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const headings = [...withoutScripts.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => normalizeText(stripTags(match[1])))
    .filter(Boolean)
  const ratingTargets = parseTables(withoutScripts).filter((row) => {
    const keys = Object.keys(row).join(" ")
    return /종목명|투자의견|목표주가|Rating|Target/i.test(keys)
  })
  const text = normalizeText(
    decodeEntities(
      withoutScripts
        .replace(/<\/?(p|div|br|li|tr|h[1-6]|table|thead|tbody|ul|ol)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  )
  const excerpt = text.length > 300 ? `${text.slice(0, 297)}...` : text

  return { title, headings, text, excerpt, ratingTargets }
}

function parseTables(html) {
  const rows = []
  for (const tableMatch of String(html || "").matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tableRows = [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cellMatch) => normalizeText(stripTags(cellMatch[1])))
    ).filter((cells) => cells.length > 0)
    if (tableRows.length < 2) continue
    const headers = tableRows[0]
    for (const cells of tableRows.slice(1)) {
      const row = {}
      headers.forEach((header, index) => {
        if (header && cells[index]) row[header] = cells[index]
      })
      if (Object.keys(row).length > 0) rows.push(row)
    }
  }
  return rows
}

function matchesQuery(item, query) {
  if (!query) return true
  const haystack = [item.id, item.title, item.excerpt, item.text, ...(item.headings || [])]
    .join("\n")
    .toLocaleLowerCase("ko-KR")
  return query.toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean).every((term) => haystack.includes(term))
}

async function fetchJson(fetcher, url, options = {}) {
  const response = await fetcher(url, { headers: requestHeaders(url, options) })
  await assertOk(response, url)
  if (typeof response.json === "function") return response.json()
  return JSON.parse(await response.text())
}

async function fetchText(fetcher, url, options = {}) {
  const response = await fetcher(url, { headers: requestHeaders(url, options) })
  await assertOk(response, url)
  return response.text()
}

async function fetchReportHtml(fetcher, urls, options = {}) {
  try {
    return await fetchText(fetcher, urls.rawUrl, options)
  } catch (rawError) {
    try {
      const contents = await fetchJson(fetcher, urls.apiUrl, options)
      return decodeContentsApiHtml(contents, urls.apiUrl)
    } catch (contentsError) {
      const error = new Error(`${rawError.message}; contents fallback failed: ${contentsError.message}`)
      error.cause = rawError
      error.fallbackCause = contentsError
      error.url = rawError.url
      error.status = rawError.status
      error.statusText = rawError.statusText
      error.kind = rawError.kind
      error.rateLimit = rawError.rateLimit
      throw error
    }
  }
}

async function assertOk(response, url) {
  if (response && response.ok) return
  const statusCode = response && response.status
  const statusText = response && response.statusText
  const status = response ? `${statusCode || ""} ${statusText || ""}`.trim() : "no response"
  const error = new Error(`HTTP ${status} for ${url}`)
  error.url = url
  error.status = statusCode || null
  error.statusText = statusText || ""
  error.kind = statusCode === 403 || statusCode === 429 ? "rate_limit" : "http"
  error.rateLimit = readRateLimit(response && response.headers)
  throw error
}

function requestHeaders(url, options = {}) {
  const headers = {
    "user-agent": "k-skill daishin-report-search (+https://github.com/NomaDamas/k-skill)",
    accept: "application/vnd.github+json, text/html;q=0.9, */*;q=0.8"
  }
  if (isGitHubApiUrl(url)) {
    Object.assign(headers, options.githubHeaders || {})
    const token = options.githubToken || readEnvToken()
    if (token && !hasHeader(headers, "authorization")) headers.authorization = `Bearer ${token}`
  }
  return headers
}

function decodeContentsApiHtml(contents, url) {
  if (!contents || typeof contents.content !== "string") {
    throw new Error(`GitHub contents response missing content for ${url}`)
  }
  if (contents.encoding && contents.encoding !== "base64") {
    throw new Error(`unsupported GitHub contents encoding ${contents.encoding} for ${url}`)
  }
  return Buffer.from(contents.content.replace(/\s+/g, ""), "base64").toString("utf8")
}

function isGitHubApiUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase() === "api.github.com"
  } catch {
    return false
  }
}

function buildSource(totalReportsDiscovered, inspectedReports, error) {
  const source = {
    treeUrl: TREE_URL,
    pagesBaseUrl: PAGES_BASE_URL,
    rawBaseUrl: RAW_BASE_URL,
    branch: BRANCH,
    totalReportsDiscovered,
    inspectedReports
  }
  if (error) source.error = serializeSourceError(error)
  return source
}

function serializeSourceError(error) {
  return {
    message: error.message,
    url: error.url || TREE_URL,
    status: error.status || null,
    statusText: error.statusText || "",
    kind: error.kind || "unknown",
    rateLimit: error.rateLimit || {}
  }
}

function readRateLimit(headers) {
  if (!headers || typeof headers.get !== "function") return {}
  const reset = headers.get("x-ratelimit-reset")
  const retryAfter = headers.get("retry-after")
  const rateLimit = {
    limit: headers.get("x-ratelimit-limit") || "",
    remaining: headers.get("x-ratelimit-remaining") || "",
    reset: reset || "",
    retryAfter: retryAfter || ""
  }
  if (reset && /^\d+$/.test(reset)) rateLimit.resetAt = new Date(Number(reset) * 1000).toISOString()
  return rateLimit
}

function readEnvToken() {
  if (typeof process === "undefined" || !process.env) return ""
  return process.env.DAISHIN_GITHUB_TOKEN || process.env.GITHUB_TOKEN || ""
}

function hasHeader(headers, name) {
  const normalized = name.toLowerCase()
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized)
}

function normalizeReportPath(idOrPath) {
  const value = String(idOrPath || "").trim()
  if (/^\d{14}$/.test(value)) return `${value}.html`
  return value.replace(/^\/+/, "")
}

function firstText(html, pattern) {
  const match = String(html || "").match(pattern)
  return match ? normalizeText(stripTags(match[1])) : ""
}

function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function parsePositiveInteger(value, defaultValue, maxValue) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaultValue
  const integer = Math.floor(parsed)
  if (integer <= 0) return defaultValue
  return Math.min(integer, maxValue)
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  }
  return String(value || "")
    .replace(/&#(\d+);/g, (entity, code) => decodeCodePoint(Number(code), entity))
    .replace(/&#x([0-9a-f]+);/gi, (entity, code) => decodeCodePoint(Number.parseInt(code, 16), entity))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] || `&${name};`)
}

function decodeCodePoint(codePoint, originalEntity) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return originalEntity
  return String.fromCodePoint(codePoint)
}

function encodeReportPath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/")
}

module.exports = {
  API_BASE_URL,
  BRANCH,
  PAGES_BASE_URL,
  RAW_BASE_URL,
  TREE_URL,
  buildReportUrls,
  fetchReport,
  listReports,
  parseReportHtml,
  parseTimestamp,
  parseTreePaths
}
