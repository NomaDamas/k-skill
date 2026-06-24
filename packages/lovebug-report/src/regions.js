const { requestJson } = require("./http")
const {
  cleanText,
  normalizeGuScoreResponse,
  normalizeSnapshotResponse,
  normalizeToken,
  parseBoolean
} = require("./normalize")
const {
  buildAreasUrl,
  buildClustersUrl,
  buildGuScoreUrl,
  buildWeeklyReportCountUrl
} = require("./urls")
const { parsePositiveInteger } = require("./util")

async function getGuScores(options = {}) {
  const payload = await requestJson(buildGuScoreUrl(), options)
  return normalizeGuScoreResponse(payload)
}

async function getWeeklyReportCount(options = {}) {
  const payload = await requestJson(buildWeeklyReportCountUrl(), options)
  return { count: Number(payload?.count ?? 0), source_url: buildWeeklyReportCountUrl() }
}

async function getClusters(options = {}) {
  const sourceUrl = buildClustersUrl(options)
  const payload = await requestJson(sourceUrl, options)
  return normalizeSnapshotResponse(payload, { type: "clusters", sourceUrl })
}

async function getAreas(options = {}) {
  const sourceUrl = buildAreasUrl(options)
  const payload = await requestJson(sourceUrl, options)
  return normalizeSnapshotResponse(payload, { type: "areas", sourceUrl })
}

async function listRegions(options = {}) {
  const result = await getGuScores(options)
  const limit = parsePositiveInteger(options.limit, { defaultValue: 20, max: 100 })
  return { ...result, items: result.items.slice(0, limit) }
}

async function findRegion(query, options = {}) {
  const result = await searchLovebugRegions({ ...options, query, includeAreas: false })
  return result.items[0] || null
}

async function searchLovebugRegions(options = {}) {
  const query = cleanText(options.query)
  const limit = parsePositiveInteger(options.limit, { defaultValue: 10, max: 100 })
  const includeAreas = parseBoolean(options.includeAreas, true)
  const [guScores, weeklyReportCount, areas] = await Promise.all([
    getGuScores(options),
    getWeeklyReportCount(options).catch((error) => ({ count: null, warning: error.message })),
    includeAreas ? getAreas({ ...options, includePolygon: false }).catch((error) => ({ items: [], warning: error.message })) : Promise.resolve({ items: [] })
  ])
  const areaGroups = groupAreasByGu(areas.items || [], query)
  const items = guScores.items
    .filter((item) => regionMatches(item, query) || areaGroups.has(item.gu_code))
    .slice(0, limit)
    .map((item) => ({ ...item, areas: includeAreas ? areaGroups.get(item.gu_code) || [] : undefined }))
  return {
    type: "region-search",
    query,
    summary: {
      matched_count: items.length,
      weekly_report_count: weeklyReportCount.count,
      source_urls: [buildGuScoreUrl(), buildWeeklyReportCountUrl(), includeAreas ? buildAreasUrl({ includePolygon: false }) : null].filter(Boolean),
      warnings: [weeklyReportCount.warning, areas.warning].filter(Boolean)
    },
    items
  }
}

function regionMatches(item, query) {
  if (!query) return true
  const token = normalizeToken(query)
  return [item.gu_code, item.gu_name, item.sido].some((value) => normalizeToken(value).includes(token))
}

function groupAreasByGu(areas, query) {
  const token = normalizeToken(query)
  const groups = new Map()
  for (const area of areas) {
    if (token && ![area.area_code, area.area_name, area.gu_code, area.gu_name, area.sido].some((value) => normalizeToken(value).includes(token))) continue
    const list = groups.get(area.gu_code) || []
    list.push(area)
    groups.set(area.gu_code, list)
  }
  return groups
}

module.exports = {
  findRegion,
  getAreas,
  getClusters,
  getGuScores,
  getWeeklyReportCount,
  listRegions,
  searchLovebugRegions
}
