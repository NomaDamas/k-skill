"use strict"

function parseAction(raw) {
  const source = clean(raw)
  const match = source.match(/([A-Za-z_$][\w$]*)\s*\(([\s\S]*?)\)/)
  if (!match) return null
  return {
    functionName: match[1],
    args: matchAll(match[2], /'([^']*)'|"([^"]*)"|([^,\s]+)/g).map((arg) => clean(arg.replace(/^['"]|['"]$/g, ""))).filter(Boolean),
    raw: source
  }
}

function parseLinks(html) {
  return Array.from(String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi), (match) => ({
    attrs: match[1] || "",
    text: cleanText(match[2] || ""),
    html: match[0]
  }))
}

function getAttribute(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))
  return match ? match[1] || match[2] || "" : ""
}

function normalizeLooseDate(value) {
  const raw = clean(value)
  const match = raw.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ""
}

function textAfter(source, anchorHtml) {
  const index = String(source || "").indexOf(anchorHtml)
  return index < 0 ? "" : cleanText(String(source).slice(index + anchorHtml.length, index + anchorHtml.length + 240))
}

function classifyBlockedHtml(html) {
  const text = cleanText(stripTags(html))
  if (/400\s*Bad Request|deceptive request routing|traffic|TouchEn|보안|차단|점검|login|로그인/i.test(text)) {
    return { status: "blocked", reason: text.slice(0, 300) }
  }
  return { status: "ok", reason: "" }
}

function parseNoticeListText(text, options = {}) {
  const sourceText = cleanText(text)
  const rows = extractCandidateRows(sourceText).map(parseCandidateRow).filter(Boolean)
  return {
    query: cleanText(options.query),
    total_count: parseTotalCount(sourceText),
    count: rows.length,
    source_url: options.sourceUrl || "https://www.d2b.go.kr/mainBidAnnounceList.do",
    items: rows
  }
}

function parseTotalCount(text) {
  const match = cleanText(text).match(/총\s*([0-9,]+)\s*건/)
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null
}

function extractCandidateRows(text) {
  const normalized = cleanText(text)
  const pattern = /(?:^|\s)(\d+\s+(?:물품|용역|공사|국외)\s+경쟁입찰\s+.+?)(?=\s+\d+\s+(?:물품|용역|공사|국외)\s+경쟁입찰\s+|순번\s+업무구분|$)/g
  return Array.from(normalized.matchAll(pattern), (match) => match[1])
}

function parseCandidateRow(row) {
  const normalized = cleanText(row)
  const pattern = /^(\d+)\s+(물품|용역|공사|국외)\s+(경쟁입찰)\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+([A-Z0-9-]+)\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+(.+)$/
  const prefix = normalized.match(pattern)
  if (!prefix) return null
  const rest = prefix[9]
  const firstDeadline = rest.match(/\s+(해당없음|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+/)
  if (!firstDeadline) return null
  const titleAndAgency = rest.slice(0, firstDeadline.index).trim()
  const afterAgency = rest.slice(firstDeadline.index + firstDeadline[0].length).trim()
  const agency = extractAgency(titleAndAgency)
  const title = titleAndAgency.slice(0, titleAndAgency.length - agency.length).trim()
  const schedule = parseSchedule(afterAgency)
  return {
    sequence: Number.parseInt(prefix[1], 10),
    business_category: prefix[2],
    bid_category: prefix[3],
    notice_type: prefix[4],
    notice_date: prefix[5],
    g2b_notice_number: prefix[6],
    integrated_reference_number: prefix[7],
    purchase_request_number: prefix[8],
    title,
    agency,
    production_capacity_due_at: nullableDeadline(firstDeadline[1]),
    registration_due_at: schedule.registrationDueAt,
    bid_due_at: schedule.bidDueAt,
    contract_method: schedule.contractMethod,
    bid_form: schedule.bidForm,
    base_price_status: schedule.basePriceStatus
  }
}

function extractAgency(text) {
  const compact = cleanText(text)
  const match = compact.match(/((?:국군|방위사업청|육군|해군|공군|국방|합동|제\d+|[가-힣A-Za-z0-9]+)(?:[가-힣A-Za-z0-9()·/-]*)(?:단|청|본부|사령부|부대|학교|원|센터|기관|대대|전대|군단))$/)
  return match ? match[1] : ""
}

function parseSchedule(text) {
  const deadlinePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/g
  const deadlines = Array.from(text.matchAll(deadlinePattern), (match) => match[1])
  const tail = cleanText(text.replace(deadlinePattern, " "))
  const tailTokens = tail.split(" ").filter(Boolean)
  return {
    registrationDueAt: deadlines[0] || null,
    bidDueAt: deadlines[1] || null,
    contractMethod: tailTokens[0] || null,
    bidForm: tailTokens[1] || null,
    basePriceStatus: tailTokens.slice(2).join(" ") || null
  }
}

function nullableDeadline(value) {
  return value && value !== "해당없음" ? value : null
}

function matchAll(value, pattern) {
  return Array.from(String(value || "").matchAll(pattern), (match) => match[1] || match[2] || match[3] || match[0])
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
}

function cleanText(value) {
  return clean(stripTags(value))
}

function clean(value) {
  return decodeEntities(String(value || "")).replace(/\s+/g, " ").trim()
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
}

module.exports = {
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
}
