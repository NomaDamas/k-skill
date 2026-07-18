"use strict"

const { MODEL_SUBSIDY_PATH, SIDO_ALIASES, STATUS_URL, resolveVehicleType } = require("./constants")
const { createError, wrapBrowserError } = require("./errors")
const {
  attachModelEstimate,
  buildStatusResult,
  normalizeRegionKey,
  normalizeText,
  parseModelSubsidyRows,
  parseStatusRows
} = require("./parse")

const DEFAULT_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 300

async function evaluateDom(page, operation, payload = {}) {
  return page.evaluate(({ operation, payload }) => {
    const normalize = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim()
    const visible = (element) => {
      if (!element) return false
      const style = window.getComputedStyle(element)
      return style.display !== "none" && style.visibility !== "hidden"
    }
    const optionRows = (select) => Array.from(select ? select.options : []).map((option) => ({
      value: option.value,
      label: normalize(option.textContent),
      disabled: Boolean(option.disabled)
    }))
    const dispatchChange = (select, value) => {
      select.value = value
      select.dispatchEvent(new Event("input", { bubbles: true }))
      select.dispatchEvent(new Event("change", { bubbles: true }))
    }

    if (operation === "page-state") {
      const bodyText = normalize(document.body ? document.body.innerText : "")
      return {
        bodyText: bodyText.slice(0, 50000),
        htmlLength: document.documentElement ? document.documentElement.outerHTML.length : 0,
        hasPassword: Boolean(document.querySelector("input[type=password]")),
        hasCaptcha: /captcha|캡차|자동입력\s*방지|로봇이\s*아닙니다/i.test(bodyText)
      }
    }

    if (operation === "options") {
      return optionRows(document.querySelector(payload.selector))
    }

    if (operation === "select-value") {
      const select = document.querySelector(payload.selector)
      if (!select) return { ok: false, reason: "select-not-found" }
      const option = Array.from(select.options).find((candidate) => candidate.value === payload.value)
      if (!option) return { ok: false, reason: "option-not-found" }
      const changed = select.value !== option.value
      dispatchChange(select, option.value)
      return { ok: true, changed, value: option.value, label: normalize(option.textContent) }
    }

    if (operation === "select-label-any") {
      const wanted = normalize(payload.label)
      for (const select of Array.from(document.querySelectorAll("select"))) {
        const option = Array.from(select.options).find((candidate) => normalize(candidate.textContent) === wanted)
        if (option) {
          dispatchChange(select, option.value)
          return { ok: true, selector: select.id ? `#${select.id}` : select.name, value: option.value }
        }
      }
      return { ok: false }
    }

    if (operation === "click-text") {
      const wanted = normalize(payload.text)
      const near = payload.nearSelector ? document.querySelector(payload.nearSelector) : null
      const scope = near ? (near.closest("form") || near.parentElement || document) : document
      const candidates = Array.from(scope.querySelectorAll("a,button,input[type=button],input[type=submit]"))
      const element = candidates.find((candidate) => {
        const text = normalize(candidate.textContent || candidate.value)
        return visible(candidate) && text === wanted
      })
      if (!element) return { ok: false }
      element.click()
      return { ok: true, tag: element.tagName, id: element.id || null }
    }

    if (operation === "status-rows") {
      const wanted = normalize(payload.localName)
      const rows = []
      for (const tr of Array.from(document.querySelectorAll("tr"))) {
        const cells = Array.from(tr.querySelectorAll("td,th"))
        const text = cells.map((cell) => normalize(cell.textContent))
        if (text.length < 10 || text[1] !== wanted) continue
        const noticeCell = cells[3]
        const noticeFiles = Array.from(noticeCell.querySelectorAll("a,button,input[type=button]")).map((item) => ({
          label: normalize(item.textContent || item.value),
          title: normalize(item.getAttribute("title")),
          onclick: normalize(item.getAttribute("onclick"))
        }))
        rows.push({ cells: text, notice_files: noticeFiles })
      }
      return rows
    }

    if (operation === "submit-model-form") {
      const form = document.createElement("form")
      form.method = "post"
      form.action = payload.action
      for (const [name, value] of Object.entries(payload.fields)) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = name
        input.value = String(value)
        form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
      return { ok: true }
    }

    if (operation === "model-table") {
      let selected = null
      for (const table of Array.from(document.querySelectorAll("table"))) {
        const rows = Array.from(table.querySelectorAll("tbody tr"))
          .map((tr) => Array.from(tr.querySelectorAll("td")).map((cell) => normalize(cell.textContent)))
          .filter((cells) => cells.length >= 6)
        if (rows.length && (!selected || rows.length > selected.rows.length)) {
          selected = {
            headers: Array.from(table.querySelectorAll("thead th, thead td")).map((cell) => normalize(cell.textContent)),
            rows
          }
        }
      }
      return selected || { headers: [], rows: [] }
    }

    return null
  }, { operation, payload })
}

async function waitFor(page, predicate, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : POLL_INTERVAL_MS
  const deadline = Date.now() + timeoutMs
  let lastValue
  while (Date.now() <= deadline) {
    lastValue = await predicate()
    if (lastValue) return lastValue
    await page.waitForTimeout(intervalMs)
  }
  const error = createError(options.code || "UPSTREAM_TIMEOUT", options.message || "공식 페이지 응답을 기다리다 시간이 초과되었습니다.")
  error.details.last_value = lastValue
  throw error
}

async function assertPublicStatusPage(page, timeoutMs) {
  const state = await waitFor(page, async () => {
    const current = await evaluateDom(page, "page-state")
    if (current.hasCaptcha) throw createError("CAPTCHA_DETECTED", "공식 페이지에 CAPTCHA가 표시되어 자동 조회를 중단했습니다.")
    if (current.hasPassword && !current.bodyText.includes("구매보조금 지급현황")) {
      throw createError("AUTH_REQUIRED", "공식 조회 페이지가 로그인을 요구합니다.")
    }
    return current.bodyText.includes("구매보조금 지급현황") ? current : null
  }, {
    timeoutMs,
    code: "UPSTREAM_BLOCKED",
    message: "공식 구매보조금 지급현황 본문이 렌더링되지 않았습니다."
  })
  if (state.htmlLength < 1000) {
    throw createError("UPSTREAM_BLOCKED", "공식 페이지가 빈 응답을 반환했습니다.")
  }
  return state
}

function findSidoOption(query, options) {
  const normalizedQuery = normalizeRegionKey(query)
  const candidates = []
  for (const option of options) {
    const normalizedLabel = normalizeRegionKey(option.label)
    const canonical = Object.keys(SIDO_ALIASES).find((key) => {
      const aliases = SIDO_ALIASES[key]
      return aliases.some((alias) => normalizedQuery.includes(normalizeRegionKey(alias)))
    })
    if (
      normalizedQuery.includes(normalizedLabel) ||
      (canonical && SIDO_ALIASES[canonical].some((alias) => normalizeRegionKey(alias) === normalizedLabel))
    ) {
      candidates.push(option)
    }
  }
  return candidates.length === 1 ? candidates[0] : null
}

function findLocalOptions(query, options) {
  const normalizedQuery = normalizeRegionKey(query)
  return options.filter((option) => {
    if (!option.value || option.disabled) return false
    const label = normalizeRegionKey(option.label)
    if (!label) return false
    if (normalizedQuery.includes(label)) return true
    const shortLabel = label.replace(/(시|군|구)$/u, "")
    return shortLabel.length >= 2 && normalizedQuery.includes(shortLabel)
  })
}

async function selectValue(page, selector, option, timeoutMs) {
  const result = await evaluateDom(page, "select-value", { selector, value: option.value })
  if (!result || !result.ok) {
    throw createError("DOM_CHANGED", `${selector}에서 ${option.label} 옵션을 선택하지 못했습니다.`)
  }
  await page.waitForTimeout(Math.min(800, timeoutMs))
  return result
}

async function localOptions(page) {
  return evaluateDom(page, "options", { selector: "#local_cd1" })
}

async function waitForLocalOptions(page, previousSignature, timeoutMs) {
  return waitFor(page, async () => {
    const options = await localOptions(page)
    const signature = JSON.stringify(options)
    const usable = options.filter((option) => option.value && !option.disabled)
    if (usable.length && signature !== previousSignature) return options
    return null
  }, {
    timeoutMs,
    code: "DOM_CHANGED",
    message: "시도 선택 후 시군구 목록이 갱신되지 않았습니다."
  })
}

async function resolveRegion(page, query, timeoutMs) {
  if (!normalizeText(query)) throw createError("REGION_REQUIRED", "조회할 시도와 시군구를 입력하세요.")
  const sidoOptions = (await evaluateDom(page, "options", { selector: "#localDo_cd" }))
    .filter((option) => option.value && !option.disabled)
  if (!sidoOptions.length) throw createError("DOM_CHANGED", "시도 선택 목록을 찾지 못했습니다.")

  const explicitSido = findSidoOption(query, sidoOptions)
  const matches = []
  const candidates = explicitSido ? [explicitSido] : sidoOptions

  for (const sido of candidates) {
    const before = JSON.stringify(await localOptions(page))
    const selection = await selectValue(page, "#localDo_cd", sido, timeoutMs)
    const locals = selection.changed ? await waitForLocalOptions(page, before, timeoutMs) : await localOptions(page)
    for (const local of findLocalOptions(query, locals)) {
      matches.push({ sidoName: sido.label, sidoCode: sido.value, localName: local.label, localCode: local.value })
    }
    if (explicitSido) break
  }

  const unique = Array.from(new Map(matches.map((item) => [`${item.sidoCode}:${item.localCode}`, item])).values())
  if (!unique.length) throw createError("REGION_NOT_FOUND", `공식 지역 목록에서 "${query}"를 찾지 못했습니다.`)
  if (unique.length > 1) {
    throw createError("REGION_AMBIGUOUS", `"${query}"에 해당하는 지역이 여러 곳입니다. 시도를 함께 입력하세요.`, {
      candidates: unique
    })
  }

  const region = unique[0]
  if (!explicitSido || explicitSido.value !== region.sidoCode) {
    const before = JSON.stringify(await localOptions(page))
    const selection = await selectValue(page, "#localDo_cd", { value: region.sidoCode, label: region.sidoName }, timeoutMs)
    if (selection.changed) await waitForLocalOptions(page, before, timeoutMs)
  }
  await selectValue(page, "#local_cd1", { value: region.localCode, label: region.localName }, timeoutMs)
  return region
}

async function chooseVehicleAndYear(page, vehicle, year, timeoutMs) {
  let selected = await evaluateDom(page, "select-label-any", { label: vehicle.label })
  if (!selected || !selected.ok) {
    selected = await evaluateDom(page, "click-text", { text: vehicle.label })
    if (selected && selected.ok) {
      await page.waitForTimeout(800)
      await assertPublicStatusPage(page, timeoutMs)
    }
  }
  if ((!selected || !selected.ok) && vehicle.key !== "passenger") {
    throw createError("VEHICLE_TYPE_NOT_AVAILABLE", `${vehicle.label} 선택 항목을 찾지 못했습니다.`)
  }

  const yearResult = await evaluateDom(page, "select-label-any", { label: String(year) })
  if (!yearResult || !yearResult.ok) {
    throw createError("YEAR_NOT_AVAILABLE", `${year}년 선택 항목을 찾지 못했습니다.`)
  }
}

async function clickSearchAndReadRows(page, region, timeoutMs) {
  const clicked = await evaluateDom(page, "click-text", { text: "조회", nearSelector: "#local_cd1" })
  if (!clicked || !clicked.ok) throw createError("DOM_CHANGED", "조회 버튼을 찾지 못했습니다.")
  return waitFor(page, async () => {
    const rows = await evaluateDom(page, "status-rows", { localName: region.localName })
    return rows.length ? rows : null
  }, {
    timeoutMs,
    code: "RESULT_EMPTY",
    message: `${region.localName} 지급현황 행이 나타나지 않았습니다.`
  })
}

async function readModelSubsidies(page, { region, vehicle, year, model, timeoutMs }) {
  const action = new URL(MODEL_SUBSIDY_PATH, STATUS_URL).toString()
  await evaluateDom(page, "submit-model-form", {
    action,
    fields: {
      year,
      year1: year,
      local_cd: region.localCode,
      car_type: vehicle.carTypeCode,
      carType: vehicle.key === "passenger" ? "car" : vehicle.key,
      evCarTypeDtl: vehicle.carTypeCode
    }
  })
  const snapshot = await waitFor(page, async () => {
    const current = await evaluateDom(page, "model-table")
    return current.rows.length ? current : null
  }, {
    timeoutMs,
    code: "MODEL_LOOKUP_FAILED",
    message: "지자체 차종별 보조금 표가 나타나지 않았습니다."
  })
  return parseModelSubsidyRows(snapshot, { model })
}

function connectionOptions(options) {
  const output = {}
  for (const key of ["provider", "platform", "cdpUrl", "probe", "asideCommand", "asideTimeoutMs", "connectLoader", "chromiumLoader"]) {
    if (options[key] !== undefined) output[key] = options[key]
  }
  return output
}

async function withAutomationPage(options, work) {
  if (options.page) return work(options.page, { provider: "injected" })
  const runtime = options.runtime || require("k-skill-browser-runtime")
  let browser
  let session
  let provider
  try {
    const connected = await runtime.connect(connectionOptions(options))
    browser = connected.browser
    provider = connected.provider
    session = await runtime.getAutomationPage(browser, {
      reuseDefaultContext: false,
      contextOptions: {
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        viewport: { width: 1280, height: 900 }
      }
    })
    return await work(session.page, { provider })
  } catch (error) {
    throw wrapBrowserError(error)
  } finally {
    if (session && runtime.cleanupAutomationPage) await runtime.cleanupAutomationPage(session).catch(() => {})
    if (browser && typeof browser.disconnect === "function") await browser.disconnect().catch(() => {})
  }
}

async function getSubsidyStatus(options = {}) {
  const vehicle = resolveVehicleType(options.vehicleType)
  const year = Number(options.year || new Date().getFullYear())
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS

  return withAutomationPage(options, async (page, browserInfo) => {
    await page.goto(STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    await assertPublicStatusPage(page, timeoutMs)
    await chooseVehicleAndYear(page, vehicle, year, timeoutMs)
    const region = await resolveRegion(page, options.region, timeoutMs)
    const rawRows = await clickSearchAndReadRows(page, region, timeoutMs)
    const rows = parseStatusRows(rawRows, {
      localName: region.localName,
      vehicleType: vehicle.key
    })
    let result = buildStatusResult({
      query: {
        region: options.region,
        year,
        vehicle_type: vehicle.key,
        category: options.category || "all",
        model: options.model || null
      },
      region,
      rows,
      sourceUrl: STATUS_URL
    })
    result.browser_provider = browserInfo.provider

    if (options.model) {
      try {
        const modelResult = await readModelSubsidies(page, { region, vehicle, year, model: options.model, timeoutMs })
        if (!modelResult.items.length) {
          result.warnings.push(`"${options.model}" 모델을 지자체 차종별 보조금 표에서 찾지 못했습니다.`)
        } else {
          result = attachModelEstimate(result, modelResult.items[0])
          result.model_candidates = modelResult.items
        }
      } catch (error) {
        result.warnings.push(`모델별 보조금 조회 실패: ${error.message}`)
        result.model_lookup_error = { code: error.code || "MODEL_LOOKUP_FAILED", message: error.message }
      }
    }
    return result
  })
}

async function searchRegions(options = {}) {
  const query = normalizeText(options.query)
  if (!query) throw createError("REGION_REQUIRED", "검색할 지역명을 입력하세요.")
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
  return withAutomationPage(options, async (page) => {
    await page.goto(STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    await assertPublicStatusPage(page, timeoutMs)
    const sidoOptions = (await evaluateDom(page, "options", { selector: "#localDo_cd" }))
      .filter((option) => option.value && !option.disabled)
    const matches = []
    for (const sido of sidoOptions) {
      const before = JSON.stringify(await localOptions(page))
      const selection = await selectValue(page, "#localDo_cd", sido, timeoutMs)
      const locals = selection.changed ? await waitForLocalOptions(page, before, timeoutMs) : await localOptions(page)
      for (const local of findLocalOptions(query, locals)) {
        matches.push({
          sido_name: sido.label,
          sido_code: sido.value,
          local_name: local.label,
          local_code: local.value
        })
      }
    }
    return { query, items: matches, source_url: STATUS_URL }
  })
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  assertPublicStatusPage,
  chooseVehicleAndYear,
  clickSearchAndReadRows,
  evaluateDom,
  findLocalOptions,
  findSidoOption,
  getSubsidyStatus,
  readModelSubsidies,
  resolveRegion,
  searchRegions,
  waitFor,
  withAutomationPage
}
