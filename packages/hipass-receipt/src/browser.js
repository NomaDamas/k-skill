const fs = require("node:fs")
const path = require("node:path")

const runtime = require("k-skill-browser-runtime")
const { PROVIDERS } = runtime

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

function resolveHipassProvider(options = {}) {
  if (options.provider) {
    return String(options.provider).trim()
  }
  if (process.env.KSKILL_BROWSER_PROVIDER) {
    return String(process.env.KSKILL_BROWSER_PROVIDER).trim()
  }
  // An explicit --cdp-url points at a specific browser the user launched (Chrome
  // via `hipass-receipt chrome-command`), so target it directly. Otherwise use the
  // recommended default: prefer a user-launched BrowserOS session, fall back to Chrome CDP.
  if (options.cdpUrl) {
    return PROVIDERS.CHROME_CDP
  }
  return PROVIDERS.AUTO
}

async function connectToChrome(options = {}) {
  const connectOptions = {
    provider: resolveHipassProvider(options),
    probe: options.probe === undefined ? false : options.probe
  }
  if (options.cdpUrl) {
    connectOptions.cdpUrl = options.cdpUrl
  }
  if (typeof options.connectLoader === "function") {
    connectOptions.connectLoader = options.connectLoader
  }
  if (typeof options.chromiumLoader === "function") {
    connectOptions.chromiumLoader = options.chromiumLoader
  }
  const { browser } = await runtime.connect(connectOptions)
  return browser
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
  try {
    await runtime.disconnectBrowser(browser)
  } catch {
    // The runtime refuses to close a user-owned browser that lacks disconnect()
    // (e.g. a Playwright CDP Browser). That refusal preserves the logged-in
    // Chrome session; connection cleanup is left to process exit / GC for the
    // chrome-cdp case. BrowserOS clients expose disconnect() and clean up here.
  }
}

async function listUsageHistory(options = {}) {
  const browser = await connectToChrome(options)
  try {
    const { page } = await runtime.getAutomationPage(browser, { reuseDefaultContext: true })
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
    const { page, context } = await runtime.getAutomationPage(browser, { reuseDefaultContext: true })
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
