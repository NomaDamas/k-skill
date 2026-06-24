const {
  ADVISORY_LABELS,
  CONTEXT_LABELS,
  LEVEL_LABELS,
  LOVEBUG_BASE_URL,
  SCORE_LABELS,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_URL,
  SUPABASE_URL
} = require("./constants")
const { LovebugRequestError } = require("./errors")
const {
  normalizeContext,
  normalizeGuScoreResponse,
  normalizeLevel,
  normalizeSnapshotResponse
} = require("./normalize")
const {
  buildSubmitAnonymousReportRequest,
  createDeviceHash,
  reportLovebug
} = require("./reports")
const {
  findRegion,
  getAreas,
  getClusters,
  getGuScores,
  getWeeklyReportCount,
  listRegions,
  searchLovebugRegions
} = require("./regions")
const {
  buildAreasUrl,
  buildBoundariesUrl,
  buildClustersUrl,
  buildGuScoreUrl,
  buildWeeklyReportCountUrl
} = require("./urls")

module.exports = {
  ADVISORY_LABELS,
  CONTEXT_LABELS,
  LEVEL_LABELS,
  LOVEBUG_BASE_URL,
  SCORE_LABELS,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_URL,
  SUPABASE_URL,
  LovebugRequestError,
  buildAreasUrl,
  buildBoundariesUrl,
  buildClustersUrl,
  buildGuScoreUrl,
  buildSubmitAnonymousReportRequest,
  buildWeeklyReportCountUrl,
  createDeviceHash,
  findRegion,
  getAreas,
  getClusters,
  getGuScores,
  getWeeklyReportCount,
  listRegions,
  normalizeContext,
  normalizeGuScoreResponse,
  normalizeLevel,
  normalizeSnapshotResponse,
  reportLovebug,
  searchLovebugRegions
}
