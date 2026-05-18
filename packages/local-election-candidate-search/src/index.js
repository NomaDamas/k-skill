const fs = require("node:fs/promises")

const NEC_SEARCH_URL = "https://info.nec.go.kr/search/searchCandidate.xhtml"
const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const LOCAL_ELECTION_CODES = new Set(["3", "4", "5", "6", "8", "9", "11"])

const ELECTION_CODE_ALIASES = new Map([
  ["3", "3"], ["시도지사", "3"], ["시·도지사", "3"], ["시도지사선거", "3"], ["광역단체장", "3"], ["governor", "3"],
  ["4", "4"], ["구시군의장", "4"], ["구시군장", "4"], ["구·시·군의장", "4"], ["구·시·군의 장", "4"], ["기초단체장", "4"], ["mayor", "4"],
  ["5", "5"], ["시도의원", "5"], ["시도의회의원", "5"], ["광역의원", "5"], ["metro-council", "5"],
  ["6", "6"], ["구시군의원", "6"], ["구시군의회의원", "6"], ["기초의원", "6"], ["local-council", "6"],
  ["8", "8"], ["광역비례", "8"], ["광역의원비례", "8"], ["광역의원비례대표", "8"],
  ["9", "9"], ["기초비례", "9"], ["기초의원비례", "9"], ["기초의원비례대표", "9"],
  ["11", "11"], ["교육감", "11"], ["superintendent", "11"]
])

function normalizeToken(value) {
  return String(value == null ? "" : value).replace(/[\s·ㆍ,._-]+/g, "").trim().toLowerCase()
}

function decodeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&#(\d+);/g, (match, dec) => decodeNumericEntity(Number.parseInt(dec, 10), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => decodeNumericEntity(Number.parseInt(hex, 16), match))
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
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

function cleanText(value) {
  return decodeHtml(String(value == null ? "" : value)).replace(/\s+/g, " ").trim()
}

function getHtmlAttr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))
  return match ? decodeHtml(match[2]) : ""
}

function parsePositiveInteger(value, { defaultValue, min = 1, max = Number.MAX_SAFE_INTEGER, label }) {
  if (value === undefined || value === null || String(value).trim() === "") return defaultValue
  const text = String(value).trim()
  if (!/^\d+$/.test(text)) throw new Error(`Provide valid ${label}.`)
  const parsed = Number.parseInt(text, 10)
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

function normalizeBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue
  if (typeof value === "boolean") return value
  const token = normalizeToken(value)
  if (["1", "true", "yes", "y", "local", "지방", "지방선거"].includes(token)) return true
  if (["0", "false", "no", "n", "all", "전체", "includeall"].includes(token)) return false
  return Boolean(value)
}

function normalizeElectionCode(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null
  const token = normalizeToken(value)
  const code = ELECTION_CODE_ALIASES.get(token)
  if (!code) throw new Error(`Unsupported local election type: ${value}`)
  return code
}

function normalizeElectionDate(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null
  const digits = String(value).replace(/\D/g, "")
  if (/^\d{4}$/.test(digits)) return digits
  if (/^\d{8}$/.test(digits)) return digits
  throw new Error("electionDate must be YYYY or YYYYMMDD/ YYYY.MM.DD.")
}

function normalizeSearchOptions(options = {}) {
  const name = cleanText(options.name ?? options.keyword ?? options.q ?? options.query ?? options.searchKeyword)
  if (!name) throw new Error("Provide a candidate name to search.")
  if (name.length > 30) throw new Error("Candidate name must be 30 characters or fewer.")
  const normalized = {
    name,
    localOnly: normalizeBoolean(options.localOnly ?? options.local ?? options.onlyLocal, true),
    electionCode: normalizeElectionCode(options.electionCode ?? options.election ?? options.electionType ?? options.type),
    electionDate: normalizeElectionDate(options.electionDate ?? options.date ?? options.year ?? options.electionName),
    region: cleanText(options.region ?? options.city ?? options.district) || null,
    limit: parsePositiveInteger(options.limit ?? options.pageSize, { defaultValue: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT, label: "limit" }),
    includeHtml: Boolean(options.includeHtml)
  }
  normalized.upstreamLimit = parsePositiveInteger(options.upstreamLimit ?? options.recordCountPerPage, {
    defaultValue: hasClientSideFilters(normalized) ? MAX_LIMIT : normalized.limit,
    min: normalized.limit,
    max: MAX_LIMIT,
    label: "upstream limit"
  })
  return normalized
}

function hasClientSideFilters(options) {
  return Boolean(options.localOnly || options.electionCode || options.electionDate || options.region)
}

function buildSearchRequest(options = {}) {
  const normalized = normalizeSearchOptions(options)
  const body = new URLSearchParams({
    searchKeyword: normalized.name,
    pageIndex: "1",
    firstIndex: "0",
    recordCountPerPage: String(normalized.upstreamLimit)
  }).toString()
  return {
    url: NEC_SEARCH_URL,
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "Mozilla/5.0 (compatible; k-skill-local-election-candidate-search/0.1)",
      referer: NEC_SEARCH_URL
    },
    body,
    options: normalized
  }
}

function parseBirthDateAndGender(text, attrs = "") {
  const attrBirthday = getHtmlAttr(attrs, "data-birthday")
  const dateMatch = String(text || "").match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*\(([^)]+)\)/)
  const birthDate = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
    : (/^\d{8}$/.test(attrBirthday) ? `${attrBirthday.slice(0, 4)}-${attrBirthday.slice(4, 6)}-${attrBirthday.slice(6, 8)}` : null)
  const gender = dateMatch ? cleanText(dateMatch[4]) : null
  return { birthDate, gender }
}

function parseProfileFields(listHtml) {
  const fields = {}
  const cellRegex = /<td\b[^>]*class=(['"])th\1[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi
  for (const match of listHtml.matchAll(cellRegex)) {
    const key = cleanText(stripTags(match[2]))
    const rawValue = match[3]
    const paragraphs = [...rawValue.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((p) => stripTags(p[1])).filter(Boolean)
    const value = paragraphs.length ? paragraphs : stripTags(rawValue)
    if (key) fields[key] = value
  }
  return {
    job: asText(fields["직업"]),
    education: asText(fields["학력"]),
    career: asList(fields["경력"])
  }
}

function asText(value) {
  if (Array.isArray(value)) return value.join("; ") || null
  return value || null
}

function asList(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function parseTitle(titleHtml) {
  const mark = titleHtml.match(/<mark[^>]*>\s*\[([0-9.]+)\]\s*([\s\S]*?)<\/mark>/i)
  const electionDate = mark ? normalizeElectionDate(mark[1]) : null
  const electionName = mark ? stripTags(mark[2]) : null
  const text = stripTags(titleHtml)
  const afterMark = mark ? stripTags(titleHtml.slice(mark.index + mark[0].length)) : text
  const segments = afterMark.split("/").map((part) => cleanText(part)).filter(Boolean)
  let party = segments[0] || null
  let electionType = segments[1] || null
  let district = segments[2] || null
  let votes = null
  let voteShare = null
  let elected = /당선/.test(afterMark)

  if (segments[0] && /선거$/.test(segments[0])) {
    party = null
    electionType = segments[0]
    district = segments[1]
  }
  const voteSegment = segments.find((segment) => /표/.test(segment)) || ""
  const voteMatch = voteSegment.match(/([0-9,]+)\s*표/)
  if (voteMatch) votes = Number.parseInt(voteMatch[1].replace(/,/g, ""), 10)
  const shareMatch = voteSegment.match(/\(([0-9.]+%)\)/)
  if (shareMatch) voteShare = shareMatch[1]
  if (district && /표/.test(district)) district = null
  return { electionDate, electionName, party, electionType, district, votes, voteShare, elected, rawTitleText: text }
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
    if (entry === null || entry === undefined || entry === "") return false
    if (Array.isArray(entry) && entry.length === 0) return false
    return true
  }))
}

function isUnexpectedHtml(html) {
  const text = stripTags(html)
  return !/resultDiv|class=["']result|검색결과|fn_firstView/.test(html) && /NetFunnel|로그인|점검|대기열|접근|차단|서비스/.test(text)
}

function hasUnparsedCandidateResults(html) {
  if (!/resultDiv|검색결과|fn_firstView/.test(html)) return false
  if (/<div\b[^>]*class=(['"])[^'"]*\bresult\b[^'"]*\1/i.test(html)) return false
  const resultDiv = String(html || "").match(/<div\b[^>]*class=(['"])[^'"]*\bresultDiv\b[^'"]*\1[^>]*>([\s\S]*?)<\/div>/i)
  if (!resultDiv) return false
  return stripTags(resultDiv[2]).length > 0
}

function filterItem(item, options) {
  if (options.localOnly && !item.is_local_election) return false
  if (options.electionCode && item.election_code !== options.electionCode) return false
  if (options.electionDate) {
    const digits = (item.election_name_code || "").replace(/\D/g, "")
    if (options.electionDate.length === 4) {
      if (!digits.startsWith(options.electionDate)) return false
    } else if (digits !== options.electionDate) return false
  }
  if (options.region) {
    const haystack = `${item.district || ""} ${item.city_code || ""}`
    if (!normalizeToken(haystack).includes(normalizeToken(options.region))) return false
  }
  return true
}

function getCandidateElectionKey(item) {
  return [
    item.name,
    item.birth_date,
    item.election_name_code,
    item.election_code,
    item.party,
    item.district,
    item.votes,
    item.vote_share
  ].map((value) => cleanText(value)).join("|")
}

function parseSearchHtml(html, options = {}) {
  const normalized = normalizeSearchOptions(options)
  const warnings = []
  const items = []
  const itemKeys = new Set()
  const source = { url: NEC_SEARCH_URL, method: "POST", surface: "NEC election statistics integrated candidate search" }
  if (isUnexpectedHtml(html)) {
    warnings.push(`unexpected NEC search HTML; possible NetFunnel 로그인 점검 block page: ${stripTags(html).slice(0, 160)}`)
  }

  const resultRegex = /<div\b([^>]*)class=(['"])[^'"]*\bresult\b[^'"]*\2([^>]*)>([\s\S]*?)(?=<div\b[^>]*class=(['"])[^'"]*\bresult\b|<div\b[^>]*class=(['"])[^'"]*\bpage\b|<\/body>|$)/gi
  let parsedResultCards = 0
  let parsedElectionEntries = 0
  for (const resultMatch of html.matchAll(resultRegex)) {
    parsedResultCards += 1
    const resultAttrs = `${resultMatch[1] || ""} ${resultMatch[3] || ""}`
    const resultHtml = resultMatch[4]
    const listRegex = /<div\b([^>]*)class=(['"])[^'"]*\blist\b[^'"]*\2([^>]*)>([\s\S]*?)(?=<div\b[^>]*class=(['"])[^'"]*\blist\b|<\/div>\s*<\/div>\s*(?:<div\b[^>]*class=(['"])[^'"]*\bresult\b|<\/div>|$))/gi
    const listMatches = [...resultHtml.matchAll(listRegex)]
    parsedElectionEntries += listMatches.length
    const nameMatch = resultHtml.match(/<p\b[^>]*class=(['"])[^'"]*\bname\b[^'"]*\1[^>]*>([\s\S]*?)<\/p>/i)
    const nameHtml = nameMatch ? nameMatch[2] : ""
    const strongMatch = nameHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)
    const hanjaMatch = nameHtml.match(/<span\b[^>]*class=(['"])[^'"]*\bhanja\b[^'"]*\1[^>]*>\s*\((.*?)\)\s*<\/span>/i)
    const dateMatch = nameHtml.match(/<span\b[^>]*class=(['"])[^'"]*\bdate\b[^'"]*\1[^>]*>([\s\S]*?)<\/span>/i)
    const personName = strongMatch ? stripTags(strongMatch[1]) : null
    if (!personName) {
      warnings.push("missing candidate name in NEC result card; skipped result because exact-name matching could not be verified")
      continue
    }
    if (normalizeToken(personName) !== normalizeToken(normalized.name)) {
      warnings.push(`candidate name mismatch in NEC result card; expected ${normalized.name} but found ${personName}; skipped result`)
      continue
    }
    const hanja = hanjaMatch ? stripTags(hanjaMatch[2]) : null
    const { birthDate, gender } = parseBirthDateAndGender(dateMatch ? stripTags(dateMatch[2]) : stripTags(nameHtml), resultAttrs)

    for (const listMatch of listMatches) {
      const listAttrs = `${listMatch[1] || ""} ${listMatch[3] || ""}`
      const listHtml = listMatch[4]
      const titleMatch = listHtml.match(/<div\b[^>]*class=(['"])[^'"]*\bt\b[^'"]*\1[^>]*>([\s\S]*?)(?:<button\b[^>]*class=(['"])[^'"]*\bmore\b|<div\b[^>]*class=(['"])[^'"]*\bbox\b|$)/i)
      const title = parseTitle(titleMatch ? titleMatch[2] : listHtml)
      const electionNameCode = getHtmlAttr(listAttrs, "data-election-name")
      const electionCode = getHtmlAttr(listAttrs, "data-election-code")
      const profile = parseProfileFields(listHtml)
      const item = compactObject({
        name: personName,
        hanja,
        birth_date: birthDate,
        gender,
        election_date: title.electionDate ? `${title.electionDate.slice(0, 4)}-${title.electionDate.slice(4, 6)}-${title.electionDate.slice(6, 8)}` : undefined,
        election_name: title.electionName,
        election_name_code: electionNameCode,
        election_code: electionCode,
        election_type: title.electionType,
        is_local_election: LOCAL_ELECTION_CODES.has(electionCode) || /지방선거|시·도지사|구·시·군|의회의원|교육감/.test(`${title.electionName || ""} ${title.electionType || ""}`),
        party: title.party,
        district: title.district,
        votes: title.votes,
        vote_share: title.voteShare,
        elected: title.elected || undefined,
        city_code: getHtmlAttr(listAttrs, "data-city-code"),
        sgg_city_code: getHtmlAttr(listAttrs, "data-sgg-city-code"),
        town_code: getHtmlAttr(listAttrs, "data-town-code"),
        ...profile
      })
      if (filterItem(item, normalized)) {
        const itemKey = getCandidateElectionKey(item)
        if (!itemKeys.has(itemKey)) {
          itemKeys.add(itemKey)
          items.push(item)
        }
      }
    }
  }

  if (parsedResultCards === 0 && hasUnparsedCandidateResults(html)) {
    warnings.push("parser drift suspected: NEC search result markers were present but no supported result cards could be parsed")
  }
  if (hasClientSideFilters(normalized) && parsedElectionEntries >= normalized.upstreamLimit) {
    warnings.push(`NEC search page was capped at ${normalized.upstreamLimit} upstream rows before client-side filters; additional matches may require pagination`)
  }

  const limitedItems = items.slice(0, normalized.limit)
  if (limitedItems.length === 0 && warnings.length === 0) warnings.push("no candidate results matched the provided name/filters on the NEC search page")
  const result = {
    query: compactObject({
      name: normalized.name,
      local_only: normalized.localOnly,
      election_code: normalized.electionCode,
      election_date: normalized.electionDate,
      region: normalized.region,
      limit: normalized.limit
    }),
    summary: {
      returned_count: limitedItems.length,
      matched_before_limit: items.length,
      upstream_result_limit: normalized.upstreamLimit,
      local_only: normalized.localOnly
    },
    items: limitedItems,
    warnings,
    source
  }
  if (normalized.includeHtml) result.html = html
  return result
}

async function searchCandidates(options = {}, deps = {}) {
  const fixturePath = options.fixture || options.fixturePath
  const request = buildSearchRequest(options)
  if (fixturePath) {
    const html = await fs.readFile(fixturePath, "utf8")
    return parseSearchHtml(html, request.options)
  }
  const fetchImpl = deps.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== "function") throw new Error("No fetch implementation is available. Use Node.js 18+ or provide fetchImpl.")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs || DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal
    })
    const html = await response.text()
    if (!response.ok) throw new Error(`NEC candidate search failed with HTTP ${response.status}: ${html.slice(0, 160)}`)
    return parseSearchHtml(html, request.options)
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = {
  NEC_SEARCH_URL,
  DEFAULT_TIMEOUT_MS,
  LOCAL_ELECTION_CODES,
  ELECTION_CODE_ALIASES,
  buildSearchRequest,
  cleanText,
  decodeHtml,
  normalizeSearchOptions,
  parseSearchHtml,
  searchCandidates,
  stripTags
}
