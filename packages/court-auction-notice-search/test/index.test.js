"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber,
  searchProperties,
  buildPropertySearchBody,
  getCourtCodes,
  getUsageCodes,
  getRegionCodes,
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

test("searchSaleNotices posts the month key used by the site search button and normalizes the response", async () => {
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
      srchYmd: "202604",
      cortOfcCd: "B000210",
      bidDvsCd: "000331",
      srchBtnYn: "Y"
    }
  });

  assert.equal(result.count, 2);
  assert.equal(result.requestedDate, "2026-04-27");
  assert.equal(result.requestedMonth, "2026-04");
  assert.equal(result.requestedCourtCode, "B000210");
  assert.deepEqual(result.requestedBidType, { code: "000331", name: "기일입찰" });
  assert.equal(result.items[0].caseNumber, undefined);
  assert.equal(result.items[0].noticeId, "REAL_ID_2026042701");
});

test("searchSaleNotices accepts compact dates/months and filters exact day requests", async () => {
  const client = makeFakeClient(() => loadFixture("notices-sample.json"));

  const exactDay = await searchSaleNotices({ date: "20260427", client });
  assert.equal(client.calls[0].body.dma_srchDspslPbanc.srchYmd, "202604");
  assert.equal(exactDay.count, 2);

  const emptyDay = await searchSaleNotices({ date: "2026-04-28", client });
  assert.equal(client.calls[1].body.dma_srchDspslPbanc.srchYmd, "202604");
  assert.equal(emptyDay.count, 0);

  const month = await searchSaleNotices({ date: "2026-04", client });
  assert.equal(client.calls[2].body.dma_srchDspslPbanc.srchYmd, "202604");
  assert.equal(month.requestedDate, "2026-04");
  assert.equal(month.requestedMonth, "2026-04");
  assert.equal(month.count, 2);

  await assert.rejects(
    () => searchSaleNotices({ date: "not-a-date", client }),
    /must be YYYY-MM, YYYYMM, YYYY-MM-DD or YYYYMMDD/
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

test("buildPropertySearchBody matches the canonical PGJ151M01 body captured from a real browser submission", () => {
  const canonical = loadFixture("canonical-search-body.json");
  delete canonical._source;

  const body = buildPropertySearchBody({
    bidType: "date",
    courtCode: "B000210",
    saleDate: { from: "2026-05-08", to: "2026-05-22" },
    page: 1,
    pageSize: 10
  });

  assert.deepEqual(body, canonical);
  assert.equal(typeof body.dma_pageInfo.pageNo, "number", "pageNo must be numeric (matches captured body)");
  assert.equal(typeof body.dma_pageInfo.pageSize, "number", "pageSize must be numeric");
  assert.equal(typeof body.dma_srchGdsDtlSrchInfo.statNum, "number", "statNum must be numeric");
  assert.equal(body.dma_srchGdsDtlSrchInfo.cortStDvs, "1", "no region → cortStDvs=1");
  assert.equal(body.dma_srchGdsDtlSrchInfo.notifyLoc, "off");
});

test("buildPropertySearchBody maps Workflow C filters using REAL upstream codes (lcl/sigungu/dong)", () => {
  const body = buildPropertySearchBody({
    region: { sido: "서울특별시", sigungu: "11680", dong: "11680101" },
    usage: { large: "건물", medium: "21200", small: "21201" },
    priceRange: { min: 100000000, max: 500000000 },
    appraisedPriceRange: { min: 150000000, max: 800000000 },
    saleDate: { from: "2026-05-01", to: "2026-05-20" },
    flbdCount: { min: 1, max: 3 },
    area: { min: 30, max: 85.5 },
    bidType: "date",
    courtCode: "B000210",
    page: 2,
    pageSize: 20
  });

  assert.equal(body.dma_pageInfo.pageNo, 2);
  assert.equal(body.dma_pageInfo.pageSize, 20);
  assert.equal(body.dma_pageInfo.totalYn, "Y");

  const s = body.dma_srchGdsDtlSrchInfo;
  assert.equal(s.bidDvsCd, "000331");
  assert.equal(s.cortOfcCd, "B000210");
  assert.equal(s.cortStDvs, "2");
  assert.equal(s.rprsAdongSdCd, "11");
  assert.equal(s.rprsAdongSggCd, "11680");
  assert.equal(s.rprsAdongEmdCd, "11680101");
  assert.equal(s.lclDspslGdsLstUsgCd, "20000", "건물 → 20000 (real upstream LCL code)");
  assert.equal(s.mclDspslGdsLstUsgCd, "21200");
  assert.equal(s.sclDspslGdsLstUsgCd, "21201");
  assert.equal(s.lwsDspslPrcMin, "100000000");
  assert.equal(s.lwsDspslPrcMax, "500000000");
  assert.equal(s.aeeEvlAmtMin, "150000000");
  assert.equal(s.aeeEvlAmtMax, "800000000");
  assert.equal(s.flbdNcntMin, "1");
  assert.equal(s.flbdNcntMax, "3");
  assert.equal(s.objctArDtsMin, "30");
  assert.equal(s.objctArDtsMax, "85.5");
  assert.equal(s.bidBgngYmd, "20260501");
  assert.equal(s.bidEndYmd, "20260520");

  assert.equal(s.mvprpArtclKndCd, "", "real upstream uses mvprpArtclKndCd not mvprpArtclKnd");
  assert.equal(s.mvprpAtchmPlcTypCd, "", "real upstream uses mvprpAtchmPlcTypCd not mvrpDspslPlcTyp");
  assert.ok(!Object.prototype.hasOwnProperty.call(s, "mvprpArtclKnd"), "old wrong key removed");
  assert.ok(!Object.prototype.hasOwnProperty.call(s, "mvrpDspslPlcTyp"), "old wrong key removed");
  assert.ok(!Object.prototype.hasOwnProperty.call(s, "consonant"), "consonant is not in canonical body");
  assert.ok(!Object.prototype.hasOwnProperty.call(s, "maeMokmulNm"), "maeMokmulNm is not in canonical body");
  assert.equal(s.execrOfcDvsCd, "", "execrOfcDvsCd present (canonical)");
  assert.equal(s.cortAuctnMbrsId, "", "cortAuctnMbrsId present (canonical)");
});

test("buildPropertySearchBody keeps the documented raw-code CLI example numeric", () => {
  const body = buildPropertySearchBody({
    region: { sido: "서울특별시", sigungu: "11680" },
    usage: { large: "건물", medium: "21200" },
    priceRange: { min: 100000000, max: 500000000 },
    saleDate: { from: "2026-05-01", to: "2026-05-20" }
  });
  const s = body.dma_srchGdsDtlSrchInfo;
  assert.equal(s.rprsAdongSdCd, "11");
  assert.equal(s.rprsAdongSggCd, "11680");
  assert.equal(s.lclDspslGdsLstUsgCd, "20000");
  assert.equal(s.mclDspslGdsLstUsgCd, "21200");
  assert.equal(s.lwsDspslPrcMin, "100000000");
});

test("buildPropertySearchBody rejects fractional flbdCount (count must be integer)", () => {
  assert.throws(
    () => buildPropertySearchBody({ flbdCount: { min: 1.5 } }),
    /flbdCount\.min .*non-negative integer.*1\.5/
  );
});

test("searchProperties posts propertySearch and normalizes the real PGJ151 result row", async () => {
  const client = makeFakeClient((endpoint) => {
    assert.equal(endpoint, "propertySearch");
    return loadFixture("properties-sample.json");
  });

  const result = await searchProperties({
    region: { sido: "11", sigungu: "11680" },
    usage: { large: "20000" },
    saleDate: { from: "2026-05-01", to: "2026-05-20" },
    bidType: "date",
    page: 2,
    pageSize: 20,
    client
  });

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].body.dma_pageInfo.pageNo, 2);
  assert.equal(client.calls[0].body.dma_srchGdsDtlSrchInfo.bidBgngYmd, "20260501");
  assert.equal(result.page.pageNo, 2);
  assert.equal(result.page.pageSize, 20);
  assert.equal(result.page.totalCount, 37);
  assert.equal(result.count, 2);

  const item = result.items[0];
  assert.equal(item.caseNumber, "20220130105284");
  assert.equal(item.displayCaseNumber, "2022타경105284");
  assert.equal(item.itemNumber, "1");
  assert.equal(item.itemSeq, "1");
  assert.match(item.address, /서울특별시.*강남구.*대치동/);
  assert.equal(item.appraisedPrice, 450000000);
  assert.equal(item.minimumSalePrice, 360000000);
  assert.equal(item.flbdCount, 5);
  assert.equal(item.failedBidCount, 5);
  assert.equal(item.courtCode, "B000210");
  assert.equal(item.courtName, "서울중앙지방법원");
  assert.equal(item.judgeDeptName, "경매2계");
  assert.deepEqual(item.usageCodes, { large: "20000", medium: "21100", small: "21101" });
  assert.deepEqual(item.regionCodes, { sido: "11", sigungu: "11680", dong: "11680106" });
  assert.equal(item.saleDate, "2026-05-21");
  assert.equal(item.bidTypeCode, "000331");
  assert.equal(item.status, item.statusCode);
  assert.equal(item.buildings, item.buildingList);
  assert.equal(item.areas, item.areaList);
  assert.equal(item.lotCategories, item.landCategoryList);
});

test("searchProperties rejects page sizes outside the observed PGJ151 dropdown values", () => {
  assert.equal(buildPropertySearchBody({ pageSize: 10 }).dma_pageInfo.pageSize, 10);
  assert.equal(buildPropertySearchBody({ pageSize: 20 }).dma_pageInfo.pageSize, 20);
  assert.equal(buildPropertySearchBody({ pageSize: 50 }).dma_pageInfo.pageSize, 50);
  assert.equal(buildPropertySearchBody({ pageSize: 100 }).dma_pageInfo.pageSize, 100);

  assert.throws(
    () => buildPropertySearchBody({ pageSize: 1 }),
    /pageSize must be one of 10, 20, 50, 100/
  );
  assert.throws(
    () => buildPropertySearchBody({ pageSize: 25 }),
    /pageSize must be one of 10, 20, 50, 100/
  );
  assert.throws(
    () => buildPropertySearchBody({ pageSize: 500 }),
    /pageSize must be one of 10, 20, 50, 100/
  );
});

test("searchProperties falls back from an explicit HTTP client on Workflow C WAF-style HTTP 400", async () => {
  const primary = makeFakeClient(() => {
    const error = new Error("HTTP 400");
    error.code = "UPSTREAM_ERROR";
    error.statusCode = 400;
    throw error;
  });
  const fallback = makeFakeClient((endpoint) => {
    assert.equal(endpoint, "propertySearch");
    return loadFixture("properties-sample.json");
  });

  const result = await searchProperties({
    client: primary,
    fallbackClient: fallback,
    courtCode: "B000210",
    saleDate: { from: "2026-05-08", to: "2026-05-22" },
    pageSize: 10,
    includeRaw: false
  });

  assert.equal(primary.calls.length, 1);
  assert.equal(fallback.calls.length, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].displayCaseNumber, "2022타경105284");
});

test("searchProperties stops on confirmed BLOCKED responses by default", async () => {
  const primary = makeFakeClient(() => {
    const error = new Error("ipcheck false");
    error.code = "BLOCKED";
    throw error;
  });
  const fallback = makeFakeClient(() => loadFixture("properties-sample.json"));

  await assert.rejects(
    () =>
      searchProperties({
        client: primary,
        fallbackClient: fallback
      }),
    /ipcheck false/
  );
  assert.equal(primary.calls.length, 1);
  assert.equal(fallback.calls.length, 0);
});

test("searchProperties only retries confirmed BLOCKED responses with explicit fallbackOnBlocked", async () => {
  const primary = makeFakeClient(() => {
    const error = new Error("ipcheck false");
    error.code = "BLOCKED";
    throw error;
  });
  const fallback = makeFakeClient(() => loadFixture("properties-sample.json"));

  const result = await searchProperties({
    client: primary,
    fallbackClient: fallback,
    fallbackOnBlocked: true,
    includeRaw: false
  });

  assert.equal(primary.calls.length, 1);
  assert.equal(fallback.calls.length, 1);
  assert.equal(result.items.length, 2);
});

test("searchProperties honors fallback:false even for Workflow C HTTP 400", async () => {
  const primary = makeFakeClient(() => {
    const error = new Error("HTTP 400");
    error.code = "UPSTREAM_ERROR";
    error.statusCode = 400;
    throw error;
  });
  const fallback = makeFakeClient(() => loadFixture("properties-sample.json"));

  await assert.rejects(
    () =>
      searchProperties({
        client: primary,
        fallbackClient: fallback,
        fallback: false
      }),
    /HTTP 400/
  );
  assert.equal(fallback.calls.length, 0);
});

test("Workflow C code tables expose REAL upstream LCL and sido lookups", () => {
  const usages = getUsageCodes();
  const regions = getRegionCodes();
  assert.ok(
    usages.items.some((item) => item.code === "20000" && item.name === "건물" && item.level === "large"),
    "건물=20000 from upstream selectLclLst.on"
  );
  assert.ok(
    usages.items.some((item) => item.code === "10000" && item.name === "토지"),
    "토지=10000 from upstream"
  );
  assert.ok(
    regions.items.some((item) => item.sidoCode === "11" && item.sidoName === "서울특별시"),
    "서울특별시=11 from upstream selectAdongSdLst.on"
  );
  assert.equal(regions.items.length, 19, "all 19 sido from upstream");
});

test("buildPropertySearchBody returns empty region when no region input given", () => {
  const empty = buildPropertySearchBody({}).dma_srchGdsDtlSrchInfo;
  assert.equal(empty.cortStDvs, "1", "no region → cortStDvs=1");
  assert.equal(empty.rprsAdongSdCd, "", "no region → empty sido (no first-row fallback)");
  assert.equal(empty.rprsAdongSggCd, "");
  assert.equal(empty.rprsAdongEmdCd, "");
});

test("buildPropertySearchBody preserves partial region granularity (sido-only and sido+sigungu)", () => {
  const sidoOnly = buildPropertySearchBody({ region: { sido: "서울특별시" } }).dma_srchGdsDtlSrchInfo;
  assert.equal(sidoOnly.cortStDvs, "2");
  assert.equal(sidoOnly.rprsAdongSdCd, "11");
  assert.equal(sidoOnly.rprsAdongSggCd, "");
  assert.equal(sidoOnly.rprsAdongEmdCd, "");

  const sidoSigungu = buildPropertySearchBody({
    region: { sido: "서울특별시", sigungu: "11680" }
  }).dma_srchGdsDtlSrchInfo;
  assert.equal(sidoSigungu.rprsAdongSdCd, "11");
  assert.equal(sidoSigungu.rprsAdongSggCd, "11680");
  assert.equal(sidoSigungu.rprsAdongEmdCd, "");
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
  assert.equal(ENDPOINT_PATHS.propertySearch, "/pgj/pgjsearch/searchControllerMain.on");
});

test("isPlaywrightFallbackAvailable is a boolean (no crash even when modules are absent)", () => {
  const result = isPlaywrightFallbackAvailable();
  assert.equal(typeof result, "boolean");
});

test("CourtAuctionHttpClient is exported for advanced clients to override transport", () => {
  assert.equal(typeof CourtAuctionHttpClient, "function");
});
