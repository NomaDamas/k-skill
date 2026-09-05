const { fetchWithRetry } = require("./fetch-with-retry");

const SOURCE_NAMES = ["kstartup", "bizinfo", "nipa", "kocca", "smtech"];
const DEFAULT_SOURCES = [...SOURCE_NAMES];
const SOURCE_URLS = {
  bizinfo: (page) => ({
    url: `https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?rows=15&cpage=${page}&schEndAt=N`
  }),
  nipa: (page) => ({ url: `https://www.nipa.kr/home/2-2?curPage=${page}` }),
  kocca: (page) => ({
    url: "https://www.kocca.kr/kocca/pims/list.do",
    method: "POST",
    body: new URLSearchParams({ menuNo: "204104", pageIndex: String(page) }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" }
  }),
  smtech: (page) => ({
    url: `https://www.smtech.go.kr/front/ifg/no/notice02_list.do?pageIndex=${page}`
  })
};

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw new Error("Expected an integer.");
  }
  return parsed;
}

function clean(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value) {
  const match = String(value || "").match(/(\d{2,4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (!match) {
    return "";
  }
  const year = match[1].length === 2
    ? `${Number.parseInt(match[1], 10) >= 70 ? "19" : "20"}${match[1]}`
    : match[1];
  return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function splitPeriod(value) {
  const dates = String(value || "").match(/\d{2,4}[.\-/]\s*\d{1,2}[.\-/]\s*\d{1,2}/g) || [];
  return [normalizeDate(dates[0]), normalizeDate(dates[1])];
}

function rows(html) {
  return String(html || "").match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
}

function cells(row) {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => clean(match[1]));
}

function normalizedItem(source, id, title, field, org, start, end, regDate, url) {
  return {
    source,
    id: clean(id),
    title: clean(title),
    field: clean(field),
    org: clean(org),
    apply_start: normalizeDate(start),
    apply_end: normalizeDate(end),
    reg_date: normalizeDate(regDate),
    url
  };
}

function parseBizinfoPage(html) {
  const items = [];
  for (const row of rows(html)) {
    const match = row.match(/href\s*=\s*"[^"]*pblancId=(PBLN_\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const values = cells(row);
    const [start, end] = splitPeriod(values[3]);
    items.push(normalizedItem(
      "bizinfo",
      match[1],
      match[2],
      values[1],
      [values[4], values[5]].filter(Boolean).join(" / "),
      start,
      end,
      values[6],
      `https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=${match[1]}`
    ));
  }
  return items;
}

function parseNipaPage(html) {
  const items = [];
  for (const row of rows(html)) {
    const match = row.match(/href="(\/home\/2-2\/(\d+))"[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const period = clean(row.match(/신청기간\s*:\s*([^<]+)/i)?.[1]);
    const [start, end] = splitPeriod(period);
    const field = clean(row.match(/<span[^>]+class="[^"]*box[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const dates = [...row.matchAll(/<span[^>]+class="[^"]*bco[^"]*"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/gi)];
    items.push(normalizedItem(
      "nipa", match[2], match[3], field, "NIPA", start, end,
      dates.at(-1)?.[1], `https://www.nipa.kr${match[1]}`
    ));
  }
  return items;
}

function parseKoccaPage(html) {
  const items = [];
  for (const row of rows(html)) {
    const match = row.match(/href="(\/kocca\/pims\/view\.do\?intcNo=([^&"]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const field = clean(row.match(/<span[^>]+class="[^"]*category_color\d+[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const period = clean(row.match(/data-label="접수기간"[^>]*>\s*([^<]+)/i)?.[1]);
    const [start, end] = splitPeriod(period);
    const regDate = clean(row.match(/data-label="공고일"[^>]*>\s*([^<]+)/i)?.[1]);
    items.push(normalizedItem(
      "kocca", match[2], match[3], field, "KOCCA", start, end, regDate,
      `https://www.kocca.kr${match[1].replace(/&amp;/g, "&")}`
    ));
  }
  return items;
}

function parseSmtechPage(html) {
  const items = [];
  for (const row of rows(html)) {
    const match = row.match(/href="(\/front\/ifg\/no\/notice02_detail\.do[^"]*ancmId=([^&"]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const values = cells(row);
    const period = values.find((value) => value.includes("~")) || "";
    const [start, end] = splitPeriod(period);
    const regDate = values.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) || "";
    const stablePath = match[1].replace(/;jsessionid=[^?]*/i, "").replace(/&amp;/g, "&");
    items.push(normalizedItem(
      "smtech", match[2], match[3], values[1], "SMTECH(중소기업기술정보진흥원)",
      start, end, regDate, `https://www.smtech.go.kr${stablePath}`
    ));
  }
  return items;
}

const SOURCE_PARSERS = {
  bizinfo: parseBizinfoPage,
  nipa: parseNipaPage,
  kocca: parseKoccaPage,
  smtech: parseSmtechPage
};

function normalizeGovernmentSupportQuery(query = {}) {
  const rawSources = query.sources
    ? String(query.sources).split(",").map((source) => source.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SOURCES;
  const sources = [...new Set(rawSources)];
  if (!sources.length || sources.some((source) => !SOURCE_NAMES.includes(source))) {
    throw new Error(`sources must contain only: ${SOURCE_NAMES.join(", ")}`);
  }
  const maxPages = parseInteger(query.maxPages ?? query.max_pages, 1);
  if (maxPages < 1 || maxPages > 10) {
    throw new Error("maxPages must be between 1 and 10.");
  }
  const perPage = parseInteger(query.perPage ?? query.per_page, 100);
  if (perPage < 1 || perPage > 100) {
    throw new Error("perPage must be between 1 and 100.");
  }
  const keyword = clean(query.keyword);
  if (keyword.length > 100) {
    throw new Error("keyword must be at most 100 characters.");
  }
  return { sources, keyword, maxPages, perPage };
}

async function fetchHtmlSourcePage(source, page, { fetchImpl = fetch } = {}) {
  const request = SOURCE_URLS[source](page);
  const response = await fetchWithRetry(request.url, {
    fetchImpl,
    attempts: 2,
      method: request.method || "GET",
      body: request.body,
      signal: AbortSignal.timeout(20000),
    headers: {
      "user-agent": "k-skill-proxy/1.0 (+https://github.com/NomaDamas/k-skill)",
      accept: "text/html,application/xhtml+xml",
      ...(request.headers || {})
    }
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`HTTP ${response.status}; manual verification required`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const html = await response.text();
  const items = SOURCE_PARSERS[source](html);
  if (page === 1 && items.length === 0) {
    throw new Error("0 items parsed; site layout may have changed");
  }
  return items;
}

function extractKstartupItems(payload) {
  const candidates = [
    payload?.data,
    payload?.items,
    payload?.response?.body?.items?.item,
    payload?.response?.body?.items
  ];
  const rawItems = candidates.find(Array.isArray) || [];
  return rawItems.map((item, index) => normalizedItem(
    "kstartup",
    item.pbanc_sn || item.biz_pbanc_sn || item.id || `kstartup-${index + 1}`,
    item.biz_pbanc_nm || item.intg_pbanc_biz_nm || item.title,
    item.supt_biz_clsfc || item.biz_category_nm || "",
    item.pbanc_ntrp_nm || item.biz_pbanc_ntrp_nm || item.org || "",
    item.pbanc_rcpt_bgng_dt || item.apply_start || "",
    item.pbanc_rcpt_end_dt || item.apply_end || "",
    item.biz_pbanc_reg_dt || item.reg_date || "",
    item.detl_pg_url || item.biz_pbanc_url || item.url || "https://www.k-startup.go.kr/"
  ));
}

async function fetchKstartupPage(page, perPage, { serviceKey, fetchImpl = fetch } = {}) {
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_API_KEY is not configured");
  }
  const url = new URL("https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(perPage));
  url.searchParams.set("returnType", "json");
  url.searchParams.set("rcrt_prgs_yn", "Y");
  const response = await fetchWithRetry(url, {
    fetchImpl,
    attempts: 2,
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return extractKstartupItems(await response.json());
}

async function buildGovernmentSupportSurvey({ query, fetchSourcePage }) {
  const items = [];
  const sources = {};
  for (const source of query.sources) {
    let pagesFetched = 0;
    let itemCount = 0;
    try {
      for (let page = 1; page <= query.maxPages; page += 1) {
        const pageItems = await fetchSourcePage(source, page, query.perPage);
        pagesFetched += 1;
        itemCount += pageItems.length;
        items.push(...pageItems);
        if (pageItems.length === 0) break;
      }
      sources[source] = { ok: true, pages_fetched: pagesFetched, item_count: itemCount, error: null };
    } catch (error) {
      sources[source] = {
        ok: false,
        pages_fetched: pagesFetched,
        item_count: itemCount,
        error: error.message
      };
    }
  }

  const needle = query.keyword.toLocaleLowerCase("ko-KR");
  const filtered = needle
    ? items.filter((item) => [item.title, item.field, item.org].join(" ").toLocaleLowerCase("ko-KR").includes(needle))
    : items;
  const deduped = [...new Map(filtered.map((item) => [`${item.source}:${item.id}`, item])).values()];
  deduped.sort((a, b) => (a.apply_end || "9999-99-99").localeCompare(b.apply_end || "9999-99-99"));
  return {
    complete: Object.values(sources).every((source) => source.ok),
    source_count: query.sources.length,
    item_count: deduped.length,
    sources,
    items: deduped
  };
}

async function fetchGovernmentSupportSurvey({
  query,
  serviceKey,
  fetchImpl = fetch
}) {
  return buildGovernmentSupportSurvey({
    query,
    fetchSourcePage: async (source, page, perPage) => {
      if (source === "kstartup") {
        return fetchKstartupPage(page, perPage, { serviceKey, fetchImpl });
      }
      return fetchHtmlSourcePage(source, page, { fetchImpl });
    }
  });
}

module.exports = {
  SOURCE_NAMES,
  buildGovernmentSupportSurvey,
  fetchGovernmentSupportSurvey,
  normalizeGovernmentSupportQuery,
  parseBizinfoPage,
  parseKoccaPage,
  parseNipaPage,
  parseSmtechPage,
  fetchHtmlSourcePage,
  fetchKstartupPage
};
