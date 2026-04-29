"use strict";

const { describeBidTypeCode } = require("./codetables");

function nullIfBlank(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const cleaned = trimmed.replace(/[, ]/g, "").replace(/원$/, "");
  if (cleaned === "" || cleaned === "-") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatYmd(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!/^\d{8}$/.test(trimmed)) return nullIfBlank(trimmed);
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

function formatHm(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!/^\d{3,4}$/.test(trimmed)) return nullIfBlank(trimmed);
  const padded = trimmed.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

function ensureRow(row) {
  return row && typeof row === "object" ? row : {};
}

function normalizeNoticeListResponse(rawPayload, options = {}) {
  const data = rawPayload && typeof rawPayload === "object" ? rawPayload.data : null;
  const list =
    data && Array.isArray(data.dlt_rletDspslPbancLst)
      ? data.dlt_rletDspslPbancLst
      : [];

  const includeRaw = options.includeRaw !== false;
  const items = list.map((row) => normalizeNoticeRow(row, includeRaw));

  return {
    requestedDate: options.requestedDate || null,
    requestedCourtCode: options.requestedCourtCode || null,
    requestedBidType: options.requestedBidType || null,
    count: items.length,
    items
  };
}

function normalizeNoticeRow(rawRow, includeRaw) {
  const row = ensureRow(rawRow);
  const out = {
    noticeId: nullIfBlank(row.dspslRealId),
    courtCode: nullIfBlank(row.cortOfcCd),
    courtName: nullIfBlank(row.cortOfcNm),
    courtBranchName: nullIfBlank(row.cortSptNm),
    judgeDeptCode: nullIfBlank(row.jdbnCd),
    judgeDeptName: nullIfBlank(row.cortAuctnJdbnNm),
    printJudgeDeptName: nullIfBlank(row.printJdbnNm),
    judgeDeptPhone: nullIfBlank(row.jdbnTelno),
    bidTypeCode: nullIfBlank(row.bidDvsCd) || nullIfBlank(row.intgCd),
    bidTypeName:
      nullIfBlank(row.intgCdNm) ||
      describeBidTypeCode(nullIfBlank(row.bidDvsCd) || "") ||
      null,
    saleDate: formatYmd(row.dspslDxdyYmd),
    bidStartDate: formatYmd(row.bidBgngYmd),
    bidEndDate: formatYmd(row.bidEndYmd),
    bidPeriodLabel: nullIfBlank(row.realBidPerd),
    salePlace: nullIfBlank(row.dspslPlcNm),
    saleTimes: collectSaleTimes(row),
    correctionCount: parseAmount(row.corCnt) || 0,
    cancellationCount: parseAmount(row.canCnt) || 0
  };
  if (includeRaw) {
    out.raw = { ...row };
  }
  return out;
}

function collectSaleTimes(row) {
  const result = [];
  for (const key of ["fstDspslHm", "scndDspslHm", "thrdDspslHm", "fothDspslHm"]) {
    const formatted = formatHm(row[key]);
    if (formatted) result.push(formatted);
  }
  return result;
}

function normalizeNoticeDetailResponse(rawPayload, options = {}) {
  const data = rawPayload && typeof rawPayload === "object" ? rawPayload.data : null;
  const meta = data && typeof data.dma_srchGnrlPbanc === "object" ? data.dma_srchGnrlPbanc : {};
  const list =
    data && Array.isArray(data.dlt_gnrlPbancLst) ? data.dlt_gnrlPbancLst : [];

  const includeRaw = options.includeRaw !== false;

  const noticeMeta = {
    courtCode: nullIfBlank(meta.cortOfcCd),
    saleDate: formatYmd(meta.dspslDxdyYmd),
    bidStartDate: formatYmd(meta.bidBgngYmd),
    bidEndDate: formatYmd(meta.bidEndYmd),
    judgeDeptCode: nullIfBlank(meta.jdbnCd),
    judgeDeptName: nullIfBlank(meta.cortAuctnJdbnNm),
    judgeDeptPhone: nullIfBlank(meta.jdbnTelno),
    salePlace: nullIfBlank(meta.dspslPlcNm),
    saleTimes: collectSaleTimes(meta),
    bidTypeCode: nullIfBlank(meta.bidDvsCd),
    bidTypeName: describeBidTypeCode(nullIfBlank(meta.bidDvsCd) || "") || null
  };

  const items = list.map((row) => normalizeNoticeDetailRow(row, includeRaw));

  const result = {
    notice: noticeMeta,
    count: items.length,
    items
  };
  if (includeRaw) {
    result.raw = { dma_srchGnrlPbanc: { ...meta } };
  }
  return result;
}

function normalizeNoticeDetailRow(rawRow, includeRaw) {
  const row = ensureRow(rawRow);
  const out = {
    caseNumber: nullIfBlank(row.csNo),
    itemSeq: nullIfBlank(row.dspslSeq),
    usage: nullIfBlank(row.usgNm),
    address: nullIfBlank(row.st),
    appraisedPrice: parseAmount(row.aeeEvlAmt),
    minimumSalePrice: parseAmount(row.lwsDspslPrc),
    remarks: nullIfBlank(row.dspslRmk)
  };
  if (includeRaw) {
    out.raw = { ...row };
  }
  return out;
}

function normalizeCourtCodesResponse(rawPayload) {
  const data = rawPayload && typeof rawPayload === "object" ? rawPayload.data : null;
  const list = data && Array.isArray(data.result) ? data.result : [];
  const items = list.map((row) => {
    const r = ensureRow(row);
    return {
      code: nullIfBlank(r.cortOfcCd),
      name: nullIfBlank(r.cortOfcNm),
      branchName: nullIfBlank(r.cortSptNm)
    };
  });
  return { count: items.length, items };
}

function normalizeCaseDetailResponse(rawPayload, options = {}) {
  const data = rawPayload && typeof rawPayload === "object" ? rawPayload.data : null;
  const status = rawPayload && typeof rawPayload.status === "number" ? rawPayload.status : null;
  const upstreamMessage =
    rawPayload && typeof rawPayload.message === "string" ? rawPayload.message : null;
  const includeRaw = options.includeRaw !== false;

  if (!data || !data.dma_csBasInf) {
    return {
      found: false,
      status,
      message: upstreamMessage,
      caseInfo: null,
      items: [],
      schedule: [],
      claimDeadline: null,
      relatedCases: [],
      appeals: [],
      stakeholders: [],
      raw: includeRaw ? rawPayload || null : undefined
    };
  }

  const basis = data.dma_csBasInf;
  const caseInfo = {
    courtCode: nullIfBlank(basis.cortOfcCd),
    courtName: nullIfBlank(basis.cortOfcNm),
    courtBranchName: nullIfBlank(basis.cortSptNm),
    caseNumber: nullIfBlank(basis.csNo),
    caseName: nullIfBlank(basis.csNm),
    caseReceiptDate: formatYmd(basis.csRcptYmd),
    caseStartDate: formatYmd(basis.csCmdcYmd),
    claimAmount: parseAmount(basis.clmAmt),
    appealFlag: nullIfBlank(basis.rletApalYn),
    suspensionStatusCode: nullIfBlank(basis.auctnSuspStatCd),
    finalDispositionCode: nullIfBlank(basis.ultmtDvsCd),
    finalDispositionDate: formatYmd(basis.csUltmtYmd),
    progressStatusCode: nullIfBlank(basis.csProgStatCd),
    progressSuspensionReason: nullIfBlank(basis.csProgSuspRsn),
    judgeOrAuxiliaryName: nullIfBlank(basis.jdgeAojAsstnNm),
    judgeDeptCode: nullIfBlank(basis.jdbnCd),
    judgeDeptName: nullIfBlank(basis.cortAuctnJdbnNm),
    judgeDeptPhone: nullIfBlank(basis.jdbnTelno),
    executorOfficePhone: nullIfBlank(basis.execrCsTelno),
    courtTypeCode: nullIfBlank(basis.cortTypCd),
    userCaseNumber: nullIfBlank(basis.userCsNo),
    movableRealEstateCode: nullIfBlank(basis.mvprpRletDvsCd)
  };

  const items = (Array.isArray(data.dlt_rletCsDspslObjctLst)
    ? data.dlt_rletCsDspslObjctLst
    : []
  ).map((row) => {
    const r = ensureRow(row);
    return {
      itemSeq: nullIfBlank(r.dspslObjctSeq),
      address: nullIfBlank(r.userSt),
      claimDeadlineDate: formatYmd(r.userLstprdYmd),
      caseNumber: nullIfBlank(r.csNo),
      courtCode: nullIfBlank(r.cortOfcCd)
    };
  });

  const schedule = (Array.isArray(data.dlt_rletCsGdsDtsDxdyInf)
    ? data.dlt_rletCsGdsDtsDxdyInf
    : []
  ).map((row) => {
    const r = ensureRow(row);
    return {
      itemSeq: nullIfBlank(r.dspslGdsSeq),
      eventSeq: nullIfBlank(r.dxdySeq),
      saleDate: formatYmd(r.dspslDxdyYmd),
      minimumSalePrice: parseAmount(r.lwsDspslPrc),
      appraisedPrice: parseAmount(r.aeeEvlAmt),
      resultCode: nullIfBlank(r.rsltCd)
    };
  });

  const claimDeadlineRows = Array.isArray(data.dlt_dstrtDemnLstprdDts)
    ? data.dlt_dstrtDemnLstprdDts
    : [];
  const claimDeadline = claimDeadlineRows.length
    ? {
        deadlineDate: formatYmd(claimDeadlineRows[0].dstrtDemnLstprdYmd),
        announcementDate: formatYmd(
          claimDeadlineRows[0].dstrtDemnLstprdPbancYmd
        )
      }
    : null;

  const relatedCases = (Array.isArray(data.dlt_rletReltCsLst)
    ? data.dlt_rletReltCsLst
    : []
  ).map((row) => {
    const r = ensureRow(row);
    return {
      caseNumber: nullIfBlank(r.userReltCsNo) || nullIfBlank(r.reltCsNo),
      courtCode: nullIfBlank(r.reltCortOfcCd),
      courtName: nullIfBlank(r.cortOfcNm),
      courtBranchName: nullIfBlank(r.cortSptNm),
      relationCode: nullIfBlank(r.reltCsDvsCd)
    };
  });

  const appeals = (Array.isArray(data.dlt_csApalRaplDts)
    ? data.dlt_csApalRaplDts
    : []
  ).map((row) => {
    const r = ensureRow(row);
    return {
      appellant: nullIfBlank(r.apalPrpndr),
      appealCaseNumber: nullIfBlank(r.apalCsNo),
      appealResult: nullIfBlank(r.apalRslt),
      reAppealCaseNumber: nullIfBlank(r.raplCsNo),
      reAppealResult: nullIfBlank(r.raplRslt),
      filedDate: formatYmd(r.printApalAplyYmd),
      confirmationFlag: nullIfBlank(r.cfmtnYnRslt)
    };
  });

  const stakeholders = (Array.isArray(data.dlt_rletCsIntrpsLst)
    ? data.dlt_rletCsIntrpsLst
    : []
  ).map((row) => {
    const r = ensureRow(row);
    return {
      kind: nullIfBlank(r.auctnIntrpsDvsNm1) || nullIfBlank(r.auctnIntrpsDvsNm2),
      name: nullIfBlank(r.intrpsNm1) || nullIfBlank(r.intrpsNm2)
    };
  });

  const result = {
    found: true,
    status,
    message: upstreamMessage,
    caseInfo,
    items,
    schedule,
    claimDeadline,
    relatedCases,
    appeals,
    stakeholders
  };
  if (includeRaw) {
    result.raw = rawPayload;
  }
  return result;
}

module.exports = {
  normalizeNoticeListResponse,
  normalizeNoticeRow,
  normalizeNoticeDetailResponse,
  normalizeNoticeDetailRow,
  normalizeCourtCodesResponse,
  normalizeCaseDetailResponse,
  parseAmount,
  formatYmd,
  formatHm
};
