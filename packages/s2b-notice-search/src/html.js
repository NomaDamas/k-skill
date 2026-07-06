"use strict"

function parseListRow(rowHtml) {
  const cells = matchAll(rowHtml, /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)
  if (cells.length < 4) return null
  const texts = cells.map(cleanText).filter((value) => value)
  const titleCell = cells.find((cell) => /<a\b/i.test(cell)) || cells[2] || ""
  const action = parseAction(getAttribute(titleCell, "onclick") || getJavascriptHref(titleCell))
  const title = cleanText(firstMatch(titleCell, /<a\b[^>]*>([\s\S]*?)<\/a>/i)) || texts[2] || ""
  const code = action && action.args.length ? action.args[0] : findCode(rowHtml)
  const withoutOrdinal = texts.filter((text) => !/^\d+$/.test(text))
  const itemType = findFirst(withoutOrdinal, /^(물품|공사|용역)$/) || ""
  const organization = withoutOrdinal.find((text) => text !== itemType && text !== title && /(학교|교육청|기관|초등|중학교|고등)/.test(text)) || ""
  const status = findFirst(withoutOrdinal, /(진행|마감|완료|공고|취소|유찰)/) || ""
  const dates = withoutOrdinal.map(normalizeLooseDate).filter(Boolean)
  if (!hasNoticeRowShape({ action, dates, itemType, organization, status, title })) return null
  return {
    noticeCode: code,
    estimateCode: code,
    title,
    organization,
    status,
    itemType,
    postedDate: dates[0] || "",
    deadline: dates[1] || "",
    detailAction: action
  }
}

function hasNoticeRowShape(row) {
  if (!row.action || !row.title || row.dates.length === 0) return false
  return Boolean(row.itemType || row.organization || row.status)
}

function parseAttachments(source) {
  return Array.from(String(source || "").matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi), (match) => match[0])
    .map((anchor) => {
      const action = parseAction(getAttribute(anchor, "onclick"))
      const filename = cleanText(firstMatch(anchor, /^([\s\S]*)$/)) || (action ? action.args.find((arg) => /\.[A-Za-z0-9]+$/.test(arg)) : "")
      if (!action || !filename) return null
      return { filename, action }
    })
    .filter(Boolean)
}

function tableFields(source) {
  const fields = {}
  for (const row of matchAll(source, /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const parts = matchAll(row, /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi).map(cleanText)
    for (let index = 0; index + 1 < parts.length; index += 2) {
      if (parts[index]) fields[parts[index]] = parts[index + 1] || ""
    }
  }
  return fields
}

function normalizeLooseDate(value) {
  const raw = clean(value)
  const match = raw.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})(?:\s+(\d{1,2}:\d{2}))?/)
  if (!match) return ""
  const date = `${match[1]}-${match[2]}-${match[3]}`
  return match[4] ? `${date} ${match[4]}` : date
}

function parseAction(raw) {
  const source = clean(raw)
  if (!source) return null
  const match = source.match(/([A-Za-z_$][\w$]*)\s*\(([\s\S]*?)\)/)
  if (!match) return null
  return {
    functionName: match[1],
    args: matchAll(match[2], /'([^']*)'|"([^"]*)"|([^,\s]+)/g).map((arg) => clean(arg.replace(/^['"]|['"]$/g, ""))).filter(Boolean),
    raw: source
  }
}

function findCode(value) {
  return clean(firstMatch(value, /([A-Z]{2,}-\d{4}-\d{3,})/i))
}

function findFirst(values, pattern) {
  return values.find((value) => pattern.test(value)) || ""
}

function getJavascriptHref(value) {
  const href = getAttribute(value, "href")
  return href.toLowerCase().startsWith("javascript:") ? href.slice("javascript:".length) : ""
}

function getAttribute(value, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  const match = String(value || "").match(pattern)
  return match ? match[1] || match[2] || "" : ""
}

function firstMatch(value, pattern) {
  const match = String(value || "").match(pattern)
  return match ? match[1] || "" : ""
}

function matchAll(value, pattern) {
  return Array.from(String(value || "").matchAll(pattern), (match) => match[1] || match[0])
}

function cleanText(value) {
  return clean(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
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
  clean,
  cleanText,
  firstMatch,
  matchAll,
  normalizeLooseDate,
  parseAttachments,
  parseListRow,
  tableFields
}
