"use strict"

const {
  DEFAULT_ASIDE_COMMAND,
  DEFAULT_ASIDE_TIMEOUT_MS,
  RESULT_PREFIX,
  AsideReplSession,
  probeAside,
  runAsideRepl,
  runAsideReplSync
} = require("./aside-repl")
const {
  AsideContext,
  AsideFrame,
  AsideLocator,
  AsidePage
} = require("./aside-page")

class AsideBrowser {
  constructor(options = {}) {
    this.provider = "aside"
    this.context = new AsideContext(options)
  }

  contexts() {
    return [this.context]
  }

  async newContext() {
    return this.context
  }

  async disconnect() {
    if (this.context && typeof this.context.close === "function") {
      await this.context.close()
    }
    if (this.context.options.asideSession) {
      await this.context.options.asideSession.close()
    }
  }
}

async function connectAside(options = {}) {
  if (typeof options.asideConnectLoader === "function") {
    return options.asideConnectLoader(options)
  }
  const session = options.asideSession || new AsideReplSession(options)
  await session.start()
  return new AsideBrowser({ ...options, asideSession: session })
}

module.exports = {
  DEFAULT_ASIDE_COMMAND,
  DEFAULT_ASIDE_TIMEOUT_MS,
  RESULT_PREFIX,
  AsideBrowser,
  AsideContext,
  AsideFrame,
  AsideLocator,
  AsidePage,
  AsideReplSession,
  probeAside,
  connectAside,
  runAsideRepl,
  runAsideReplSync
}
