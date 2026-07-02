const test = require("node:test");
const assert = require("node:assert/strict");

const { BASE_URL, TRAINING_INFO_URL } = require("../src/index");
const { fixtures, withMockedBrowserModule } = require("./helpers");

const { genericHtml, loginHtml, trainingInfoHtml } = fixtures;

test("inspectPage navigates with the resolved target URL and closes the mocked CDP connection", async () => {
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() { state.closed = true; } }; } } };
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

test("fetchTrainingInfo navigates straight to TRAINING_INFO_URL, parses it, and closes the mocked connection", async () => {
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() { state.closed = true; } }; } } };
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
    },
    async ({ fetchTrainingInfo }) => {
      await assert.rejects(() => fetchTrainingInfo(), /session is not authenticated or has expired/);
    },
  );
});
