const GORUNNING_RACES_URL = "https://gorunning.kr/races/"
const TRIATHLON_TOUR_URL = "https://triathlon.or.kr/events/tour/"

async function searchEvents(options = {}) {
  const {
    query = "",
    from,
    to,
    includeTriathlon = false,
    limit = 10,
    maxDetailsPerSource,
    fetcher = global.fetch
  } = options

  if (!fetcher) throw new Error("fetch is required.")

  const normalizedLimit = Math.max(1, Number(limit) || 10)
  const detailBudget = normalizeDetailBudget(maxDetailsPerSource, normalizedLimit)
  const years = collectYears(from, to)
  const items = []
  const warnings = []

  try {
    const marathonListHtml = await fetchText(fetcher, GORUNNING_RACES_URL)
    const marathonUrls = parseGorunningList(marathonListHtml)
    const marathonBudgetedUrls = marathonUrls.slice(0, detailBudget)
    for (const url of marathonBudgetedUrls) {
      try {
        const detailHtml = await fetchText(fetcher, url)
        const event = parseGorunningDetail(detailHtml, url)
        if (matchesEvent(event, { query, from, to })) items.push(event)
      } catch (error) {
        warnings.push(`gorunning detail failed for ${url}: ${error.message}`)
      }
      if (items.length >= normalizedLimit) break
    }
    if (items.length < normalizedLimit && marathonUrls.length > marathonBudgetedUrls.length) {
      warnings.push(`gorunning detail budget exhausted after ${marathonBudgetedUrls.length} of ${marathonUrls.length} source links`)
    }
  } catch (error) {
    warnings.push(`gorunning source failed: ${error.message}`)
  }

  if (includeTriathlon) {
    let triathlonDetailCount = 0
    let triathlonSourceCount = 0
    for (const year of years) {
      const listUrl = `${TRIATHLON_TOUR_URL}?sYear=${encodeURIComponent(year)}&vType=list`
      try {
        const triListHtml = await fetchText(fetcher, listUrl)
        const triListItems = parseTriathlonList(triListHtml)
        triathlonSourceCount += triListItems.length
        for (const listItem of triListItems) {
          if (triathlonDetailCount >= detailBudget) break
          triathlonDetailCount += 1
          try {
            const detailHtml = await fetchText(fetcher, listItem.url)
            const event = parseTriathlonDetail(detailHtml, listItem.url, listItem)
            if (matchesEvent(event, { query, from, to })) items.push(event)
          } catch (error) {
            warnings.push(`triathlon detail failed for ${listItem.url}: ${error.message}`)
          }
          if (items.length >= normalizedLimit) break
        }
      } catch (error) {
        warnings.push(`triathlon source failed for ${listUrl}: ${error.message}`)
      }
      if (items.length >= normalizedLimit) break
    }
    if (items.length < normalizedLimit && triathlonSourceCount > triathlonDetailCount && triathlonDetailCount >= detailBudget) {
      warnings.push(`triathlon detail budget exhausted after ${triathlonDetailCount} of ${triathlonSourceCount} source links`)
    }
  }

  items.sort((a, b) => String(a.eventDate || "").localeCompare(String(b.eventDate || "")))

  return {
    query: String(query || ""),
    from: from || null,
    to: to || null,
    includeTriathlon: Boolean(includeTriathlon),
    sources: includeTriathlon ? ["gorunning", "triathlon.or.kr"] : ["gorunning"],
    warnings,
    items: items.slice(0, normalizedLimit)
  }
}

function normalizeDetailBudget(maxDetailsPerSource, normalizedLimit) {
  if (maxDetailsPerSource === undefined || maxDetailsPerSource === null) return Math.max(300, normalizedLimit * 10)
  const numeric = Number(maxDetailsPerSource)
  if (!Number.isFinite(numeric)) return Math.max(300, normalizedLimit * 10)
  return Math.max(1, Math.floor(numeric))
}

function parseGorunningList(html) {
  const urls = new Set()
  const source = String(html || "")
  const linkRe = /<a\b[^>]*href=["']([^"']*\/races\/\d+\/[^"']*)["'][^>]*>/gi
  let match
  while ((match = linkRe.exec(source))) {
    const url = resolveAllowedUrl(decodeHtml(match[1]), GORUNNING_RACES_URL, "gorunning.kr")
    if (url) urls.add(url)
  }
  return [...urls]
}

function parseGorunningDetail(html, url) {
  const title = firstHeading(html) || textBetweenLabels(html, "대회명") || ""
  const plain = htmlToText(html)
  const registrationPeriod = parseRegistrationPeriod(plain)
  const eventDate = parseFirstDateAfterTitle(plain, title) || parseFirstIsoDate(plain)
  const address = textBetweenLabels(html, "주소")
  const locationLine = findLocationLine(plain)
  const region = inferRegion([address, locationLine], plain)
  const venue = address || stripRegion(locationLine, region) || locationLine || ""
  const officialUrl = findOfficialUrl(html, url)
  const categories = extractGorunningCategories(plain, title)

  return compactEvent({
    source: "gorunning",
    type: "marathon",
    title: cleanText(title),
    eventDate,
    region,
    venue: cleanText(venue),
    registrationDeadline: registrationPeriod.end || parseDeadline(plain, eventDate),
    registrationPeriod,
    status: detectStatus(plain),
    categories,
    organizer: textBetweenLabels(html, "주최자") || null,
    officialUrl,
    url
  })
}

function parseTriathlonList(html) {
  const items = new Map()
  const source = String(html || "")
  const linkRe = /<a\b[^>]*href=["']([^"']*\/events\/tour\/overview\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = linkRe.exec(source))) {
    const url = resolveAllowedUrl(decodeHtml(match[1]), "https://triathlon.or.kr", "triathlon.or.kr")
    if (!url) continue
    const title = cleanText(htmlToText(match[2]))
    const context = enclosingTagSource(source, match.index, "tr") || source.slice(Math.max(0, match.index - 300), Math.min(source.length, match.index + 700))
    const contextText = htmlToText(context)
    if (!isTriathlonCompetitionText(title, contextText)) continue
    const categories = splitCategories(textAfterInlineLabel(contextText, "코스"))
    items.set(url, { url, categories })
  }
  return [...items.values()]
}

function enclosingTagSource(source, index, tagName) {
  const tag = escapeRegExp(tagName)
  const before = source.slice(0, index)
  const openMatch = [...before.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].pop()
  if (!openMatch) return null
  const closeRe = new RegExp(`</${tag}>`, "i")
  const closeMatch = closeRe.exec(source.slice(index))
  if (!closeMatch) return null
  return source.slice(openMatch.index, index + closeMatch.index + closeMatch[0].length)
}

function resolveAllowedUrl(href, baseUrl, allowedHostname) {
  try {
    const url = new URL(href, baseUrl)
    return url.hostname === allowedHostname ? url.toString() : null
  } catch {
    return null
  }
}

function isTriathlonCompetitionText(title, context = "") {
  const titleText = cleanText(title)
  const contextText = cleanText(context)
  if (!titleText && !contextText) return false
  if (/교육|강습|세미나|설명회|회의|공지|대회규정|심판|지도자|워크숍/.test(titleText)) return false
  if (/대회|컵|선수권|챔피언십|철인3종|트라이애슬론|듀애슬론|아쿠아슬론/.test(titleText)) return true
  if (/교육|강습|세미나|설명회|회의|공지|대회규정|심판|지도자|워크숍/.test(contextText)) return false
  return /대회|컵|선수권|챔피언십|철인3종|트라이애슬론|듀애슬론|아쿠아슬론/.test(contextText)
}

function parseTriathlonDetail(html, url, listMetadata = {}) {
  const title = tableValue(html, "대회명") || firstHeading(html) || ""
  const eventDate = normalizeDate(tableValue(html, "대회기간") || tableValue(html, "대회일정") || htmlToText(html))
  const venue = tableValue(html, "대회장소") || textAfterInlineLabel(htmlToText(html), "장소") || ""
  const registrationPeriod = parseRegistrationPeriod(tableValue(html, "접수기간") || htmlToText(html))
  const courseText = textAfterInlineLabel(htmlToText(html), "코스") || tableValue(html, "종목") || ""
  const detailCategories = splitCategories(courseText)

  return compactEvent({
    source: "triathlon.or.kr",
    type: "triathlon",
    title: cleanText(title),
    eventDate,
    region: normalizeRegion(String(venue).split(/\s+/)[0]),
    venue: cleanText(venue),
    registrationDeadline: registrationPeriod.end,
    registrationPeriod,
    status: detectStatus(htmlToText(html)),
    categories: detailCategories.length ? detailCategories : (listMetadata.categories || []),
    organizer: tableValue(html, "주최") || tableValue(html, "주관") || null,
    officialUrl: url,
    url
  })
}

async function fetchText(fetcher, url) {
  const response = await fetcher(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; k-skill/korean-marathon-schedule)",
      accept: "text/html,application/xhtml+xml"
    }
  })
  if (!response || !response.ok) {
    const status = response ? `${response.status} ${response.statusText || ""}`.trim() : "no response"
    throw new Error(`request failed for ${url}: ${status}`)
  }
  return response.text()
}

function matchesEvent(event, { query, from, to }) {
  const q = cleanText(query || "").toLowerCase()
  if (q) {
    const haystack = [event.title, event.region, event.venue, ...(event.categories || [])].join(" ").toLowerCase()
    if (!haystack.includes(q)) return false
  }
  if (from && event.eventDate && event.eventDate < from) return false
  if (to && event.eventDate && event.eventDate > to) return false
  return true
}

function collectYears(from, to) {
  const current = new Date().getFullYear()
  const start = from && /^\d{4}/.test(from) ? Number(from.slice(0, 4)) : current
  const end = to && /^\d{4}/.test(to) ? Number(to.slice(0, 4)) : start
  const years = []
  for (let year = start; year <= Math.min(end, start + 2); year += 1) years.push(String(year))
  return years.length ? years : [String(current)]
}

function firstHeading(html) {
  const match = String(html || "").match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
  return match ? cleanText(htmlToText(match[1])) : null
}

function tableValue(html, label) {
  const source = String(html || "")
  const escaped = escapeRegExp(label)
  const patterns = [
    new RegExp(`<tr[^>]*>[\\s\\S]*?<t[hd][^>]*>\\s*${escaped}\\s*<\\/t[hd]>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<\\/tr>`, "i"),
    new RegExp(`${escaped}\\s*<\\/t[hd]>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i")
  ]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match) return cleanText(htmlToText(match[1]))
  }
  return null
}

function textBetweenLabels(html, label) {
  const source = String(html || "")
  const escaped = escapeRegExp(label)
  const pattern = new RegExp(`${escaped}\\s*<\\/[^>]+>\\s*<[^>]+>([\\s\\S]*?)<\\/[^>]+>`, "i")
  const match = source.match(pattern)
  return match ? cleanText(htmlToText(match[1])) : null
}

function parseRegistrationPeriod(text) {
  const plain = cleanText(text)
  const match = plain.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})(?:\s*\d{1,2}:\d{2})?\s*[~～-]\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})(?:\s*\d{1,2}:\d{2})?/)
  if (!match) return { start: null, end: null }
  return { start: normalizeDate(match[1]), end: normalizeDate(match[2]) }
}

function parseFirstDateAfterTitle(text, title) {
  const plain = cleanText(text)
  const idx = title ? plain.indexOf(cleanText(title)) : -1
  const tail = idx >= 0 ? plain.slice(idx + cleanText(title).length) : plain
  return normalizeDate(tail)
}

function parseFirstIsoDate(text) {
  return normalizeDate(text)
}

function parseDeadline(text, eventDate) {
  const plain = cleanText(text)
  const match = plain.match(/(?:접수\s*)?마감[:\s]*(\d{1,2})월\s*(\d{1,2})일/)
  if (!match) return null
  const year = eventDate ? Number(eventDate.slice(0, 4)) : new Date().getFullYear()
  return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
}

function normalizeDate(value) {
  const text = cleanText(value || "")
  const match = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
}

function findLocationLine(text) {
  const plain = cleanText(text)
  const match = plain.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}[^가-힣]*(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s+([^접등웹주정]+)/)
  if (match) return cleanText(`${match[1]} ${match[2]}`)
  return null
}

function stripRegion(locationLine, region) {
  if (!locationLine || !region) return locationLine
  return cleanText(String(locationLine).replace(new RegExp(`^${escapeRegExp(region)}\\s*`), ""))
}

function inferRegion(locations, fallbackText) {
  const candidates = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
  for (const location of Array.isArray(locations) ? locations : [locations]) {
    const locationText = cleanText(location || "")
    const firstTokenRegion = normalizeRegion(String(locationText).split(/\s+/)[0])
    const locationRegion = (candidates.includes(firstTokenRegion) ? firstTokenRegion : null) || candidates.find((candidate) => locationText.includes(candidate))
    if (locationRegion) return locationRegion
  }

  const fallbackHaystack = cleanText(fallbackText || "")
  return candidates.find((candidate) => fallbackHaystack.includes(candidate)) || null
}

function normalizeRegion(region) {
  const value = cleanText(region || "")
  const map = {
    서울특별시: "서울",
    부산광역시: "부산",
    대구광역시: "대구",
    인천광역시: "인천",
    광주광역시: "광주",
    대전광역시: "대전",
    울산광역시: "울산",
    세종특별자치시: "세종",
    경기도: "경기",
    강원도: "강원",
    충청북도: "충북",
    충청남도: "충남",
    전라북도: "전북",
    전라남도: "전남",
    경상북도: "경북",
    경상남도: "경남",
    제주특별자치도: "제주"
  }
  return map[value] || value || null
}

function detectStatus(text) {
  const plain = cleanText(text)
  if (/등록중|접수중|참가 신청 가능/.test(plain)) return plain.includes("접수중") ? "접수중" : "등록중"
  if (/마감|등록마감|접수마감/.test(plain)) return "마감"
  return null
}

function extractGorunningCategories(text, title) {
  const plain = cleanText(text)
  const cleanTitle = cleanText(title || "")
  if (cleanTitle) {
    const escaped = escapeRegExp(cleanTitle)
    const pipeMatch = plain.match(new RegExp(`${escaped}\\s*\\|\\s*([^|]{1,120}?)\\s*\\|\\s*\\d{4}[./-]\\d{1,2}[./-]\\d{1,2}`, "i"))
    if (pipeMatch) return extractRaceCategories(pipeMatch[1])

    const idx = plain.indexOf(cleanTitle)
    if (idx >= 0) {
      const tail = plain.slice(idx + cleanTitle.length, idx + cleanTitle.length + 300)
      const dateIdx = tail.search(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/)
      return extractRaceCategories(dateIdx >= 0 ? tail.slice(0, dateIdx) : tail)
    }
  }
  return extractRaceCategories(plain.slice(0, 500))
}

function extractRaceCategories(text) {
  const plain = cleanText(text)
  const categories = []
  const patterns = [
    [/풀(?:코스)?|Full/gi, "Full"],
    [/하프|Half/gi, "Half"],
    [/\b10\s?km\b/gi, "10km"],
    [/\b5\s?km\b/gi, "5km"],
    [/\b3\s?km\s*걷기/gi, "3km 걷기"],
    [/\b3\s?km\s*걷기\(어린이\)/gi, "3km 걷기(어린이)"]
  ]
  for (const [pattern, label] of patterns) {
    if (pattern.test(plain) && !categories.includes(label)) categories.push(label)
  }
  return categories
}

function splitCategories(text) {
  return cleanText(text || "")
    .split(/[,/·|]/)
    .map((item) => cleanText(item))
    .filter(Boolean)
}

function textAfterInlineLabel(text, label) {
  const plain = cleanText(text)
  const match = plain.match(new RegExp(`${escapeRegExp(label)}\\s*[:：]\\s*([^\\n]+?)(?:\\s{2,}|$)`))
  return match ? cleanText(match[1]) : null
}

function findOfficialUrl(html, fallbackUrl) {
  const source = String(html || "")
  const websiteBlock = source.match(/웹사이트[\s\S]{0,500}?<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/i)
  if (websiteBlock) return decodeHtml(websiteBlock[1])

  const links = [...source.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi)].map((m) => decodeHtml(m[1]))
  return links.find((link) => !link.includes("gorunning.kr") && !link.includes("map.naver.com")) || links.find((link) => !link.includes("gorunning.kr")) || fallbackUrl
}

function compactEvent(event) {
  return {
    source: event.source,
    type: event.type,
    title: event.title || null,
    eventDate: event.eventDate || null,
    region: event.region || null,
    venue: event.venue || null,
    registrationDeadline: event.registrationDeadline || null,
    registrationPeriod: event.registrationPeriod || { start: null, end: null },
    status: event.status || null,
    categories: event.categories || [],
    organizer: event.organizer || null,
    officialUrl: event.officialUrl || null,
    url: event.url || null
  }
}

function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/tr>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
}

function cleanText(value) {
  return decodeHtml(String(value || ""))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim()
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

module.exports = {
  searchEvents,
  parseGorunningList,
  parseGorunningDetail,
  parseTriathlonList,
  parseTriathlonDetail,
  GORUNNING_RACES_URL,
  TRIATHLON_TOUR_URL
}
