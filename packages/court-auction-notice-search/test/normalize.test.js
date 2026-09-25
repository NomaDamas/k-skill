"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeNoticeListResponse,
  normalizeNoticeDetailResponse,
  normalizeAuctionCalendarResponse,
  normalizeAuctionCalendarRow,
  normalizeCaseDetailResponse,
  normalizeCourtCodesResponse,
  parseAmount,
  formatYmd,
  formatHm
} = require("../src/normalize");

const fixturesDir = path.join(__dirname, "fixtures");
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const noticesEmpty = loadFixture("notices-empty.json");
const noticesSample = loadFixture("notices-sample.json");
const noticeDetailSample = loadFixture("notice-detail-sample.json");
const caseFoundSample = loadFixture("case-found-sample.json");
const caseNotFoundSample = loadFixture("case-not-found.json");
const courtsSample = loadFixture("courts-sample.json");

test("parseAmount strips commas/won/spaces and rejects non-numeric", () => {
  assert.equal(parseAmount("1,500,000,000"), 1500000000);
  assert.equal(parseAmount("1,500,000,000원"), 1500000000);
  assert.equal(parseAmount(" 850000000 "), 850000000);
  assert.equal(
    parseAmount('<img src="/images/number_01.gif" alt="첫번째"> 9,600,000<br>입찰시간(10:00)<br>'),
    9600000
  );
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("-"), null);
  assert.equal(parseAmount("not-a-number"), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(undefined), null);
});

test("formatYmd inserts hyphens for 8-digit dates and passes through otherwise", () => {
  assert.equal(formatYmd("20260427"), "2026-04-27");
  assert.equal(formatYmd("2026.04.27"), "2026.04.27");
  assert.equal(formatYmd(""), null);
  assert.equal(formatYmd(null), null);
});

test("formatHm formats 3-4 digit times into HH:MM", () => {
  assert.equal(formatHm("1000"), "10:00");
  assert.equal(formatHm("930"), "09:30");
  assert.equal(formatHm(""), null);
  assert.equal(formatHm(null), null);
});

test("normalizeNoticeListResponse returns 0 items for an empty payload", () => {
  const result = normalizeNoticeListResponse(noticesEmpty, {
    requestedDate: "2026-04-30",
    requestedCourtCode: "",
    requestedBidType: null
  });
  assert.equal(result.count, 0);
  assert.deepEqual(result.items, []);
  assert.equal(result.requestedDate, "2026-04-30");
});

test("normalizeNoticeListResponse normalizes auction notice rows with English keys + raw passthrough", () => {
  const result = normalizeNoticeListResponse(noticesSample);
  assert.equal(result.count, 2);

  const first = result.items[0];
  assert.equal(first.noticeId, "REAL_ID_2026042701");
  assert.equal(first.courtCode, "B000210");
  assert.equal(first.courtName, "서울중앙지방법원");
  assert.equal(first.judgeDeptCode, "ENC_jdbn1");
  assert.equal(first.judgeDeptName, "경매1계");
  assert.equal(first.bidTypeCode, "000331");
  assert.equal(first.bidTypeName, "기일입찰");
  assert.equal(first.saleDate, "2026-04-27");
  assert.equal(first.bidStartDate, "2026-04-27");
  assert.equal(first.bidEndDate, "2026-04-27");
  assert.equal(first.salePlace, "서울중앙지방법원 경매법정 (4별관 211호)");
  assert.deepEqual(first.saleTimes, ["10:00", "14:00"]);
  assert.equal(first.correctionCount, 0);
  assert.equal(first.cancellationCount, 0);
  assert.equal(first.raw.dspslRealId, "REAL_ID_2026042701");

  const second = result.items[1];
  assert.equal(second.bidTypeCode, "000332");
  assert.equal(second.bidTypeName, "기간입찰");
  assert.equal(second.bidStartDate, "2026-04-20");
  assert.equal(second.bidEndDate, "2026-04-24");
  assert.equal(second.bidPeriodLabel, "20260420 ~ 20260424");
});

test("normalizeNoticeListResponse can strip raw passthrough on demand", () => {
  const result = normalizeNoticeListResponse(noticesSample, { includeRaw: false });
  for (const item of result.items) {
    assert.equal(item.raw, undefined);
  }
});

test("normalizeNoticeDetailResponse extracts 사건번호/용도/주소/감정평가/최저매각가/매각장소", () => {
  const result = normalizeNoticeDetailResponse(noticeDetailSample);
  assert.equal(result.count, 2);
  assert.equal(result.notice.salePlace, "서울중앙지방법원 경매법정 (4별관 211호)");
  assert.equal(result.notice.saleDate, "2026-04-27");
  assert.equal(result.notice.bidTypeCode, "000331");
  assert.equal(result.notice.bidTypeName, "기일입찰");

  const first = result.items[0];
  assert.equal(first.caseNumber, "2024타경100001");
  assert.equal(first.itemSeq, "1");
  assert.equal(first.usage, "아파트");
  assert.equal(
    first.address,
    "서울특별시 강남구 역삼동 123-4 OO아파트 101동 502호"
  );
  assert.equal(first.appraisedPrice, 1500000000);
  assert.equal(first.minimumSalePrice, 1200000000);
  assert.equal(first.remarks, "토지·건물 일괄매각");
  assert.equal(first.raw.csNo, "2024타경100001");
});

test("normalizeNoticeDetailResponse handles empty payload gracefully", () => {
  const result = normalizeNoticeDetailResponse({ status: 200, data: {} });
  assert.equal(result.count, 0);
  assert.deepEqual(result.items, []);
});

test("normalizeCourtCodesResponse returns code/name/branchName triples", () => {
  const result = normalizeCourtCodesResponse(courtsSample);
  assert.equal(result.count, 9);
  assert.equal(result.items[0].code, "B000210");
  assert.equal(result.items[0].name, "서울중앙지방법원");
  assert.equal(result.items[0].branchName, "서울중앙지방법원");
});

test("normalizeCaseDetailResponse marks status:204 / null dma_csBasInf as found:false", () => {
  const result = normalizeCaseDetailResponse(caseNotFoundSample);
  assert.equal(result.found, false);
  assert.equal(result.status, 204);
  assert.match(result.message, /조회 되는 사건번호 정보가 없습니다/);
  assert.equal(result.caseInfo, null);
  assert.deepEqual(result.items, []);
});

test("normalizeCaseDetailResponse extracts case basic info, items, schedule, claim deadline", () => {
  const result = normalizeCaseDetailResponse(caseFoundSample);
  assert.equal(result.found, true);
  assert.equal(result.status, 200);

  assert.equal(result.caseInfo.caseNumber, "2024타경100001");
  assert.equal(result.caseInfo.courtCode, "B000210");
  assert.equal(result.caseInfo.caseName, "부동산임의경매");
  assert.equal(result.caseInfo.caseReceiptDate, "2024-03-15");
  assert.equal(result.caseInfo.caseStartDate, "2024-03-20");
  assert.equal(result.caseInfo.claimAmount, 500000000);
  assert.equal(result.caseInfo.judgeDeptName, "경매1계");

  assert.equal(result.items.length, 1);
  assert.equal(
    result.items[0].address,
    "서울특별시 강남구 역삼동 123-4 OO아파트 101동 502호"
  );
  assert.equal(result.items[0].claimDeadlineDate, "2024-06-15");

  assert.equal(result.schedule.length, 2);
  assert.equal(result.schedule[0].saleDate, "2026-04-27");
  assert.equal(result.schedule[0].minimumSalePrice, 1200000000);
  assert.equal(result.schedule[0].appraisedPrice, 1500000000);
  assert.equal(result.schedule[0].resultCode, "유찰");
  assert.equal(result.schedule[1].minimumSalePrice, 960000000);
  assert.equal(result.schedule[1].resultCode, null);

  assert.deepEqual(result.claimDeadline, {
    deadlineDate: "2024-06-15",
    announcementDate: "2024-05-01"
  });
});

test("normalizeCaseDetailResponse strips raw when includeRaw=false", () => {
  const result = normalizeCaseDetailResponse(caseFoundSample, { includeRaw: false });
  assert.equal(result.raw, undefined);
});

test("normalizeAuctionCalendarResponse normalizes PGJ153 부동산 schedule rows", () => {
  const auctionCalendarSample = loadFixture("auction-calendar-sample.json");
  const result = normalizeAuctionCalendarResponse(auctionCalendarSample, {
    requestedDate: "2026-05-21",
    requestedCourtCode: "B000210",
    requestedBidType: { code: "000331", name: "기일입찰" }
  });

  assert.equal(result.count, 4);
  assert.equal(result.requestedDate, "2026-05-21");
  assert.equal(result.requestedMonth, null);
  assert.equal(result.requestedCourtCode, "B000210");
  assert.deepEqual(result.requestedBidType, { code: "000331", name: "기일입찰" });

  const first = result.items[0];
  assert.equal(first.courtCode, "B000210");
  assert.equal(first.courtName, "서울중앙지방법원");
  assert.equal(first.courtBranchName, "서울중앙지방법원");
  assert.equal(first.judgeDeptCode, "ENC_jdbn1");
  assert.equal(first.judgeDeptName, "경매1계");
  assert.equal(first.bidTypeCode, "000331");
  assert.equal(first.bidTypeName, "기일입찰");
  assert.equal(first.saleDate, "2026-05-08");
  assert.equal(first.bidStartDate, "2026-05-08");
  assert.equal(first.bidEndDate, "2026-05-08");
  assert.deepEqual(first.saleTimes, ["10:00", "14:00"]);
  assert.equal(first.salePlace, "서울중앙지방법원 경매법정 (4별관 211호)");
  assert.equal(first.noticeFile, "B000210_20260508_1.pdf");
  assert.equal(first.raw.dspslDxdyYmd, "20260508");

  const period = result.items[3];
  assert.equal(period.bidTypeCode, "000332");
  assert.equal(period.bidTypeName, "기간입찰");
  assert.equal(period.saleDate, "2026-06-11");
  assert.equal(period.userBidPeriod, "20260608 ~ 20260610");
  assert.equal(period.userSaleDate, "2026.06.11");
});

test("normalizeAuctionCalendarResponse handles empty payloads and strips raw on demand", () => {
  const empty = normalizeAuctionCalendarResponse({ status: 200, data: {} });
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.requestedMonth, null);

  const sample = normalizeAuctionCalendarResponse(loadFixture("auction-calendar-sample.json"), {
    includeRaw: false
  });
  for (const item of sample.items) {
    assert.equal(item.raw, undefined);
  }
});

test("normalizeAuctionCalendarRow tolerates sparse rows without throwing", () => {
  const row = normalizeAuctionCalendarRow({}, true);
  assert.equal(row.courtCode, null);
  assert.equal(row.saleDate, null);
  assert.equal(row.bidTypeCode, null);
  assert.equal(row.bidTypeName, null);
  assert.deepEqual(row.saleTimes, []);
  assert.deepEqual(row.raw, {});
});
