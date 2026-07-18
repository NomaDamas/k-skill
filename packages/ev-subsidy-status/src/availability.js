"use strict"

function classifyAvailability(note, remainingCount) {
  const text = String(note || "").replace(/\s+/g, " ").trim()
  const basis = []
  const warnings = []

  const closedPattern = /(마감|소진|접수\s*종료|신청\s*종료)/
  const scheduledPattern = /(접수\s*예정|추경.{0,12}예정|추가\s*공고.{0,12}예정|재공고.{0,12}예정)/
  const openPattern = /(접수\s*중|신청\s*기간|접수\s*기간|신청\s*가능)/

  if (closedPattern.test(text)) basis.push("note:closed")
  if (scheduledPattern.test(text)) basis.push("note:scheduled")
  if (openPattern.test(text)) basis.push("note:open")

  let label = "unknown"
  if (closedPattern.test(text)) label = "closed"
  else if (scheduledPattern.test(text)) label = "scheduled"
  else if (openPattern.test(text)) label = "open"
  else if (Number.isFinite(remainingCount) && remainingCount > 0) {
    label = "unknown_with_remaining_count"
    basis.push("remaining_count:positive")
  }

  if (label === "closed" && Number.isFinite(remainingCount) && remainingCount > 0) {
    warnings.push("출고잔여대수는 양수지만 지자체 비고에는 마감 또는 소진으로 표시됩니다.")
  }

  return { label, basis, warnings }
}

module.exports = { classifyAvailability }
