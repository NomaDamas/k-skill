const test = require("node:test");
const assert = require("node:assert/strict");

const { BASE_URL, VIEW_MENUS } = require("../src/index");
const { fixtures, withMockedBrowserModule } = require("./helpers");

const { genericHtml, loginHtml, viewListHtml } = fixtures;

function loadingTableHtml() {
  return viewListHtml.replace(
    /(<thead>[\s\S]*?<\/thead>)\s*<tbody>[\s\S]*?<\/tbody>/,
    '$1<tbody><tr><td>Loading...</td></tr></tbody>',
  );
}

test("fetchInquiry rejects an unknown view menu without touching the browser", async () => {
  await withMockedBrowserModule(
    () => ({ chromium: { async connectOverCDP() { throw new Error("should not connect"); } } }),
    async ({ fetchInquiry }) => {
      await assert.rejects(() => fetchInquiry("notAMenu"), /Unknown view menu "notAMenu"/);
    },
  );
});

test("fetchInquiry polls past an AJAX loading placeholder instead of returning it as real data", async () => {
  let contentCallCount = 0;

  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          contentCallCount += 1;
          return contentCallCount === 1 ? loadingTableHtml() : viewListHtml;
        },
        url() {
          return `${BASE_URL}${VIEW_MENUS.applicationResults.path}`;
        },
        async waitForTimeout() {},
      };
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
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
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return loadingTableHtml();
        },
        url() {
          return `${BASE_URL}${VIEW_MENUS.applicationResults.path}`;
        },
        async waitForTimeout() {},
      };
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
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
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
    },
    async ({ fetchInquiry }) => {
      await assert.rejects(() => fetchInquiry("applicationResults"), /session is not authenticated or has expired/);
    },
  );
});

test("fetchInquiry treats a login redirect URL as expired even if the markup has no login form", async () => {
  await withMockedBrowserModule(
    () => {
      const page = {
        async goto() {},
        async content() {
          return genericHtml;
        },
        url() {
          return `${BASE_URL}/login.do`;
        },
        async waitForTimeout() {},
      };
      const context = { pages() { return [page]; } };
      return { chromium: { async connectOverCDP() { return { contexts() { return [context]; }, async close() {} }; } } };
    },
    async ({ fetchInquiry }) => {
      await assert.rejects(() => fetchInquiry("applicationResults"), /session is not authenticated or has expired/);
    },
  );
});
