const BASE_URL = "https://www.hipass.co.kr";
const LOGIN_URL = `${BASE_URL}/comm/lginpg.do`;
const USAGE_HISTORY_INIT_URL = `${BASE_URL}/usepculr/InitUsePculrTabSearch.do`;
const USAGE_HISTORY_LIST_URL = `${BASE_URL}/usepculr/UsePculrTabSearchList.do`;
const RECEIPT_URL = `${BASE_URL}/usepculr/UsePculrReceiptPrint.do`;
const DETAIL_URL = `${BASE_URL}/usepculr/UsePculrTabSearchListDetail.do`;

const HIPASS_ENDPOINTS = {
  login: "/comm/lginpg.do",
  loginPage: "https://www.hipass.co.kr/comm/lginpg.do",
  main: "https://www.hipass.co.kr/main.do",
  sessionCheck: "/comm/sessionCheck.do",
  sessionOut: "/comm//sessionout.do",
  sendLoginVerificationCode: "/comm/sendLoginVerificationCode.do",
  chkLoginVerificationCode: "/comm/chkLoginVerificationCode.do",
  idPwLogin: "/comm/IdPwLogin.do",
  idPwLogin90Check: "/comm/IdPwLogin_90Check.do",
  usageHistoryInit: "/usepculr/InitUsePculrTabSearch.do",
  usageHistoryList: "/usepculr/UsePculrTabSearchList.do",
  usageHistoryDetail: "/usepculr/UsePculrTabSearchListDetail.do",
  receiptPrint: "/usepculr/UsePculrReceiptPrint.do",
};

const ROW_COLUMN_KEYS = [
  "rowNumber",
  "workDateTime",
  "cardNumberMasked",
  "cardAlias",
  "vehicleType",
  "inTollgateName",
  "outTollgateName",
  "laneType",
  "transactionAmount",
  "billDate",
  "category",
  "baseToll",
  "paidToll",
  "billedAmount",
];

const TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;

function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(TAG_PATTERN, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function normalizeCompactDate(value, fieldName) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 8) {
    throw new Error(`${fieldName} must be a YYYYMMDD-compatible date`);
  }
  return digits;
}

function toStringOrDefault(value, fallback) {
  return value == null || value === "" ? fallback : String(value);
}

function buildUsageHistorySearchPayload(options = {}) {
  return {
    card_kind: toStringOrDefault(options.cardKind, "all"),
    card_com: toStringOrDefault(options.cardCompany, "all"),
    ecd_no: toStringOrDefault(options.encryptedCardNumber, "all"),
    sDate: normalizeCompactDate(options.startDate, "startDate"),
    eDate: normalizeCompactDate(options.endDate, "endDate"),
    date_type: toStringOrDefault(options.dateType, "work"),
    biz_type: toStringOrDefault(options.roadType, "on"),
    pageSize: toStringOrDefault(options.pageSize, "10"),
    pageNo: toStringOrDefault(options.pageNo, "1"),
    order_type: toStringOrDefault(options.orderType, "desc"),
    order_item: toStringOrDefault(options.orderItem, "date"),
    receipt_time_type: toStringOrDefault(options.receiptTimeType, "display"),
    in_ic_nm: toStringOrDefault(options.inTollgateName, ""),
    out_ic_nm: toStringOrDefault(options.outTollgateName, ""),
    in_ic_code: toStringOrDefault(options.inTollgateCode, ""),
    out_ic_code: toStringOrDefault(options.outTollgateCode, ""),
    w: toStringOrDefault(options.popupWidth, "742"),
    h: toStringOrDefault(options.popupHeight, "436"),
    inc_vat: toStringOrDefault(options.includeVat, "nodisplay"),
  };
}

function buildUsageHistoryQuery(options = {}) {
  const startDate = normalizeCompactDate(options.startDate, "startDate");
  const endDate = normalizeCompactDate(options.endDate, "endDate");
  const pageSize = Number(toStringOrDefault(options.pageSize, "30"));
  if (![10, 30, 50, 80, 100].includes(pageSize)) {
    throw new Error("pageSize must be one of 10, 30, 50, 80, 100");
  }
  if (startDate > endDate) {
    throw new Error("startDate must be on or before endDate");
  }

  return {
    card_kind: toStringOrDefault(options.cardKind, "all"),
    card_com: toStringOrDefault(options.cardCom ?? options.cardCompany, "all"),
    ecd_no: toStringOrDefault(options.ecdNo ?? options.encryptedCardNumber, "all"),
    sDate: startDate,
    eDate: endDate,
    date_type: toStringOrDefault(options.dateType, "work"),
    biz_type: toStringOrDefault(options.bizType, "on"),
    pageSize: String(pageSize),
    pageNo: toStringOrDefault(options.pageNo, "1"),
    order_type: toStringOrDefault(options.orderType, "desc"),
    order_item: toStringOrDefault(options.orderItem, "date"),
    receipt_time_type: toStringOrDefault(options.receiptTimeType, "display"),
    in_ic_nm: toStringOrDefault(options.inIcName, ""),
    out_ic_nm: toStringOrDefault(options.outIcName, ""),
    in_ic_code: toStringOrDefault(options.inIcCode, ""),
    out_ic_code: toStringOrDefault(options.outIcCode, ""),
    w: toStringOrDefault(options.width, "742"),
    h: toStringOrDefault(options.height, "436"),
    inc_vat: toStringOrDefault(options.incVat, "nodisplay"),
  };
}

function detectSessionState({ url = "", html = "" } = {}) {
  const normalizedUrl = String(url || "");
  const normalizedHtml = String(html || "");

  if (/\/comm\/lginpg\.do(?:\?|$)/.test(normalizedUrl)) {
    return {
      authenticated: false,
      requiresLogin: true,
      reason: "login_redirect",
      messageType: null,
    };
  }

  const messageTypeMatch = normalizedHtml.match(/var\s+mgs_type\s*=\s*(\d+)/);
  const messageType = messageTypeMatch ? Number(messageTypeMatch[1]) : null;

  if (messageType === 11) {
    return {
      authenticated: false,
      requiresLogin: true,
      reason: "login_required",
      messageType,
    };
  }

  if (messageType === 12) {
    return {
      authenticated: false,
      requiresLogin: true,
      reason: "session_out",
      messageType,
    };
  }

  if (/\/comm\/lginpg\.do/.test(normalizedHtml) && /로그인/.test(normalizedHtml)) {
    return {
      authenticated: false,
      requiresLogin: true,
      reason: "login_redirect",
      messageType,
    };
  }

  return {
    authenticated: true,
    requiresLogin: false,
    reason: null,
    messageType,
  };
}

function extractBodyRows(html) {
  const tbodyMatch = String(html || "").match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) {
    return [];
  }

  return [...tbodyMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[0]);
}

function extractCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
}

function parseReceiptAction(rowHtml) {
  const candidatePattern = /<(a|button|input)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)\/>/gi;
  const candidates = [];

  for (const match of rowHtml.matchAll(candidatePattern)) {
    const controlType = (match[1] || "input").toLowerCase();
    const attrs = (match[2] || match[4] || "").trim();
    const inlineText = controlType === "input" ? "" : stripTags(match[3] || "");
    const valueMatch = attrs.match(/\bvalue\s*=\s*"([^"]*)"|\bvalue\s*=\s*'([^']*)'/i);
    const classMatch = attrs.match(/\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/i);
    const onclickMatch = attrs.match(/\bonclick\s*=\s*"([^"]*)"|\bonclick\s*=\s*'([^']*)'/i);
    const label = stripTags(inlineText || valueMatch?.[1] || valueMatch?.[2] || "");

    candidates.push({
      controlType,
      className: classMatch?.[1] || classMatch?.[2] || "",
      onclick: onclickMatch?.[1] || onclickMatch?.[2] || "",
      label,
    });
  }

  return (
    candidates.find((candidate) => /영수증|출력/.test(candidate.label) || /receipt/i.test(candidate.className)) ||
    null
  );
}

function parseHiddenFields(html) {
  const fields = {};
  for (const match of String(html || "").matchAll(/<input\b[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi)) {
    fields[match[1]] = match[2];
  }
  return fields;
}

function parseFunctionArgs(onclick, functionName) {
  const match = String(onclick || "").match(new RegExp(`${functionName}\\(([^)]*)\\)`));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((arg) => arg[1] || arg[2] || "");
}

function parseAmount(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function buildDetailRequest(detailRequest) {
  return {
    card_kind: detailRequest.card_kind,
    work_dates: detailRequest.work_dates,
    tolof_cd: detailRequest.tolof_cd,
    work_no: detailRequest.work_no,
    vhclProsNo: detailRequest.vhclProsNo,
  };
}

function buildReceiptRequest(receiptRequest, options = {}) {
  return {
    ...buildDetailRequest(receiptRequest),
    receipt_time_type: toStringOrDefault(receiptRequest.receipt_time_type, "display"),
    inc_vat: options.includeVat ? "display" : toStringOrDefault(receiptRequest.inc_vat, "nodisplay"),
    w: toStringOrDefault(receiptRequest.w, "742"),
    h: toStringOrDefault(receiptRequest.h, "436"),
  };
}

function parseUsageHistoryList(html) {
  const state = detectSessionState({ html });
  const hiddenFields = parseHiddenFields(html);
  const rows = extractBodyRows(html);
  const normalizedRows = rows
    .map((rowHtml, index) => {
      const cells = extractCells(rowHtml);
      if (cells.length < ROW_COLUMN_KEYS.length) {
        return null;
      }

      const detailAction = [...String(rowHtml || "").matchAll(/<a\b[^>]*onclick="([^"]*viewDetail[^"]*)"[^>]*>/gi)][0]?.[1] || "";
      const receiptAction = [...String(rowHtml || "").matchAll(/<a\b[^>]*onclick="([^"]*printReceipt[^"]*)"[^>]*>/gi)][0]?.[1] || "";
      const detailArgs = parseFunctionArgs(detailAction, "viewDetail");
      const receiptArgs = parseFunctionArgs(receiptAction, "printReceipt");

      const row = {
        rowNumber: Number(cells[0]),
        workDateTime: cells[1],
        hipassCard: cells[2],
        cardAlias: cells[3],
        vehicleClass: cells[4],
        entryOffice: cells[5],
        exitOffice: cells[6],
        lane: cells[7],
        transactionAmount: parseAmount(cells[8]),
        billingDate: cells[9],
        chargeType: cells[10],
        baseToll: parseAmount(cells[11]),
        payableToll: parseAmount(cells[12]),
        billAmount: parseAmount(cells[13]),
        detailRequest: buildDetailRequest({
          card_kind: detailArgs[0],
          work_dates: detailArgs[1],
          tolof_cd: detailArgs[2],
          work_no: detailArgs[3],
          vhclProsNo: detailArgs[4],
        }),
        receiptRequest: buildReceiptRequest({
          card_kind: receiptArgs[0],
          work_dates: receiptArgs[1],
          tolof_cd: receiptArgs[2],
          work_no: receiptArgs[3],
          vhclProsNo: receiptArgs[4],
          receipt_time_type: receiptArgs[5],
          inc_vat: receiptArgs[6],
          w: hiddenFields.w || "742",
          h: hiddenFields.h || "436",
        }),
      };

      return {
        row,
        item: {
          rowIndex: index + 1,
          rowNumber: row.rowNumber,
          workDateTime: row.workDateTime,
          cardNumberMasked: row.hipassCard,
          cardAlias: row.cardAlias,
          vehicleType: row.vehicleClass,
          inTollgateName: row.entryOffice,
          outTollgateName: row.exitOffice,
          laneType: row.lane,
          transactionAmount: `${row.transactionAmount.toLocaleString("en-US")}원`,
          billDate: row.billingDate,
          category: row.chargeType,
          baseToll: `${row.baseToll.toLocaleString("en-US")}원`,
          paidToll: `${row.payableToll.toLocaleString("en-US")}원`,
          billedAmount: `${row.billAmount.toLocaleString("en-US")}원`,
          rawHtml: rowHtml,
          receiptAction: parseReceiptAction(rowHtml),
          detailRequest: row.detailRequest,
          receiptRequest: row.receiptRequest,
        },
      };
    })
    .filter(Boolean);

  return {
    state,
    query: {
      card_kind: hiddenFields.card_kind || "",
      card_com: hiddenFields.card_com || "",
      ecd_no: hiddenFields.ecd_no || "",
      sDate: hiddenFields.sDate || "",
      eDate: hiddenFields.eDate || "",
      date_type: hiddenFields.date_type || "",
      biz_type: hiddenFields.biz_type || "",
      pageSize: hiddenFields.pageSize || "",
      pageNo: hiddenFields.pageNo || "",
      order_type: hiddenFields.order_type || "",
      order_item: hiddenFields.order_item || "",
    },
    rows: normalizedRows.map((entry) => entry.row),
    items: normalizedRows.map((entry) => entry.item),
    meta: {
      listUrl: USAGE_HISTORY_LIST_URL,
      receiptUrl: RECEIPT_URL,
      detailUrl: DETAIL_URL,
    },
  };
}

function sameValue(expected, actual) {
  return stripTags(expected).toLowerCase() === stripTags(actual).toLowerCase();
}

function findUsageHistoryEntry(items, criteria = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No usage-history rows are available");
  }

  const normalizedCriteria = Object.entries(criteria).filter(([, value]) => value != null && value !== "");
  const match = items.find((item) =>
    normalizedCriteria.every(([key, value]) => {
      if (key === "rowIndex") {
        return item.rowIndex === Number(value);
      }
      return sameValue(value, item[key]);
    }),
  );

  if (!match) {
    throw new Error("No matching usage-history row found for the provided criteria");
  }

  return match;
}

function inspectHipassPage(html) {
  const normalizedHtml = String(html || "");
  const sessionTimeMatch =
    normalizedHtml.match(/id="session_time"[^>]*value="(\d+)"/i) || normalizedHtml.match(/var\s+session_time\s*=\s*(\d+)/);
  const sessionTimeSeconds = sessionTimeMatch ? Number(sessionTimeMatch[1]) : null;

  if (/sendLoginVerificationCode\.do/.test(normalizedHtml) || /개인\/외국인 로그인/.test(normalizedHtml)) {
    return {
      pageType: "login",
      reloginRequired: true,
      sessionTimeSeconds,
      endpoints: HIPASS_ENDPOINTS,
      reason: "manual_login_required",
    };
  }

  if (/CommonAuthCheck\.jsp/.test(normalizedHtml) || /var\s+mgs_type\s*=/.test(normalizedHtml)) {
    return {
      pageType: "permission-check",
      reloginRequired: true,
      sessionTimeSeconds,
      endpoints: HIPASS_ENDPOINTS,
      reason: "common_auth_check",
    };
  }

  if (/UsePculrTabSearchList\.do/.test(normalizedHtml) || /사용내역 조회/.test(normalizedHtml)) {
    return {
      pageType: "usage-history-list",
      reloginRequired: false,
      sessionTimeSeconds,
      endpoints: HIPASS_ENDPOINTS,
      reason: null,
    };
  }

  return {
    pageType: "unknown",
    reloginRequired: false,
    sessionTimeSeconds,
    endpoints: HIPASS_ENDPOINTS,
    reason: null,
  };
}

module.exports = {
  BASE_URL,
  HIPASS_ENDPOINTS,
  LOGIN_URL,
  RECEIPT_URL,
  USAGE_HISTORY_INIT_URL,
  USAGE_HISTORY_LIST_URL,
  buildDetailRequest,
  buildReceiptRequest,
  buildUsageHistoryQuery,
  buildUsageHistorySearchPayload,
  detectSessionState,
  findUsageHistoryEntry,
  inspectHipassPage,
  parseUsageHistoryList,
  stripTags,
};
