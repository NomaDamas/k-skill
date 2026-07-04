"use strict"

const STOP_CODES = Object.freeze({
  MANUAL_HANDOFF: "MANUAL_HANDOFF",
  BLOCKED: "BLOCKED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  CAPTCHA_DETECTED: "CAPTCHA_DETECTED",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  ELECTRONIC_SIGNATURE: "ELECTRONIC_SIGNATURE",
  IRREVERSIBLE_BOUNDARY: "IRREVERSIBLE_BOUNDARY",
  UNAVAILABLE: "UNAVAILABLE",
  PLAYWRIGHT_UNAVAILABLE: "PLAYWRIGHT_UNAVAILABLE",
  UNKNOWN_PROVIDER: "UNKNOWN_PROVIDER"
})

function createBrowserRuntimeError(code, message, details = {}) {
  const error = new Error(message || code)
  error.code = code
  error.details = details
  return error
}

function createManualHandoff(reason, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.MANUAL_HANDOFF, reason || "Manual browser handoff is required.", details)
}

function createUnavailableError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.UNAVAILABLE, message || "Browser runtime provider is unavailable.", details)
}
function createUnknownProviderError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.UNKNOWN_PROVIDER, message || "Unknown browser runtime provider.", details)
}

function createBlockedError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.BLOCKED, message || "Browser automation was blocked by the upstream site.", details)
}

function createAuthRequiredError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.AUTH_REQUIRED, message || "User authentication is required in the browser session.", details)
}

function createCaptchaDetectedError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.CAPTCHA_DETECTED, message || "CAPTCHA or bot-check user intervention is required.", details)
}

function createPaymentRequiredError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.PAYMENT_REQUIRED, message || "A payment step requires user confirmation and handoff.", details)
}

function createElectronicSignatureError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.ELECTRONIC_SIGNATURE, message || "An electronic signature requires user confirmation and handoff.", details)
}

function createIrreversibleBoundaryError(message, details = {}) {
  return createBrowserRuntimeError(STOP_CODES.IRREVERSIBLE_BOUNDARY, message || "Irreversible browser action requires user confirmation and handoff.", details)
}

module.exports = {
  STOP_CODES,
  createBrowserRuntimeError,
  createManualHandoff,
  createUnavailableError,
  createUnknownProviderError,
  createBlockedError,
  createAuthRequiredError,
  createCaptchaDetectedError,
  createPaymentRequiredError,
  createElectronicSignatureError,
  createIrreversibleBoundaryError
}
