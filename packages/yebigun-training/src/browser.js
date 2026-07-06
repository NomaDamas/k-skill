const fs = require("node:fs")
const path = require("node:path")

const { APPLICATION_MENUS, BASE_URL, HOME_URL, TRAINING_INFO_URL, VIEW_MENUS } = require("./menus")
const { parseGenericTable, parseInquiry } = require("./inquiry")
const { inspectYebigunPage, parseTrainingInfo } = require("./parse")
const { contentWithRetry, openApplicationMenuPage } = require("./open-menu")

function resolveChromePath(explicitPath) {
  if (explicitPath) {
    return explicitPath
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

function shellQuote(value) {
  return `"${String(value).replace(/["\\$`]/g, "\\$&")}"`
}

function buildChromeLaunchCommand(options = {}) {
  const chromePath = resolveChromePath(options.chromePath)
  const profileDir = options.profileDir || path.join(process.env.HOME || "~", ".cache", "k-skill", "yebigun-chrome")
  const debuggingPort = Number(options.debuggingPort || 9222)
  const extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : []

  const args = [
    `--user-data-dir=${shellQuote(profileDir)}`,
    `--remote-debugging-port=${debuggingPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...extraArgs,
    HOME_URL
  ]

  return `${shellQuote(chromePath)} ${args.join(" ")}`
}

async function loadChromium() {
  for (const moduleName of ["playwright-core", "playwright"]) {
    try {
      const loaded = require(moduleName)
      if (loaded.chromium) {
        return loaded.chromium
      }
    } catch {
      // ignore and try the next module name
    }
  }

  throw new Error(
    "playwright-core or playwright is required for live browser-session automation. Install one of them in the environment that uses yebigun-training.",
  )
}

async function connectToChrome(options = {}) {
  const chromium = await loadChromium()
  return chromium.connectOverCDP(options.cdpUrl || "http://127.0.0.1:9222")
}

async function getAutomationPage(browser) {
  const context = browser.contexts()[0] || (await browser.newContext())
  const existingPage = context.pages()[0]
  const page = existingPage || (await context.newPage())
  return { context, page }
}

function resolveTargetUrl(targetPath) {
  if (!targetPath) {
    return HOME_URL
  }
  if (/^https?:\/\//i.test(targetPath)) {
    return targetPath
  }
  return `${BASE_URL}${targetPath.startsWith("/") ? "" : "/"}${targetPath}`
}

/**
 * Generic page-discovery helper: navigates to `targetPath` (relative to
 * BASE_URL, or an absolute URL) on the page's already-authenticated session
 * and returns enough information to figure out the real page structure.
 * This is the v1 building block for Phase 2 (live discovery with the user).
 */
async function inspectPage(options = {}) {
  const browser = await connectToChrome(options)
  try {
    const { page } = await getAutomationPage(browser)
    const targetUrl = resolveTargetUrl(options.path)
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" })
    const html = await page.content()
    const url = page.url()
    const title = await page.title().catch(() => null)
    const pageInfo = inspectYebigunPage({ url, html })

    return { url, title, html, pageInfo }
  } finally {
    await closeBrowserConnection(browser)
  }
}

/**
 * Fetches and parses the "나의 훈련정보" page (IvdTraScheDetail.do) on the
 * already-authenticated session: this year's training, prior years found on
 * the same page, and a ready-made comparison against last year.
 */
async function fetchTrainingInfo(options = {}) {
  const browser = await connectToChrome(options)
  try {
    const { page } = await getAutomationPage(browser)
    const targetUrl = options.path ? resolveTargetUrl(options.path) : TRAINING_INFO_URL
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" })
    const html = await page.content()
    const url = page.url()
    const pageInfo = inspectYebigunPage({ url, html })

    if (pageInfo.reloginRequired) {
      throw new Error("yebigun1.mil.kr session is not authenticated or has expired. Ask the user to log in again in the same Chrome profile.")
    }

    return { url, ...parseTrainingInfo(html) }
  } finally {
    await closeBrowserConnection(browser)
  }
}

const LOADING_PLACEHOLDER_PATTERN = /^Loading\.\.\.$/i

/**
 * Several VIEW_MENUS list pages render a "Loading..." placeholder row in the
 * initial HTML and fill in real rows via a follow-up AJAX call after
 * domcontentloaded. Polls page.content() until that placeholder is gone (or
 * gives up after `attempts`) instead of returning the placeholder as if it
 * were real data.
 */
async function waitForTableData(page, attempts = 15, intervalMs = 300) {
  let html = await contentWithRetry(page)
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { rows } = parseGenericTable(html)
    const stillLoading = rows.length > 0 && rows.every((cells) => cells.length === 1 && LOADING_PLACEHOLDER_PATTERN.test(cells[0]))
    if (!stillLoading) {
      return { html, stillLoading: false }
    }
    await page.waitForTimeout(intervalMs)
    html = await contentWithRetry(page)
  }
  return { html, stillLoading: true }
}

/**
 * Fetches and parses one VIEW_MENUS list page: generic headers+rows table,
 * read-only. Never visits an APPLICATION_MENUS entry — those are
 * navigation-only by design and have their own function.
 */
async function fetchInquiry(menu, options = {}) {
  const menuDef = VIEW_MENUS[menu]
  if (!menuDef) {
    throw new Error(`Unknown view menu "${menu}". Valid options: ${Object.keys(VIEW_MENUS).join(", ")}`)
  }

  const browser = await connectToChrome(options)
  try {
    const { page } = await getAutomationPage(browser)
    await page.goto(resolveTargetUrl(menuDef.path), { waitUntil: "domcontentloaded" })
    const { html, stillLoading } = await waitForTableData(page)
    const url = page.url()

    if (stillLoading) {
      throw new Error(`"${menuDef.label}" list did not finish loading in time. Try \`view\` again, or re-check with \`inspect\` if this keeps happening.`)
    }

    return { url, ...parseInquiry(menu, menuDef.label, html, url) }
  } finally {
    await closeBrowserConnection(browser)
  }
}

async function openApplicationMenu(menu, options = {}) {
  if (!APPLICATION_MENUS[menu]) {
    throw new Error(`Unknown menu "${menu}". Valid options: ${Object.keys(APPLICATION_MENUS).join(", ")}`)
  }

  const browser = await connectToChrome(options)
  try {
    const { page } = await getAutomationPage(browser)
    return await openApplicationMenuPage(page, menu)
  } finally {
    await closeBrowserConnection(browser)
  }
}

async function closeBrowserConnection(browser) {
  if (!browser || typeof browser.close !== "function") {
    return
  }

  await browser.close().catch(() => {})
}

module.exports = {
  buildChromeLaunchCommand,
  connectToChrome,
  fetchInquiry,
  fetchTrainingInfo,
  getAutomationPage,
  inspectPage,
  openApplicationMenu,
  closeBrowserConnection,
  resolveTargetUrl
}
