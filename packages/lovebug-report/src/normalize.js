const {
  ADVISORY_LABELS,
  CONTEXT_ALIASES,
  LEVEL_LABELS,
  SCORE_LABELS
} = require("./constants")
const { buildGuScoreUrl } = require("./urls")

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim()
}

function normalizeToken(value) {
  return cleanText(value).replace(/[\s._-]+/g, "").toLowerCase()
}

function parseBoolean(value, defaultValue = undefined) {
  if (value == null || value === "") return defaultValue
  if (typeof value === "boolean") return value
  const token = normalizeToken(value)
  if (["true", "1", "yes", "y", "include", "포함"].includes(token)) return true
  if (["false", "0", "no", "n", "exclude", "미포함"].includes(token)) return false
  return defaultValue
}

function normalizeLevel(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) return value
  const token = normalizeToken(value)
  if (["0", "quiet", "none", "잠잠", "잠잠해요", "없음", "안보임", "조용"].includes(token)) return 0
  if (["1", "low", "slight", "살짝", "살짝보임", "조금", "조금보여요"].includes(token)) return 1
  if (["2", "medium", "many", "많음", "많아요", "꽤많이", "꽤많이보여요"].includes(token)) return 2
  if (["3", "high", "verymany", "peak", "매우많음", "매우많아요", "엄청많음", "엄청많아요", "조심"].includes(token)) return 3
  throw new TypeError("level must be 0, 1, 2, 3 or one of the official Korean labels")
}

function normalizeContext(value = "other") {
  const token = normalizeToken(value || "other")
  const normalized = CONTEXT_ALIASES.get(token) || CONTEXT_ALIASES.get(cleanText(value))
  if (!normalized) throw new TypeError(`unsupported report context: ${value}`)
  return normalized
}

function normalizeCode(value, label) {
  const code = cleanText(value)
  if (!/^\d{5,10}$/.test(code)) throw new TypeError(`${label} must be a Korean administrative code`)
  return code
}

function normalizeGuScoreResponse(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : []
  const items = features.map((feature, index) => normalizeGuScoreFeature(feature, index + 1))
  return { type: "gu-score", source_url: buildGuScoreUrl(), items }
}

function normalizeSnapshotResponse(payload, options = {}) {
  const features = Array.isArray(payload?.features) ? payload.features : []
  return {
    type: options.type || payload?.level || "snapshot",
    date: payload?.date || null,
    level: payload?.level || null,
    source_url: options.sourceUrl || null,
    items: features.map(normalizeSnapshotFeature)
  }
}

function normalizeGuScoreFeature(feature, rank = null) {
  const properties = feature?.properties || {}
  const level = properties.no_data ? 0 : normalizeLevelFromScore(properties.score)
  return compactObject({
    rank,
    gu_code: cleanText(properties.gu_code),
    gu_name: cleanText(properties.gu_name),
    sido: cleanText(properties.sido),
    score: Number(properties.score ?? 0),
    score_label: properties.no_data ? "아직 정보가 부족해요" : SCORE_LABELS[level],
    advisory: ADVISORY_LABELS[level],
    level,
    level_label: LEVEL_LABELS[level],
    no_data: Boolean(properties.no_data),
    coordinates: coordinatesFromGeometry(feature.geometry),
    counts: compactObject({
      report: numberOrNull(properties.report_count ?? properties.report_count_14d),
      report_14d: numberOrNull(properties.report_count_14d),
      report_24h: numberOrNull(properties.report_count_24h),
      verified_14d: numberOrNull(properties.report_count_verified_14d),
      spotted: numberOrNull(properties.spotted_count),
      quiet: numberOrNull(properties.quiet_count ?? properties.quiet_count_14d),
      low: numberOrNull(properties.low_count),
      medium: numberOrNull(properties.medium_count),
      high: numberOrNull(properties.high_count)
    }),
    metrics: compactObject({
      intensity_score: numberOrNull(properties.intensity_score),
      spotted_rate_score: numberOrNull(properties.spotted_rate_score),
      quiet_penalty: numberOrNull(properties.quiet_penalty),
      historical_score: numberOrNull(properties.historical_score),
      confidence_cap: numberOrNull(properties.confidence_cap)
    }),
    source_url: buildGuScoreUrl()
  })
}

function normalizeSnapshotFeature(feature) {
  const properties = feature?.properties || {}
  const stats = properties.stats || {}
  const classifiedLevel = clampLevel(stats.classified_level)
  return compactObject({
    area_code: cleanText(properties.code || properties.area_code),
    area_name: cleanText(properties.name || properties.label),
    gu_code: cleanText(properties.gu_code || properties.code),
    gu_name: cleanText(properties.gu_name || properties.label),
    sido: cleanText(properties.sido),
    coordinates: coordinatesFromGeometry(feature.geometry),
    centroid: properties.centroid ? { lng: Number(properties.centroid.lng), lat: Number(properties.centroid.lat) } : undefined,
    stats: compactObject({
      date: cleanText(stats.date),
      level: classifiedLevel,
      level_label: LEVEL_LABELS[classifiedLevel],
      intensity: numberOrNull(stats.intensity),
      confidence: numberOrNull(stats.confidence),
      indoor_ratio: numberOrNull(stats.indoor_ratio),
      report_count: numberOrNull(stats.report_count),
      report_count_verified: numberOrNull(stats.report_count_verified),
      hour_distribution: Array.isArray(stats.hour_distribution) ? stats.hour_distribution : undefined
    }),
    historical: normalizeHistorical(properties.historical)
  })
}

function normalizeHistorical(value) {
  if (!value) return null
  return compactObject({
    year: numberOrNull(value.year),
    week: numberOrNull(value.week),
    updated_at: cleanText(value.updated_at),
    mention_count: numberOrNull(value.mention_count),
    classified_level: clampLevel(value.classified_level),
    source_count: value.source_count || undefined,
    source_urls: Array.isArray(value.source_urls)
      ? value.source_urls.map((item) => compactObject({
          source: cleanText(item.source),
          title: cleanText(item.title),
          url: cleanText(item.url),
          date: cleanText(item.date)
        }))
      : undefined
  })
}

function coordinatesFromGeometry(geometry) {
  const coordinates = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : []
  if (coordinates.length < 2) return null
  const [lng, lat] = coordinates
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null
  return { lng: Number(lng), lat: Number(lat) }
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""))
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clampLevel(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(3, Math.round(number)))
}

function normalizeLevelFromScore(score) {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 25) return 0
  if (value <= 50) return 1
  if (value <= 75) return 2
  return 3
}

module.exports = {
  cleanText,
  compactObject,
  normalizeCode,
  normalizeContext,
  normalizeGuScoreResponse,
  normalizeLevel,
  normalizeSnapshotResponse,
  normalizeToken,
  parseBoolean
}
