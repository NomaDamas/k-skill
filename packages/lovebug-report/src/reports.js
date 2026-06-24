const crypto = require("node:crypto")

const {
  DEFAULT_DEVICE_HASH_NAMESPACE,
  DEFAULT_TIMEOUT_MS,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_URL
} = require("./constants")
const { LovebugRequestError, classifyReportError, reportErrorMessage } = require("./errors")
const { createTimeoutSignal, parseResponseBody } = require("./http")
const {
  cleanText,
  normalizeCode,
  normalizeContext,
  normalizeLevel,
  parseBoolean
} = require("./normalize")

function buildSubmitAnonymousReportRequest(options = {}) {
  const guCode = normalizeCode(options.guCode || options.gu_code, "guCode")
  const level = normalizeLevel(options.level)
  const context = normalizeContext(options.context || "other")
  const lng = Number(options.lng)
  const lat = Number(options.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new TypeError("lng and lat are required numeric coordinates")
  const accuracyM = options.accuracyM == null || options.accuracyM === "" ? null : Number(options.accuracyM)
  if (accuracyM != null && !Number.isFinite(accuracyM)) throw new TypeError("accuracyM must be numeric when provided")
  const deviceHash = cleanText(options.deviceHash || options.device_hash)
  if (!deviceHash) throw new TypeError("deviceHash is required for report submission")
  const indoor = options.indoor == null ? context === "indoor" : Boolean(parseBoolean(options.indoor, options.indoor))
  const body = {
    p_gu_code: guCode,
    p_lng: lng,
    p_lat: lat,
    p_accuracy_m: accuracyM,
    p_level: level,
    p_device_hash: deviceHash,
    p_context: context,
    p_image_url: options.imageUrl || options.image_url || null,
    p_indoor: indoor
  }
  return {
    url: `${SUPABASE_REST_URL}/rpc/submit_anonymous_report`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(body)
  }
}

async function reportLovebug(options = {}) {
  const request = buildSubmitAnonymousReportRequest(options)
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is not available; pass options.fetch or use Node.js 18+")
  const timeout = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: options.signal || timeout?.signal
    })
    const payload = await parseResponseBody(response)
    if (!response.ok) {
      const code = classifyReportError(payload) || `HTTP_${response.status}`
      throw new LovebugRequestError(reportErrorMessage(code), { status: response.status, code, body: payload })
    }
    return {
      ok: true,
      status: response.status,
      report: JSON.parse(request.body),
      response: payload,
      source_url: request.url
    }
  } finally {
    timeout?.cancel()
  }
}

function createDeviceHash(options = {}) {
  const seed = cleanText(options.seed || DEFAULT_DEVICE_HASH_NAMESPACE)
  return crypto.createHash("sha256").update(seed).digest("hex")
}

module.exports = {
  buildSubmitAnonymousReportRequest,
  createDeviceHash,
  reportLovebug
}
