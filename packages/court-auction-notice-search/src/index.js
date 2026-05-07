"use strict";

const {
  CourtAuctionHttpClient,
  ENDPOINT_PATHS,
  WARMUP_PATH,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  createBlockedError,
  createUpstreamError,
  createNetworkError
} = require("./transport/http");
const { CourtAuctionPlaywrightClient, isFallbackAvailable } = require("./transport/playwright");
const {
  resolveBidTypeCode,
  describeBidTypeCode,
  listBidTypes,
  BID_TYPES,
  resolveUsageCode,
  resolveRegionCodes,
  listUsageCodes,
  listRegionCodes
} = require("./codetables");
const {
  normalizeNoticeListResponse,
  normalizeNoticeDetailResponse,
  normalizeCourtCodesResponse,
  normalizeCaseDetailResponse,
  normalizePropertySearchResponse
} = require("./normalize");

function toYmd(input, label) {
  if (input === null || input === undefined || input === "") {
    throw new Error(`${label} is required (YYYY-MM-DD or YYYYMMDD)`);
  }
  const value = String(input).trim();
  const compact = value.replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(compact)) {
    throw new Error(`${label} must be YYYY-MM-DD or YYYYMMDD, got "${input}"`);
  }
  return compact;
}

function optionalYmd(input, label) {
  if (input === null || input === undefined || input === "") return "";
  return toYmd(input, label);
}

function toPositiveInt(input, fallback, label, opts = {}) {
  if (input === null || input === undefined || input === "") return fallback;
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got "${input}"`);
  }
  if (Array.isArray(opts.allowed) && !opts.allowed.includes(value)) {
    throw new Error(`${label} must be one of ${opts.allowed.join(", ")}, got ${value}`);
  }
  if (typeof opts.max === "number" && value > opts.max) {
    throw new Error(
      `${label} must be <= ${opts.max} (court auction site upper bound), got ${value}`
    );
  }
  return value;
}

const PAGE_SIZE_VALUES = [10, 20, 50, 100];

function rangeValue(range, key, opts = {}) {
  if (!range || typeof range !== "object") return "";
  const value = range[key];
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim().replace(/,/g, "");
  if (opts.integerOnly) {
    if (!/^\d+$/.test(text)) {
      throw new Error(
        `${opts.label || key} range value must be a non-negative integer, got "${value}"`
      );
    }
  } else if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Error(
      `${opts.label || key} range value must be numeric, got "${value}"`
    );
  }
  return text;
}

function toNoticeSearchDate(input, label) {
  if (input === null || input === undefined || input === "") {
    throw new Error(`${label} is required (YYYY-MM, YYYYMM, YYYY-MM-DD, or YYYYMMDD)`);
  }

  const value = String(input).trim();
  const compact = value.replace(/[^0-9]/g, "");
  if (/^\d{6}$/.test(compact)) {
    return { queryYmd: compact, exactYmd: null };
  }
  if (/^\d{8}$/.test(compact)) {
    return { queryYmd: compact.slice(0, 6), exactYmd: compact };
  }

  throw new Error(`${label} must be YYYY-MM, YYYYMM, YYYY-MM-DD or YYYYMMDD, got "${input}"`);
}

function formatCompactMonth(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
}

function formatCompactDate(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeCaseNumber(input) {
  if (input === null || input === undefined) {
    throw new Error("caseNumber is required (e.g. 2024타경100001)");
  }
  const value = String(input).trim();
  if (value === "") {
    throw new Error("caseNumber must not be blank");
  }
  if (/^\d{4}타경\d+$/.test(value)) {
    return value;
  }
  const match = value.match(/^(\d{4})\s*[-_\s]?\s*(\d+)$/);
  if (match) {
    return `${match[1]}타경${match[2]}`;
  }
  return value;
}

function ensureCourtCode(input) {
  if (input === null || input === undefined) {
    throw new Error("courtCode is required (e.g. B000210 for 서울중앙지방법원)");
  }
  const value = String(input).trim();
  if (!/^B\d{6}$/.test(value)) {
    throw new Error(`courtCode must look like "B000210", got "${input}"`);
  }
  return value;
}

function pickClientOptions(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  if (input.baseUrl !== undefined) out.baseUrl = input.baseUrl;
  if (input.userAgent !== undefined) out.userAgent = input.userAgent;
  if (input.timeoutMs !== undefined) out.timeoutMs = input.timeoutMs;
  if (input.fetchImpl !== undefined) out.fetchImpl = input.fetchImpl;
  if (input.minDelayMs !== undefined) out.minDelayMs = input.minDelayMs;
  if (input.jitterMs !== undefined) out.jitterMs = input.jitterMs;
  if (input.maxCallsPerSession !== undefined) {
    out.maxCallsPerSession = input.maxCallsPerSession;
  }
  if (input.now !== undefined) out.now = input.now;
  if (input.delayImpl !== undefined) out.delayImpl = input.delayImpl;
  return out;
}

function ensureClient(client, options) {
  if (client && typeof client.postJson === "function") return client;
  return new CourtAuctionHttpClient(pickClientOptions(options));
}

async function searchSaleNotices(params = {}) {
  const searchDate = toNoticeSearchDate(params.date, "date");
  const courtCodeRaw =
    params.courtCode === undefined || params.courtCode === null ? "" : String(params.courtCode).trim();
  const courtCode = courtCodeRaw === "" ? "" : ensureCourtCode(courtCodeRaw);
  const bidTypeCode = resolveBidTypeCode(params.bidType);

  const client = ensureClient(params.client, params);
  const body = {
    dma_srchDspslPbanc: {
      // The PGJ143M01 "검색" button posts a month key (YYYYMM), not a day key.
      // Day-level API compatibility is preserved by filtering the returned month rows below.
      srchYmd: searchDate.queryYmd,
      cortOfcCd: courtCode,
      bidDvsCd: bidTypeCode,
      srchBtnYn: "Y"
    }
  };

  const raw = await client.postJson("notices", body);
  const normalized = normalizeNoticeListResponse(raw, {
    requestedDate: searchDate.exactYmd
      ? formatCompactDate(searchDate.exactYmd)
      : formatCompactMonth(searchDate.queryYmd),
    requestedMonth: formatCompactMonth(searchDate.queryYmd),
    requestedCourtCode: courtCode || null,
    requestedBidType: bidTypeCode
      ? { code: bidTypeCode, name: describeBidTypeCode(bidTypeCode) }
      : null,
    includeRaw: params.includeRaw !== false
  });

  if (searchDate.exactYmd) {
    normalized.items = normalized.items.filter((item) => {
      const rawYmd = item.raw && item.raw.dspslDxdyYmd ? String(item.raw.dspslDxdyYmd) : "";
      return rawYmd === searchDate.exactYmd;
    });
    normalized.count = normalized.items.length;
  }

  return normalized;
}

function pickNoticeKeys(notice) {
  if (!notice || typeof notice !== "object") return null;
  const raw = notice.raw && typeof notice.raw === "object" ? notice.raw : notice;
  return raw;
}

function buildNoticeDetailBody(input) {
  if (!input || typeof input !== "object") {
    throw new Error("getSaleNoticeDetail requires an object argument");
  }

  const raw = pickNoticeKeys(input) || {};

  const cortOfcCd =
    input.cortOfcCd || input.courtCode || raw.cortOfcCd || raw.courtCode || "";
  if (!cortOfcCd) {
    throw new Error("getSaleNoticeDetail requires courtCode (cortOfcCd)");
  }

  const dspslDxdyYmd =
    raw.dspslDxdyYmd ||
    (input.saleDate ? toYmd(input.saleDate, "saleDate") : "") ||
    (input.dspslDxdyYmd ? toYmd(input.dspslDxdyYmd, "dspslDxdyYmd") : "");
  if (!dspslDxdyYmd) {
    throw new Error("getSaleNoticeDetail requires saleDate (dspslDxdyYmd)");
  }

  const bidBgngYmd =
    raw.bidBgngYmd ||
    (input.bidStartDate ? toYmd(input.bidStartDate, "bidStartDate") : "") ||
    "";
  const bidEndYmd =
    raw.bidEndYmd ||
    (input.bidEndDate ? toYmd(input.bidEndDate, "bidEndDate") : "") ||
    "";

  const jdbnCd = raw.jdbnCd || input.judgeDeptCode || "";
  if (!jdbnCd) {
    throw new Error(
      "getSaleNoticeDetail requires judgeDeptCode (jdbnCd) — this is the encrypted token from the list response"
    );
  }

  const bidDvsCd =
    raw.bidDvsCd ||
    raw.intgCd ||
    resolveBidTypeCode(input.bidType) ||
    input.bidDvsCd ||
    "";

  return {
    dma_srchGnrlPbanc: {
      cortOfcCd: ensureCourtCode(cortOfcCd),
      dspslDxdyYmd: toYmd(dspslDxdyYmd, "dspslDxdyYmd"),
      bidBgngYmd: bidBgngYmd ? toYmd(bidBgngYmd, "bidBgngYmd") : "",
      bidEndYmd: bidEndYmd ? toYmd(bidEndYmd, "bidEndYmd") : "",
      jdbnCd,
      cortAuctnJdbnNm: raw.cortAuctnJdbnNm || input.judgeDeptName || "",
      jdbnTelno: raw.jdbnTelno || input.judgeDeptPhone || "",
      dspslPlcNm: raw.dspslPlcNm || input.salePlace || "",
      fstDspslHm: raw.fstDspslHm || "",
      scndDspslHm: raw.scndDspslHm || "",
      thrdDspslHm: raw.thrdDspslHm || "",
      fothDspslHm: raw.fothDspslHm || "",
      bidDvsCd
    }
  };
}

async function getSaleNoticeDetail(input, options = {}) {
  const body = buildNoticeDetailBody(input);
  const client = ensureClient(options.client || (input && input.client), options);
  const raw = await client.postJson("noticeDetail", body);
  return normalizeNoticeDetailResponse(raw, {
    includeRaw: options.includeRaw !== false
  });
}

async function getCaseByCaseNumber(params = {}) {
  const courtCode = ensureCourtCode(params.courtCode);
  const caseNumber = normalizeCaseNumber(params.caseNumber);
  const client = ensureClient(params.client, params);

  const body = {
    dma_srchCsDtlInf: {
      cortOfcCd: courtCode,
      csNo: caseNumber
    }
  };
  const raw = await client.postJson("caseDetail", body);
  return normalizeCaseDetailResponse(raw, {
    includeRaw: params.includeRaw !== false
  });
}

function buildPropertySearchBody(params = {}) {
  const pageNo = toPositiveInt(params.page, 1, "page");
  const pageSize = toPositiveInt(params.pageSize, 10, "pageSize", { allowed: PAGE_SIZE_VALUES });
  const courtCodeRaw =
    params.courtCode === undefined || params.courtCode === null ? "" : String(params.courtCode).trim();
  const courtCode = courtCodeRaw === "" ? "" : ensureCourtCode(courtCodeRaw);
  const region = resolveRegionCodes(params.region || {});
  const usage = params.usage && typeof params.usage === "object" ? params.usage : {};
  const saleDate = params.saleDate && typeof params.saleDate === "object" ? params.saleDate : {};

  const hasRegion = Boolean(region.sido || region.sigungu || region.dong);
  const body = {
    dma_pageInfo: {
      pageNo,
      pageSize,
      bfPageNo: "",
      startRowNo: "",
      totalCnt: "",
      totalYn: params.totalYn === "N" ? "N" : "Y",
      groupTotalCount: ""
    },
    dma_srchGdsDtlSrchInfo: {
      rletDspslSpcCondCd: "",
      bidDvsCd: resolveBidTypeCode(params.bidType),
      mvprpRletDvsCd: "00031R",
      cortAuctnSrchCondCd: "0004601",
      rprsAdongSdCd: region.sido,
      rprsAdongSggCd: region.sigungu,
      rprsAdongEmdCd: region.dong,
      rdnmSdCd: "",
      rdnmSggCd: "",
      rdnmNo: "",
      mvprpDspslPlcAdongSdCd: "",
      mvprpDspslPlcAdongSggCd: "",
      mvprpDspslPlcAdongEmdCd: "",
      rdDspslPlcAdongSdCd: "",
      rdDspslPlcAdongSggCd: "",
      rdDspslPlcAdongEmdCd: "",
      cortOfcCd: courtCode,
      jdbnCd: params.judgeDeptCode ? String(params.judgeDeptCode).trim() : "",
      execrOfcDvsCd: "",
      lclDspslGdsLstUsgCd: resolveUsageCode(usage.large, "large"),
      mclDspslGdsLstUsgCd: resolveUsageCode(usage.medium, "medium"),
      sclDspslGdsLstUsgCd: resolveUsageCode(usage.small, "small"),
      cortAuctnMbrsId: "",
      aeeEvlAmtMin: rangeValue(params.appraisedPriceRange, "min", { label: "appraisedPriceRange.min" }),
      aeeEvlAmtMax: rangeValue(params.appraisedPriceRange, "max", { label: "appraisedPriceRange.max" }),
      lwsDspslPrcRateMin: rangeValue(params.minimumSalePriceRateRange, "min", { label: "minimumSalePriceRateRange.min" }),
      lwsDspslPrcRateMax: rangeValue(params.minimumSalePriceRateRange, "max", { label: "minimumSalePriceRateRange.max" }),
      flbdNcntMin: rangeValue(params.flbdCount, "min", { integerOnly: true, label: "flbdCount.min" }),
      flbdNcntMax: rangeValue(params.flbdCount, "max", { integerOnly: true, label: "flbdCount.max" }),
      objctArDtsMin: rangeValue(params.area, "min", { label: "area.min" }),
      objctArDtsMax: rangeValue(params.area, "max", { label: "area.max" }),
      mvprpArtclKndCd: "",
      mvprpArtclNm: "",
      mvprpAtchmPlcTypCd: "",
      notifyLoc: params.notifyLocation ? "Y" : "off",
      lafjOrderBy: params.orderBy ? String(params.orderBy) : "",
      pgmId: "PGJ151F01",
      csNo: "",
      cortStDvs: hasRegion ? "2" : "1",
      statNum: 1,
      bidBgngYmd: optionalYmd(saleDate.from, "saleDate.from"),
      bidEndYmd: optionalYmd(saleDate.to, "saleDate.to"),
      dspslDxdyYmd: "",
      fstDspslHm: "",
      scndDspslHm: "",
      thrdDspslHm: "",
      fothDspslHm: "",
      dspslPlcNm: "",
      lwsDspslPrcMin: rangeValue(params.priceRange, "min", { label: "priceRange.min" }),
      lwsDspslPrcMax: rangeValue(params.priceRange, "max", { label: "priceRange.max" }),
      grbxTypCd: "",
      gdsVendNm: "",
      fuelKndCd: "",
      carMdyrMax: "",
      carMdyrMin: "",
      carMdlNm: "",
      sideDvsCd: ""
    }
  };
  return body;
}

async function searchProperties(params = {}) {
  const body = buildPropertySearchBody(params);
  const includeRaw = params.includeRaw !== false;

  const primary = ensureClient(params.client, params);
  let raw;
  try {
    raw = await primary.postJson("propertySearch", body);
  } catch (err) {
    const isConfirmedBlocked = err && err.code === "BLOCKED";
    const isWafHttp400 = err && err.code === "UPSTREAM_ERROR" && err.statusCode === 400;
    const isFallbackEligibleError = isWafHttp400 || (isConfirmedBlocked && params.fallbackOnBlocked === true);
    const canFallbackFromClient =
      !params.client || params.fallbackClient || primary instanceof CourtAuctionHttpClient;
    const fallbackEnabled = params.fallback !== false && canFallbackFromClient;
    if (!isFallbackEligibleError || !fallbackEnabled) {
      throw err;
    }

    const fallback =
      params.fallbackClient ||
      (isFallbackAvailable()
        ? new CourtAuctionPlaywrightClient({
            ...pickClientOptions(params),
            headless: params.headless !== false,
            chromiumLoader: params.chromiumLoader
          })
        : null);
    if (!fallback) {
      throw err;
    }

    try {
      raw = await fallback.postJson("propertySearch", body);
    } finally {
      if (!params.fallbackClient && typeof fallback.close === "function") {
        await fallback.close().catch(() => {});
      }
    }
  }

  return normalizePropertySearchResponse(raw, {
    requestedFilters: body.dma_srchGdsDtlSrchInfo,
    includeRaw
  });
}

async function getCourtCodes(options = {}) {
  const client = ensureClient(options.client, options);
  const raw = await client.postJson("courts", {});
  return normalizeCourtCodesResponse(raw);
}

function getBidTypes() {
  return listBidTypes();
}

function getUsageCodes() {
  const items = listUsageCodes();
  return { count: items.length, items };
}

function getRegionCodes() {
  const items = listRegionCodes();
  return { count: items.length, items };
}

module.exports = {
  ENDPOINT_PATHS,
  WARMUP_PATH,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  BID_TYPES,
  CourtAuctionHttpClient,
  CourtAuctionPlaywrightClient,
  isPlaywrightFallbackAvailable: isFallbackAvailable,
  createBlockedError,
  createUpstreamError,
  createNetworkError,
  resolveBidTypeCode,
  describeBidTypeCode,
  searchSaleNotices,
  getSaleNoticeDetail,
  buildNoticeDetailBody,
  getCaseByCaseNumber,
  searchProperties,
  buildPropertySearchBody,
  getCourtCodes,
  getBidTypes,
  getUsageCodes,
  getRegionCodes
};
