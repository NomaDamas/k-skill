"use strict"

const { createBrowserRuntimeError, STOP_CODES } = require("./stop-rules")

const CDP_MODULE_NAMES = Object.freeze(["playwright-core", "playwright", "rebrowser-playwright"])

let cachedChromium = null

async function loadChromium(loaderImpl) {
  if (cachedChromium) return cachedChromium
  if (typeof loaderImpl === "function") {
    cachedChromium = await loaderImpl()
    return cachedChromium
  }

  let lastError
  for (const moduleName of CDP_MODULE_NAMES) {
    try {
      const loaded = require(moduleName)
      const chromium = loaded.chromium || (loaded.default && loaded.default.chromium)
      if (chromium) {
        cachedChromium = chromium
        return cachedChromium
      }
    } catch (error) {
      lastError = error
    }
  }

  const error = createBrowserRuntimeError(
    STOP_CODES.PLAYWRIGHT_UNAVAILABLE,
    "Browser CDP runtime requires playwright-core, playwright, or rebrowser-playwright in the consuming environment.",
    { moduleNames: CDP_MODULE_NAMES }
  )
  if (lastError) error.cause = lastError
  throw error
}

async function connectOverCDP(cdpUrl, options = {}) {
  const chromium = await loadChromium(options.chromiumLoader)
  return chromium.connectOverCDP(cdpUrl)
}

function resetChromiumCacheForTests() {
  cachedChromium = null
}

module.exports = {
  CDP_MODULE_NAMES,
  loadChromium,
  connectOverCDP,
  resetChromiumCacheForTests
}
