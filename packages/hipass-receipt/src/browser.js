const fs = require("node:fs")
const path = require("node:path")

const {
  HIPASS_ENDPOINTS,
  USAGE_HISTORY_INIT_URL,
  buildUsageHistoryQuery,
  inspectHipassPage,
  parseUsageHistoryList
} = require("./parse")

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
  const profileDir = options.profileDir || path.join(process.env.HOME || "~", ".cache", "k-skill", "hipass-chrome")
  const debuggingPort = Number(options.debuggingPort || 9222)
  const extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : []

  const args = [
    `--user-data-dir=${shellQuote(profileDir)}`,
    `--remote-debugging-port=${debuggingPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...extraArgs,
    HIPASS_ENDPOINTS.loginPage
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
    "playwright-core or playwright is required for live browser-session automation. Install one of them in the environment that uses hipass-receipt.",
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

async function gotoUsageHistoryPage(page) {
  await page.goto(USAGE_HISTORY_INIT_URL, { waitUntil: "domcontentloaded" })
  const info = inspectHipassPage(await page.content())

  if (info.reloginRequired) {
    throw new Error("Hi-Pass session is not authenticated or has expired. Ask the user to log in again in the same Chrome profile.")
  }

  return info
}

async function submitUsageHistorySearch(page, query) {
  await page.evaluate((submittedQuery) => {
    const form = document.forms.hpForm || document.getElementById("hpForm")
    if (!form) {
      throw new Error("Expected the Hi-Pass usage-history page to expose form hpForm")
    }

    const setFieldValue = (name, value) => {
      const element = form.elements.namedItem(name)
      const stringValue = String(value)

      if (!element) {
        const hidden = document.createElement("input")
        hidden.type = "hidden"
        hidden.name = name
        hidden.value = stringValue
        form.appendChild(hidden)
        return
      }

      if (typeof element.length === "number" && element.tagName == null) {
        Array.from(element).forEach((candidate) => {
          candidate.checked = candidate.value === stringValue
        })
        return
      }

      element.value = stringValue
    }

    Object.entries(submittedQuery).forEach(([name, value]) => setFieldValue(name, value))
    form.submit()
  }, query)

  const frame = await waitForUsageHistoryFrame(page)
  await frame.waitForLoadState("domcontentloaded").catch(() => {})
  const html = await frame.content()
  const info = inspectHipassPage(html)

  if (info.reloginRequired) {
    throw new Error("Hi-Pass session expired while loading the usage-history list. Ask the user to log in again.")
  }

  return { frame, html, info }
}

async function waitForUsageHistoryFrame(page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const frame = page.frames().find((candidate) => candidate.name() === "if_main_post")
    if (frame && frame.url() !== "about:blank") {
      return frame
    }
    await page.waitForTimeout(250)
  }

  throw new Error("Timed out waiting for the usage-history iframe (if_main_post) to load")
}

async function closeBrowserConnection(browser) {
  if (!browser || typeof browser.close !== "function") {
    return
  }

  await browser.close().catch(() => {})
}

async function listUsageHistory(options = {}) {
  const browser = await connectToChrome(options)
  try {
    const { page } = await getAutomationPage(browser)
    await gotoUsageHistoryPage(page)
    const query = buildUsageHistoryQuery(options)
    const { html } = await submitUsageHistorySearch(page, query)
    return {
      query,
      ...parseUsageHistoryList(html)
    }
  } finally {
    await closeBrowserConnection(browser)
  }
}

async function openReceiptPopup(options = {}) {
  const browser = await connectToChrome(options)
  try {
    const { page, context } = await getAutomationPage(browser)
    await gotoUsageHistoryPage(page)
    const query = buildUsageHistoryQuery(options)
    const { frame, html } = await submitUsageHistorySearch(page, query)
    const parsed = parseUsageHistoryList(html)
    const rowIndex = Number(options.rowIndex || 1)
    const row = parsed.rows[rowIndex - 1]

    if (!row) {
      throw new Error(`Could not find usage-history row ${rowIndex}`)
    }

    const popupPromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null)
    await frame.locator("table tbody tr").nth(rowIndex - 1).evaluate((element) => {
      const clickable = [...element.querySelectorAll('a,button,input[type="button"],input[type="submit"]')].find((candidate) => {
        const label = (candidate.innerText || candidate.textContent || candidate.value || "").trim()
        return /영수증|출력/.test(label)
      })

      if (!clickable) {
        throw new Error("Could not find a receipt button/link in the selected usage-history row")
      }

      clickable.click()
    })

    const popup = await popupPromise
    if (!popup) {
      return {
        query,
        entry: row,
        popupUrl: null,
        popupTitle: null,
        popupCaptured: false
      }
    }

    await popup.waitForLoadState("domcontentloaded").catch(() => {})

    return {
      query,
      entry: row,
      popupUrl: popup.url(),
      popupTitle: await popup.title().catch(() => null),
      popupCaptured: true
    }
  } finally {
    await closeBrowserConnection(browser)
  }
}

module.exports = {
  buildChromeLaunchCommand,
  connectToChrome,
  listUsageHistory,
  openReceiptPopup
}
