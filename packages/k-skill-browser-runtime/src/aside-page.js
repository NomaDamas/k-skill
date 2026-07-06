"use strict"

const {
  DEFAULT_ASIDE_TIMEOUT_MS,
  markerExpression,
  runAsideRepl
} = require("./aside-repl")
const { AsideFrame, AsideLocator, serializeArg } = require("./aside-locator")

class AsidePage {
  constructor(options = {}) {
    this.options = options
    this.targetId = options.targetId || null
    this.ownsPage = options.ownsPage !== false
    this.lastUrl = null
  }

  async runOnAttachedPage(expression) {
    if (!this.targetId) {
      throw new Error("Aside page has not opened or attached to a tab yet.")
    }
    const state = await runAsideRepl(
      markerExpression(`
        (async () => {
          await attachBrowserTab(${JSON.stringify(this.targetId)});
          const value = await (async () => { ${expression} })();
          return {
            value,
            url: page.url(),
            frames: page.frames().map((frame) => ({ name: frame.name(), url: frame.url() }))
          };
        })()
      `),
      this.options
    )
    this.lastUrl = state.url || this.lastUrl
    this.framesCache = Array.isArray(state.frames) ? state.frames : []
    return state.value
  }

  runOnAttachedPageSync(expression) {
    return null
  }

  async goto(url) {
    const result = await runAsideRepl(
      markerExpression(`
        (async () => {
          if (${JSON.stringify(this.targetId)} === null) {
            const beforeTargetIds = new Set((await listBrowserTabs()).map((tab) => tab.targetId).filter(Boolean));
            await openTab(${JSON.stringify(url)});
            const openTabs = await listBrowserTabs();
            const currentUrl = page.url();
            const currentTitle = await page.title().catch(() => null);
            const tab = openTabs.find((candidate) => candidate.targetId && !beforeTargetIds.has(candidate.targetId));
            if (!tab) throw new Error("Aside Browser did not expose a newly opened tab targetId.");
            return { targetId: tab.targetId, url: currentUrl, title: currentTitle };
          } else {
            await attachBrowserTab(${JSON.stringify(this.targetId)});
            await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded" });
            return { targetId: ${JSON.stringify(this.targetId)}, url: page.url(), title: await page.title().catch(() => null) };
          }
        })()
      `),
      this.options
    )
    this.targetId = result.targetId || this.targetId
    this.lastUrl = result.url || url
    if (this.options.asideContext && typeof this.options.asideContext.trackPage === "function") {
      this.options.asideContext.trackPage(this)
    }
    this.framesCache = []
    return result
  }

  url() {
    return this.lastUrl || "about:blank"
  }

  async title() {
    const result = await this.runOnAttachedPage("return { title: await page.title().catch(() => null) };")
    return result.title
  }

  async content() {
    const result = await this.runOnAttachedPage("return { html: await page.content() };")
    return result.html
  }

  async evaluate(fn, arg) {
    return this.runOnAttachedPage(`
      const fn = ${fn.toString()};
      return await page.evaluate(fn, ${serializeArg(arg)});
    `)
  }

  async waitForTimeout(ms) {
    await runAsideRepl(markerExpression(`sleep(${Number(ms) || 0}).then(() => null)`), this.options)
  }

  async waitForLoadState() {
    return null
  }

  frames() {
    return Array.isArray(this.framesCache)
      ? this.framesCache.map((frameInfo) => new AsideFrame(this, frameInfo))
      : []
  }

  locator(selector) {
    return new AsideLocator(this, selector)
  }

  async close() {
    if (!this.targetId || !this.ownsPage) return
    await runAsideRepl(
      markerExpression(`
        (async () => {
          const tab = await attachBrowserTab(${JSON.stringify(this.targetId)});
          await closeTab(tab);
          return { closed: true };
        })()
      `),
      this.options
    ).catch(() => null)
  }
}

class AsideContext {
  constructor(options = {}) {
    this.options = { ...options, asideContext: this }
    this.createdPages = []
  }

  pages() {
    return this.createdPages
  }

  trackPage(page) {
    if (!this.createdPages.includes(page)) {
      this.createdPages.push(page)
    }
  }

  async newPage() {
    const page = new AsidePage(this.options)
    this.createdPages.push(page)
    return page
  }

  async waitForEvent(eventName, options = {}) {
    if (eventName !== "page") {
      throw new Error(`Aside context does not support waiting for event "${eventName}"`)
    }
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : DEFAULT_ASIDE_TIMEOUT_MS
    const baseline = await this.listTargetIds()
    const deadline = Date.now() + timeoutMs
    while (Date.now() <= deadline) {
      const tabs = await this.listTabs()
      const opened = tabs.find((tab) => tab && tab.targetId && !baseline.has(tab.targetId))
      if (opened) {
        const page = new AsidePage({ ...this.options, targetId: opened.targetId, ownsPage: true })
        page.lastUrl = opened.url || null
        this.trackPage(page)
        return page
      }
      await runAsideRepl(markerExpression("sleep(250).then(() => null)"), this.options)
    }
    throw new Error(`Timed out waiting for Aside context event "${eventName}"`)
  }

  async listTabs() {
    return runAsideRepl(
      markerExpression("(async () => (await listBrowserTabs()).map((tab) => ({ targetId: tab.targetId, url: tab.url, title: tab.title, active: tab.active })))()"),
      this.options
    )
  }

  async listTargetIds() {
    const tabs = await runAsideRepl(
      markerExpression("(async () => (await listBrowserTabs()).map((tab) => tab.targetId).filter(Boolean))()"),
      this.options
    )
    const ids = new Set(tabs)
    for (const page of this.createdPages) {
      if (page.targetId) ids.add(page.targetId)
    }
    return ids
  }

  async close() {
    await Promise.all(this.createdPages.map((page) => page.close()))
  }
}

module.exports = {
  AsideContext,
  AsideFrame,
  AsideLocator,
  AsidePage
}
