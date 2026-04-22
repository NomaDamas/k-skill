const NAVER_NEWS_OPEN_API_URL = "https://openapi.naver.com/v1/search/news.json";
const DEFAULT_DISPLAY = 10;
const MIN_DISPLAY = 1;
const MAX_DISPLAY = 100;
const DEFAULT_START = 1;
const MIN_START = 1;
const MAX_START = 1000;
const MAX_SEARCH_WINDOW = 1000;
const ALLOWED_SORTS = new Set(["sim", "date"]);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function decodeHtmlEntities(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function stripTags(value) {
  return decodeHtmlEntities(value)
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeString(value) {
  const normalized = stripTags(value);
  return normalized || null;
}

function normalizeUrl(value) {
  const raw = trimOrNull(value);
  if (!raw || /^javascript:/i.test(raw)) {
    return null;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return null;
}

function canonicalizeLinkForDedup(link) {
  try {
    const u = new URL(link);
    const params = [...u.searchParams.entries()];
    params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    u.search = params.length ? new URLSearchParams(params).toString() : "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    }
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return String(link).toLowerCase();
  }
}

function parsePubDateIso(rfc822) {
  if (!rfc822) {
    return null;
  }
  const date = new Date(rfc822);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeNaverNewsSearchQuery(query) {
  const q = trimOrNull(query?.q ?? query?.query ?? query?.keyword);
  if (!q) {
    throw new Error("Provide q/query.");
  }
  if ([...q].length < 2) {
    throw new Error("q/query must be at least 2 characters.");
  }

  const rawDisplay = parseInteger(query.display ?? query.limit ?? query.size, DEFAULT_DISPLAY);
  const rawStart = parseInteger(query.start ?? query.offset, DEFAULT_START);
  const requestedSort = trimOrNull(query.sort) || "sim";
  const sort = ALLOWED_SORTS.has(requestedSort) ? requestedSort : "sim";

  const display = clamp(rawDisplay, MIN_DISPLAY, MAX_DISPLAY);
  const start = clamp(rawStart, MIN_START, MAX_START);

  if (start + display - 1 > MAX_SEARCH_WINDOW) {
    throw new Error(
      `start + display exceeds Naver's ${MAX_SEARCH_WINDOW}-item search window ` +
        `(start=${start} + display=${display} would fetch item ${start + display - 1}, ` +
        `max accessible item is ${MAX_SEARCH_WINDOW}). Narrow the search or reduce start/display.`
    );
  }

  return {
    query: q,
    display,
    start,
    sort
  };
}

function buildNaverNewsSearchUrl({ query, display = DEFAULT_DISPLAY, start = DEFAULT_START, sort = "sim" } = {}) {
  const url = new URL(NAVER_NEWS_OPEN_API_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", String(start));
  url.searchParams.set("sort", sort);
  return url;
}

function normalizeNaverNewsSearchPayload(
  payload,
  { query = null, display = DEFAULT_DISPLAY, start = DEFAULT_START, sort = "sim" } = {}
) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const normalized = [];
  const seenLinks = new Set();
  const normalizedSort = ALLOWED_SORTS.has(sort) ? sort : "sim";

  for (const item of items) {
    const title = normalizeString(item.title);
    const link = normalizeUrl(item.link);
    if (!title || !link) {
      continue;
    }

    const originalLink = normalizeUrl(item.originallink);
    const description = normalizeString(item.description);
    const pubDate = trimOrNull(item.pubDate);
    const pubDateIso = parsePubDateIso(pubDate);

    const dedupKey = canonicalizeLinkForDedup(link);
    if (seenLinks.has(dedupKey)) {
      continue;
    }
    seenLinks.add(dedupKey);

    normalized.push({
      rank: normalized.length + 1,
      title,
      description,
      link,
      original_link: originalLink,
      pub_date: pubDate,
      pub_date_iso: pubDateIso,
      source: "naver-openapi"
    });
  }

  return {
    items: normalized,
    meta: {
      query,
      extraction: "naver-openapi",
      item_count: normalized.length,
      total: parseInteger(payload?.total, 0),
      start: parseInteger(payload?.start, start),
      display: parseInteger(payload?.display, display),
      last_build_date: normalizeString(payload?.lastBuildDate),
      sort: normalizedSort
    }
  };
}

async function fetchNaverNewsSearch({
  query,
  display = DEFAULT_DISPLAY,
  start = DEFAULT_START,
  sort = "sim",
  clientId,
  clientSecret,
  fetchImpl = global.fetch
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime.");
  }

  if (!clientId || !clientSecret) {
    const error = new Error(
      "NAVER_SEARCH_CLIENT_ID and NAVER_SEARCH_CLIENT_SECRET are not configured on the proxy server."
    );
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const url = buildNaverNewsSearchUrl({ query, display, start, sort });
  const response = await fetchImpl(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      accept: "application/json"
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();

  if (!response.ok) {
    const error = new Error(`Naver News Search API responded with ${response.status}.`);
    error.code = "upstream_error";
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.upstreamStatusCode = response.status;
    error.upstreamBodySnippet = body.slice(0, 200);
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (cause) {
    const error = new Error("Naver News Search API returned invalid JSON.");
    error.code = "invalid_upstream_response";
    error.statusCode = 502;
    error.cause = cause;
    throw error;
  }

  const parsed = normalizeNaverNewsSearchPayload(payload, { query, display, start, sort });
  return {
    ...parsed,
    upstream: {
      url: url.toString(),
      status_code: response.status,
      content_type: response.headers.get("content-type") || null,
      provider: "naver-search-api"
    }
  };
}

module.exports = {
  buildNaverNewsSearchUrl,
  fetchNaverNewsSearch,
  normalizeNaverNewsSearchPayload,
  normalizeNaverNewsSearchQuery
};
