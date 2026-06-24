const { DEFAULT_TIMEOUT_MS } = require("./constants")
const { LovebugRequestError, classifyReportError } = require("./errors")

function createTimeoutSignal(timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) }
}

async function requestJson(url, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is not available; pass options.fetch or use Node.js 18+")
  const timeout = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal || timeout?.signal
  try {
    const response = await fetchImpl(url, { ...options.init, signal })
    const body = await parseResponseBody(response)
    if (!response.ok) {
      throw new LovebugRequestError(`lovebug request failed: ${response.status}`, {
        status: response.status,
        body,
        code: classifyReportError(body)
      })
    }
    return body
  } finally {
    timeout?.cancel()
  }
}

async function parseResponseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

module.exports = { createTimeoutSignal, parseResponseBody, requestJson }
