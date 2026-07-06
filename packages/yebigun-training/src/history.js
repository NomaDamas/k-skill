const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const DEFAULT_HISTORY_PATH = path.join(os.homedir() || "~", ".cache", "k-skill", "yebigun-training", "history.json")

const COMPARABLE_FIELDS = ["trainingType", "startDate", "endDate", "location", "transportProvided", "notifiedAt"]

function resolveHistoryPath(filePath) {
  return filePath || DEFAULT_HISTORY_PATH
}

function loadHistory(filePath) {
  const resolved = resolveHistoryPath(filePath)
  if (!fs.existsSync(resolved)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"))
}

function saveHistory(history, filePath) {
  const resolved = resolveHistoryPath(filePath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, `${JSON.stringify(history, null, 2)}\n`)
  return resolved
}

function recordYear(year, data, filePath) {
  const yearKey = String(year)
  const history = loadHistory(filePath)
  history[yearKey] = {
    ...(history[yearKey] || {}),
    ...data,
    updatedAt: new Date().toISOString()
  }
  const resolved = saveHistory(history, filePath)
  return { path: resolved, record: history[yearKey] }
}

function getYear(year, filePath) {
  const history = loadHistory(filePath)
  return history[String(year)] || null
}

function listYears(filePath) {
  const history = loadHistory(filePath)
  return Object.keys(history).sort()
}

function diffYears(year, compareYear, filePath) {
  const current = getYear(year, filePath)
  const previous = getYear(compareYear, filePath)

  if (!current) {
    throw new Error(`No recorded training info for ${year}. Run \`training-info\` + \`record\` first.`)
  }

  if (!previous) {
    return {
      year,
      compareYear,
      hasPreviousRecord: false,
      current,
      previous: null,
      changes: []
    }
  }

  const changes = COMPARABLE_FIELDS.filter((field) => current[field] !== previous[field]).map((field) => ({
    field,
    before: previous[field] ?? null,
    after: current[field] ?? null
  }))

  return {
    year,
    compareYear,
    hasPreviousRecord: true,
    current,
    previous,
    changes
  }
}

module.exports = {
  COMPARABLE_FIELDS,
  DEFAULT_HISTORY_PATH,
  diffYears,
  getYear,
  listYears,
  loadHistory,
  recordYear,
  saveHistory
}
