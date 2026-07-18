"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")

const {
  findLocalOptions,
  findSidoOption,
  getSubsidyStatus,
  withAutomationPage
} = require("../src/browser")

test("region matchers resolve province aliases and local suffixes", () => {
  const sido = findSidoOption("경기도 성남시", [
    { label: "서울", value: "1100" },
    { label: "경기", value: "4100" }
  ])
  assert.equal(sido.value, "4100")
  assert.deepEqual(findLocalOptions("경기 성남", [
    { label: "수원시", value: "4111" },
    { label: "성남시", value: "4113" }
  ]).map((item) => item.value), ["4113"])
})

test("withAutomationPage cleans only the owned automation session and disconnects supported clients", async () => {
  const calls = []
  const page = {}
  const browser = { disconnect: async () => calls.push("disconnect") }
  const session = { page, ownsPage: true, ownsContext: false }
  const runtime = {
    connect: async () => ({ browser, provider: "aside" }),
    getAutomationPage: async () => session,
    cleanupAutomationPage: async (value) => calls.push(value === session ? "cleanup" : "wrong")
  }

  const result = await withAutomationPage({ runtime }, async (receivedPage, info) => {
    assert.equal(receivedPage, page)
    assert.equal(info.provider, "aside")
    return "ok"
  })

  assert.equal(result, "ok")
  assert.deepEqual(calls, ["cleanup", "disconnect"])
})

test("browser workflow requests domcontentloaded and returns status plus model estimate", async () => {
  const operations = []
  let sidoSelected = false
  const page = {
    goto: async (url, options) => {
      operations.push(["goto", url, options])
    },
    waitForTimeout: async () => {},
    evaluate: async (_fn, input) => {
      const { operation, payload } = input
      operations.push([operation, payload])
      if (operation === "page-state") {
        return {
          bodyText: "구매보조금 지급현황",
          htmlLength: 5000,
          hasPassword: false,
          hasCaptcha: false
        }
      }
      if (operation === "select-label-any") {
        return { ok: payload.label === "전기승용" || payload.label === "2026" }
      }
      if (operation === "options" && payload.selector === "#localDo_cd") {
        return [{ label: "경기", value: "4100", disabled: false }]
      }
      if (operation === "options" && payload.selector === "#local_cd1") {
        return sidoSelected ? [{ label: "성남시", value: "4113", disabled: false }] : []
      }
      if (operation === "select-value" && payload.selector === "#localDo_cd") {
        const changed = !sidoSelected
        sidoSelected = true
        return { ok: true, changed, value: payload.value, label: "경기" }
      }
      if (operation === "select-value" && payload.selector === "#local_cd1") {
        return { ok: true, changed: true, value: payload.value, label: "성남시" }
      }
      if (operation === "click-text") return { ok: true }
      if (operation === "status-rows") {
        return [{
          cells: [
            "경기", "성남시", "전기승용", "본공고 1", "출고등록순",
            "100 (10) (10) (10) (70)",
            "80 (8) (8) (8) (56)",
            "70 (7) (7) (7) (49)",
            "30 (3) (3) (3) (21)",
            "접수 중"
          ],
          notice_files: []
        }]
      }
      if (operation === "submit-model-form") return { ok: true }
      if (operation === "model-table") {
        return {
          headers: ["구분", "제조사", "모델", "국비(만원)", "지방비(만원)", "합계(만원)"],
          rows: [["승용", "제조사", "테스트 모델", "300", "120", "420"]]
        }
      }
      throw new Error(`Unexpected operation: ${operation}`)
    }
  }

  const result = await getSubsidyStatus({
    page,
    region: "경기 성남시",
    vehicleType: "passenger",
    year: 2026,
    model: "테스트 모델",
    timeoutMs: 100
  })

  assert.equal(operations[0][0], "goto")
  assert.equal(operations[0][2].waitUntil, "domcontentloaded")
  assert.equal(operations.some(([name]) => name === "submit-model-form"), true)
  assert.equal(result.region.local_code, "4113")
  assert.equal(result.availability.official_remaining_count, 30)
  assert.equal(result.remaining_budget.exact_available, false)
  assert.equal(result.remaining_budget.model_equivalent_estimate_krw, 126000000)
})
