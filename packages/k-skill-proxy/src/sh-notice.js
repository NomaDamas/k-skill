// SH 공고/공지 (Seoul Housing & Communities Corporation) scraper.
// SH does not expose the same data.go.kr envelope as LH for this board, so this
// wrapper reads the official i-sh.co.kr board HTML and normalizes list/detail rows.

const SH_BASE_URL = "https://www.i-sh.co.kr";
const SH_NOTICE_PATH = "/app/lay2/program/S48T1581C563/www/brd/m_247";
const SH_LIST_URL = `${SH_BASE_URL}${SH_NOTICE_PATH}/list.do`;
const SH_VIEW_URL = `${SH_BASE_URL}${SH_NOTICE_PATH}/view.do`;
const DEFAULT_MULTI_ITM_SEQ = "2";

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).replace(/\s+/g, " ").trim();
  return trimmed || null;
}

function decodeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function absolutizeUrl(url) {
  const clean = decodeHtml(url || "").trim();
  if (!clean) return null;
  return new URL(clean, SH_BASE_URL).toString();
}

function parseBoundedInt(value, { defaultValue, min, max, label }) {
  if (value === undefined || value === null || String(value).trim() === "") return defaultValue;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error(`Provide valid ${label}.`);
  const parsed = Number.parseInt(text, 10);
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function normalizeShNoticeSearchQuery(query) {
  const srchTp = trimOrNull(query.srchTp ?? query.searchType ?? query.type);
  if (srchTp && !["title", "content", "1", "2", "제목", "내용"].includes(srchTp)) {
    throw new Error("srchTp must be title/content or 제목/내용.");
  }
  const mappedSrchTp = srchTp === "title" || srchTp === "제목" ? "1" : srchTp === "content" || srchTp === "내용" ? "2" : srchTp;
  return {
    page: parseBoundedInt(query.page ?? query.pageNo, { defaultValue: 1, min: 1, max: 1000, label: "page" }),
    pageSize: parseBoundedInt(query.pageSize ?? query.limit, { defaultValue: 10, min: 1, max: 100, label: "pageSize" }),
    srchWord: trimOrNull(query.srchWord ?? query.q ?? query.query ?? query.keyword),
    srchTp: mappedSrchTp || null,
    multiItmSeq: trimOrNull(query.multiItmSeq ?? query.multi_itm_seq) || DEFAULT_MULTI_ITM_SEQ
  };
}

function normalizeShNoticeDetailQuery(query) {
  const seq = trimOrNull(query.seq ?? query.noticeSeq ?? query.id);
  if (!seq) throw new Error("Provide seq.");
  if (!/^\d{1,20}$/.test(seq)) throw new Error("seq must be digits only.");
  return {
    seq,
    multiItmSeq: trimOrNull(query.multiItmSeq ?? query.multi_itm_seq) || DEFAULT_MULTI_ITM_SEQ
  };
}

function buildSearchUrl(filters) {
  const url = new URL(SH_LIST_URL);
  url.searchParams.set("multi_itm_seq", filters.multiItmSeq || DEFAULT_MULTI_ITM_SEQ);
  if (filters.page) url.searchParams.set("page", String(filters.page));
  if (filters.srchWord) url.searchParams.set("srchWord", filters.srchWord);
  if (filters.srchTp) url.searchParams.set("srchTp", filters.srchTp);
  return url;
}

function buildDetailUrl(filters) {
  const url = new URL(SH_VIEW_URL);
  url.searchParams.set("multi_itm_seq", filters.multiItmSeq || DEFAULT_MULTI_ITM_SEQ);
  url.searchParams.set("seq", filters.seq);
  return url;
}

function extractTotalCount(html) {
  const text = stripTags(html);
  const match = text.match(/총\s*([0-9,]+)\s*건/);
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function parseListRows(html, filters = {}) {
  const tbodyMatch = String(html || "").match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const tbody = tbodyMatch ? tbodyMatch[1] : String(html || "");
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbody))) {
    const row = rowMatch[1];
    const seqMatch = row.match(/getDetailView\(['"]?(\d+)['"]?\)/i);
    if (!seqMatch) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 5) continue;
    const titleAnchor = cells[1].match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const rawTitle = (titleAnchor ? titleAnchor[1] : cells[1]).replace(/<span[^>]*class=["'][^"']*icoNew[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ");
    const title = trimOrNull(stripTags(rawTitle).replace(/^NEW\s*/i, ""));
    const seq = seqMatch[1];
    rows.push({
      seq,
      number: trimOrNull(stripTags(cells[0])),
      title,
      department: trimOrNull(stripTags(cells[2])),
      registered_date: trimOrNull(stripTags(cells[3])),
      views: (() => {
        const v = trimOrNull(stripTags(cells[4]));
        return v && /^[0-9,]+$/.test(v) ? Number.parseInt(v.replace(/,/g, ""), 10) : null;
      })(),
      is_new: /icoNew/i.test(cells[1]),
      detail_url: buildDetailUrl({ seq, multiItmSeq: filters.multiItmSeq || DEFAULT_MULTI_ITM_SEQ }).toString()
    });
  }
  return rows;
}

function parseAttachments(html, seq) {
  const attachments = [];
  const rowRegex = /<tr[^>]*>[\s\S]*?<th[^>]*>\s*첨부\s*<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(String(html || "")))) {
    const cell = match[1];
    const fileAnchor = cell.match(/<a[^>]*class=["'][^"']*btnAttach[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const filename = trimOrNull(stripTags(fileAnchor ? fileAnchor[1] : ""));
    if (!filename) continue;
    const previewMatch = cell.match(/<a[^>]*href=["']([^"']*htmlConverter\.do[^"']*)["'][^>]*>/i);
    const previewUrl = previewMatch ? absolutizeUrl(previewMatch[1]) : null;
    const fileSeqMatch = previewUrl ? previewUrl.match(/[?&]file_seq=(\d+)/) : null;
    attachments.push({
      filename,
      file_seq: fileSeqMatch ? fileSeqMatch[1] : null,
      preview_url: previewUrl,
      download_hint: seq && fileSeqMatch ? `${SH_BASE_URL}/app/com/file/fileDown.do?brd_id=GS0401&seq=${seq}&file_seq=${fileSeqMatch[1]}` : null
    });
  }
  return attachments;
}

function parseDetail(html, filters) {
  const titleMatch = String(html || "").match(/<caption>([\s\S]*?)<\/caption>/i) || String(html || "").match(/<thead>[\s\S]*?<th[^>]*colspan=["']2["'][^>]*>([\s\S]*?)<\/th>/i);
  const title = trimOrNull(stripTags(titleMatch ? titleMatch[1] : ""));
  const registeredMatch = String(html || "").match(/<strong>\s*등록일\s*:\s*<\/strong>\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})/i);
  const viewsMatch = String(html || "").match(/<strong>\s*조회수\s*:\s*<\/strong>\s*([0-9,]+)/i);
  const contentMatch = String(html || "").match(/<td[^>]*class=["']cont["'][^>]*>([\s\S]*?)<\/td>/i);
  const contentText = trimOrNull(stripTags(contentMatch ? contentMatch[1] : ""));
  return {
    seq: filters.seq,
    title,
    registered_date: registeredMatch ? registeredMatch[1].replace(/\./g, "-") : null,
    views: viewsMatch ? Number.parseInt(viewsMatch[1].replace(/,/g, ""), 10) : null,
    content_text: contentText,
    attachments: parseAttachments(html, filters.seq),
    detail_url: buildDetailUrl(filters).toString()
  };
}

function buildListResponseBody(html, filters) {
  const allItems = parseListRows(html, filters);
  const items = allItems.slice(0, filters.pageSize);
  return {
    items,
    summary: {
      page: filters.page,
      page_size: filters.pageSize,
      returned_count: items.length,
      total_count: extractTotalCount(html)
    },
    query: {
      srch_word: filters.srchWord || null,
      srch_tp: filters.srchTp || null,
      multi_itm_seq: filters.multiItmSeq || DEFAULT_MULTI_ITM_SEQ
    }
  };
}

function buildDetailResponseBody(html, filters) {
  return {
    notice: parseDetail(html, filters),
    query: {
      seq: filters.seq,
      multi_itm_seq: filters.multiItmSeq || DEFAULT_MULTI_ITM_SEQ
    }
  };
}

async function fetchText(url, { fetchImpl = global.fetch, timeoutMs = 20000 } = {}) {
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const error = new Error(`SH upstream request failed: ${err.message}`);
    error.statusCode = 502;
    error.code = "upstream_fetch_failed";
    throw error;
  }
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`SH upstream responded with HTTP ${response.status}: ${text.slice(0, 200)}`);
    error.statusCode = 502;
    error.code = "upstream_error";
    throw error;
  }
  return text;
}

async function fetchShNoticeList({ filters, fetchImpl = global.fetch }) {
  const html = await fetchText(buildSearchUrl(filters), { fetchImpl });
  return buildListResponseBody(html, filters);
}

async function fetchShNoticeDetail({ filters, fetchImpl = global.fetch }) {
  const html = await fetchText(buildDetailUrl(filters), { fetchImpl });
  return buildDetailResponseBody(html, filters);
}

module.exports = {
  SH_BASE_URL,
  SH_NOTICE_PATH,
  SH_LIST_URL,
  SH_VIEW_URL,
  DEFAULT_MULTI_ITM_SEQ,
  normalizeShNoticeSearchQuery,
  normalizeShNoticeDetailQuery,
  buildSearchUrl,
  buildDetailUrl,
  parseListRows,
  parseAttachments,
  parseDetail,
  buildListResponseBody,
  buildDetailResponseBody,
  fetchShNoticeList,
  fetchShNoticeDetail
};
