const { DEFAULT_HISTORICAL_YEAR, LOVEBUG_BASE_URL } = require("./constants")

function buildUrl(path, params) {
  const url = new URL(path, LOVEBUG_BASE_URL)
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function buildGuScoreUrl() {
  return buildUrl("/api/map/gu-score")
}

function buildWeeklyReportCountUrl() {
  return buildUrl("/api/map/weekly-report-count")
}

function buildClustersUrl(options = {}) {
  return buildUrl("/api/map/clusters", {
    level: options.level || "sigungu",
    historicalYear: options.historicalYear ?? DEFAULT_HISTORICAL_YEAR,
    historicalWeek: options.historicalWeek,
    date: options.date
  })
}

function buildAreasUrl(options = {}) {
  return buildUrl("/api/map/areas", {
    historicalYear: options.historicalYear ?? DEFAULT_HISTORICAL_YEAR,
    includePolygon: options.includePolygon === true ? "true" : "false",
    historicalWeek: options.historicalWeek,
    date: options.date
  })
}

function buildBoundariesUrl(options = {}) {
  return buildUrl("/api/map/boundaries", { level: options.level || "sigungu" })
}

module.exports = {
  buildAreasUrl,
  buildBoundariesUrl,
  buildClustersUrl,
  buildGuScoreUrl,
  buildWeeklyReportCountUrl,
  buildUrl
}
