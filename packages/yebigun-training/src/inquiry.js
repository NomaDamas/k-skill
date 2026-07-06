function parseGenericTable(html) {
  const normalizedHtml = String(html || "");
  const theadMatch = normalizedHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  if (!theadMatch) {
    return { headers: [], rows: [] };
  }

  const headers = [...theadMatch[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
  const afterThead = normalizedHtml.slice(theadMatch.index + theadMatch[0].length);
  const tbodyMatch = afterThead.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) {
    return { headers, rows: [] };
  }

  return {
    headers,
    rows: extractRows(tbodyMatch[1])
      .map(extractCells)
      .filter((cells) => cells.some((cell) => cell)),
  };
}

function parseInquiry(menu, label, html, url = "") {
  const state = detectSessionState({ url, html });
  if (state.requiresLogin) {
    throw new Error("yebigun1.mil.kr session is not authenticated or has expired. Ask the user to log in again.");
  }

  return { menu, label, ...parseGenericTable(html) };
}

function extractCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
}

function extractRows(sectionHtml) {
  return [...String(sectionHtml || "").matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
}

function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function detectSessionState({ url = "", html = "" } = {}) {
  if (/login|lgn/i.test(String(url || ""))) {
    return { requiresLogin: true };
  }
  const hasPasswordField = /<input[^>]*type=["']password["']/i.test(String(html || ""));
  return { requiresLogin: hasPasswordField && /로그인/.test(String(html || "")) };
}

module.exports = {
  parseGenericTable,
  parseInquiry,
};
