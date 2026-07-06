"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const runtime = require("../src")

test("exports Aside, BrowserOS, and Chrome CDP defaults", () => {
  assert.equal(runtime.PROVIDERS.ASIDE, "aside")
  assert.equal(runtime.PROVIDERS.BROWSEROS, "browseros")
  assert.equal(runtime.DEFAULT_BROWSEROS_CDP_URL, "http://127.0.0.1:9100")
  assert.equal(runtime.DEFAULT_CHROME_CDP_URL, "http://127.0.0.1:9222")
})

test("resolves the auto provider by default (BrowserOS, Aside, Chrome CDP order)", () => {
  assert.equal(runtime.normalizeProvider(), "auto")
  assert.equal(runtime.PROVIDERS.AUTO, "auto")
  assert.equal(runtime.resolveCdpUrl("aside"), null)
  assert.equal(runtime.resolveCdpUrl("browseros"), "http://127.0.0.1:9100")
  assert.equal(runtime.resolveCdpUrl("chrome-cdp"), "http://127.0.0.1:9222")
  assert.deepEqual(runtime.AUTO_ORDER, ["browseros", "aside", "chrome-cdp"])
})

test("auto provider prefers BrowserOS when its endpoint probes ok", async () => {
  const probeCalls = []
  const connectCalls = []
  const probe = async (url) => { probeCalls.push(url); return { ok: true, url } }
  const connectLoader = async (url) => { connectCalls.push(url); return { url } }
  const result = await runtime.connect({ provider: "auto", probe, connectLoader })
  assert.equal(result.provider, "browseros")
  assert.equal(result.cdpUrl, "http://127.0.0.1:9100")
  assert.deepEqual(probeCalls, ["http://127.0.0.1:9100"])
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9100"])
})

test("auto provider falls back to Chrome CDP when BrowserOS and Aside probes fail", async () => {
  const probeCalls = []
  const connectCalls = []
  const probe = async (url) => { probeCalls.push(url); return { ok: /9222/.test(url), url } }
  const asideProbe = async () => { probeCalls.push("aside"); return { ok: false } }
  const connectLoader = async (url) => { connectCalls.push(url); return { url } }
  const result = await runtime.connect({ provider: "auto", probe, asideProbe, connectLoader })
  assert.equal(result.provider, "chrome-cdp")
  assert.equal(result.cdpUrl, "http://127.0.0.1:9222")
  assert.deepEqual(probeCalls, ["http://127.0.0.1:9100", "aside", "http://127.0.0.1:9222"])
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9222"])
})

test("auto provider prefers Aside before Chrome CDP when BrowserOS is unavailable", async () => {
  const probeCalls = []
  const connectCalls = []
  const probe = async (url) => { probeCalls.push(url); return { ok: false, url } }
  const asideProbe = async () => { probeCalls.push("aside"); return { ok: true } }
  const connectLoader = async (url) => { connectCalls.push(url); return { url } }
  const asideConnectLoader = async () => { connectCalls.push("aside"); return { aside: true } }
  const result = await runtime.connect({ provider: "auto", probe, asideProbe, connectLoader, asideConnectLoader })
  assert.equal(result.provider, "aside")
  assert.equal(result.cdpUrl, null)
  assert.deepEqual(probeCalls, ["http://127.0.0.1:9100", "aside"])
  assert.deepEqual(connectCalls, ["aside"])
  assert.equal(result.browser.aside, true)
})

test("explicit Aside provider uses the Aside adapter without a CDP URL", async () => {
  const probeCalls = []
  const connectCalls = []
  const asideProbe = async () => { probeCalls.push("aside"); return { ok: true } }
  const asideConnectLoader = async () => { connectCalls.push("aside"); return { aside: true } }
  const result = await runtime.connect({ provider: "aside", asideProbe, asideConnectLoader })
  assert.equal(result.provider, "aside")
  assert.equal(result.cdpUrl, null)
  assert.deepEqual(probeCalls, ["aside"])
  assert.deepEqual(connectCalls, ["aside"])
  assert.equal(result.browser.aside, true)
})

test("explicit Aside provider fails closed when the Aside probe fails", async () => {
  await assert.rejects(
    () => runtime.connect({ provider: "aside", asideProbe: async () => ({ ok: false }) }),
    (err) => err.code === "UNAVAILABLE" && /Aside Browser provider/.test(err.message)
  )
})

test("auto provider with probe:false connects to BrowserOS, then Aside, then Chrome CDP", async () => {
  const connectCalls = []
  const connectLoader = async (url) => {
    connectCalls.push(url)
    if (/9100/.test(url)) throw new Error("browseros not running")
    if (/9222/.test(url)) return { url }
    throw new Error(`unexpected CDP URL ${url}`)
  }
  const asideConnectLoader = async () => {
    connectCalls.push("aside")
    throw new Error("aside not running")
  }
  const result = await runtime.connect({ provider: "auto", probe: false, connectLoader, asideConnectLoader })
  assert.equal(result.provider, "chrome-cdp")
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9100", "aside", "http://127.0.0.1:9222"])
})

test("auto provider with probe:false uses Aside before Chrome CDP when BrowserOS fails", async () => {
  const connectCalls = []
  const connectLoader = async (url) => {
    connectCalls.push(url)
    if (/9100/.test(url)) throw new Error("browseros not running")
    return { url }
  }
  const asideConnectLoader = async () => { connectCalls.push("aside"); return { aside: true } }
  const result = await runtime.connect({ provider: "auto", probe: false, connectLoader, asideConnectLoader })
  assert.equal(result.provider, "aside")
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9100", "aside"])
  assert.equal(result.browser.aside, true)
})

test("auto provider with probe:false falls through to Chrome CDP when Aside CLI is missing", async () => {
  const connectCalls = []
  const connectLoader = async (url) => {
    connectCalls.push(url)
    if (/9100/.test(url)) throw new Error("browseros not running")
    return { url }
  }
  const result = await runtime.connect({
    provider: "auto",
    probe: false,
    asideCommand: "/definitely/missing/k-skill-aside",
    asideTimeoutMs: 100,
    connectLoader
  })
  assert.equal(result.provider, "chrome-cdp")
  assert.equal(result.cdpUrl, "http://127.0.0.1:9222")
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9100", "http://127.0.0.1:9222"])
})

test("Aside context waitForEvent('page') resolves newly opened browser tabs", async () => {
  const responses = [
    ["existing-tab"],
    [
      { targetId: "existing-tab", url: "https://example.com/", title: "Example", active: false },
      { targetId: "popup-tab", url: "https://example.com/popup", title: "Popup", active: true }
    ]
  ]
  const context = new runtime.AsideContext({
    asideReplRunner: async () => responses.shift()
  })
  const page = await context.waitForEvent("page", { timeout: 1000 })
  assert.equal(page.targetId, "popup-tab")
  assert.equal(page.url(), "https://example.com/popup")
  assert.equal(context.pages().includes(page), true)
})

test("Aside page goto tracks only the newly opened tab as owned", async () => {
  let capturedCode = ""
  const page = new runtime.AsidePage({
    asideReplRunner: async (code) => {
      capturedCode = code
      return { targetId: "new-tab", url: "https://example.com/", title: "Example Domain" }
    }
  })
  await page.goto("https://example.com/")
  assert.equal(page.targetId, "new-tab")
  assert.match(capturedCode, /const beforeTargetIds = new Set/)
  assert.match(capturedCode, /!beforeTargetIds\.has\(candidate\.targetId\)/)
  assert.doesNotMatch(capturedCode, /candidate\.url === currentUrl/)
  assert.doesNotMatch(capturedCode, /candidate\.active/)
})

test("Aside REPL session queue recovers after a failed command", async () => {
  const calls = []
  const session = new runtime.AsideReplSession()
  session.runNow = async (code) => {
    calls.push(code)
    if (code === "fail") throw new Error("first command failed")
    return { ok: true, code }
  }
  await assert.rejects(() => session.run("fail"), /first command failed/)
  const result = await session.run("cleanup")
  assert.deepEqual(result, { ok: true, code: "cleanup" })
  assert.deepEqual(calls, ["fail", "cleanup"])
})

test("auto provider throws UNAVAILABLE when neither BrowserOS nor Chrome CDP is reachable", async () => {
  await assert.rejects(
    () => runtime.connect({
      provider: "auto",
      probe: async () => ({ ok: false }),
      asideProbe: async () => ({ ok: false }),
      connectLoader: async () => ({})
    }),
    (err) => err.code === "UNAVAILABLE" && /auto provider/.test(err.message)
  )
})

test("exports stop-rule errors with stable codes", () => {
  assert.equal(runtime.createManualHandoff("handoff").code, "MANUAL_HANDOFF")
  assert.equal(runtime.createUnavailableError("missing").code, "UNAVAILABLE")
  assert.equal(runtime.createBlockedError("blocked").code, "BLOCKED")
  assert.equal(runtime.createAuthRequiredError("auth").code, "AUTH_REQUIRED")
  assert.equal(runtime.createCaptchaDetectedError("captcha").code, "CAPTCHA_DETECTED")
  assert.equal(runtime.createPaymentRequiredError("payment").code, "PAYMENT_REQUIRED")
  assert.equal(runtime.createElectronicSignatureError("esign").code, "ELECTRONIC_SIGNATURE")
  assert.equal(runtime.createIrreversibleBoundaryError("submit").code, "IRREVERSIBLE_BOUNDARY")
})

test("runner does nothing when no caller-supplied steps exist", async () => {
  const result = await runtime.runJob({ steps: [] })
  assert.deepEqual(result, { status: "no-steps", results: [] })
})

test("automation page ownership tracks actual created resources", async () => {
  const existingPage = { closeCalled: false, async close() { this.closeCalled = true } }
  const existingContext = {
    closeCalled: false,
    pages() { return [existingPage] },
    async newPage() { throw new Error("should not create page when reusing default context") },
    async close() { this.closeCalled = true }
  }
  const browser = {
    contexts() { return [existingContext] }
  }

  const session = await runtime.getAutomationPage(browser, { reuseDefaultContext: true })
  assert.equal(session.context, existingContext)
  assert.equal(session.page, existingPage)
  assert.equal(session.ownsContext, false)
  assert.equal(session.ownsPage, false)
  await runtime.cleanupAutomationPage(session)
  assert.equal(existingPage.closeCalled, false)
  assert.equal(existingContext.closeCalled, false)
})

test("automation page marks newly created context and page as owned", async () => {
  const createdPage = { closeCalled: false, async close() { this.closeCalled = true } }
  const createdContext = {
    closeCalled: false,
    pages() { return [] },
    async newPage() { return createdPage },
    async close() { this.closeCalled = true }
  }
  const browser = {
    contexts() { return [] },
    async newContext() { return createdContext }
  }

  const session = await runtime.getAutomationPage(browser)
  assert.equal(session.ownsContext, true)
  assert.equal(session.ownsPage, true)
  await runtime.cleanupAutomationPage(session)
  assert.equal(createdPage.closeCalled, true)
  assert.equal(createdContext.closeCalled, true)
})

test("disconnectBrowser disconnects BrowserOS clients or closes Playwright CDP connections", async () => {
  const connected = { disconnected: false, async disconnect() { this.disconnected = true } }
  await runtime.disconnectBrowser(connected)
  assert.equal(connected.disconnected, true)

  const closeOnly = { closed: false, async close() { this.closed = true } }
  await runtime.disconnectBrowser(closeOnly)
  assert.equal(closeOnly.closed, true)
})

test("connect fails closed with UNKNOWN_PROVIDER on unknown provider", async () => {
  await assert.rejects(
    () => runtime.connect({ provider: "firefox", probe: false, connectLoader: async () => ({}) }),
    (err) => err.code === "UNKNOWN_PROVIDER" && /firefox/.test(err.message)
  )
  assert.equal(runtime.isKnownProvider("aside"), true)
  assert.equal(runtime.isKnownProvider("browseros"), true)
  assert.equal(runtime.isKnownProvider("chrome-cdp"), true)
  assert.equal(runtime.isKnownProvider("firefox"), false)
})

test("connect resolves chrome-cdp default URL and forwards to injected loaders", async () => {
  const probeCalls = []
  const connectCalls = []
  const probe = async (url) => { probeCalls.push(url); return { ok: true, url, version: { Browser: "Chrome" } } }
  const connectLoader = async (url) => { connectCalls.push(url); return { connected: true, url } }
  const result = await runtime.connect({ provider: "chrome-cdp", probe, connectLoader })
  assert.equal(result.provider, "chrome-cdp")
  assert.equal(result.cdpUrl, "http://127.0.0.1:9222")
  assert.deepEqual(probeCalls, ["http://127.0.0.1:9222"])
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9222"])
  assert.equal(result.browser.connected, true)
})

test("connect uses default BrowserOS URL with injected probe and connect loaders", async () => {
  const probeCalls = []
  const connectCalls = []
  const probe = async (url) => { probeCalls.push(url); return { ok: true, url } }
  const connectLoader = async (url) => { connectCalls.push(url); return { url } }
  const result = await runtime.connect({ probe, connectLoader })
  assert.equal(result.provider, "browseros")
  assert.equal(result.cdpUrl, "http://127.0.0.1:9100")
  assert.deepEqual(probeCalls, ["http://127.0.0.1:9100"])
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9100"])
})

test("connect surfaces probe failure as UNAVAILABLE without calling connectLoader", async () => {
  let connectCalled = false
  const probe = async () => ({ ok: false, cause: new Error("connection refused") })
  await assert.rejects(
    () => runtime.connect({
      probe,
      asideProbe: async () => ({ ok: false }),
      connectLoader: async () => { connectCalled = true; return {} }
    }),
    (err) => err.code === "UNAVAILABLE" && /unavailable/.test(err.message)
  )
  assert.equal(connectCalled, false)
})

test("connect skips probe when probe is false and still calls connectLoader", async () => {
  // With probe:false the default probeCdp (which would hit the network and fail against
  // 127.0.0.1:9100) is skipped, so reaching connectLoader proves the skip.
  const connectCalls = []
  const result = await runtime.connect({
    probe: false,
    connectLoader: async (url) => { connectCalls.push(url); return { url, ok: true } }
  })
  assert.deepEqual(connectCalls, ["http://127.0.0.1:9100"])
  assert.equal(result.browser.ok, true)
})

test("loadChromium uses injected loader and caches the resolved chromium", async () => {
  runtime.resetChromiumCacheForTests()
  let calls = 0
  const fakeChromium = { connectOverCDP() {} }
  const first = await runtime.loadChromium(async () => { calls++; return fakeChromium })
  const second = await runtime.loadChromium(async () => { throw new Error("loader must not run again") })
  assert.equal(first, fakeChromium)
  assert.equal(second, fakeChromium)
  assert.equal(calls, 1)
  runtime.resetChromiumCacheForTests()
})

test("connectOverCDP delegates to injected chromiumLoader with the cdpUrl", async () => {
  runtime.resetChromiumCacheForTests()
  const received = {}
  const fakeChromium = {
    async connectOverCDP(url) { received.url = url; return { connected: true, url } }
  }
  const browser = await runtime.connectOverCDP("http://127.0.0.1:9100", {
    chromiumLoader: async () => fakeChromium
  })
  assert.equal(browser.connected, true)
  assert.equal(received.url, "http://127.0.0.1:9100")
  runtime.resetChromiumCacheForTests()
})
