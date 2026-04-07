const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

const {
  HIPASS_ENDPOINTS,
  buildDetailRequest,
  buildReceiptRequest,
  buildUsageHistoryQuery,
  inspectHipassPage,
  parseUsageHistoryList,
  RECEIPT_URL,
  USAGE_HISTORY_INIT_URL,
  USAGE_HISTORY_LIST_URL
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const usageHistoryHtml = fs.readFileSync(path.join(fixturesDir, "usage-history-list.html"), "utf8");
const loginHtml = fs.readFileSync(path.join(fixturesDir, "login-page.html"), "utf8");
const permissionHtml = fs.readFileSync(path.join(fixturesDir, "permission-check.html"), "utf8");

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

test("buildUsageHistoryQuery normalizes defaults for logged-in usage-history searches", () => {
  const query = buildUsageHistoryQuery({
    startDate: "2026-04-01",
    endDate: "2026-04-07",
    ecdNo: "QmFzZTY0RW5jcnlwdGVkQ2FyZE5vPT0=",
    cardCom: "005"
  });

  assert.deepEqual(query, {
    card_kind: "all",
    card_com: "005",
    ecd_no: "QmFzZTY0RW5jcnlwdGVkQ2FyZE5vPT0=",
    sDate: "20260401",
    eDate: "20260407",
    date_type: "work",
    biz_type: "on",
    pageSize: "30",
    pageNo: "1",
    order_type: "desc",
    order_item: "date",
    receipt_time_type: "display",
    in_ic_nm: "",
    out_ic_nm: "",
    in_ic_code: "",
    out_ic_code: "",
    w: "742",
    h: "436",
    inc_vat: "nodisplay"
  });
});

test("buildUsageHistoryQuery accepts the encryptedCardNumber alias and the CLI help documents it", () => {
  const query = buildUsageHistoryQuery({
    startDate: "2026-04-01",
    endDate: "2026-04-07",
    encryptedCardNumber: "alias-card-token"
  });

  assert.equal(query.ecd_no, "alias-card-token");

  const help = childProcess.execFileSync(process.execPath, [path.join(__dirname, "..", "src", "cli.js"), "--help"], {
    encoding: "utf8"
  });

  assert.match(help, /--encrypted-card-number VALUE/);
});

test("buildUsageHistoryQuery rejects invalid date windows and unsupported paging options", () => {
  assert.throws(
    () =>
      buildUsageHistoryQuery({
        startDate: "20260408",
        endDate: "20260407"
      }),
    /startDate must be on or before endDate/,
  );

  assert.throws(
    () =>
      buildUsageHistoryQuery({
        startDate: "20260401",
        endDate: "20260407",
        pageSize: 15
      }),
    /pageSize must be one of 10, 30, 50, 80, 100/,
  );
});

test("parseUsageHistoryList extracts transaction rows and the receipt/detail payloads", () => {
  const list = parseUsageHistoryList(usageHistoryHtml);

  assert.equal(list.query.sDate, "20260401");
  assert.equal(list.query.eDate, "20260407");
  assert.equal(list.rows.length, 2);
  assert.deepEqual(list.rows[0], {
    rowNumber: 1,
    workDateTime: "2026-04-07 08:30",
    hipassCard: "0020-01**-****-2086",
    cardAlias: "가족카드",
    vehicleClass: "1종",
    entryOffice: "서울TG",
    exitOffice: "판교IC",
    lane: "하이패스",
    transactionAmount: 1200,
    billingDate: "2026-04-10",
    chargeType: "출구",
    baseToll: 1200,
    payableToll: 1200,
    billAmount: 1200,
    detailRequest: {
      card_kind: "2",
      work_dates: "20260407083012",
      tolof_cd: "A12",
      work_no: "000123",
      vhclProsNo: "VH001"
    },
    receiptRequest: {
      card_kind: "2",
      work_dates: "20260407083012",
      tolof_cd: "A12",
      work_no: "000123",
      vhclProsNo: "VH001",
      receipt_time_type: "display",
      inc_vat: "nodisplay",
      w: "742",
      h: "436"
    }
  });
});

test("buildDetailRequest and buildReceiptRequest preserve the expected submit field names", () => {
  const row = parseUsageHistoryList(usageHistoryHtml).rows[1];

  assert.deepEqual(buildDetailRequest(row.detailRequest), {
    card_kind: "2",
    work_dates: "20260406201540",
    tolof_cd: "A12",
    work_no: "000124",
    vhclProsNo: "VH002"
  });

  assert.deepEqual(buildReceiptRequest(row.receiptRequest, { includeVat: true }), {
    card_kind: "2",
    work_dates: "20260406201540",
    tolof_cd: "A12",
    work_no: "000124",
    vhclProsNo: "VH002",
    receipt_time_type: "display",
    inc_vat: "display",
    w: "742",
    h: "436"
  });
});

test("inspectHipassPage flags login and permission-check pages as re-login-required", () => {
  const loginPage = inspectHipassPage(loginHtml);
  const permissionPage = inspectHipassPage(permissionHtml);
  const listPage = inspectHipassPage(usageHistoryHtml);

  assert.equal(loginPage.pageType, "login");
  assert.equal(loginPage.reloginRequired, true);
  assert.equal(loginPage.sessionTimeSeconds, 1200);
  assert.equal(loginPage.endpoints.sessionCheck, HIPASS_ENDPOINTS.sessionCheck);
  assert.equal(loginPage.endpoints.idPwLogin90Check, HIPASS_ENDPOINTS.idPwLogin90Check);

  assert.equal(permissionPage.pageType, "permission-check");
  assert.equal(permissionPage.reloginRequired, true);
  assert.equal(permissionPage.reason, "common_auth_check");

  assert.equal(listPage.pageType, "usage-history-list");
  assert.equal(listPage.reloginRequired, false);
});

test("list command accepts --encrypted-card-number and reaches the usage-history init endpoint with a mocked CDP browser", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hipass-receipt-playwright-"));
  const mockHookPath = path.join(tempDir, "mock-playwright.js");

  const fakeModuleSource = `
const Module = require("node:module");
const fixtureHtml = ${JSON.stringify(usageHistoryHtml)};
let submittedQuery = null;

const frame = {
  name() {
    return "if_main_post";
  },
  url() {
    return "https://www.hipass.co.kr/usepculr/UsePculrTabSearchList.do";
  },
  async waitForLoadState() {},
  async content() {
    return fixtureHtml.replace(
      'value="QmFzZTY0RW5jcnlwdGVkQ2FyZE5vPT0="',
      'value="' + (submittedQuery?.ecd_no || "") + '"',
    );
  }
};

const page = {
  async goto(url) {
    if (!url) {
      throw new Error("goto received undefined");
    }
  },
  async content() {
    return "<html><body>사용내역 조회</body></html>";
  },
  async evaluate(_callback, query) {
    submittedQuery = query;
  },
  frames() {
    return [frame];
  },
  async waitForTimeout() {}
};

const fakePlaywright = {
  chromium: {
    async connectOverCDP() {
      return {
        contexts() {
          return [{
            pages() {
              return [page];
            }
          }];
        }
      };
    }
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "playwright-core" || request === "playwright") {
    return fakePlaywright;
  }
  return originalLoad.call(this, request, parent, isMain);
};
`;

  fs.writeFileSync(mockHookPath, fakeModuleSource);

  const output = childProcess.execFileSync(
    process.execPath,
    [
      path.join(__dirname, "..", "src", "cli.js"),
      "list",
      "--start-date",
      "2026-04-01",
      "--end-date",
      "2026-04-07",
      "--encrypted-card-number",
      "ENC-ONLY-ALIAS"
    ],
    {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ""}--require ${mockHookPath}`
      }
    },
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.query.sDate, "20260401");
  assert.equal(parsed.query.ecd_no, "ENC-ONLY-ALIAS");
});

test("listUsageHistory uses the absolute usage-history URL and closes the browser connection", async () => {
  const state = {
    closed: false,
    gotoUrl: null
  };

  await withMockedBrowserModule(
    () => {
      const frame = {
        name() {
          return "if_main_post";
        },
        url() {
          return USAGE_HISTORY_LIST_URL;
        },
        async waitForLoadState() {},
        async content() {
          return usageHistoryHtml;
        }
      };

      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          return "<html><body>사용내역 조회</body></html>";
        },
        async evaluate() {},
        frames() {
          return [frame];
        },
        async waitForTimeout() {}
      };

      const context = {
        pages() {
          return [page];
        }
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
              }
            };
          }
        }
      };
    },
    async ({ listUsageHistory }) => {
      const parsed = await listUsageHistory({
        startDate: "2026-04-01",
        endDate: "2026-04-07"
      });

      assert.equal(parsed.rows.length, 2);
      assert.equal(state.gotoUrl, USAGE_HISTORY_INIT_URL);
      assert.equal(state.closed, true);
    },
  );
});

test("openReceiptPopup uses the receipt flow and closes the browser connection", async () => {
  const state = {
    closed: false,
    gotoUrl: null
  };

  await withMockedBrowserModule(
    () => {
      const popup = {
        url() {
          return RECEIPT_URL;
        },
        async title() {
          return "영수증 출력";
        },
        async waitForLoadState() {}
      };

      const frame = {
        name() {
          return "if_main_post";
        },
        url() {
          return USAGE_HISTORY_LIST_URL;
        },
        async waitForLoadState() {},
        async content() {
          return usageHistoryHtml;
        },
        locator() {
          return {
            nth() {
              return {
                async evaluate() {}
              };
            }
          };
        }
      };

      const page = {
        async goto(url) {
          state.gotoUrl = url;
        },
        async content() {
          return "<html><body>사용내역 조회</body></html>";
        },
        async evaluate() {},
        frames() {
          return [frame];
        },
        async waitForTimeout() {}
      };

      const context = {
        pages() {
          return [page];
        },
        async waitForEvent() {
          return popup;
        }
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
              }
            };
          }
        }
      };
    },
    async ({ openReceiptPopup }) => {
      const parsed = await openReceiptPopup({
        startDate: "2026-04-01",
        endDate: "2026-04-07",
        rowIndex: 1
      });

      assert.equal(parsed.popupCaptured, true);
      assert.equal(parsed.popupUrl, RECEIPT_URL);
      assert.equal(state.gotoUrl, USAGE_HISTORY_INIT_URL);
      assert.equal(state.closed, true);
    },
  );
});
