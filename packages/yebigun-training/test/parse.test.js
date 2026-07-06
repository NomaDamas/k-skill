const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASE_URL,
  HOME_URL,
  detectSessionState,
  inspectYebigunPage,
  parseGenericTable,
  parseTrainingInfo,
} = require("../src/index");
const { fixtures } = require("./helpers");

const { genericHtml, loginHtml, trainingInfoHtml, viewListHtml } = fixtures;

test("detectSessionState flags a login-form page as requiring login", () => {
  const state = detectSessionState({ url: HOME_URL, html: loginHtml });
  assert.equal(state.requiresLogin, true);
  assert.equal(state.reason, "login_form_detected");
});

test("detectSessionState flags a login-looking URL as requiring login even without markup", () => {
  const state = detectSessionState({ url: `${BASE_URL}/login.do`, html: "" });
  assert.equal(state.requiresLogin, true);
  assert.equal(state.reason, "login_url_redirect");
});

test("detectSessionState treats a generic page without login markers as authenticated", () => {
  const state = detectSessionState({ url: HOME_URL, html: genericHtml });
  assert.equal(state.requiresLogin, false);
  assert.equal(state.authenticated, true);
});

test("inspectYebigunPage classifies login pages but reports unknown for unverified authenticated pages", () => {
  const loginPage = inspectYebigunPage({ url: HOME_URL, html: loginHtml });
  assert.equal(loginPage.pageType, "login");
  assert.equal(loginPage.reloginRequired, true);

  const genericPage = inspectYebigunPage({ url: HOME_URL, html: genericHtml });
  assert.equal(genericPage.pageType, "unknown");
  assert.equal(genericPage.reloginRequired, false);
});

test("parseTrainingInfo throws a clear relogin error instead of guessing when the session is logged out", () => {
  assert.throws(() => parseTrainingInfo(loginHtml), /session is not authenticated or has expired/);
});

test("parseTrainingInfo extracts member info, this-year/prior-year trainings, and a year-over-year comparison", () => {
  const result = parseTrainingInfo(trainingInfoHtml);

  assert.equal(result.member.name, "테스트사용자");
  assert.equal(result.member.yearsOfService, "3");
  assert.equal(result.currentDisplayYear, "2026");
  assert.equal(result.trainings.length, 3);

  const thisYear = result.trainings[0];
  assert.equal(thisYear.year, "2026");
  assert.equal(thisYear.trainingType, "동원훈련Ⅱ형 1차");
  assert.equal(thisYear.startDate, "2026-08-10");
  assert.equal(thisYear.endDate, "2026-08-12");
  assert.equal(thisYear.location, "가상과학화예비군훈련장(가상시)");

  assert.equal(result.comparison.hasPreviousRecord, true);
  assert.deepEqual(
    result.comparison.changes.map((change) => change.field).sort(),
    ["endDate", "result", "startDate"],
  );
});

test("parseTrainingInfo handles a single-day past training without a date range", () => {
  const result = parseTrainingInfo(trainingInfoHtml);
  const basicTraining = result.trainings.find((training) => training.year === "2024");

  assert.equal(basicTraining.startDate, "2024-05-05");
  assert.equal(basicTraining.endDate, "2024-05-05");
});

test("parseGenericTable finds the data table's headers/rows and skips a header-less search-form table", () => {
  const result = parseGenericTable(viewListHtml);

  assert.deepEqual(result.headers, ["번호", "신청구분", "신청일자", "처리결과"]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], ["1", "가상신청구분", "2026-03-01", "승인"]);
});

test("parseGenericTable returns an empty table when there is no table header", () => {
  assert.deepEqual(parseGenericTable(genericHtml), { headers: [], rows: [] });
});
