function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

function cleanText(value) {
  return stripTags(value).replace(/\s+/g, " ").trim()
}

function toWonNumber(value) {
  const digits = String(value || "").replace(/[^\d-]/g, "")
  if (!digits) {
    return 0
  }

  const amount = Number(digits)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeDate(value, label) {
  const digits = String(value || "").replace(/\D/g, "")

  if (digits.length !== 8) {
    throw new Error(`${label} must be an 8-digit YYYYMMDD date. Received: ${value}`)
  }

  return digits
}

function readAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i")
  const match = String(tag || "").match(pattern)
  return match ? decodeHtml(match[2]).trim() : ""
}

function extractTitle(html) {
  const match = String(html || "").match(/<title>([\s\S]*?)<\/title>/i)
  return match ? cleanText(match[1]) : ""
}

module.exports = {
  cleanText,
  decodeHtml,
  extractTitle,
  normalizeDate,
  readAttribute,
  stripTags,
  toWonNumber
}
