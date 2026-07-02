const test = require("node:test");
const assert = require("node:assert/strict");

const { APPLICATION_MENUS, BASE_URL, TRAINING_INFO_URL } = require("../src/index");
const { fixtures, withMockedBrowserModule } = require("./helpers");

const { loginHtml, trainingInfoHtml } = fixtures;

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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() { state.closed = true; } }; } } };
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
    },
    async ({ openApplicationMenu }) => {
      await assert.rejects(() => openApplicationMenu("nationalUnit"), /session is not authenticated or has expired/);
    },
  );
});

test("openApplicationMenu navigates directly without reading sensitive HTML for goto-mode menus", async () => {
  const state = { closed: false, gotoUrl: null };

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          throw new Error("sensitive page HTML must not be read");
        },
        url() {
          return `${BASE_URL}${APPLICATION_MENUS.delay.path}`;
        },
        async title() {
          return "연기 신청";
        },
      };
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() { state.closed = true; } }; } } };
    },
    async ({ openApplicationMenu }) => {
      const result = await openApplicationMenu("delay");

      assert.equal(state.gotoUrl, `${BASE_URL}${APPLICATION_MENUS.delay.path}`);
      assert.equal(state.closed, true);
      assert.equal(result.menu, "delay");
      assert.equal(result.label, "훈련 연기신청");
      assert.equal(result.title, "연기 신청");
      assert.equal(result.pageInfo.pageType, "opened");
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
    },
    async ({ openApplicationMenu }) => {
      await assert.rejects(() => openApplicationMenu("hold"), /session is not authenticated or has expired/);
    },
  );
});
