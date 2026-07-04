"use strict"

async function getAutomationPage(browser, options = {}) {
  const contexts = typeof browser.contexts === "function" ? browser.contexts() : []
  const reuseDefaultContext = options.reuseDefaultContext === true
  let context
  let ownsContext = false

  if (reuseDefaultContext && contexts[0]) {
    context = contexts[0]
  } else if (typeof browser.newContext === "function") {
    context = await browser.newContext(options.contextOptions || {})
    ownsContext = true
  } else if (contexts[0]) {
    context = contexts[0]
  }

  if (!context) {
    throw new Error("Connected browser does not expose an automation context.")
  }

  const existingPages = typeof context.pages === "function" ? context.pages() : []
  let page
  let ownsPage = false

  if (reuseDefaultContext && existingPages[0]) {
    page = existingPages[0]
  } else {
    page = await context.newPage()
    ownsPage = true
  }

  return {
    context,
    page,
    ownsContext,
    ownsPage
  }
}

async function cleanupAutomationPage(session) {
  if (!session) return
  if (session.ownsPage && session.page && typeof session.page.close === "function") {
    await session.page.close().catch(() => {})
  }
  if (session.ownsContext && session.context && typeof session.context.close === "function") {
    await session.context.close().catch(() => {})
  }
}

async function disconnectBrowser(browser) {
  if (!browser) return
  if (typeof browser.disconnect === "function") {
    await browser.disconnect()
    return
  }
  throw new Error("Connected browser does not expose disconnect(); refusing to close a potentially user-owned browser.")
}

module.exports = {
  getAutomationPage,
  cleanupAutomationPage,
  disconnectBrowser
}
