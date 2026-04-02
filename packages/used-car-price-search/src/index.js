const {
  SK_DIRECT_USED_CAR_URL,
  filterCarsByQuery,
  normalizeUsedCarInventory,
  summarizeMatches
} = require("./parse")

const DEFAULT_BROWSER_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko,en-US;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
}

async function requestText(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.")
  }

  const response = await fetchImpl(url, {
    headers: {
      ...DEFAULT_BROWSER_HEADERS,
      ...(options.headers || {})
    },
    signal: options.signal
  })

  if (!response.ok) {
    throw new Error(`SK direct request failed with ${response.status} for ${url}`)
  }

  return response.text()
}

async function fetchUsedCarInventory(options = {}) {
  const html = await requestText(options.url || SK_DIRECT_USED_CAR_URL, options)
  const inventory = normalizeUsedCarInventory(html)

  return {
    ...inventory,
    fetchedAt: new Date().toISOString()
  }
}

async function lookupUsedCarPrices(query, options = {}) {
  const limit = Number(options.limit || 10)
  const inventory = await fetchUsedCarInventory(options)
  const matches = filterCarsByQuery(inventory.items, query).slice(0, limit)

  return {
    provider: inventory.provider,
    fetchedAt: inventory.fetchedAt,
    query: String(query || "").trim(),
    totalInventory: inventory.total,
    matchedCount: matches.length,
    summary: summarizeMatches(matches),
    items: matches
  }
}

module.exports = {
  fetchUsedCarInventory,
  lookupUsedCarPrices
}
