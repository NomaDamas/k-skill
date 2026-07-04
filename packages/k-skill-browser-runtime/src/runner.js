"use strict"

// Narrow declared-step runner.
//
// runJob executes ONLY caller-supplied step functions in declared order. It never
// invents navigation, never generates steps, and never plans site behavior. The
// only navigation it performs is a single caller-requested `page.goto(url, ...)`,
// and only when a URL AND at least one caller step are supplied. Stop-rule checks
// are invoked at phase boundaries (before navigation, before each step) so callers
// can surface manual-handoff boundaries without the runner bypassing them.

async function runJob(options = {}) {
  const steps = Array.isArray(options.steps) ? options.steps : []
  if (steps.length === 0) {
    return { status: "no-steps", results: [] }
  }

  // Validate caller steps up front so a malformed step never triggers navigation
  // or partial execution. The runner only executes caller-supplied functions.
  for (const step of steps) {
    if (typeof step !== "function") {
      throw new TypeError("runJob steps must be caller-supplied functions.")
    }
  }

  const page = options.page
  const url = options.url
  const stopOn = options.stopOn
  const results = []

  // Navigate only when a caller supplied a URL. Steps are already non-empty here,
  // so the URL guard satisfies "navigate only when URL AND steps are supplied".
  if (url) {
    if (typeof stopOn === "function") {
      const stopReason = await stopOn({ page, phase: "navigate", url, results })
      if (stopReason) {
        return { status: "stopped", stopReason, results }
      }
    }
    if (!page || typeof page.goto !== "function") {
      throw new TypeError("runJob navigation requires a page with a goto function.")
    }
    await page.goto(url, { waitUntil: "domcontentloaded" })
  }

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    if (typeof stopOn === "function") {
      const stopReason = await stopOn({ page, phase: "step", step, index, url, results })
      if (stopReason) {
        return { status: "stopped", stopReason, results }
      }
    }
    results.push(await step({ page, results }))
  }

  return { status: "complete", results }
}

module.exports = {
  runJob
}
