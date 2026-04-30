"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber,
  getCourtCodes,
  getBidTypes,
  resolveBidTypeCode,
  describeBidTypeCode,
  buildNoticeDetailBody,
  ENDPOINT_PATHS,
  CourtAuctionHttpClient,
  isPlaywrightFallbackAvailable
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function makeFakeClient(handler) {
  const calls = [];
  return {
    calls,
    async postJson(endpointKey, body) {
      calls.push({ endpointKey, body });
      return handler(endpointKey, body);
    }
  };
}

test("getBidTypes returns 기일입찰 + 기간입찰", () => {
  const types = getBidTypes();
  assert.equal(types.length, 2);
  assert.deepEqual(
    types.map((t) => t.code).sort(),
    ["000331", "000332"]
  );
  assert.deepEqual(
    types.map((t) => t.name).sort(),
    ["기간입찰", "기일입찰"]
  );
});

test("resolveBidTypeCode accepts alias / code / korean name and is fail-open", () => {
  assert.equal(resolveBidTypeCode("date"), "000331");
  assert.equal(resolveBidTypeCode("DATE"), "000331");
  assert.equal(resolveBidTypeCode("period"), "000332");
  assert.equal(resolveBidTypeCode("기일입찰"), "000331");
  assert.equal(resolveBidTypeCode("기간입찰"), "000332");
  assert.equal(resolveBidTypeCode("000331"), "000331");
  assert.equal(resolveBidTypeCode(""), "");
  assert.equal(resolveBidTypeCode(undefined), "");
  assert.equal(resolveBidTypeCode("000999"), "000999");
});

test("describeBidTypeCode returns the Korean name", () => {
  assert.equal(describeBidTypeCode("000331"), "기일입찰");
  assert.equal(describeBidTypeCode("000332"), "기간입찰");
  assert.equal(describeBidTypeCode("UNKNOWN"), "UNKNOWN");
  assert.equal(describeBidTypeCode(""), "");
});

test("searchSaleNotices builds the expected request body and normalizes the response", async () => {
  const client = makeFakeClient((endpoint) => {
    assert.equal(endpoint, "notices");
    return loadFixture("notices-sample.json");
  });

  const result = await searchSaleNotices({
    date: "2026-04-27",
    courtCode: "B000210",
    bidType: "date",
    client
  });

  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].body, {
    dma_srchDspslPbanc: {
      srchYmd: "20260427",
      cortOfcCd: "B000210",
      bidDvsCd: "000331",
      srchBtnYn: "Y"
    }
  });

  assert.equal(result.count, 2);
  assert.equal(result.requestedDate, "2026-04-27");
  assert.equal(result.requestedCourtCode, "B000210");
  assert.deepEqual(result.requestedBidType, { code: "000331", name: "기일입찰" });
  assert.equal(result.items[0].caseNumber, undefined);
  assert.equal(result.items[0].noticeId, "REAL_ID_2026042701");
});

test("searchSaleNotices accepts compact YYYYMMDD dates and rejects garbage", async () => {
  const client = makeFakeClient(() => loadFixture("notices-empty.json"));
  await searchSaleNotices({ date: "20260427", client });
  assert.equal(client.calls[0].body.dma_srchDspslPbanc.srchYmd, "20260427");

  await assert.rejects(
    () => searchSaleNotices({ date: "not-a-date", client }),
    /must be YYYY-MM-DD or YYYYMMDD/
  );
});

test("searchSaleNotices rejects an obviously bad courtCode", async () => {
  const client = makeFakeClient(() => loadFixture("notices-empty.json"));
  await assert.rejects(
    () => searchSaleNotices({ date: "2026-04-27", courtCode: "INVALID", client }),
    /courtCode must look like/
  );
});

test("buildNoticeDetailBody requires courtCode + saleDate + jdbnCd", () => {
  assert.throws(() => buildNoticeDetailBody({}), /requires courtCode/);
  assert.throws(
    () => buildNoticeDetailBody({ courtCode: "B000210" }),
    /requires saleDate/
  );
  assert.throws(
    () => buildNoticeDetailBody({ courtCode: "B000210", saleDate: "2026-04-27" }),
    /requires judgeDeptCode/
  );
});

test("buildNoticeDetailBody round-trips a row from the list response (raw passthrough)", () => {
  const list = loadFixture("notices-sample.json").data.dlt_rletDspslPbancLst;
  const noticeRow = list[0];
  const body = buildNoticeDetailBody({ raw: noticeRow });
  assert.deepEqual(body, {
    dma_srchGnrlPbanc: {
      cortOfcCd: "B000210",
      dspslDxdyYmd: "20260427",
      bidBgngYmd: "20260427",
      bidEndYmd: "20260427",
      jdbnCd: "ENC_jdbn1",
      cortAuctnJdbnNm: "경매1계",
      jdbnTelno: "02-530-1234",
      dspslPlcNm: "서울중앙지방법원 경매법정 (4별관 211호)",
      fstDspslHm: "1000",
      scndDspslHm: "1400",
      thrdDspslHm: "",
      fothDspslHm: "",
      bidDvsCd: "000331"
    }
  });
});

test("getSaleNoticeDetail issues noticeDetail POST and normalizes 사건번호/용도/주소/가격", async () => {
  const client = makeFakeClient((endpoint) => {
    assert.equal(endpoint, "noticeDetail");
    return loadFixture("notice-detail-sample.json");
  });

  const list = loadFixture("notices-sample.json").data.dlt_rletDspslPbancLst;
  const result = await getSaleNoticeDetail(
    { raw: list[0] },
    { client }
  );

  assert.equal(result.count, 2);
  const first = result.items[0];
  assert.equal(first.caseNumber, "2024타경100001");
  assert.equal(first.usage, "아파트");
  assert.equal(first.appraisedPrice, 1500000000);
  assert.equal(first.minimumSalePrice, 1200000000);
  assert.equal(result.notice.salePlace, "서울중앙지방법원 경매법정 (4별관 211호)");
});

test("getCaseByCaseNumber sends {cortOfcCd, csNo} and returns normalized case info when found", async () => {
  const client = makeFakeClient((endpoint, body) => {
    assert.equal(endpoint, "caseDetail");
    assert.deepEqual(body, {
      dma_srchCsDtlInf: {
        cortOfcCd: "B000210",
        csNo: "2024타경100001"
      }
    });
    return loadFixture("case-found-sample.json");
  });

  const result = await getCaseByCaseNumber({
    courtCode: "B000210",
    caseNumber: "2024타경100001",
    client
  });
  assert.equal(result.found, true);
  assert.equal(result.caseInfo.caseName, "부동산임의경매");
  assert.equal(result.schedule.length, 2);
});

test("getCaseByCaseNumber tolerates 2024-100001 alternate format", async () => {
  const client = makeFakeClient(() => loadFixture("case-not-found.json"));
  await getCaseByCaseNumber({
    courtCode: "B000210",
    caseNumber: "2024-100001",
    client
  });
  assert.equal(client.calls[0].body.dma_srchCsDtlInf.csNo, "2024타경100001");
});

test("getCaseByCaseNumber returns found:false on status 204", async () => {
  const client = makeFakeClient(() => loadFixture("case-not-found.json"));
  const result = await getCaseByCaseNumber({
    courtCode: "B000210",
    caseNumber: "2024타경999999",
    client
  });
  assert.equal(result.found, false);
  assert.equal(result.status, 204);
  assert.match(result.message, /조회 되는 사건번호 정보가 없습니다/);
});

test("getCourtCodes hits the courts endpoint and returns code/name pairs", async () => {
  const client = makeFakeClient((endpoint) => {
    assert.equal(endpoint, "courts");
    return loadFixture("courts-sample.json");
  });
  const result = await getCourtCodes({ client });
  assert.equal(result.count, 9);
  assert.equal(result.items[0].code, "B000210");
  assert.equal(result.items[0].name, "서울중앙지방법원");
});

test("ENDPOINT_PATHS exposes the discovered courtauction.go.kr endpoints", () => {
  assert.equal(ENDPOINT_PATHS.notices, "/pgj/pgj143/selectRletDspslPbanc.on");
  assert.equal(ENDPOINT_PATHS.noticeDetail, "/pgj/pgj143/selectRletDspslPbancDtl.on");
  assert.equal(ENDPOINT_PATHS.caseDetail, "/pgj/pgj15A/selectAuctnCsSrchRslt.on");
  assert.equal(ENDPOINT_PATHS.courts, "/pgj/pgjComm/selectCortOfcCdLst.on");
});

test("isPlaywrightFallbackAvailable is a boolean (no crash even when modules are absent)", () => {
  const result = isPlaywrightFallbackAvailable();
  assert.equal(typeof result, "boolean");
});

test("CourtAuctionHttpClient is exported for advanced clients to override transport", () => {
  assert.equal(typeof CourtAuctionHttpClient, "function");
});
