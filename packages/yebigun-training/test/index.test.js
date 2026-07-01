const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const {
  BASE_URL,
  HOME_URL,
  TRAINING_INFO_URL,
  APPLICATION_MENUS,
  VIEW_MENUS,
  detectSessionState,
  inspectYebigunPage,
  parseGenericTable,
  parseTrainingInfo,
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const loginHtml = fs.readFileSync(path.join(fixturesDir, "login-page.html"), "utf8");
const genericHtml = fs.readFileSync(path.join(fixturesDir, "generic-page.html"), "utf8");
const trainingInfoHtml = fs.readFileSync(path.join(fixturesDir, "training-info-page.html"), "utf8");
const viewListHtml = fs.readFileSync(path.join(fixturesDir, "view-list-page.html"), "utf8");

async function withMockedBrowserModule(factory, callback) {
  const browserModulePath = require.resolve("../src/browser");
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "playwright-core" || request === "playwright") {
      return factory();
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[browserModulePath];

  try {
    const browserModule = require("../src/browser");
    return await callback(browserModule);
  } finally {
    Module._load = originalLoad;
    delete require.cache[browserModulePath];
  }
}

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

test("parseTrainingInfo handles a single-day past training (no '~' date range)", () => {
  const result = parseTrainingInfo(trainingInfoHtml);
  const basicTraining = result.trainings.find((training) => training.year === "2024");

  assert.equal(basicTraining.startDate, "2024-05-05");
  assert.equal(basicTraining.endDate, "2024-05-05");
});

test("--help documents the read-only, login-session-only scope", () => {
  const help = childProcess.execFileSync(process.execPath, [path.join(__dirname, "..", "src", "cli.js"), "--help"], {
    encoding: "utf8",
  });

  assert.match(help, /logged-in browser session/);
  assert.match(help, /never automates PASS/);
});

test("inspectPage navigates with the resolved target URL and closes the browser connection using a mocked CDP browser", async () => {
  const state = { closed: false, gotoUrl: null };

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          return genericHtml;
        },
        url() {
          return `${BASE_URL}/mypage/training.do`;
        },
        async title() {
          return "나의 훈련정보";
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return {
              contexts() {
                return [context];
              },
              async close() {
                state.closed = true;
              },
            };
          },
        },
      };
    },
    async ({ inspectPage }) => {
      const result = await inspectPage({ path: "/mypage/training.do" });

      assert.equal(state.gotoUrl, `${BASE_URL}/mypage/training.do`);
      assert.equal(state.closed, true);
      assert.equal(result.title, "나의 훈련정보");
      assert.equal(result.pageInfo.pageType, "unknown");
    },
  );
});

test("fetchTrainingInfo navigates straight to TRAINING_INFO_URL, parses it, and closes the connection using a mocked CDP browser", async () => {
  const state = { closed: false, gotoUrl: null };

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          return trainingInfoHtml;
        },
        url() {
          return TRAINING_INFO_URL;
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return {
              contexts() {
                return [context];
              },
              async close() {
                state.closed = true;
              },
            };
          },
        },
      };
    },
    async ({ fetchTrainingInfo }) => {
      const result = await fetchTrainingInfo();

      assert.equal(state.gotoUrl, TRAINING_INFO_URL);
      assert.equal(state.closed, true);
      assert.equal(result.member.name, "테스트사용자");
      assert.equal(result.comparison.year, "2026");
    },
  );
});

test("fetchTrainingInfo throws a relogin error instead of returning stale data when the session expired", async () => {
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return loginHtml;
        },
        url() {
          return `${BASE_URL}/login.do`;
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return {
              contexts() {
                return [context];
              },
              async close() {},
            };
          },
        },
      };
    },
    async ({ fetchTrainingInfo }) => {
      await assert.rejects(() => fetchTrainingInfo(), /session is not authenticated or has expired/);
    },
  );
});

test("openApplicationMenu clicks the matching button label and stops at the next screen without submitting anything", async () => {
  const state = { closed: false, gotoUrl: null, evaluatedLabel: null };

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          return trainingInfoHtml;
        },
        url() {
          return TRAINING_INFO_URL;
        },
        async evaluate(fn, label) {
          state.evaluatedLabel = label;
          return label === APPLICATION_MENUS.selfSelect.label;
        },
        async waitForLoadState() {},
        async title() {
          return "훈련일정 자율선택";
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return {
              contexts() {
                return [context];
              },
              async close() {
                state.closed = true;
              },
            };
          },
        },
      };
    },
    async ({ openApplicationMenu }) => {
      const result = await openApplicationMenu("selfSelect");

      assert.equal(state.gotoUrl, TRAINING_INFO_URL);
      assert.equal(state.evaluatedLabel, APPLICATION_MENUS.selfSelect.label);
      assert.equal(state.closed, true);
      assert.equal(result.menu, "selfSelect");
      assert.equal(result.label, "훈련일정 자율선택");
    },
  );
});

test("openApplicationMenu rejects an unknown menu key without touching the browser", async () => {
  await withMockedBrowserModule(
    () => ({ chromium: { async connectOverCDP() { throw new Error("should not connect"); } } }),
    async ({ openApplicationMenu }) => {
      await assert.rejects(() => openApplicationMenu("apply"), /Unknown menu "apply"/);
    },
  );
});

test("openApplicationMenu throws instead of guessing when the matching button cannot be found", async () => {
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return trainingInfoHtml;
        },
        url() {
          return TRAINING_INFO_URL;
        },
        async evaluate() {
          return false;
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return { contexts() { return [context]; }, async close() {} };
          },
        },
      };
    },
    async ({ openApplicationMenu }) => {
      await assert.rejects(() => openApplicationMenu("holiday"), /Could not find the "휴일예비군 훈련신청" button/);
    },
  );
});

test("openApplicationMenu throws a relogin error instead of clicking anything when the session expired", async () => {
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return loginHtml;
        },
        url() {
          return `${BASE_URL}/login.do`;
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return { contexts() { return [context]; }, async close() {} };
          },
        },
      };
    },
    async ({ openApplicationMenu }) => {
      await assert.rejects(() => openApplicationMenu("nationalUnit"), /session is not authenticated or has expired/);
    },
  );
});

test("openApplicationMenu navigates directly (no click) for goto-mode menus like 훈련 연기신청", async () => {
  const state = { closed: false, gotoUrl: null };

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          return genericHtml;
        },
        url() {
          return `${BASE_URL}${APPLICATION_MENUS.delay.path}`;
        },
        async title() {
          return "연기 신청";
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return {
              contexts() {
                return [context];
              },
              async close() {
                state.closed = true;
              },
            };
          },
        },
      };
    },
    async ({ openApplicationMenu }) => {
      const result = await openApplicationMenu("delay");

      assert.equal(state.gotoUrl, `${BASE_URL}${APPLICATION_MENUS.delay.path}`);
      assert.equal(state.closed, true);
      assert.equal(result.menu, "delay");
      assert.equal(result.label, "훈련 연기신청");
      assert.equal(result.title, "연기 신청");
    },
  );
});

test("openApplicationMenu throws a relogin error for goto-mode menus too, instead of landing on a stale form", async () => {
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return loginHtml;
        },
        url() {
          return `${BASE_URL}/login.do`;
        },
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return { contexts() { return [context]; }, async close() {} };
          },
        },
      };
    },
    async ({ openApplicationMenu }) => {
      await assert.rejects(() => openApplicationMenu("hold"), /session is not authenticated or has expired/);
    },
  );
});

test("editProfile and honors are routed to APPLICATION_MENUS (navigation-only), not VIEW_MENUS", () => {
  assert.equal(APPLICATION_MENUS.editProfile.mode, "goto");
  assert.equal(APPLICATION_MENUS.honors.mode, "goto");
  assert.equal("editProfile" in VIEW_MENUS, false);
  assert.equal("honors" in VIEW_MENUS, false);
});

test("parseGenericTable finds the data table's headers/rows and skips a header-less search-form table", () => {
  const result = parseGenericTable(viewListHtml);

  assert.deepEqual(result.headers, ["번호", "신청구분", "신청일자", "처리결과"]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], ["1", "가상신청구분", "2026-03-01", "승인"]);
});

test("parseGenericTable returns an empty table when there is no <thead> at all", () => {
  assert.deepEqual(parseGenericTable(genericHtml), { headers: [], rows: [] });
});

test("fetchInquiry rejects an unknown view menu without touching the browser", async () => {
  await withMockedBrowserModule(
    () => ({ chromium: { async connectOverCDP() { throw new Error("should not connect"); } } }),
    async ({ fetchInquiry }) => {
      await assert.rejects(() => fetchInquiry("notAMenu"), /Unknown view menu "notAMenu"/);
    },
  );
});

test("fetchInquiry polls past an AJAX 'Loading...' placeholder instead of returning it as real data", async () => {
  let contentCallCount = 0;
  const loadingHtml = viewListHtml.replace(
    /(<thead>[\s\S]*?<\/thead>)\s*<tbody>[\s\S]*?<\/tbody>/,
    '$1<tbody><tr><td>Loading...</td></tr></tbody>',
  );

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          contentCallCount += 1;
          return contentCallCount === 1 ? loadingHtml : viewListHtml;
        },
        url() {
          return `${BASE_URL}${VIEW_MENUS.applicationResults.path}`;
        },
        async waitForTimeout() {},
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return { contexts() { return [context]; }, async close() {} };
          },
        },
      };
    },
    async ({ fetchInquiry }) => {
      const result = await fetchInquiry("applicationResults");

      assert.equal(contentCallCount > 1, true);
      assert.equal(result.rows.length, 2);
      assert.deepEqual(result.rows[0], ["1", "가상신청구분", "2026-03-01", "승인"]);
    },
  );
});

test("fetchInquiry throws instead of returning a placeholder forever if the list never finishes loading", async () => {
  const loadingHtml = viewListHtml.replace(
    /(<thead>[\s\S]*?<\/thead>)\s*<tbody>[\s\S]*?<\/tbody>/,
    '$1<tbody><tr><td>Loading...</td></tr></tbody>',
  );

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return loadingHtml;
        },
        url() {
          return `${BASE_URL}${VIEW_MENUS.applicationResults.path}`;
        },
        async waitForTimeout() {},
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return { contexts() { return [context]; }, async close() {} };
          },
        },
      };
    },
    async ({ fetchInquiry }) => {
      await assert.rejects(() => fetchInquiry("applicationResults"), /did not finish loading in time/);
    },
  );
});

test("fetchInquiry throws a relogin error instead of returning a stale list when the session expired", async () => {
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return loginHtml;
        },
        url() {
          return `${BASE_URL}/login.do`;
        },
        async waitForTimeout() {},
      };

      const context = {
        pages() {
          return [page];
        },
      };

      return {
        chromium: {
          async connectOverCDP() {
            return { contexts() { return [context]; }, async close() {} };
          },
        },
      };
    },
    async ({ fetchInquiry }) => {
      await assert.rejects(() => fetchInquiry("applicationResults"), /session is not authenticated or has expired/);
    },
  );
});
