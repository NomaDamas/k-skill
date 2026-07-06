"use strict"

const http = require("node:http")
const { connectOverCDP } = require("./cdp")
const { connectAside, probeAside } = require("./aside")
const { createUnavailableError, createUnknownProviderError } = require("./stop-rules")

const PROVIDERS = Object.freeze({
  ASIDE: "aside",
  BROWSEROS: "browseros",
  CHROME_CDP: "chrome-cdp",
  AUTO: "auto"
})

const DEFAULT_BROWSEROS_CDP_URL = "http://127.0.0.1:9100"
const DEFAULT_CHROME_CDP_URL = "http://127.0.0.1:9222"

const AUTO_ORDER = Object.freeze([PROVIDERS.BROWSEROS, PROVIDERS.ASIDE, PROVIDERS.CHROME_CDP])

function normalizeProvider(provider) {
  return String(provider || process.env.KSKILL_BROWSER_PROVIDER || PROVIDERS.AUTO).trim() || PROVIDERS.AUTO
}
function isKnownProvider(provider) {
  return provider === PROVIDERS.BROWSEROS || provider === PROVIDERS.ASIDE || provider === PROVIDERS.CHROME_CDP
}

function resolveCdpUrl(provider, options = {}) {
  if (provider === PROVIDERS.ASIDE) return null
  if (options.cdpUrl) return options.cdpUrl
  if (provider === PROVIDERS.CHROME_CDP) {
    return process.env.KSKILL_CHROME_CDP_URL || DEFAULT_CHROME_CDP_URL
  }
  return process.env.KSKILL_BROWSEROS_CDP_URL || DEFAULT_BROWSEROS_CDP_URL
}

function readUrl(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", (chunk) => {
        body += chunk
      })
      response.on("end", () => resolve({ statusCode: response.statusCode, body }))
    })
    request.on("timeout", () => {
      request.destroy(new Error(`CDP health probe timed out: ${url}`))
    })
    request.on("error", reject)
  })
}

async function probeCdp(cdpUrl, options = {}) {
  const probeUrl = `${String(cdpUrl).replace(/\/$/, "")}/json/version`
  try {
    const response = await readUrl(probeUrl, options.timeoutMs)
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return { ok: false, statusCode: response.statusCode, url: probeUrl }
    }
    return { ok: true, url: probeUrl, version: JSON.parse(response.body) }
  } catch (cause) {
    return { ok: false, url: probeUrl, cause }
  }
}

function resolveConnectFn(options) {
  return typeof options.connectLoader === "function" ? options.connectLoader : connectOverCDP
}

async function connectSingle(provider, options = {}) {
  if (!isKnownProvider(provider)) {
    throw createUnknownProviderError(`Unknown browser runtime provider: ${provider}`, { provider })
  }
  if (provider === PROVIDERS.ASIDE) {
    if (options.probe !== false) {
      const probe = await probeAside(options)
      if (!probe.ok) {
        throw createUnavailableError("Aside Browser provider is unavailable.", { provider, probe })
      }
    }
    const browser = await connectAside(options)
    return { provider, cdpUrl: null, browser }
  }
  const cdpUrl = resolveCdpUrl(provider, options)
  if (options.probe !== false) {
    const probeFn = typeof options.probe === "function" ? options.probe : probeCdp
    const probe = await probeFn(cdpUrl, options)
    if (!probe.ok) {
      throw createUnavailableError(`CDP endpoint is unavailable for provider ${provider}: ${cdpUrl}`, { provider, cdpUrl, probe })
    }
  }
  const browser = await resolveConnectFn(options)(cdpUrl, options)
  return { provider, cdpUrl, browser }
}

async function connectAuto(options = {}) {
  const connectFn = resolveConnectFn(options)

  if (options.probe === false) {
    let lastError
    for (const provider of AUTO_ORDER) {
      if (provider === PROVIDERS.ASIDE) {
        try {
          const browser = await connectAside(options)
          return { provider, cdpUrl: null, browser }
        } catch (error) {
          lastError = error
          continue
        }
      }
      const cdpUrl = resolveCdpUrl(provider)
      try {
        const browser = await connectFn(cdpUrl, options)
        return { provider, cdpUrl, browser }
      } catch (error) {
        lastError = error
      }
    }
    const err = createUnavailableError(
      "Browser runtime is unavailable for auto provider (tried BrowserOS, Aside Browser, then Chrome CDP).",
      { order: AUTO_ORDER }
    )
    if (lastError) err.cause = lastError
    throw err
  }

  const probeFn = typeof options.probe === "function" ? options.probe : probeCdp
  let lastProbe
  for (const provider of AUTO_ORDER) {
    if (provider === PROVIDERS.ASIDE) {
      const probe = await probeAside(options)
      if (probe.ok) {
        const browser = await connectAside(options)
        return { provider, cdpUrl: null, browser }
      }
      lastProbe = probe
      continue
    }
    const cdpUrl = resolveCdpUrl(provider)
    const probe = await probeFn(cdpUrl, options)
    if (probe.ok) {
      const browser = await connectFn(cdpUrl, options)
      return { provider, cdpUrl, browser }
    }
    lastProbe = probe
  }
  throw createUnavailableError(
    "Browser runtime is unavailable for auto provider (tried BrowserOS, Aside Browser, then Chrome CDP).",
    { order: AUTO_ORDER, probe: lastProbe }
  )
}

async function connect(options = {}) {
  const provider = normalizeProvider(options.provider)
  if (provider === PROVIDERS.AUTO) {
    return connectAuto(options)
  }
  return connectSingle(provider, options)
}

module.exports = {
  PROVIDERS,
  DEFAULT_BROWSEROS_CDP_URL,
  DEFAULT_CHROME_CDP_URL,
  AUTO_ORDER,
  normalizeProvider,
  isKnownProvider,
  resolveCdpUrl,
  probeCdp,
  connect
}
