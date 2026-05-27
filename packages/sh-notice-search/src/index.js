const SH_BASE_URL = "https://www.i-sh.co.kr"
const DEFAULT_CATEGORY = "rent"
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 10
const DEFAULT_TIMEOUT_MS = 20000

const CATEGORY_CONFIGS = {
  all: {
    key: "all",
    name: "전체",
    path: "/app/lay2/program/S1T294C295/www/brd/m_241",
    multiItmSeqs: "1,2,4,8,16,32,64,128,256,512",
    aliases: ["all", "전체"]
  },
  sale: {
    key: "sale",
    name: "주택분양",
    path: "/app/lay2/program/S1T294C296/www/brd/m_244",
    multiItmSeq: "1",
    aliases: ["sale", "분양", "주택분양", "분양주택"]
  },
  rent: {
    key: "rent",
    name: "주택임대",
    path: "/app/lay2/program/S1T294C297/www/brd/m_247",
    multiItmSeq: "2",
    aliases: ["rent", "임대", "주택임대", "임대주택"]
  },
  purchase: {
    key: "purchase",
    name: "주택매입",
    path: "/app/lay2/program/S1T294C3379/www/brd/m_247",
    multiItmSeq: "512",
    aliases: ["purchase", "매입", "주택매입", "매입임대", "welfare", "주거복지"]
  },
  movein: {
    key: "movein",
    name: "입주안내",
    path: "/app/lay2/program/S1T294C298/www/brd/m_248",
    multiItmSeq: "4",
    aliases: ["movein", "입주", "입주안내"]
  },
  land: {
    key: "land",
    name: "토지",
    path: "/app/lay2/program/S1T294C299/www/brd/m_255",
    multiItmSeq: "8",
    aliases: ["land", "토지"]
  },
  commercial: {
    key: "commercial",
    name: "상가/공장",
    path: "/app/lay2/program/S1T294C300/www/brd/m_256",
    multiItmSeq: "16",
    aliases: ["commercial", "상가", "공장", "상가/공장"]
  },
  compensation: {
    key: "compensation",
    name: "보상/이주",
    path: "/app/lay2/program/S1T294C301/www/brd/m_257",
    multiItmSeq: "32",
    aliases: ["compensation", "보상", "이주", "보상/이주"]
  },
  design: {
    key: "design",
    name: "현상설계",
    path: "/app/lay2/program/S1T294C302/www/brd/m_258",
    multiItmSeq: "64",
    aliases: ["design", "현상설계", "설계"]
  },
  etc: {
    key: "etc",
    name: "기타",
    path: "/app/lay2/program/S1T294C304/www/brd/m_260",
    multiItmSeq: "256",
    aliases: ["etc", "기타"]
  }
}

const CATEGORY_ALIAS = Object.fromEntries(
  Object.values(CATEGORY_CONFIGS).flatMap((config) => config.aliases.map((alias) => [normalizeToken(alias), config.key]))
)

const STATUS_ALIASES = {
  open: "open",
  ongoing: "open",
  active: "open",
  "진행": "open",
  "공고중": "open",
  "모집중": "open",
  closed: "closed",
  close: "closed",
  ended: "closed",
  "마감": "closed",
  "종료": "closed",
  "결과": "closed",
  announced: "announced",
  "발표": "announced",
  "당첨": "announced",
  "당첨자": "announced"
}

function normalizeToken(value) {
  return String(value == null ? "" : value).replace(/\s+/g, "").trim().toLowerCase()
}

function cleanText(value) {
  return decodeHtml(String(value == null ? "" : value).replace(/\s+/g, " ").trim())
}

function trimOrNull(value) {
  const text = cleanText(value)
  return text || null
}

function decodeHtml(value) {
  if (value === undefined || value === null) return ""
  return String(value)
    .replace(/&#(\d+);/g, (_match, dec) => decodeNumericEntity(Number.parseInt(dec, 10), _match))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => decodeNumericEntity(Number.parseInt(hex, 16), _match))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
}

function decodeNumericEntity(codePoint, fallback) {
  try {
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return fallback
    return String.fromCodePoint(codePoint)
  } catch {
    return fallback
  }
}

function stripTags(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

function getHtmlAttr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))
  return match ? decodeHtml(match[2]) : ""
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
    if (entry === null || entry === undefined || entry === "") return false
    if (Array.isArray(entry) && entry.length === 0) return false
    return true
  }))
}

function parsePositiveInteger(value, { defaultValue, min = 1, max, label }) {
  if (value === undefined || value === null || String(value).trim() === "") return defaultValue
  const text = String(value).trim()
  if (!/^\d+$/.test(text)) throw new Error(`Provide valid ${label}.`)
  const parsed = Number.parseInt(text, 10)
  if (parsed < min) return min
  if (Number.isFinite(max) && parsed > max) return max
  return parsed
}

function normalizeCategory(value) {
  const token = normalizeToken(value || DEFAULT_CATEGORY)
  const key = CATEGORY_ALIAS[token] || CATEGORY_CONFIGS[token]?.key
  if (!key) throw new Error(`Unsupported SH category: ${value}`)
  return key
}

function normalizeSearchType(value, hasKeyword) {
  const token = normalizeToken(value)
  if (!token) return hasKeyword ? "0" : null
  if (["title", "제목", "0"].includes(token)) return "0"
  if (["content", "contents", "본문", "내용", "1"].includes(token)) return "1"
  throw new Error("srchTp must be title/content or 제목/내용.")
}

function normalizeStatus(value) {
  const token = normalizeToken(value)
  if (!token) return null
  const status = STATUS_ALIASES[token]
  if (!status) throw new Error(`Unsupported SH status: ${value}`)
  return status
}

function normalizeSearchOptions(options = {}) {
  const keyword = trimOrNull(options.keyword ?? options.q ?? options.query ?? options.srchWord)
  if (keyword && keyword.length > 100) throw new Error("srchWord must be 100 characters or fewer.")
  const category = normalizeCategory(options.category ?? options.kind ?? options.noticeType)
  return {
    keyword,
    srchTp: normalizeSearchType(options.srchTp ?? options.searchType ?? options.type, Boolean(keyword)),
    page: parsePositiveInteger(options.page ?? options.pageNo, { defaultValue: 1, min: 1, max: 1000, label: "page" }),
    pageSize: parsePositiveInteger(options.pageSize ?? options.limit, { defaultValue: DEFAULT_PAGE_SIZE, min: 1, max: MAX_PAGE_SIZE, label: "pageSize" }),
    category,
    status: normalizeStatus(options.status),
    timeoutMs: parsePositiveInteger(options.timeoutMs, { defaultValue: DEFAULT_TIMEOUT_MS, min: 1, max: 120000, label: "timeoutMs" }),
    fetcher: options.fetcher,
    signal: options.signal,
    includeHtml: Boolean(options.includeHtml)
  }
}

function normalizeDetailOptions(options = {}) {
  const seq = trimOrNull(options.seq ?? options.noticeSeq ?? options.id)
  if (!seq) throw new Error("seq is required")
  if (!/^\d{1,20}$/.test(seq)) throw new Error("seq must be digits only.")
  const category = normalizeCategory(options.category ?? options.kind ?? options.noticeType)
  return {
    seq,
    category,
    timeoutMs: parsePositiveInteger(options.timeoutMs, { defaultValue: DEFAULT_TIMEOUT_MS, min: 1, max: 120000, label: "timeoutMs" }),
    fetcher: options.fetcher,
    signal: options.signal,
    includeHtml: Boolean(options.includeHtml)
  }
}

function buildSearchUrl(options = {}) {
  const normalized = normalizeSearchOptions(options)
  const config = CATEGORY_CONFIGS[normalized.category]
  const url = new URL(`${SH_BASE_URL}${config.path}/list.do`)
  if (config.multiItmSeqs) url.searchParams.set("multi_itm_seqs", config.multiItmSeqs)
  if (config.multiItmSeq) url.searchParams.set("multi_itm_seq", config.multiItmSeq)
  url.searchParams.set("page", String(normalized.page || 1))
  if (normalized.keyword) url.searchParams.set("srchWord", normalized.keyword)
  if (normalized.srchTp) url.searchParams.set("srchTp", normalized.srchTp)
  return url
}

function buildDetailUrl(options = {}) {
  const normalized = normalizeDetailOptions(options)
  const config = CATEGORY_CONFIGS[normalized.category]
  const url = new URL(`${SH_BASE_URL}${config.path}/view.do`)
  if (config.multiItmSeq) url.searchParams.set("multi_itm_seq", config.multiItmSeq)
  url.searchParams.set("seq", normalized.seq)
  return url
}

function extractTotalCount(html) {
  const match = String(html || "").match(/총\s*<strong[^>]*>\s*([0-9,]+)\s*<\/strong>\s*건/i) || stripTags(html).match(/총\s*([0-9,]+)\s*건/)
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null
}

function classifyNoticeStatus(title) {
  const text = cleanText(title)
  if (/당첨|발표/.test(text)) return "announced"
  if (/마감|계약결과|결과|완료|종료/.test(text)) return "closed"
  if (/모집공고|입주자\s*모집|신청|접수|공고/.test(text)) return "open"
  return "unknown"
}

function statusMatches(itemStatus, requestedStatus) {
  if (!requestedStatus) return true
  if (requestedStatus === "closed") return itemStatus === "closed"
  if (requestedStatus === "announced") return itemStatus === "announced"
  return itemStatus === requestedStatus
}

function findUpstreamBlockMarkers(html) {
  const text = stripTags(html)
  const markers = [
    ["NetFunnel", /NetFunnel/i],
    ["CAPTCHA", /captcha|보안문자/i],
    ["로그인", /로그인|login/i],
    ["점검", /점검|maintenance/i],
    ["대기열", /대기열|queue/i],
    ["차단", /차단|block/i]
  ]
  return markers.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
}

function buildUnexpectedHtmlWarnings(html, expectedMarkupFound, label) {
  if (expectedMarkupFound) return []
  const markers = findUpstreamBlockMarkers(html)
  if (markers.length > 0) {
    return [`unexpected SH ${label} HTML; possible block/maintenance markers: ${markers.join(", ")}`]
  }
  return [`unexpected SH ${label} HTML; expected public SH ${label} markup was not found.`]
}

function parseListRows(html, options = {}) {
  const normalized = normalizeSearchOptions(options)
  const config = CATEGORY_CONFIGS[normalized.category]
  const listAreaMatch = String(html || "").match(/<div\b[^>]*id=["']listTb["'][^>]*>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>[\s\S]*?<\/div>/i)
  const tbodyMatch = listAreaMatch || String(html || "").match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  const tbody = tbodyMatch ? tbodyMatch[1] : String(html || "")
  const rows = []
  let rowMatch
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  while ((rowMatch = rowRegex.exec(tbody))) {
    const row = rowMatch[1]
    const seqMatch = row.match(/getDetailView\(\s*['"]?(\d+)['"]?\s*\)/i)
    if (!seqMatch) continue
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1])
    if (cells.length < 5) continue
    const titleAnchor = cells[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)
    const rawTitle = (titleAnchor ? titleAnchor[1] : cells[1]).replace(/<span\b[^>]*class=["'][^"']*icoNew[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
    const title = trimOrNull(stripTags(rawTitle).replace(/^NEW\s*/i, ""))
    const seq = seqMatch[1]
    const status = classifyNoticeStatus(title)
    const item = {
      seq,
      number: trimOrNull(stripTags(cells[0])),
      title,
      department: trimOrNull(stripTags(cells[2])),
      registered_date: trimOrNull(stripTags(cells[3])),
      views: parseNumberOrNull(stripTags(cells[4])),
      is_new: /icoNew|>\s*NEW\s*</i.test(cells[1]),
      category: config.key,
      category_name: config.name,
      status,
      status_basis: "title_text_classifier",
      detail_url: buildDetailUrl({ seq, category: config.key }).toString()
    }
    if (statusMatches(item.status, normalized.status)) rows.push(compactObject(item))
  }
  return rows
}

function parseNumberOrNull(value) {
  const text = cleanText(value)
  return /^[0-9,]+$/.test(text) ? Number.parseInt(text.replace(/,/g, ""), 10) : null
}

function parseListHtml(html, options = {}) {
  const normalized = normalizeSearchOptions(options)
  const items = parseListRows(html, normalized).slice(0, normalized.pageSize)
  const hasExpectedListMarkup = /<div\b[^>]*id=["']listTb["']/i.test(String(html || "")) || /<tbody[^>]*>[\s\S]*getDetailView\(/i.test(String(html || ""))
  const result = {
    query: {
      keyword: normalized.keyword || null,
      srch_tp: normalized.srchTp || null,
      category: normalized.category,
      category_name: CATEGORY_CONFIGS[normalized.category].name,
      status: normalized.status || null
    },
    summary: {
      page: normalized.page,
      page_size: normalized.pageSize,
      returned_count: items.length,
      total_count: extractTotalCount(html)
    },
    source: {
      name: "sh-public-html",
      url: buildSearchUrl(normalized).toString(),
      proxy: false
    },
    warnings: buildUnexpectedHtmlWarnings(html, hasExpectedListMarkup, "list"),
    items
  }
  if (normalized.status) {
    result.warnings.push("SH public board has no first-class status field; status filtering uses a conservative title-text classifier.")
  }
  if (normalized.includeHtml) result.html = html
  return result
}

function parseAttachmentDownList(html) {
  const match = String(html || "").match(/downList["\']?\s*[:=]\s*(\[[\s\S]*?\])\s*[;,}]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1])
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isAttachmentIconLabel(value) {
  const text = trimOrNull(value)
  return !text || /^\.(?:pdf|hwp|hwpx|docx?|xlsx?|pptx?|txt|zip|jpg|jpeg|png|gif|mp[34]|etc)$/i.test(text)
}

function parseAttachments(html) {
  const downList = parseAttachmentDownList(html)
  const byFileSeq = new Map(downList.map((file) => [String(file.fileSeq || ""), file]))
  const attachments = []
  const source = String(html || "").replace(/<!--[\s\S]*?-->/g, " ")
  const rowRegex = /<tr\b[^>]*>[\s\S]*?<th\b[^>]*>\s*첨부(?:파일)?\s*<\/th>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi
  let match
  while ((match = rowRegex.exec(source))) {
    const cell = match[1]
    const anchors = [...cell.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((anchorMatch) => {
      const attrs = anchorMatch[1]
      return {
        className: getHtmlAttr(attrs, "class"),
        href: getHtmlAttr(attrs, "href"),
        onclick: getHtmlAttr(attrs, "onclick"),
        text: trimOrNull(stripTags(anchorMatch[2]))
      }
    })
    const previewUrls = anchors
      .map((anchor) => anchor.href)
      .filter((href) => /htmlConverter\.do/i.test(href))
      .map(normalizeAttachmentPreviewUrl)
    const fileAnchors = anchors.filter((anchor) => /\bbtnAttach\b/i.test(anchor.className) && /existFile\(\s*['"]?\d+['"]?\s*\)/i.test(anchor.onclick) && !isAttachmentIconLabel(anchor.text))
    fileAnchors.forEach((anchor, index) => {
      const previewUrl = previewUrls[index] || null
      const fileSeq = previewUrl && new URL(previewUrl).searchParams.get("file_seq")
      const meta = byFileSeq.get(String(fileSeq || "")) || {}
      attachments.push(compactObject({
        filename: cleanText(meta.oriFileNm || anchor.text),
        file_seq: fileSeq || (meta.fileSeq ? String(meta.fileSeq) : null),
        file_size: parseNumberOrNull(meta.fileSize),
        file_type: trimOrNull(meta.fileTp),
        preview_url: previewUrl
      }))
    })
  }
  return attachments
}

function normalizeAttachmentPreviewUrl(href) {
  try {
    const url = new URL(href, SH_BASE_URL)
    if (url.origin !== SH_BASE_URL) return null
    if (url.pathname !== "/app/com/util/htmlConverter.do") return null
    return url.toString()
  } catch {
    return null
  }
}

function extractDepartment(html) {
  const personInfoMatch = String(html || "").match(/<ul\b[^>]*class=["'][^"']*personInfo[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)
  if (!personInfoMatch) return null
  const departmentMatch = personInfoMatch[1].match(/담당부서\s*<\/span>\s*:\s*([^<]+)/i) || stripTags(personInfoMatch[1]).match(/담당부서\s*:\s*([^:]+?)(?:담당자|연락처|$)/)
  return departmentMatch ? trimOrNull(departmentMatch[1]) : null
}

function parseDetailHtml(html, options = {}) {
  const normalized = normalizeDetailOptions(options)
  const config = CATEGORY_CONFIGS[normalized.category]
  const source = String(html || "")
  const titleMatch = String(html || "").match(/<div\b[^>]*class=["'][^"']*detailTable[^"']*firgs0401Table[^"']*["'][^>]*>[\s\S]*?<caption>([\s\S]*?)<\/caption>/i) ||
    String(html || "").match(/<thead>[\s\S]*?<th\b[^>]*colspan=["']2["'][^>]*>([\s\S]*?)<\/th>/i)
  const registeredMatch = String(html || "").match(/<strong>\s*등록일\s*:\s*<\/strong>\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})/i)
  const viewsMatch = String(html || "").match(/<strong>\s*조회수\s*:\s*<\/strong>\s*([0-9,]+)/i)
  const contentMatch = String(html || "").match(/<td\b[^>]*class=["']cont["'][^>]*>([\s\S]*?)<\/td>/i)
  const title = trimOrNull(stripTags(titleMatch ? titleMatch[1] : ""))
  const attachments = parseAttachments(html)
  const detail = compactObject({
    seq: normalized.seq,
    title,
    registered_date: registeredMatch ? registeredMatch[1].replace(/\./g, "-") : null,
    views: viewsMatch ? Number.parseInt(viewsMatch[1].replace(/,/g, ""), 10) : null,
    department: extractDepartment(html),
    category: config.key,
    category_name: config.name,
    status: classifyNoticeStatus(title),
    status_basis: "title_text_classifier",
    content_text: trimOrNull(stripTags(contentMatch ? contentMatch[1] : "")),
    detail_url: buildDetailUrl(normalized).toString(),
    warnings: buildUnexpectedHtmlWarnings(html, /detailTable|class=["']cont["']|firgs0401Table/i.test(source), "detail")
  })
  detail.attachments = attachments
  if (normalized.includeHtml) detail.html = html
  return detail
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return null
  const n = Number(timeoutMs)
  return Number.isFinite(n) && n > 0 ? AbortSignal.timeout(n) : null
}

async function fetchText(url, options = {}) {
  const fetcher = options.fetcher || global.fetch
  if (!fetcher) throw new Error("fetch is required")
  const signal = options.signal || createTimeoutSignal(options.timeoutMs || DEFAULT_TIMEOUT_MS)
  let response
  try {
    response = await fetcher(url.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; k-skill/sh-notice-search)",
        accept: "text/html,application/xhtml+xml"
      },
      signal
    })
  } catch (error) {
    throw new Error(`SH upstream request failed: ${error.message}`)
  }
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`SH upstream responded with HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  return text
}

async function searchNotices(options = {}) {
  const normalized = normalizeSearchOptions(options)
  const html = await fetchText(buildSearchUrl(normalized), normalized)
  return parseListHtml(html, normalized)
}

async function getNoticeDetail(options = {}) {
  const normalized = normalizeDetailOptions(options)
  const html = await fetchText(buildDetailUrl(normalized), normalized)
  return {
    notice: parseDetailHtml(html, normalized),
    query: {
      seq: normalized.seq,
      category: normalized.category,
      category_name: CATEGORY_CONFIGS[normalized.category].name
    },
    source: {
      name: "sh-public-html",
      url: buildDetailUrl(normalized).toString(),
      proxy: false
    }
  }
}

module.exports = {
  SH_BASE_URL,
  DEFAULT_CATEGORY,
  CATEGORY_CONFIGS,
  STATUS_ALIASES,
  cleanText,
  stripTags,
  normalizeCategory,
  normalizeSearchOptions,
  normalizeDetailOptions,
  buildSearchUrl,
  buildDetailUrl,
  extractTotalCount,
  classifyNoticeStatus,
  parseListRows,
  parseListHtml,
  parseAttachmentDownList,
  parseAttachments,
  parseDetailHtml,
  createTimeoutSignal,
  searchNotices,
  getNoticeDetail
}
