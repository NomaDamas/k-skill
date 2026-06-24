class LovebugRequestError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = "LovebugRequestError"
    this.status = options.status ?? null
    this.code = options.code ?? null
    this.body = options.body
  }
}

function classifyReportError(payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {})
  if (text.includes("ANON_DAILY_DUPLICATE")) return "ANON_DAILY_DUPLICATE"
  if (text.includes("OUTSIDE_GU_AREA")) return "OUTSIDE_GU_AREA"
  if (text.includes("ACCURACY_TOO_LOW")) return "ACCURACY_TOO_LOW"
  return null
}

function reportErrorMessage(code) {
  if (code === "ANON_DAILY_DUPLICATE") return "anonymous device already submitted a report for this region today"
  if (code === "OUTSIDE_GU_AREA") return "coordinates are outside the requested gu_code"
  if (code === "ACCURACY_TOO_LOW") return "location accuracy is too low for the lovebug.com report surface"
  return `lovebug report failed: ${code}`
}

module.exports = { LovebugRequestError, classifyReportError, reportErrorMessage }
