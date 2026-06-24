function parsePositiveInteger(value, { defaultValue, max = 100 } = {}) {
  if (value == null || value === "") return defaultValue
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new TypeError("value must be a positive integer")
  return Math.min(number, max)
}

module.exports = { parsePositiveInteger }
