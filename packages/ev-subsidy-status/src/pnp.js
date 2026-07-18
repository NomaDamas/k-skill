"use strict"

const { createError } = require("./errors")

const PNP_SCRIPT_PATTERN = /<script[^>]+name=['"]pnp4web['"][^>]+src=['"]([^'"]+)['"]/i
const PROTECTED_PAYLOAD_PATTERN = /onload=['"][^'"]*_0xac\(["']?([A-Za-z0-9+/=]+)["']?\)/i

function decodeJavascriptString(value) {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
}

function parsePnpAlphabets(source) {
  const arrayMatch = source.match(/var In=\[([\s\S]*?)\],zn=/) ||
    source.match(/var In=Array\(([\s\S]*?)\),zn=/)
  if (!arrayMatch) {
    throw createError("UPSTREAM_DECODE_FAILED", "pnp4web 문자표를 찾지 못했습니다.")
  }

  const fragments = []
  const stringPattern = /"((?:\\.|[^"\\])*)"/g
  let stringMatch
  while ((stringMatch = stringPattern.exec(arrayMatch[1]))) {
    fragments.push(decodeJavascriptString(stringMatch[1]))
  }
  if (!fragments.length) {
    throw createError("UPSTREAM_DECODE_FAILED", "pnp4web 문자표가 비어 있습니다.")
  }

  const alphabets = []
  for (let index = 0; index <= 6; index += 1) {
    const expressionMatch = source.match(new RegExp(`o${index}:([^,}]+)`))
    if (!expressionMatch) {
      throw createError("UPSTREAM_DECODE_FAILED", `pnp4web o${index} 문자표를 찾지 못했습니다.`)
    }
    const fragmentIndexes = Array.from(expressionMatch[1].matchAll(/In\[(\d+)\]/g), (match) => Number(match[1]))
    const alphabet = fragmentIndexes.map((fragmentIndex) => fragments[fragmentIndex]).join("")
    if (alphabet.length < 64) {
      throw createError("UPSTREAM_DECODE_FAILED", `pnp4web o${index} 문자표 길이가 올바르지 않습니다.`)
    }
    alphabets.push(alphabet)
  }
  return alphabets
}

function decodePnpPayload(payload, alphabets) {
  if (typeof payload !== "string" || payload.length < 3) {
    throw createError("UPSTREAM_DECODE_FAILED", "보호된 본문 payload가 비어 있습니다.")
  }
  const alphabetIndex = Number(payload[0])
  const rotation = Number(payload[1])
  const baseAlphabet = alphabets[alphabetIndex]
  if (!baseAlphabet || !Number.isInteger(rotation)) {
    throw createError("UPSTREAM_DECODE_FAILED", "보호된 본문의 문자표 식별자가 올바르지 않습니다.")
  }

  const alphabet = baseAlphabet.slice(rotation) + baseAlphabet.slice(0, rotation)
  const encoded = payload.slice(2).replace(/[^A-Za-z0-9+/=]/g, "")
  const bytes = []
  for (let offset = 0; offset < encoded.length;) {
    const a = alphabet.indexOf(encoded[offset++])
    const b = alphabet.indexOf(encoded[offset++])
    const c = alphabet.indexOf(encoded[offset++])
    const d = alphabet.indexOf(encoded[offset++])
    if (a < 0 || b < 0) break
    bytes.push((a << 2) | (b >> 4))
    if (c >= 0 && c !== 64) {
      bytes.push(((b & 15) << 4) | (c >> 2))
      if (d >= 0 && d !== 64) bytes.push(((c & 3) << 6) | d)
    }
  }
  return Buffer.from(bytes)
}

function extractPnpScriptUrl(shellHtml, baseUrl) {
  const match = shellHtml.match(PNP_SCRIPT_PATTERN)
  if (!match) throw createError("UPSTREAM_DECODE_FAILED", "pnp4web 스크립트 URL을 찾지 못했습니다.")
  return new URL(match[1], baseUrl).toString()
}

function extractProtectedPayload(shellHtml) {
  const match = shellHtml.match(PROTECTED_PAYLOAD_PATTERN)
  if (!match) throw createError("UPSTREAM_DECODE_FAILED", "보호된 공식 페이지 본문을 찾지 못했습니다.")
  return match[1]
}

function decodeProtectedHtml(shellHtml, pnpSource) {
  if (!/<meta[^>]+name=['"]penc['"]/i.test(shellHtml)) return shellHtml
  const payload = extractProtectedPayload(shellHtml)
  return decodePnpPayload(payload, parsePnpAlphabets(pnpSource)).toString("utf8")
}

module.exports = {
  decodePnpPayload,
  decodeProtectedHtml,
  extractPnpScriptUrl,
  extractProtectedPayload,
  parsePnpAlphabets
}
