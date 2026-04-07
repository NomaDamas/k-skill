const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  HIPASS_ENDPOINTS,
  buildDetailRequest,
  buildReceiptRequest,
  buildUsageHistoryQuery,
  inspectHipassPage,
  parseUsageHistoryList
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const usageHistoryHtml = fs.readFileSync(path.join(fixturesDir, "usage-history-list.html"), "utf8");
const loginHtml = fs.readFileSync(path.join(fixturesDir, "login-page.html"), "utf8");
const permissionHtml = fs.readFileSync(path.join(fixturesDir, "permission-check.html"), "utf8");

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
