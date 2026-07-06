"use strict"

const BUSINESS_SELECTORS = {
  all: "#allCheck",
  goods: "#pgb",
  service: "#psb",
  construction: "#pcb",
  foreign: "#peb"
}

function buildAsideSearchScript(options, homeUrl) {
  return buildBrowserSearchScript(options, homeUrl, "aside")
}

function buildPlaywrightSearchScript(options, homeUrl) {
  return buildBrowserSearchScript(options, homeUrl, "playwright")
}

function buildBrowserSearchScript(options, homeUrl, surface) {
  const opener = surface === "aside"
    ? `const page = await openTab(${JSON.stringify(homeUrl)});`
    : `const page = await browser.newPage();\nawait page.goto(${JSON.stringify(homeUrl)}, { waitUntil: "domcontentloaded" });`
  return `${opener}
const d2bOptions = ${JSON.stringify(options)};
await runD2BNoticeSearch(page, d2bOptions);
const visibleText = await page.locator("body").innerText();
console.log(JSON.stringify({ url: page.url(), visibleText }, null, 2));

async function runD2BNoticeSearch(page, options) {
  await setInputValue(page, "#anmt_name, input[title='공고건명']", options.keyword);
  if (options.noticeType) await page.locator("#anmt_divs").selectOption(options.noticeType);
  await page.locator("#gubun").selectOption(options.dateField);
  if (options.startDate) await setInputValue(page, "#datepicker_from", options.startDate);
  if (options.endDate) await setInputValue(page, "#datepicker_to", options.endDate);
  await setInputValue(page, "#numb_divs", options.g2bNoticeNumber);
  await setInputValue(page, "#dprt_name", options.agency);
  await page.locator("#pageUnitSelBox").selectOption(String(options.pageSize)).catch(() => {});
  await selectBusinessCategories(page, options.businessCategories);
  await page.locator("#btn_search").click();
  await page.waitForURL(/mainBidAnnounceList\\.do/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

async function setInputValue(page, selector, value) {
  await page.locator(selector).first().evaluate((element, nextValue) => {
    element.removeAttribute("readonly");
    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function selectBusinessCategories(page, categories) {
  const selectorByCategory = ${JSON.stringify(BUSINESS_SELECTORS)};
  if (categories.includes("all")) {
    await page.locator(selectorByCategory.all).check().catch(() => {});
    return;
  }
  await page.locator(selectorByCategory.all).uncheck().catch(() => {});
  for (const category of categories) {
    await page.locator(selectorByCategory[category]).check();
  }
}`
}

module.exports = { buildAsideSearchScript, buildPlaywrightSearchScript }
