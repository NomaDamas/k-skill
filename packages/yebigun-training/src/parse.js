const {
  APPLICATION_MENUS,
  BASE_URL,
  HOME_URL,
  TRAINING_INFO_PATH,
  TRAINING_INFO_URL,
  VIEW_MENUS,
  YEBIGUN_ENDPOINTS,
} = require("./menus");
const { parseGenericTable, parseInquiry } = require("./inquiry");

const TAG_PATTERN = /<[^>]+>/g, WHITESPACE_PATTERN = /\s+/g;

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

/**
 * Best-effort session-state detection for yebigun1.mil.kr: a password input
 * plus 로그인 wording, or a URL that looks like a login redirect. These
 * heuristics were confirmed against the real login page during Phase 2
 * (logged-in session) verification.
 */
function detectSessionState({ url = "", html = "" } = {}) {
  const normalizedUrl = String(url || "");
  const normalizedHtml = String(html || "");

  if (/login|lgn/i.test(normalizedUrl)) {
    return {
      authenticated: false,
      requiresLogin: true,
      reason: "login_url_redirect",
    };
  }

  const hasPasswordField = /<input[^>]*type=["']password["']/i.test(normalizedHtml);
  const mentionsLogin = /로그인/.test(normalizedHtml);

  if (hasPasswordField && mentionsLogin) {
    return {
      authenticated: false,
      requiresLogin: true,
      reason: "login_form_detected",
    };
  }

  return {
    authenticated: true,
    requiresLogin: false,
    reason: null,
  };
}

/**
 * Classifies a fetched page. "training-info" is recognized by the
 * IvdTraScheDetail.do page's #detailTb table, confirmed against a real
 * logged-in session (see SKILL.md Phase 2).
 */
function inspectYebigunPage({ url = "", html = "" } = {}) {
  const state = detectSessionState({ url, html });

  if (state.requiresLogin) {
    return {
      pageType: "login",
      reloginRequired: true,
      reason: state.reason,
    };
  }

  if (/id=["']detailTb["']/.test(String(html || ""))) {
    return {
      pageType: "training-info",
      reloginRequired: false,
      reason: null,
    };
  }

  return {
    pageType: "unknown",
    reloginRequired: false,
    reason: null,
  };
}

function textPreview(html, maxLength = 2000) {
  return stripTags(html).slice(0, maxLength);
}

function extractCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
}

function extractRows(sectionHtml) {
  return [...String(sectionHtml || "").matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
}

function extractSection(html, tableId) {
  const match = String(html || "").match(new RegExp(`<table[^>]*id=["']${tableId}["'][^>]*>([\\s\\S]*?)<\\/table>`));
  return match ? match[1] : "";
}

function parseDateRange(rawDateText) {
  const [start, end] = String(rawDateText || "")
    .split("~")
    .map((part) => part.trim().replace(/\./g, "-").replace(/-$/, ""));

  return {
    startDate: start || null,
    endDate: end || start || null,
  };
}

/**
 * Parses one row from either #detailTb (this year) or #detail2 (이전 훈련내용)
 * on the IvdTraScheDetail.do page. Both tables share the same 8-column shape:
 * 구분 / 훈련일자 / 계획시간 / 실시시간 / 잔여시간 / 훈련결과 / 훈련장 / 비고.
 * Skips the #detailTb "총계" (total) row, which is not an actual training event.
 */
function parseTrainingRow(rowHtml) {
  const cells = extractCells(rowHtml);
  if (cells.length < 8) {
    return null;
  }

  const [category, dateText, plannedHours, actualHours, remainingHours, result, location, remarks] = cells;
  if (category === "총계") {
    return null;
  }

  const { startDate, endDate } = parseDateRange(dateText);

  return {
    year: startDate ? startDate.slice(0, 4) : null,
    trainingType: category || null,
    startDate,
    endDate,
    plannedHours: plannedHours || null,
    actualHours: actualHours || null,
    remainingHours: remainingHours || null,
    result: result || null,
    location: location || null,
    remarks: remarks || null,
    traId: String(rowHtml || "").match(/data-tra-id=["']([^"']*)["']/)?.[1] || null,
  };
}

function parseMember(html) {
  const sectionMatch = String(html || "").match(/<caption>소속<\/caption>([\s\S]*?)<\/table>/);
  if (!sectionMatch) {
    return null;
  }

  const rows = extractRows(sectionMatch[1]);
  const bodyRow = rows.find((row) => /<td\b/i.test(row));
  const cells = bodyRow ? extractCells(bodyRow) : [];
  if (cells.length < 9) {
    return null;
  }

  const [unit, squad, rank, serviceNo, name, branch, yearsOfService, mobilizationType] = cells;

  return {
    unit: unit || null,
    squad: squad || null,
    rank: rank || null,
    serviceNo: serviceNo || null,
    name: name || null,
    branch: branch || null,
    yearsOfService: yearsOfService || null,
    mobilizationType: mobilizationType || null,
  };
}

function selectDiffFields(training) {
  return {
    trainingType: training.trainingType,
    startDate: training.startDate,
    endDate: training.endDate,
    location: training.location,
    plannedHours: training.plannedHours,
    result: training.result,
  };
}

/**
 * Diffs the (first/most-recent) training record for two years. Never
 * guesses: if either year has no record, says so explicitly instead of
 * fabricating a comparison.
 */
function diffTrainings(currentTraining, previousTraining) {
  if (!currentTraining) {
    return { hasCurrentRecord: false, hasPreviousRecord: Boolean(previousTraining), current: null, previous: previousTraining || null, changes: [] };
  }

  if (!previousTraining) {
    return { hasCurrentRecord: true, hasPreviousRecord: false, current: currentTraining, previous: null, changes: [] };
  }

  const a = selectDiffFields(currentTraining);
  const b = selectDiffFields(previousTraining);
  const changes = Object.keys(a)
    .filter((field) => a[field] !== b[field])
    .map((field) => ({ field, before: b[field] ?? null, after: a[field] ?? null }));

  return { hasCurrentRecord: true, hasPreviousRecord: true, current: currentTraining, previous: previousTraining, changes };
}

function trainingsForYear(trainings, year) {
  return trainings.filter((training) => training.year === String(year));
}

/**
 * Parses the IvdTraScheDetail.do ("나의 훈련정보" > "훈련정보") page: who the
 * member is, which display-year the page is showing, every training event
 * found in both the current-year table (#detailTb) and the prior-years table
 * (#detail2, already present in the DOM though visually collapsed), and a
 * ready-made comparison between the display year and the year before it.
 *
 * Confirmed against a real logged-in session on 2026-06-24 (see SKILL.md
 * Phase 2). If yebigun1.mil.kr changes this page's markup, the table-id-based
 * extraction below will simply find nothing rather than return wrong dates —
 * callers should treat an empty `trainings` array as "structure changed,
 * needs re-verification", not "no training scheduled".
 */
function parseTrainingInfo(html) {
  const pageInfo = inspectYebigunPage({ html });
  if (pageInfo.pageType === "login") {
    throw new Error("yebigun1.mil.kr session is not authenticated or has expired. Ask the user to log in again.");
  }

  const member = parseMember(html);

  const yearHeaderMatch = String(html || "").match(/훈련내용\((\d{4})년\)/);
  const currentDisplayYear = yearHeaderMatch ? yearHeaderMatch[1] : null;

  const currentYearRows = extractRows(extractSection(html, "detailTb"));
  const pastYearRows = extractRows(extractSection(html, "detail2"));
  const trainings = [...currentYearRows, ...pastYearRows]
    .map(parseTrainingRow)
    .filter(Boolean)
    .sort((left, right) => String(right.startDate).localeCompare(String(left.startDate)));

  let comparison = null;
  if (currentDisplayYear) {
    const compareYear = String(Number(currentDisplayYear) - 1);
    const current = trainingsForYear(trainings, currentDisplayYear)[0] || null;
    const previous = trainingsForYear(trainings, compareYear)[0] || null;
    comparison = { year: currentDisplayYear, compareYear, ...diffTrainings(current, previous) };
  }

  return { member, currentDisplayYear, trainings, comparison };
}

module.exports = {
  APPLICATION_MENUS,
  VIEW_MENUS,
  BASE_URL,
  HOME_URL,
  TRAINING_INFO_PATH,
  TRAINING_INFO_URL,
  YEBIGUN_ENDPOINTS,
  detectSessionState,
  diffTrainings,
  inspectYebigunPage,
  parseGenericTable,
  parseInquiry,
  parseTrainingInfo,
  stripTags,
  textPreview,
  trainingsForYear,
};
