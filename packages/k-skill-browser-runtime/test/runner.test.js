"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const runtime = require("../src")
const runner = require("../src/runner")

function createMockPage() {
  const gotoCalls = []
  return {
    gotoCalls,
    async goto(url, options) { gotoCalls.push({ url, options }) }
  }
}

test("runner module exports only runJob and no planner or step generator", () => {
  const keys = Object.keys(runner).sort()
  assert.deepEqual(keys, ["runJob"])
})

test("runner does not navigate when steps are empty even if url is supplied", async () => {
  const page = createMockPage()
  const result = await runtime.runJob({ url: "https://example.com", steps: [], page })
  assert.deepEqual(result, { status: "no-steps", results: [] })
  assert.deepEqual(page.gotoCalls, [])
})

test("runner does not navigate when steps is a non-array even if url is supplied", async () => {
  const page = createMockPage()
  const result = await runtime.runJob({ url: "https://example.com", steps: "not-an-array", page })
  assert.deepEqual(result, { status: "no-steps", results: [] })
  assert.deepEqual(page.gotoCalls, [])
})

test("runner does not call stopOn when there are no steps", async () => {
  const page = createMockPage()
  let stopOnCalls = 0
  const stopOn = async () => { stopOnCalls++; return null }
  const result = await runtime.runJob({ url: "https://example.com", steps: [], page, stopOn })
  assert.equal(result.status, "no-steps")
  assert.equal(stopOnCalls, 0)
  assert.deepEqual(page.gotoCalls, [])
})

test("runner navigates with domcontentloaded only when url and steps are supplied", async () => {
  const page = createMockPage()
  const stepCalls = []
  const steps = [
    async ({ page: stepPage, results }) => { stepCalls.push({ stepPage, priorResults: Array.from(results) }); return "step-1" }
  ]
  const result = await runtime.runJob({ url: "https://example.com", steps, page })
  assert.deepEqual(page.gotoCalls, [
    { url: "https://example.com", options: { waitUntil: "domcontentloaded" } }
  ])
  assert.equal(stepCalls.length, 1)
  assert.equal(stepCalls[0].stepPage, page)
  assert.deepEqual(stepCalls[0].priorResults, [])
  assert.deepEqual(result, { status: "complete", results: ["step-1"] })
})

test("runner runs declared steps in order without navigating when no url is supplied", async () => {
  const page = createMockPage()
  const order = []
  const steps = [
    async () => { order.push("a"); return "a" },
    async () => { order.push("b"); return "b" },
    async () => { order.push("c"); return "c" }
  ]
  const result = await runtime.runJob({ steps, page })
  assert.deepEqual(order, ["a", "b", "c"])
  assert.deepEqual(result.results, ["a", "b", "c"])
  assert.equal(result.status, "complete")
  assert.deepEqual(page.gotoCalls, [])
})

test("runner rejects non-function steps without navigating", async () => {
  const page = createMockPage()
  await assert.rejects(
    () => runtime.runJob({ url: "https://example.com", steps: ["not-a-function"], page }),
    /caller-supplied functions/
  )
  assert.deepEqual(page.gotoCalls, [])
})

test("runner rejects a non-function step mixed with valid steps before any execution", async () => {
  const page = createMockPage()
  let executed = 0
  const steps = [
    async () => { executed++; return "a" },
    "not-a-function",
    async () => { executed++; return "c" }
  ]
  await assert.rejects(
    () => runtime.runJob({ url: "https://example.com", steps, page }),
    /caller-supplied functions/
  )
  assert.equal(executed, 0)
  assert.deepEqual(page.gotoCalls, [])
})

test("runner stopOn can stop before navigation", async () => {
  const page = createMockPage()
  const stopOnCalls = []
  const stopOn = async (ctx) => { stopOnCalls.push(ctx); return "AUTH_REQUIRED" }
  const steps = [async () => "step-1"]
  const result = await runtime.runJob({ url: "https://example.com", steps, page, stopOn })
  assert.equal(result.status, "stopped")
  assert.equal(result.stopReason, "AUTH_REQUIRED")
  assert.deepEqual(result.results, [])
  assert.deepEqual(page.gotoCalls, [])
  assert.equal(stopOnCalls[0].phase, "navigate")
  assert.equal(stopOnCalls[0].url, "https://example.com")
  assert.equal(stopOnCalls.length, 1)
})

test("runner stopOn can stop before a step after navigation", async () => {
  const page = createMockPage()
  const executed = []
  const stopOn = async (ctx) =>
    ctx.phase === "step" && ctx.index === 1 ? "MANUAL_HANDOFF" : null
  const steps = [
    async () => { executed.push("a"); return "a" },
    async () => { executed.push("b"); return "b" }
  ]
  const result = await runtime.runJob({ url: "https://example.com", steps, page, stopOn })
  assert.equal(result.status, "stopped")
  assert.equal(result.stopReason, "MANUAL_HANDOFF")
  assert.deepEqual(result.results, ["a"])
  assert.deepEqual(executed, ["a"])
  assert.deepEqual(page.gotoCalls, [
    { url: "https://example.com", options: { waitUntil: "domcontentloaded" } }
  ])
})

test("runner stopOn can stop before the first step without a url", async () => {
  const page = createMockPage()
  const executed = []
  const stopOn = async (ctx) =>
    ctx.phase === "step" && ctx.index === 0 ? "MANUAL_HANDOFF" : null
  const steps = [async () => { executed.push("a"); return "a" }]
  const result = await runtime.runJob({ steps, page, stopOn })
  assert.equal(result.status, "stopped")
  assert.equal(result.stopReason, "MANUAL_HANDOFF")
  assert.deepEqual(result.results, [])
  assert.deepEqual(executed, [])
  assert.deepEqual(page.gotoCalls, [])
})

test("runner stopOn receives predictable phase context across navigate and step phases", async () => {
  const page = createMockPage()
  const phases = []
  const stopOn = async (ctx) => {
    phases.push({ phase: ctx.phase, index: ctx.index, url: ctx.url })
    return null
  }
  const steps = [
    async () => "a",
    async () => "b"
  ]
  const result = await runtime.runJob({ url: "https://example.com", steps, page, stopOn })
  assert.equal(result.status, "complete")
  assert.deepEqual(phases, [
    { phase: "navigate", index: undefined, url: "https://example.com" },
    { phase: "step", index: 0, url: "https://example.com" },
    { phase: "step", index: 1, url: "https://example.com" }
  ])
})
