"use strict"

const {
  classifyBlockedHtml,
  clean,
  cleanText,
  getAttribute,
  normalizeLooseDate,
  parseAction,
  parseLinks,
  parseNoticeListText,
  parseTotalCount,
  stripTags,
  textAfter
} = require("./html")
const {
  buildAsideSearchScript: buildAsideScript,
  buildPlaywrightSearchScript: buildPlaywrightScript
} = require("./browser")

const BASE_URL = "https://www.d2b.go.kr"
const INDEX_PATH = "/index.do"
const PUBLIC_OPENAPI_PATH = "/openapi/sealedBidAnnounceList.json"
const D2B_BASE_URL = BASE_URL
const D2B_HOME_URL = `${BASE_URL}${INDEX_PATH}`
const D2B_NOTICE_LIST_URL = `${BASE_URL}/mainBidAnnounceList.do`

const BUSINESS_ALIASES = new Map([
  ["all", "all"], ["전체", "all"],
  ["goods", "goods"], ["item", "goods"], ["물품", "goods"], ["pdb", "goods"],
  ["service", "service"], ["services", "service"], ["용역", "service"], ["psb", "service"],
  ["construction", "construction"], ["works", "construction"], ["공사", "construction"], ["pcb", "construction"],
  ["foreign", "foreign"], ["overseas", "foreign"], ["국외", "foreign"], ["peb", "foreign"]
])

const KIND_CODES = new Map([
  ["all", "all"], ["goods", "PDB"], ["service", "PSB"], ["construction", "PCB"], ["foreign", "PEB"]
])

const NOTICE_TYPE_CODES = new Map([
  ["all", ""], ["전체", ""],
  ["normal", "A"], ["정상공고", "A"], ["a", "A"],
  ["urgent", "B"], ["긴급공고", "B"], ["b", "B"],
  ["correction", "H"], ["정정공고", "H"], ["h", "H"],
  ["cancel", "J"], ["취소공고", "J"], ["j", "J"],
  ["postponed", "K"], ["연기공고", "K"], ["k", "K"],
  ["rebid", "D"], ["재공고", "D"], ["d", "D"]
])

const DATE_FIELD_CODES = new Map([
  ["openingDate", "1"], ["openingdate", "1"], ["opening", "1"], ["open", "1"], ["개찰일자", "1"], ["1", "1"],
  ["noticeDate", "2"], ["noticedate", "2"], ["notice", "2"], ["posted", "2"], ["공고일자", "2"], ["2", "2"]
])

function normalizeSearchOptions(options = {}) {
  const startDate = normalizeDate(options.startDate ?? options.dateStart, "startDate")
  const endDate = normalizeDate(options.endDate ?? options.dateEnd, "endDate")
  if (startDate && endDate && startDate > endDate) throw new Error("startDate must be on or before endDate")
  if (startDate && endDate) assertDateRange(startDate, endDate)
  return {
    keyword: cleanText(options.keyword ?? options.noticeName ?? options.title),
    noticeType: normalizeLookup(options.noticeType, NOTICE_TYPE_CODES, "noticeType"),
    dateField: normalizeLookup(options.dateField ?? options.dateType ?? "openingDate", DATE_FIELD_CODES, "dateField") || "1",
    startDate,
    endDate,
    g2bNoticeNumber: cleanText(options.g2bNoticeNumber ?? options.g2bNoticeNo ?? options.g2bNo),
    agency: cleanText(options.agency ?? options.organization ?? options.department),
    pageSize: normalizePageSize(options.pageSize),
    businessCategories: normalizeBusinessCategories(options.businessCategories ?? options.businessCategory ?? options.kind ?? "all")
  }
}

function buildSearchRequest(input = {}) {
  const options = normalizeSearchOptions(input)
  const firstCategory = options.businessCategories[0] || "all"
  return {
    method: "GET",
    baseUrl: BASE_URL,
    path: PUBLIC_OPENAPI_PATH,
    url: new URL(PUBLIC_OPENAPI_PATH, BASE_URL).toString(),
    headers: { "user-agent": "Mozilla/5.0 k-skill d2b-notice-search" },
    query: {
      keyword: options.keyword,
      kind: KIND_CODES.get(firstCategory) || "all",
      noticeType: options.noticeType,
      dateType: options.dateField,
      dateStart: options.startDate,
      dateEnd: options.endDate,
      g2bNoticeNo: options.g2bNoticeNumber,
      organization: options.agency,
      page: normalizePage(input.page)
    },
    form: {
      page: D2B_HOME_URL,
      recipe: {
        keywordSelector: "#anmt_name, input[title='공고건명'], input[placeholder='공고건명']",
        dateStartSelector: "#datepicker_from, input[placeholder='시작날짜 입력']",
        dateEndSelector: "#datepicker_to, input[placeholder='마지막날짜 입력']",
        g2bNoticeNoSelector: "#numb_divs, input[placeholder='G2B공고번호']",
        organizationSelector: "#dprt_name, input[placeholder='발주기관']",
        submitText: "검색"
      }
    },
    options
  }
}

function buildAsideSearchScript(options = {}) {
  return buildAsideScript(normalizeSearchOptions(options), D2B_HOME_URL)
}

function buildPlaywrightSearchScript(options = {}) {
  return buildPlaywrightScript(normalizeSearchOptions(options), D2B_HOME_URL)
}

function buildBrowserAutomationInstructions(input = {}) {
  const request = buildSearchRequest(input)
  return {
    intent: "read-only D2B notice lookup",
    request,
    steps: [
      { channel: "aside-browser", action: "Open the official D2B page, snapshot the public 입찰공고 form, fill filters, submit 검색, then snapshot rendered results." },
      { channel: "playwright-or-chrome-headless", action: "Run the same public form recipe in a fresh browser context and parse visible text or rendered links." },
      { channel: "direct-http-best-effort", action: "Try direct JSON only when it does not return 400 Bad Request/security HTML; classify blocked HTML explicitly." }
    ]
  }
}

function parseBrowserSearchOutput(output, options = {}) {
  const parsed = typeof output === "string" ? JSON.parse(output) : output
  return parseNoticeListText(parsed.visibleText || parsed.tree || "", {
    query: options.keyword || options.noticeName || "",
    sourceUrl: parsed.url || D2B_NOTICE_LIST_URL
  })
}

function parseListHtml(html) {
  const source = String(html || "")
  return parseLinks(source)
    .map((link) => {
      const action = parseAction(getAttribute(link.attrs, "onclick") || javascriptHref(getAttribute(link.attrs, "href")))
      if (!action || !action.args.length) return null
      return {
        noticeNo: action.args[0],
        kind: action.args[1] || "",
        title: link.text,
        postedDate: normalizeLooseDate(textAfter(source, link.html)),
        action
      }
    })
    .filter((row) => row && row.title)
}

function classifyUpstreamHtml(html) {
  return classifyBlockedHtml(html)
}

function normalizeLookup(value, table, label) {
  if (value === undefined || value === null || value === "") return ""
  const token = clean(value)
  const compact = token.replace(/\s+/g, "")
  const lower = token.toLowerCase()
  if (table.has(token)) return table.get(token)
  if (table.has(lower)) return table.get(lower)
  if (table.has(compact)) return table.get(compact)
  throw new Error(`Unsupported D2B ${label}: ${value}`)
}

function normalizeBusinessCategories(value) {
  const values = Array.isArray(value) ? value : [value]
  const mapped = values.map((entry) => {
    const token = clean(entry)
    const category = BUSINESS_ALIASES.get(token) || BUSINESS_ALIASES.get(token.toLowerCase()) || BUSINESS_ALIASES.get(token.replace(/\s+/g, ""))
    if (!category) throw new Error(`Unsupported D2B business category: ${entry}`)
    return category
  })
  return mapped.includes("all") ? ["all"] : [...new Set(mapped)]
}

function normalizeDate(value, name) {
  if (value === undefined || value === null || value === "") return ""
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`D2B ${name} must be YYYY-MM-DD: ${value}`)
  return text
}

function assertDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
  if (months > 12 || (months === 12 && end.getUTCDate() > start.getUTCDate())) {
    throw new Error("D2B search date range must not exceed 12 months")
  }
}

function normalizePageSize(value) {
  if (value === undefined || value === null || value === "") return 50
  const number = Number.parseInt(String(value), 10)
  if (![50, 100, 200].includes(number)) throw new Error("D2B pageSize must be one of 50, 100, or 200")
  return number
}

function normalizePage(value) {
  const page = value === undefined || value === null || value === "" ? 1 : Number(value)
  if (!Number.isInteger(page) || page < 1) throw new RangeError("page must be a positive integer")
  return page
}

function javascriptHref(href) {
  return clean(href).toLowerCase().startsWith("javascript:") ? clean(href).slice("javascript:".length) : ""
}

module.exports = {
  BASE_URL,
  D2B_BASE_URL,
  D2B_HOME_URL,
  D2B_NOTICE_LIST_URL,
  INDEX_PATH,
  PUBLIC_OPENAPI_PATH,
  buildAsideSearchScript,
  buildBrowserAutomationInstructions,
  buildPlaywrightSearchScript,
  buildSearchRequest,
  classifyUpstreamHtml,
  cleanText,
  normalizeSearchOptions,
  parseBrowserSearchOutput,
  parseListHtml,
  parseNoticeListText,
  parseTotalCount,
  stripTags
}
