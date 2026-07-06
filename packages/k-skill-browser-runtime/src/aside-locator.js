"use strict"

function serializeArg(value) {
  return JSON.stringify(value === undefined ? null : value)
}

class AsideFrame {
  constructor(page, frameInfo) {
    this.page = page
    this.frameInfo = frameInfo
  }

  name() {
    return this.frameInfo.name || ""
  }

  url() {
    return this.frameInfo.url || ""
  }

  async waitForLoadState() {
    return null
  }

  async content() {
    return this.page.runOnAttachedPage(`
      const frame = page.frames().find((candidate) => candidate.name() === ${JSON.stringify(this.name())} && candidate.url() === ${JSON.stringify(this.url())});
      if (!frame) throw new Error("Aside frame is no longer available");
      return await frame.content();
    `)
  }

  locator(selector) {
    return new AsideLocator(this.page, selector, this)
  }
}

class AsideLocator {
  constructor(page, selector, frame = null, index = null) {
    this.page = page
    this.selector = selector
    this.frame = frame
    this.index = index
  }

  nth(index) {
    return new AsideLocator(this.page, this.selector, this.frame, index)
  }

  async evaluate(fn, arg) {
    const locatorExpression = this.frame
      ? `page.frames().find((candidate) => candidate.name() === ${JSON.stringify(this.frame.name())} && candidate.url() === ${JSON.stringify(this.frame.url())}).locator(${JSON.stringify(this.selector)})`
      : `page.locator(${JSON.stringify(this.selector)})`
    const indexedExpression = this.index === null ? locatorExpression : `${locatorExpression}.nth(${Number(this.index)})`
    return this.page.runOnAttachedPage(`
      const fn = ${fn.toString()};
      return await ${indexedExpression}.evaluate(fn, ${serializeArg(arg)});
    `)
  }
}

module.exports = {
  AsideFrame,
  AsideLocator,
  serializeArg
}
