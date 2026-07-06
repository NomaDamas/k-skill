"use strict"

const { execFile, execFileSync, spawn } = require("node:child_process")
const { createUnavailableError } = require("./stop-rules")

const DEFAULT_ASIDE_COMMAND = "aside"
const DEFAULT_ASIDE_TIMEOUT_MS = 5000
const RESULT_PREFIX = "__K_SKILL_BROWSER_RUNTIME_RESULT__"
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g

function resolveAsideCommand(options = {}) {
  return options.asideCommand || process.env.KSKILL_ASIDE_COMMAND || DEFAULT_ASIDE_COMMAND
}

function markerExpression(expression) {
  return `await (async () => { let value = await (${expression}); console.log(${JSON.stringify(RESULT_PREFIX)} + JSON.stringify(value === undefined ? null : value)); })()`
}

function parseAsideResult(stdout) {
  const line = String(stdout)
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(RESULT_PREFIX))
  if (!line) {
    throw createUnavailableError("Aside Browser REPL did not return a runtime marker.", { stdout: String(stdout) })
  }
  return JSON.parse(line.slice(line.indexOf(RESULT_PREFIX) + RESULT_PREFIX.length))
}

function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "")
}

class AsideReplSession {
  constructor(options = {}) {
    this.command = resolveAsideCommand(options)
    this.timeoutMs = Number.isFinite(options.asideTimeoutMs) ? options.asideTimeoutMs : DEFAULT_ASIDE_TIMEOUT_MS
    this.child = null
    this.buffer = ""
    this.ready = null
    this.queue = Promise.resolve()
  }

  start() {
    if (this.ready) return this.ready
    this.child = spawn(this.command, ["repl"], { stdio: ["pipe", "pipe", "pipe"] })
    this.child.stdout.setEncoding("utf8")
    this.child.stderr.setEncoding("utf8")
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk
    })
    this.child.stderr.on("data", (chunk) => {
      this.buffer += chunk
    })
    this.ready = this.waitForPrompt()
    return this.ready
  }

  waitForPrompt() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(createUnavailableError("Aside Browser REPL did not become ready.", { command: this.command }))
      }, this.timeoutMs)
      const onData = () => {
        if (stripAnsi(this.buffer).includes("repl >")) {
          cleanup()
          resolve()
        }
      }
      const onExit = () => {
        cleanup()
        reject(createUnavailableError("Aside Browser REPL exited before it became ready.", { command: this.command }))
      }
      const onError = (cause) => {
        cleanup()
        const error = createUnavailableError("Aside Browser REPL is unavailable.", { command: this.command })
        error.cause = cause
        reject(error)
      }
      const cleanup = () => {
        clearTimeout(timeout)
        this.child.stdout.off("data", onData)
        this.child.stderr.off("data", onData)
        this.child.off("exit", onExit)
        this.child.off("error", onError)
      }
      this.child.stdout.on("data", onData)
      this.child.stderr.on("data", onData)
      this.child.on("exit", onExit)
      this.child.on("error", onError)
      onData()
    })
  }

  run(code) {
    const run = this.queue.catch(() => null).then(() => this.runNow(code))
    this.queue = run.catch(() => null)
    return run
  }

  async runNow(code) {
    await this.start()
    const marker = `${RESULT_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}__`
    const markerCode = code.replaceAll(RESULT_PREFIX, marker)
    this.buffer = ""
    this.child.stdin.write(`${markerCode.replace(/\r?\n/g, " ")}\n`)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(createUnavailableError("Aside Browser REPL command timed out.", { command: this.command, output: stripAnsi(this.buffer) }))
      }, this.timeoutMs)
      const onData = () => {
        const output = stripAnsi(this.buffer)
        const line = output.split(/\r?\n/).find((candidate) => candidate.includes(marker))
        if (line) {
          cleanup()
          resolve(JSON.parse(line.slice(line.indexOf(marker) + marker.length)))
          return
        }
        if (output.includes("[error") && output.includes("repl >")) {
          cleanup()
          reject(createUnavailableError("Aside Browser REPL command failed.", { command: this.command, output }))
        }
      }
      const onExit = () => {
        cleanup()
        reject(createUnavailableError("Aside Browser REPL exited during command.", { command: this.command, output: stripAnsi(this.buffer) }))
      }
      const onError = (cause) => {
        cleanup()
        const error = createUnavailableError("Aside Browser REPL is unavailable.", { command: this.command, output: stripAnsi(this.buffer) })
        error.cause = cause
        reject(error)
      }
      const cleanup = () => {
        clearTimeout(timeout)
        this.child.stdout.off("data", onData)
        this.child.stderr.off("data", onData)
        this.child.off("exit", onExit)
        this.child.off("error", onError)
      }
      this.child.stdout.on("data", onData)
      this.child.stderr.on("data", onData)
      this.child.on("exit", onExit)
      this.child.on("error", onError)
      onData()
    })
  }

  async close() {
    if (!this.child) return
    if (!this.child.killed) {
      this.child.stdin.write("exit\n")
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 500)
        this.child.once("exit", () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
    if (!this.child.killed) {
      this.child.kill()
    }
  }
}

function runAsideRepl(code, options = {}) {
  if (options.asideSession) {
    return options.asideSession.run(code)
  }
  if (typeof options.asideReplRunner === "function") {
    return Promise.resolve(options.asideReplRunner(code, options))
  }
  const command = resolveAsideCommand(options)
  const timeout = Number.isFinite(options.asideTimeoutMs) ? options.asideTimeoutMs : DEFAULT_ASIDE_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    execFile(command, ["repl", code], { timeout }, (error, stdout, stderr) => {
      if (error) {
        const unavailable = createUnavailableError("Aside Browser REPL is unavailable.", { command, stderr: String(stderr || "") })
        unavailable.cause = error
        reject(unavailable)
        return
      }
      try {
        resolve(parseAsideResult(stdout))
      } catch (parseError) {
        reject(parseError)
      }
    })
  })
}

function runAsideReplSync(code, options = {}) {
  if (typeof options.asideReplRunnerSync === "function") {
    return options.asideReplRunnerSync(code, options)
  }
  const command = resolveAsideCommand(options)
  const timeout = Number.isFinite(options.asideTimeoutMs) ? options.asideTimeoutMs : DEFAULT_ASIDE_TIMEOUT_MS
  try {
    const stdout = execFileSync(command, ["repl", code], { timeout, encoding: "utf8" })
    return parseAsideResult(stdout)
  } catch (cause) {
    const unavailable = createUnavailableError("Aside Browser REPL is unavailable.", { command })
    unavailable.cause = cause
    throw unavailable
  }
}

async function probeAside(options = {}) {
  if (typeof options.asideProbe === "function") {
    return options.asideProbe(options)
  }
  try {
    const result = await runAsideRepl(
      markerExpression("Promise.resolve({ tabCount: (await listBrowserTabs()).length })"),
      options
    )
    return { ok: true, result }
  } catch (cause) {
    return { ok: false, cause }
  }
}

module.exports = {
  DEFAULT_ASIDE_COMMAND,
  DEFAULT_ASIDE_TIMEOUT_MS,
  RESULT_PREFIX,
  AsideReplSession,
  markerExpression,
  probeAside,
  runAsideRepl,
  runAsideReplSync
}
