"use strict"

const {
  clean,
  cleanText,
  firstMatch,
  matchAll,
  normalizeLooseDate,
  parseAttachments,
  parseListRow,
  tableFields
} = require("./html")

const BASE_URL = "https://www.s2b.kr"
const SEARCH_PATH = "/S2BNCustomer/tcmo001.do"
const FORM_NAME = "tcmo001Form"

const ITEM_TYPES = new Map([
  ["all", "all"], ["전체", "all"],
  ["물품", "1"], ["goods", "1"], ["1", "1"],
  ["공사", "2"], ["works", "2"], ["2", "2"],
  ["용역", "3"], ["service", "3"], ["services", "3"], ["3", "3"]
])

const PRIVATE_CONTRACTS = new Map([
  ["all", "all"], ["전체", "all"],
  ["1인", "1"], ["one", "1"], ["single", "1"], ["1", "1"],
  ["2인", "2"], ["two", "2"], ["2", "2"]
])

const KEYWORD_FIELDS = new Map([
  ["title", "1"], ["name", "1"], ["공고명", "1"], ["견적요청/공고명", "1"], ["1", "1"],
  ["number", "2"], ["code", "2"], ["공고번호", "2"], ["견적요청/공고번호", "2"], ["2", "2"]
])

const DATE_FIELDS = new Map([
  ["posted", "1"], ["notice", "1"], ["공고일", "1"], ["견적요청/공고일", "1"], ["1", "1"],
  ["deadline", "2"], ["마감일", "2"], ["견적서제출마감일", "2"], ["2", "2"]
])

function normalizeSearchOptions(input = {}) {
  const dateStart = normalizeDate(input.dateStart, "dateStart", false)
  const dateEnd = normalizeDate(input.dateEnd, "dateEnd", false)
  if (dateStart && dateEnd) {
    assertDateRange(dateStart, dateEnd)
  }

  return {
    keyword: clean(input.keyword),
    keywordField: normalizeSelectCode(input.keywordField ?? input.searchType, KEYWORD_FIELDS, "keywordField"),
    organization: clean(input.organization),
    dateStart,
    dateEnd,
    dateField: normalizeSelectCode(input.dateField ?? "deadline", DATE_FIELDS, "dateField"),
    itemType: normalizeChoice(input.itemType, ITEM_TYPES, "itemType"),
    privateContract: normalizeChoice(input.privateContract, PRIVATE_CONTRACTS, "privateContract"),
    region: clean(input.region),
    page: normalizePage(input.page)
  }
}

function buildSearchRequest(input = {}) {
  const options = normalizeSearchOptions(input)
  const body = new URLSearchParams()
  body.set("forwardName", "list01")
  body.set("pageNo", String(options.page))
  body.set("estimateCode", "")
  body.set("tender_step_code", "")
  body.set("page_flag", "")
  body.set("process_yn", "Y")
  body.set("search_yn", "Y")
  body.set("tender_sep1", options.keywordField)
  setParam(body, "tender_name", options.keyword)
  setParam(body, "company_name_s", options.organization)
  body.set("tender_sep2", options.dateField)
  setParam(body, "tender_date_start", options.dateStart)
  setParam(body, "tender_date_end", options.dateEnd)
  setParam(body, "tender_item", options.itemType === "all" ? "" : options.itemType)
  setParam(body, "estimate_kind", options.privateContract === "all" ? "" : options.privateContract)
  setParam(body, "areaKind", options.region)

  return {
    method: "POST",
    formName: FORM_NAME,
    baseUrl: BASE_URL,
    path: SEARCH_PATH,
    url: new URL(SEARCH_PATH, BASE_URL).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: new URL(SEARCH_PATH, BASE_URL).toString()
    },
    body,
    options
  }
}

function parseListHtml(html) {
  return matchAll(String(html || ""), /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)
    .map((rowHtml) => parseListRow(rowHtml))
    .filter(Boolean)
}

function parseDetailHtml(html) {
  const source = String(html || "")
  const fields = tableFields(source)
  const title = cleanText(firstMatch(source, /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)) || fields["공고명"] || fields["제목"] || ""
  return {
    title,
    noticeCode: fields["공고번호"] || fields["견적번호"] || fields["견적공고번호"] || "",
    estimateCode: fields["견적번호"] || fields["공고번호"] || "",
    organization: fields["기관명"] || fields["수요기관"] || "",
    status: fields["상태"] || "",
    itemType: fields["품목구분"] || fields["물품구분"] || fields["구분"] || "",
    privateContract: fields["계약방법"] || fields["수의계약"] || "",
    postedDate: normalizeLooseDate(fields["게시일"] || fields["공고일"] || ""),
    deadline: clean(fields["견적마감일"] || fields["마감일"] || fields["입찰마감일"]),
    contentText: cleanText(firstMatch(source, /<div\b[^>]*id=["']?(?:content|contents|detailContent)["']?[^>]*>([\s\S]*?)<\/div>/i)) || cleanText(source),
    fields,
    attachments: parseAttachments(source)
  }
}

function buildBrowserAutomationInstructions(input = {}) {
  const request = buildSearchRequest(input)
  return {
    intent: "read-only S2B notice lookup",
    request,
    steps: [
      {
        channel: "aside-browser",
        action: "Open https://www.s2b.kr/S2BNCustomer/tcmo001.do, take a snapshot, fill the visible search form, submit, then snapshot the result table and detail page action."
      },
      {
        channel: "playwright-or-chrome-headless",
        action: `Create a browser context, navigate to ${request.url}, submit a POST-equivalent form with the normalized fields, and parse the rendered result table.`
      },
      {
        channel: "direct-http-best-effort",
        action: "Only when the same session/form tokens work without a browser, send the encoded POST body with matching referer/cookies; treat login, CAPTCHA, blocked, empty, or malformed responses as explicit failures."
      }
    ]
  }
}

function normalizeChoice(value, choices, name) {
  const key = clean(value || "all")
  if (!choices.has(key)) throw new RangeError(`unsupported ${name}: ${value}`)
  return choices.get(key)
}

function normalizeSelectCode(value, choices, name) {
  const key = clean(value || "")
  if (!key) return choices.values().next().value
  if (!choices.has(key)) throw new RangeError(`unsupported ${name}: ${value}`)
  return choices.get(key)
}

function normalizePage(value) {
  const page = value === undefined || value === null || value === "" ? 1 : Number(value)
  if (!Number.isInteger(page) || page < 1) throw new RangeError("page must be a positive integer")
  return page
}

function normalizeDate(value, name, required) {
  const raw = clean(value)
  if (!raw) {
    if (required) throw new RangeError(`${name} is required`)
    return ""
  }
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/) || raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new RangeError(`invalid ${name}: expected YYYYMMDD or YYYY-MM-DD`)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new RangeError(`invalid ${name}: nonexistent calendar date`)
  }
  return `${match[1]}${match[2]}${match[3]}`
}

function assertDateRange(start, end) {
  const startDate = toUtcDate(start)
  const endDate = toUtcDate(end)
  if (endDate < startDate) throw new RangeError("dateEnd must be on or after dateStart")
  const months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + endDate.getUTCMonth() - startDate.getUTCMonth()
  if (months > 3 || (months === 3 && endDate.getUTCDate() > startDate.getUTCDate())) {
    throw new RangeError("S2B search date range must not exceed 3 calendar months")
  }
}

function toUtcDate(value) {
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))))
}

function setParam(body, name, value) {
  if (value) body.set(name, value)
}

module.exports = { BASE_URL, FORM_NAME, SEARCH_PATH, buildBrowserAutomationInstructions, buildSearchRequest, normalizeSearchOptions, parseDetailHtml, parseListHtml }
