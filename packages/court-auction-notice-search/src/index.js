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
  BID_TYPES
} = require("./codetables");
const {
  normalizeNoticeListResponse,
  normalizeNoticeDetailResponse,
  normalizeCourtCodesResponse,
  normalizeCaseDetailResponse
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
  const date = toYmd(params.date, "date");
  const courtCodeRaw =
    params.courtCode === undefined || params.courtCode === null ? "" : String(params.courtCode).trim();
  const courtCode = courtCodeRaw === "" ? "" : ensureCourtCode(courtCodeRaw);
  const bidTypeCode = resolveBidTypeCode(params.bidType);

  const client = ensureClient(params.client, params);
  const body = {
    dma_srchDspslPbanc: {
      srchYmd: date,
      cortOfcCd: courtCode,
      bidDvsCd: bidTypeCode,
      srchBtnYn: "Y"
    }
  };

  const raw = await client.postJson("notices", body);
  return normalizeNoticeListResponse(raw, {
    requestedDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    requestedCourtCode: courtCode || null,
    requestedBidType: bidTypeCode
      ? { code: bidTypeCode, name: describeBidTypeCode(bidTypeCode) }
      : null,
    includeRaw: params.includeRaw !== false
  });
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

async function getCourtCodes(options = {}) {
  const client = ensureClient(options.client, options);
  const raw = await client.postJson("courts", {});
  return normalizeCourtCodesResponse(raw);
}

function getBidTypes() {
  return listBidTypes();
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
  getCourtCodes,
  getBidTypes
};
