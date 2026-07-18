"use strict"

class EvSubsidyError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = "EvSubsidyError"
    this.code = code
    this.details = details
  }
}

function createError(code, message, details) {
  return new EvSubsidyError(code, message, details)
}

function wrapBrowserError(error) {
  if (error instanceof EvSubsidyError) return error
  const sourceCode = error && error.code
  const code = sourceCode === "CAPTCHA_DETECTED"
    ? "CAPTCHA_DETECTED"
    : sourceCode === "AUTH_REQUIRED"
      ? "AUTH_REQUIRED"
      : sourceCode === "UNKNOWN_PROVIDER"
        ? "BROWSER_UNAVAILABLE"
        : sourceCode === "UNAVAILABLE" || sourceCode === "PLAYWRIGHT_UNAVAILABLE"
          ? "BROWSER_UNAVAILABLE"
          : "UPSTREAM_FAILED"
  const wrapped = createError(code, error && error.message ? error.message : String(error), {
    upstream_code: sourceCode || null
  })
  wrapped.cause = error
  return wrapped
}

module.exports = {
  EvSubsidyError,
  createError,
  wrapBrowserError
}
