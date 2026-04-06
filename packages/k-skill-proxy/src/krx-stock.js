const KRX_MARKETS = ["KOSPI", "KOSDAQ", "KONEX"];

const KRX_BASE_INFO_URLS = {
  KOSPI: "https://data-dbg.krx.co.kr/svc/apis/sto/stk_isu_base_info",
  KOSDAQ: "https://data-dbg.krx.co.kr/svc/apis/sto/ksq_isu_base_info",
  KONEX: "https://data-dbg.krx.co.kr/svc/apis/sto/knx_isu_base_info"
};

const KRX_TRADE_INFO_URLS = {
  KOSPI: "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd",
  KOSDAQ: "https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd",
  KONEX: "https://data-dbg.krx.co.kr/svc/apis/sto/knx_bydd_trd"
};

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatYmd(value) {
  const raw = String(value || "").trim();
  if (!/^\d{8}$/.test(raw)) {
    return raw || null;
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function getCurrentKstDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date()).replace(/-/g, "");
}

function normalizeBaseItem(item, market) {
  const normalized = {
    market,
    code: item.ISU_SRT_CD || item.ISU_CD || null,
    standard_code: item.ISU_CD || null,
    short_code: item.ISU_SRT_CD || item.ISU_CD || null,
    name: item.ISU_NM || null,
    name_ko: item.ISU_NM || null,
    short_name: item.ISU_ABBRV || null,
    name_abbr: item.ISU_ABBRV || null,
    english_name: item.ISU_ENG_NM || null,
    name_en: item.ISU_ENG_NM || null,
    listed_at: formatYmd(item.LIST_DD),
    market_name: item.MKT_TP_NM || market,
    security_group: item.SECUGRP_NM || null,
    section_type: item.SECT_TP_NM || null,
    sector_type: item.SECT_TP_NM || null,
    stock_certificate_type: item.KIND_STKCERT_TP_NM || null,
    stock_kind: item.KIND_STKCERT_TP_NM || null,
    par_value: parseNumber(item.PARVAL),
    listed_shares: parseNumber(item.LIST_SHRS)
  };

  return normalized;
}

function normalizeTradeItem(item, market, baseItem = null) {
  const normalized = {
    market,
    code: baseItem?.code || item.ISU_SRT_CD || item.ISU_CD || null,
    short_code: baseItem?.code || item.ISU_SRT_CD || item.ISU_CD || null,
    standard_code: item.ISU_CD || baseItem?.standard_code || null,
    base_date: item.BAS_DD || null,
    date: formatYmd(item.BAS_DD),
    name: item.ISU_NM || baseItem?.name || null,
    name_ko: item.ISU_NM || baseItem?.name || null,
    market_name: item.MKT_NM || baseItem?.market_name || market,
    section_type: item.SECT_TP_NM || baseItem?.section_type || null,
    sector_type: item.SECT_TP_NM || baseItem?.section_type || null,
    close_price: parseNumber(item.TDD_CLSPRC),
    change_price: parseNumber(item.CMPPREVDD_PRC),
    fluctuation_rate: parseNumber(item.FLUC_RT),
    change_rate: parseNumber(item.FLUC_RT),
    open_price: parseNumber(item.TDD_OPNPRC),
    high_price: parseNumber(item.TDD_HGPRC),
    low_price: parseNumber(item.TDD_LWPRC),
    trading_volume: parseNumber(item.ACC_TRDVOL),
    volume: parseNumber(item.ACC_TRDVOL),
    trading_value: parseNumber(item.ACC_TRDVAL),
    traded_value: parseNumber(item.ACC_TRDVAL),
    market_cap: parseNumber(item.MKTCAP),
    listed_shares: parseNumber(item.LIST_SHRS || baseItem?.listed_shares)
  };

  return normalized;
}

function matchesCodes(item, codes) {
  if (!codes?.length) {
    return true;
  }

  return codes.some((code) => code === item.ISU_CD || code === item.ISU_SRT_CD);
}

async function krxRequest(url, apiKey, fetchImpl = global.fetch) {
  if (!apiKey) {
    const error = new Error("KRX_API_KEY is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }

  const response = await fetchImpl(url, {
    headers: {
      "content-type": "application/json",
      AUTH_KEY: apiKey
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    const error = new Error(`KRX API HTTP 오류 (status: ${response.status}): ${response.statusText}`);
    error.code = "upstream_error";
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  if (!Array.isArray(payload.OutBlock_1)) {
    const error = new Error("KRX API 오류: 응답에 OutBlock_1 배열이 없습니다.");
    error.code = "krx_api_error";
    error.statusCode = 502;
    throw error;
  }

  return payload.OutBlock_1;
}

async function fetchBaseInfo({ market, basDd = getCurrentKstDate(), codeList = [], apiKey, fetchImpl = global.fetch }) {
  const items = await krxRequest(buildUrl(KRX_BASE_INFO_URLS[market], { basDd }), apiKey, fetchImpl);
  return items
    .filter((item) => matchesCodes(item, codeList))
    .map((item) => normalizeBaseItem(item, market));
}

async function fetchTradeInfo({ market, basDd = getCurrentKstDate(), codeList, apiKey, fetchImpl = global.fetch }) {
  const tradeItems = await krxRequest(buildUrl(KRX_TRADE_INFO_URLS[market], { basDd }), apiKey, fetchImpl);

  const directlyMatched = tradeItems.filter((item) => matchesCodes(item, codeList));
  if (directlyMatched.length > 0) {
    return directlyMatched.map((item) => normalizeTradeItem(item, market));
  }

  const baseItems = await fetchBaseInfo({ market, basDd, codeList, apiKey, fetchImpl });
  if (baseItems.length === 0) {
    return [];
  }

  const standardCodes = new Set(baseItems.map((item) => item.standard_code).filter(Boolean));
  const baseByStandardCode = new Map(baseItems.map((item) => [item.standard_code, item]));

  return tradeItems
    .filter((item) => standardCodes.has(item.ISU_CD) || baseByStandardCode.has(item.ISU_CD))
    .map((item) => normalizeTradeItem(item, market, baseByStandardCode.get(item.ISU_CD)));
}

function tokenize(query) {
  return String(query)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreSearchMatch(item, query) {
  const raw = String(query).trim().toLowerCase();
  if (!raw) {
    return -1;
  }

  const haystacks = [
    item.code,
    item.standard_code,
    item.name,
    item.short_name,
    item.english_name
  ].map((value) => String(value || "").toLowerCase());

  if (haystacks.some((value) => value === raw)) {
    return 100;
  }

  const tokens = tokenize(raw);
  if (tokens.length > 0 && tokens.every((token) => haystacks.some((value) => value.includes(token)))) {
    return 50;
  }

  return -1;
}

function buildBaseInfoSnapshotCacheKey({ market, basDd }) {
  return `krx-base-info:${market}:${basDd}`;
}

async function fetchBaseInfoSnapshot({
  market,
  basDd,
  apiKey,
  fetchImpl = global.fetch,
  cache = null,
  cacheTtlMs = 0
}) {
  const cacheKey = cache ? buildBaseInfoSnapshotCacheKey({ market, basDd }) : null;
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const items = await fetchBaseInfo({ market, basDd, apiKey, fetchImpl });

  if (cacheKey) {
    cache.set(cacheKey, items, cacheTtlMs);
  }

  return items;
}

async function searchStocks({
  query,
  basDd = getCurrentKstDate(),
  market = null,
  limit = 10,
  apiKey,
  fetchImpl = global.fetch,
  cache = null,
  cacheTtlMs = 0
}) {
  const markets = market ? [market] : KRX_MARKETS;
  const settledResults = await Promise.allSettled(markets.map(async (entryMarket) => ({
    market: entryMarket,
    items: await fetchBaseInfoSnapshot({
      market: entryMarket,
      basDd,
      apiKey,
      fetchImpl,
      cache,
      cacheTtlMs
    })
  })));

  const successfulResults = settledResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (successfulResults.length === 0) {
    const firstFailure = settledResults.find((result) => result.status === "rejected");
    throw firstFailure?.reason || new Error("KRX search failed for every market.");
  }

  return {
    items: successfulResults
      .flatMap(({ market: entryMarket, items }) =>
        items
          .map((item) => ({ ...item, market: item.market || entryMarket, score: scoreSearchMatch(item, query) }))
          .filter((item) => item.score >= 0)
      )
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ko"))
      .slice(0, limit)
      .map(({ score, ...item }) => item)
  };
}

module.exports = {
  KRX_MARKETS,
  fetchBaseInfo,
  fetchTradeInfo,
  getCurrentKstDate,
  searchStocks
};
