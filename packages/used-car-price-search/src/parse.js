const SK_DIRECT_USED_CAR_URL = "https://www.skdirect.co.kr/tb"
const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/

function extractNextData(html) {
  const source = String(html || "")
  const match = source.match(NEXT_DATA_PATTERN)

  if (!match) {
    throw new Error("Unable to locate SK direct __NEXT_DATA__ inventory payload.")
  }

  return JSON.parse(match[1])
}

function normalizeUsedCarInventory(input) {
  const nextData = typeof input === "string" ? extractNextData(input) : input
  const carList = nextData?.props?.pageProps?.carListProd

  if (!Array.isArray(carList)) {
    throw new Error("Expected carListProd in the SK direct inventory payload.")
  }

  const items = carList.map(normalizeCar).sort(compareCars)

  return {
    provider: {
      name: "SK렌터카 다이렉트 타고BUY",
      siteUrl: SK_DIRECT_USED_CAR_URL,
      inventoryPath: "/tb",
      extraction: "next-data"
    },
    total: items.length,
    items
  }
}

function normalizeCar(raw) {
  const maker = cleanText(raw.carMakerNm)
  const model = cleanText(raw.modeProdNm || raw.cartypeNm)
  const carType = cleanText(raw.cartypeNm)
  const grade = cleanText(raw.carGradeNm)
  const trim = cleanText(raw.crtrClsNm1)
  const color = cleanText(raw.colorNm)
  const displayName = uniqueJoin([maker, model, grade])
  const searchText = uniqueJoin([maker, carType, model, grade, trim, color])

  return {
    id: cleanText(raw.prodId),
    providerProductClass: cleanText(raw.prodClsNm),
    maker,
    model,
    displayName,
    color,
    monthlyPrice: toNumber(raw.realPaymentAmt),
    buyoutPrice: toNumber(raw.tkvAmt),
    buyoutPriceManwon: toManwonRounded(raw.tkvAmt),
    mileageKm: toNumber(raw.travelDtc),
    fuel: cleanText(raw.fuelNm),
    transmission: cleanText(raw.grbxNm),
    seats: toNumber(raw.seaterClsNm),
    registrationYearMonth: toYearMonth(raw.carRegDt),
    modelYear: toNumber(raw.yearType),
    stock: toNumber(raw.prodStock),
    imageUrl: cleanText(raw.repCarImg),
    searchText
  }
}

function summarizeMatches(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  return {
    count: items.length,
    monthlyPriceMin: minValue(items, "monthlyPrice"),
    monthlyPriceMax: maxValue(items, "monthlyPrice"),
    buyoutPriceMin: minValue(items, "buyoutPrice"),
    buyoutPriceMax: maxValue(items, "buyoutPrice"),
    mileageKmMin: minValue(items, "mileageKm"),
    mileageKmMax: maxValue(items, "mileageKm")
  }
}

function filterCarsByQuery(items, query) {
  const queryText = cleanText(query)
  if (!queryText) {
    throw new Error("query is required.")
  }

  const rawTokens = queryText.split(/\s+/).map(normalizeSearchKey).filter(Boolean)
  const fullQueryKey = normalizeSearchKey(queryText)

  return items
    .filter((item) => {
      const haystack = normalizeSearchKey(item.searchText)
      return rawTokens.every((token) => haystack.includes(token))
    })
    .map((item) => ({
      item,
      score: computeMatchScore(item, fullQueryKey, rawTokens)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return compareCars(left.item, right.item)
    })
    .map((entry) => entry.item)
}

function computeMatchScore(item, fullQueryKey, rawTokens) {
  const modelKey = normalizeSearchKey(item.model)
  const displayKey = normalizeSearchKey(item.displayName)
  const haystack = normalizeSearchKey(item.searchText)

  let score = 0

  if (modelKey === fullQueryKey) {
    score += 10
  }

  if (displayKey.includes(fullQueryKey)) {
    score += 5
  }

  if (haystack.includes(fullQueryKey)) {
    score += 3
  }

  score += rawTokens.filter((token) => modelKey.includes(token)).length * 2
  score += rawTokens.filter((token) => displayKey.includes(token)).length

  return score
}

function compareCars(left, right) {
  return (
    compareNumbers(left.buyoutPrice, right.buyoutPrice) ||
    compareNumbers(left.monthlyPrice, right.monthlyPrice) ||
    compareNumbers(left.mileageKm, right.mileageKm) ||
    String(left.displayName).localeCompare(String(right.displayName), "ko")
  )
}

function compareNumbers(left, right) {
  return Number(left || 0) - Number(right || 0)
}

function minValue(items, key) {
  return Math.min(...items.map((item) => Number(item[key] || 0)))
}

function maxValue(items, key) {
  return Math.max(...items.map((item) => Number(item[key] || 0)))
}

function toYearMonth(value) {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length < 6) {
    return ""
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`
}

function toManwonRounded(value) {
  const amount = toNumber(value)
  return amount ? Math.round(amount / 10000) : 0
}

function toNumber(value) {
  const amount = Number(String(value ?? "").replace(/,/g, ""))
  return Number.isFinite(amount) ? amount : 0
}

function normalizeSearchKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function uniqueJoin(parts) {
  return [...new Set(parts.map(cleanText).filter(Boolean))].join(" ")
}

module.exports = {
  SK_DIRECT_USED_CAR_URL,
  extractNextData,
  filterCarsByQuery,
  normalizeUsedCarInventory,
  summarizeMatches
}
