"use strict"

const { MODEL_SUBSIDY_PATH, SIDO_ALIASES, STATUS_URL, resolveVehicleType } = require("./constants")
const { createError } = require("./errors")
const {
  attachModelEstimate,
  buildStatusResult,
  normalizeRegionKey,
  normalizeText,
  parseModelSubsidyRows,
  parseStatusRows
} = require("./parse")
const { decodeProtectedHtml, extractPnpScriptUrl } = require("./pnp")

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_HEADERS = Object.freeze({
  accept: "text/html,application/xhtml+xml",
  "accept-language": "ko-KR,ko;q=0.9",
  "user-agent": "ev-subsidy-status/0.1 (+https://github.com/NomaDamas/k-skill)"
})

let cachedPnp = null

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
}

function htmlToText(value) {
  return normalizeText(decodeHtmlEntities(String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")))
}

function parseNoticeFiles(cellHtml) {
  const items = []
  const pattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)>/gi
  let match
  while ((match = pattern.exec(cellHtml))) {
    const attributes = match[2] || match[4] || ""
    const attribute = (name) => {
      const found = attributes.match(new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, "i"))
      return decodeHtmlEntities(found ? found[2] : "")
    }
    const label = match[1]
      ? htmlToText(match[3])
      : attribute("value")
    const onclick = attribute("onclick")
    const title = attribute("title")
    if (label || onclick) items.push({ label, title, onclick })
  }
  return items
}

function extractStatusRows(html) {
  const tables = Array.from(String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi), (match) => match[1])
  const table = tables.find((candidate) => /출고잔여/.test(htmlToText(candidate)))
  if (!table) throw createError("DOM_CHANGED", "공식 지급현황 표를 찾지 못했습니다.")

  const bodyMatch = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)
  const body = bodyMatch ? bodyMatch[1] : table
  const rows = []
  for (const rowMatch of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cellHtml = Array.from(rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (match) => match[1])
    if (cellHtml.length < 10) continue
    const cells = cellHtml.map(htmlToText)
    const codeMatch = cellHtml[3].match(/goDownloadFile\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/i)
    rows.push({
      cells,
      local_code: codeMatch ? codeMatch[1] : null,
      notice_files: parseNoticeFiles(cellHtml[3])
    })
  }
  if (!rows.length) throw createError("RESULT_EMPTY", "공식 지급현황 표에 데이터 행이 없습니다.")
  return rows
}

function extractModelSubsidySnapshot(html) {
  const candidates = Array.from(String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi), (match) => {
    const table = match[1]
    const headers = Array.from(table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi), (header) => htmlToText(header[1]))
    const rows = Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (row) =>
      Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (cell) => htmlToText(cell[1]))
    ).filter((cells) => cells.length >= 6)
    return { headers, rows }
  }).filter((candidate) =>
    candidate.rows.length > 0 &&
    /제조사/.test(candidate.headers.join(" ")) &&
    /모델/.test(candidate.headers.join(" ")) &&
    /국비/.test(candidate.headers.join(" "))
  ).sort((a, b) => b.rows.length - a.rows.length)

  if (!candidates.length) {
    throw createError("DOM_CHANGED", "공식 모델별 보조금 표를 찾지 못했습니다.")
  }
  return candidates[0]
}

function canonicalSidoFromQuery(query) {
  const key = normalizeRegionKey(query)
  return Object.entries(SIDO_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => key.includes(normalizeRegionKey(alias)))
  )?.[0] || null
}

function localMatches(query, localName) {
  const key = normalizeRegionKey(query)
  const local = normalizeRegionKey(localName)
  if (key.includes(local)) return true
  const short = local.replace(/(시|군|구)$/u, "")
  return short.length >= 2 && key.includes(short)
}

function resolveRegionFromRows(query, rawRows) {
  if (!normalizeText(query)) throw createError("REGION_REQUIRED", "조회할 시도와 시군구를 입력하세요.")
  const explicitSido = canonicalSidoFromQuery(query)
  const matches = rawRows.filter((row) => {
    const [sidoName, localName] = row.cells
    if (explicitSido && normalizeRegionKey(sidoName) !== normalizeRegionKey(explicitSido)) return false
    return localMatches(query, localName)
  }).map((row) => ({
    sidoName: row.cells[0],
    sidoCode: row.local_code ? `${row.local_code.slice(0, 2)}00` : null,
    localName: row.cells[1],
    localCode: row.local_code
  }))
  const unique = Array.from(new Map(matches.map((item) => [`${item.sidoName}:${item.localName}`, item])).values())
  if (!unique.length) throw createError("REGION_NOT_FOUND", `공식 지급현황에서 "${query}" 지역을 찾지 못했습니다.`)
  if (unique.length > 1) {
    throw createError("REGION_AMBIGUOUS", `"${query}"에 해당하는 지역이 여러 곳입니다. 시도를 함께 입력하세요.`, {
      candidates: unique
    })
  }
  return unique[0]
}

async function fetchText(url, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== "function") throw createError("UPSTREAM_FAILED", "사용 가능한 fetch 구현이 없습니다.")
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      ...options.request,
      headers: { ...DEFAULT_HEADERS, ...(options.request && options.request.headers) },
      signal: controller.signal
    })
    if (!response.ok) {
      throw createError("UPSTREAM_FAILED", `공식 사이트가 HTTP ${response.status}를 반환했습니다.`, {
        status: response.status
      })
    }
    return response.text()
  } catch (error) {
    if (error.name === "AbortError") throw createError("UPSTREAM_TIMEOUT", "공식 사이트 응답 시간이 초과되었습니다.")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function fetchDecodedStatusHtml(options = {}) {
  const vehicle = resolveVehicleType(options.vehicleType)
  const year = Number(options.year || new Date().getFullYear())
  const body = new URLSearchParams({
    car_type: vehicle.carTypeCode,
    year1: String(year),
    localDo_cd: "all",
    local_cd1: "all"
  })
  const shellHtml = await fetchText(STATUS_URL, {
    ...options,
    request: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString()
    }
  })
  if (!/<meta[^>]+name=['"]penc['"]/i.test(shellHtml)) return { html: shellHtml, vehicle, year }

  const pnpUrl = extractPnpScriptUrl(shellHtml, STATUS_URL)
  if (!cachedPnp || cachedPnp.url !== pnpUrl || options.fetch) {
    cachedPnp = {
      url: pnpUrl,
      source: await fetchText(pnpUrl, options)
    }
  }
  const html = decodeProtectedHtml(shellHtml, cachedPnp.source)
  const selectedYear = html.match(/<option\b[^>]*value=['"](\d{4})['"][^>]*selected/i)?.[1]
  if (selectedYear && Number(selectedYear) !== year) {
    throw createError("YEAR_NOT_AVAILABLE", `${year}년 지급현황을 공식 페이지에서 선택할 수 없습니다.`)
  }
  return { html, vehicle, year }
}

async function fetchDecodedModelHtml(options = {}) {
  const vehicle = options.vehicle || resolveVehicleType(options.vehicleType)
  const year = Number(options.year || new Date().getFullYear())
  const modelUrl = new URL(MODEL_SUBSIDY_PATH, STATUS_URL).toString()
  const body = new URLSearchParams({
    year: String(year),
    year1: String(year),
    local_cd: String(options.localCode),
    car_type: vehicle.carTypeCode
  })
  const shellHtml = await fetchText(modelUrl, {
    ...options,
    request: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString()
    }
  })
  if (!/<meta[^>]+name=['"]penc['"]/i.test(shellHtml)) {
    return { html: shellHtml, modelUrl }
  }

  const pnpUrl = extractPnpScriptUrl(shellHtml, modelUrl)
  if (!cachedPnp || cachedPnp.url !== pnpUrl || options.fetch) {
    cachedPnp = {
      url: pnpUrl,
      source: await fetchText(pnpUrl, options)
    }
  }
  return {
    html: decodeProtectedHtml(shellHtml, cachedPnp.source),
    modelUrl
  }
}

async function getSubsidyStatusHttp(options = {}) {
  const { html, vehicle, year } = await fetchDecodedStatusHtml(options)
  const rawRows = extractStatusRows(html)
  const region = resolveRegionFromRows(options.region, rawRows)
  const rows = parseStatusRows(rawRows, { localName: region.localName, vehicleType: vehicle.key })
  const result = buildStatusResult({
    query: {
      region: options.region,
      year,
      vehicle_type: vehicle.key,
      category: options.category || "all",
      model: options.model || null
    },
    region,
    rows,
    sourceUrl: STATUS_URL
  })
  result.transport = "direct-http"
  if (options.model) {
    try {
      const modelResponse = await fetchDecodedModelHtml({
        ...options,
        localCode: region.localCode,
        vehicle
      })
      const parsed = parseModelSubsidyRows(extractModelSubsidySnapshot(modelResponse.html), {
        model: options.model
      })
      const remainingCount = result.availability.official_remaining_count
      result.model_subsidy_candidates = parsed.items.map((item) => ({
        ...item,
        remaining_equivalent_estimate_krw:
          Number.isFinite(remainingCount) && Number.isFinite(item.total_subsidy_krw)
            ? remainingCount * item.total_subsidy_krw
            : null
      }))
      result.model_subsidy_source_url = modelResponse.modelUrl

      if (parsed.items.length === 1) {
        Object.assign(result, attachModelEstimate(result, parsed.items[0]))
      } else if (parsed.items.length > 1) {
        result.warnings.push(
          `"${options.model}"에 해당하는 세부 모델이 ${parsed.items.length}개입니다. 트림별 보조금과 잔여 환산치를 구분해 확인하세요.`
        )
      } else {
        result.model_lookup_error = {
          code: "MODEL_LOOKUP_FAILED",
          message: `공식 모델별 보조금 표에서 "${options.model}"을 찾지 못했습니다.`
        }
        result.warnings.push(result.model_lookup_error.message)
      }
    } catch (error) {
      result.model_lookup_error = {
        code: error && error.code ? error.code : "MODEL_LOOKUP_FAILED",
        message: error && error.message ? error.message : String(error)
      }
      result.warnings.push(`모델별 보조금 조회 실패: ${result.model_lookup_error.message}`)
    }
  }
  return result
}

async function searchRegionsHttp(options = {}) {
  const query = normalizeText(options.query)
  if (!query) throw createError("REGION_REQUIRED", "검색할 지역명을 입력하세요.")
  const { html } = await fetchDecodedStatusHtml({ ...options, vehicleType: "passenger" })
  const rows = extractStatusRows(html)
  const items = rows.filter((row) => localMatches(query, row.cells[1])).map((row) => ({
    sido_name: row.cells[0],
    sido_code: row.local_code ? `${row.local_code.slice(0, 2)}00` : null,
    local_name: row.cells[1],
    local_code: row.local_code
  }))
  return {
    query,
    items: Array.from(new Map(items.map((item) => [`${item.sido_name}:${item.local_name}`, item])).values()),
    source_url: STATUS_URL,
    transport: "direct-http"
  }
}

module.exports = {
  decodeHtmlEntities,
  extractModelSubsidySnapshot,
  extractStatusRows,
  fetchDecodedModelHtml,
  fetchDecodedStatusHtml,
  getSubsidyStatusHttp,
  htmlToText,
  parseNoticeFiles,
  resolveRegionFromRows,
  searchRegionsHttp
}
