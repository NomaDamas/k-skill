const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SIDO_MAP,
  REALTYPRICE_BASE_URL,
  REFERER,
  makeError,
  parseSido,
  parseAddress,
  normalizeSearchResult,
  buildResponse,
} = require("../src/realtyprice");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("REALTYPRICE_BASE_URL is correct", () => {
  assert.equal(REALTYPRICE_BASE_URL, "https://www.realtyprice.kr/notice");
});

test("REFERER is correct", () => {
  assert.equal(
    REFERER,
    "https://www.realtyprice.kr/notice/gsindividual/search.htm"
  );
});

test("SIDO_MAP has 17 entries", () => {
  const uniqueCodes = new Set(Object.values(SIDO_MAP));
  assert.equal(uniqueCodes.size, 17);
});

// ---------------------------------------------------------------------------
// makeError
// ---------------------------------------------------------------------------

test("makeError attaches code and statusCode", () => {
  const err = makeError("ADDRESS_PARSE_FAILED", "bad address", 400);
  assert.equal(err.message, "bad address");
  assert.equal(err.code, "ADDRESS_PARSE_FAILED");
  assert.equal(err.statusCode, 400);
  assert.ok(err instanceof Error);
});

// ---------------------------------------------------------------------------
// parseSido — full names
// ---------------------------------------------------------------------------

test("parseSido: 서울특별시 → 11", () => {
  assert.equal(parseSido("서울특별시"), "11");
});

test("parseSido: 부산광역시 → 21", () => {
  assert.equal(parseSido("부산광역시"), "21");
});

test("parseSido: 대구광역시 → 22", () => {
  assert.equal(parseSido("대구광역시"), "22");
});

test("parseSido: 인천광역시 → 23", () => {
  assert.equal(parseSido("인천광역시"), "23");
});

test("parseSido: 광주광역시 → 24", () => {
  assert.equal(parseSido("광주광역시"), "24");
});

test("parseSido: 대전광역시 → 25", () => {
  assert.equal(parseSido("대전광역시"), "25");
});

test("parseSido: 울산광역시 → 26", () => {
  assert.equal(parseSido("울산광역시"), "26");
});

test("parseSido: 세종특별자치시 → 29", () => {
  assert.equal(parseSido("세종특별자치시"), "29");
});

test("parseSido: 경기도 → 41", () => {
  assert.equal(parseSido("경기도"), "41");
});

test("parseSido: 강원특별자치도 → 42", () => {
  assert.equal(parseSido("강원특별자치도"), "42");
});

test("parseSido: 강원도 → 42", () => {
  assert.equal(parseSido("강원도"), "42");
});

test("parseSido: 충청북도 → 43", () => {
  assert.equal(parseSido("충청북도"), "43");
});

test("parseSido: 충청남도 → 44", () => {
  assert.equal(parseSido("충청남도"), "44");
});

test("parseSido: 전북특별자치도 → 45", () => {
  assert.equal(parseSido("전북특별자치도"), "45");
});

test("parseSido: 전라북도 → 45", () => {
  assert.equal(parseSido("전라북도"), "45");
});

test("parseSido: 전라남도 → 46", () => {
  assert.equal(parseSido("전라남도"), "46");
});

test("parseSido: 경상북도 → 47", () => {
  assert.equal(parseSido("경상북도"), "47");
});

test("parseSido: 경상남도 → 48", () => {
  assert.equal(parseSido("경상남도"), "48");
});

test("parseSido: 제주특별자치도 → 50", () => {
  assert.equal(parseSido("제주특별자치도"), "50");
});

test("parseSido: 제주도 → 50", () => {
  assert.equal(parseSido("제주도"), "50");
});

// ---------------------------------------------------------------------------
// parseSido — abbreviations
// ---------------------------------------------------------------------------

test("parseSido: 서울 → 11", () => {
  assert.equal(parseSido("서울"), "11");
});

test("parseSido: 부산 → 21", () => {
  assert.equal(parseSido("부산"), "21");
});

test("parseSido: 대구 → 22", () => {
  assert.equal(parseSido("대구"), "22");
});

test("parseSido: 인천 → 23", () => {
  assert.equal(parseSido("인천"), "23");
});

test("parseSido: 광주 → 24", () => {
  assert.equal(parseSido("광주"), "24");
});

test("parseSido: 대전 → 25", () => {
  assert.equal(parseSido("대전"), "25");
});

test("parseSido: 울산 → 26", () => {
  assert.equal(parseSido("울산"), "26");
});

test("parseSido: 세종 → 29", () => {
  assert.equal(parseSido("세종"), "29");
});

test("parseSido: 경기 → 41", () => {
  assert.equal(parseSido("경기"), "41");
});

test("parseSido: 강원 → 42", () => {
  assert.equal(parseSido("강원"), "42");
});

test("parseSido: 충북 → 43", () => {
  assert.equal(parseSido("충북"), "43");
});

test("parseSido: 충남 → 44", () => {
  assert.equal(parseSido("충남"), "44");
});

test("parseSido: 전북 → 45", () => {
  assert.equal(parseSido("전북"), "45");
});

test("parseSido: 전남 → 46", () => {
  assert.equal(parseSido("전남"), "46");
});

test("parseSido: 경북 → 47", () => {
  assert.equal(parseSido("경북"), "47");
});

test("parseSido: 경남 → 48", () => {
  assert.equal(parseSido("경남"), "48");
});

test("parseSido: 제주 → 50", () => {
  assert.equal(parseSido("제주"), "50");
});

// ---------------------------------------------------------------------------
// parseSido — unknown
// ---------------------------------------------------------------------------

test("parseSido: unknown string → null", () => {
  assert.equal(parseSido("미국"), null);
});

test("parseSido: empty string → null", () => {
  assert.equal(parseSido(""), null);
});

test("parseSido: random word → null", () => {
  assert.equal(parseSido("역삼동"), null);
});

// ---------------------------------------------------------------------------
// parseAddress — success cases
// ---------------------------------------------------------------------------

test("parseAddress: full address 서울특별시 강남구 역삼동 736", () => {
  const result = parseAddress("서울특별시 강남구 역삼동 736");
  assert.equal(result.sido, "서울특별시");
  assert.equal(result.sidoCode, "11");
  assert.equal(result.sigungu, "강남구");
  assert.equal(result.eupmyeondong, "역삼동");
  assert.equal(result.san, false);
  assert.equal(result.bun1, "736");
  assert.equal(result.bun2, "");
});

test("parseAddress: abbreviated sido 서울 강남구 역삼동 736", () => {
  const result = parseAddress("서울 강남구 역삼동 736");
  assert.equal(result.sido, "서울");
  assert.equal(result.sidoCode, "11");
  assert.equal(result.sigungu, "강남구");
  assert.equal(result.eupmyeondong, "역삼동");
  assert.equal(result.san, false);
  assert.equal(result.bun1, "736");
  assert.equal(result.bun2, "");
});

test("parseAddress: san keyword with space 서울 서초구 서초동 산 1-2", () => {
  const result = parseAddress("서울 서초구 서초동 산 1-2");
  assert.equal(result.sido, "서울");
  assert.equal(result.sidoCode, "11");
  assert.equal(result.sigungu, "서초구");
  assert.equal(result.eupmyeondong, "서초동");
  assert.equal(result.san, true);
  assert.equal(result.bun1, "1");
  assert.equal(result.bun2, "2");
});

test("parseAddress: san keyword attached 서울 서초구 서초동 산1-2", () => {
  const result = parseAddress("서울 서초구 서초동 산1-2");
  assert.equal(result.san, true);
  assert.equal(result.bun1, "1");
  assert.equal(result.bun2, "2");
});

test("parseAddress: multi-token eupmyeondong 전라남도 무안군 청계면 청천리 100-5", () => {
  const result = parseAddress("전라남도 무안군 청계면 청천리 100-5");
  assert.equal(result.sido, "전라남도");
  assert.equal(result.sidoCode, "46");
  assert.equal(result.sigungu, "무안군");
  assert.equal(result.eupmyeondong, "청계면 청천리");
  assert.equal(result.san, false);
  assert.equal(result.bun1, "100");
  assert.equal(result.bun2, "5");
});

test("parseAddress: bun1-bun2 split on dash 경기 성남시 분당구 정자동 100-5", () => {
  const result = parseAddress("경기 성남시 분당구 정자동 100-5");
  assert.equal(result.sidoCode, "41");
  assert.equal(result.sigungu, "성남시");
  assert.equal(result.eupmyeondong, "분당구 정자동");
  assert.equal(result.bun1, "100");
  assert.equal(result.bun2, "5");
});

test("parseAddress: no bun2 when single number 부산 해운대구 좌동 1", () => {
  const result = parseAddress("부산 해운대구 좌동 1");
  assert.equal(result.sidoCode, "21");
  assert.equal(result.bun1, "1");
  assert.equal(result.bun2, "");
});

test("parseAddress: trailing 번지 removed 서울 강남구 역삼동 736번지", () => {
  const result = parseAddress("서울 강남구 역삼동 736번지");
  assert.equal(result.bun1, "736");
  assert.equal(result.bun2, "");
});

test("parseAddress: trailing 번지 removed with dash 서울 강남구 역삼동 100-5번지", () => {
  const result = parseAddress("서울 강남구 역삼동 100-5번지");
  assert.equal(result.bun1, "100");
  assert.equal(result.bun2, "5");
});

test("parseAddress: 세종 address without sigungu 세종 조치원읍 신흥리 100", () => {
  const result = parseAddress("세종 조치원읍 신흥리 100");
  assert.equal(result.sidoCode, "29");
  assert.equal(result.sido, "세종");
  assert.equal(result.bun1, "100");
});

// ---------------------------------------------------------------------------
// parseAddress — error cases
// ---------------------------------------------------------------------------

test("parseAddress: missing sido throws ADDRESS_PARSE_FAILED", () => {
  assert.throws(
    () => parseAddress("역삼동 736"),
    (err) => {
      assert.equal(err.code, "ADDRESS_PARSE_FAILED");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("parseAddress: unrecognized sido throws ADDRESS_PARSE_FAILED", () => {
  assert.throws(
    () => parseAddress("뉴욕시 맨해튼구 어딘가동 1"),
    (err) => {
      assert.equal(err.code, "ADDRESS_PARSE_FAILED");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("parseAddress: empty string throws ADDRESS_PARSE_FAILED", () => {
  assert.throws(
    () => parseAddress(""),
    (err) => {
      assert.equal(err.code, "ADDRESS_PARSE_FAILED");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("parseAddress: bun1 over 4 digits throws INVALID_BUNJI", () => {
  assert.throws(
    () => parseAddress("서울 강남구 역삼동 12345"),
    (err) => {
      assert.equal(err.code, "INVALID_BUNJI");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("parseAddress: non-numeric bun1 throws INVALID_BUNJI", () => {
  assert.throws(
    () => parseAddress("서울 강남구 역삼동 abc"),
    (err) => {
      assert.equal(err.code, "INVALID_BUNJI");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test("parseAddress: non-numeric bun1 with dash throws INVALID_BUNJI", () => {
  assert.throws(
    () => parseAddress("서울 강남구 역삼동 abc-5"),
    (err) => {
      assert.equal(err.code, "INVALID_BUNJI");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// normalizeSearchResult
// ---------------------------------------------------------------------------

test("normalizeSearchResult: parses price with commas", () => {
  const raw = {
    base_year: "2026",
    gakuka_w: "72,340,000",
    notice_ymd: "20260430",
    x_coord: "127.12345",
    y_coord: "37.98765",
  };
  const result = normalizeSearchResult(raw);
  assert.equal(result.price_per_sqm, 72340000);
});

test("normalizeSearchResult: formats notice_ymd as YYYY-MM-DD", () => {
  const raw = {
    base_year: "2026",
    gakuka_w: "72,340,000",
    notice_ymd: "20260430",
    x_coord: "127.12345",
    y_coord: "37.98765",
  };
  const result = normalizeSearchResult(raw);
  assert.equal(result.notice_date, "2026-04-30");
});

test("normalizeSearchResult: extracts year as integer", () => {
  const raw = {
    base_year: "2026",
    gakuka_w: "72,340,000",
    notice_ymd: "20260430",
    x_coord: "127.12345",
    y_coord: "37.98765",
  };
  const result = normalizeSearchResult(raw);
  assert.equal(result.year, 2026);
  assert.equal(typeof result.year, "number");
});

test("normalizeSearchResult: does NOT include x_coord or y_coord in output", () => {
  const raw = {
    base_year: "2026",
    gakuka_w: "72,340,000",
    notice_ymd: "20260430",
    x_coord: "127.12345",
    y_coord: "37.98765",
  };
  const result = normalizeSearchResult(raw);
  assert.ok(!("x_coord" in result));
  assert.ok(!("y_coord" in result));
});

test("normalizeSearchResult: missing gakuka_w → price_per_sqm is null", () => {
  const raw = {
    base_year: "2026",
    gakuka_w: "",
    notice_ymd: "20260430",
  };
  const result = normalizeSearchResult(raw);
  assert.equal(result.price_per_sqm, null);
});

test("normalizeSearchResult: notice_ymd shorter than 8 chars → notice_date is null", () => {
  const raw = {
    base_year: "2026",
    gakuka_w: "72,340,000",
    notice_ymd: "2026",
  };
  const result = normalizeSearchResult(raw);
  assert.equal(result.notice_date, null);
});

// ---------------------------------------------------------------------------
// buildResponse
// ---------------------------------------------------------------------------

test("buildResponse: computes yoy_change_pct correctly for 2+ years", () => {
  const history = [
    { year: 2025, price_per_sqm: 68600000, notice_date: "2025-04-30" },
    { year: 2026, price_per_sqm: 72340000, notice_date: "2026-04-30" },
  ];
  const result = buildResponse({
    address: "서울 강남구 역삼동 736",
    jibun: "736번지",
    san: false,
    history,
  });
  assert.equal(result.yoy_change_pct, 5.45);
});

test("buildResponse: yoy_change_pct is null when only 1 year", () => {
  const history = [
    { year: 2026, price_per_sqm: 72340000, notice_date: "2026-04-30" },
  ];
  const result = buildResponse({
    address: "서울 강남구 역삼동 736",
    jibun: "736번지",
    san: false,
    history,
  });
  assert.equal(result.yoy_change_pct, null);
});

test("buildResponse: history is sorted descending by year", () => {
  const history = [
    { year: 2024, price_per_sqm: 65000000, notice_date: "2024-04-30" },
    { year: 2026, price_per_sqm: 72340000, notice_date: "2026-04-30" },
    { year: 2025, price_per_sqm: 68600000, notice_date: "2025-04-30" },
  ];
  const result = buildResponse({
    address: "서울 강남구 역삼동 736",
    jibun: "736번지",
    san: false,
    history,
  });
  assert.equal(result.history[0].year, 2026);
  assert.equal(result.history[1].year, 2025);
  assert.equal(result.history[2].year, 2024);
});

test("buildResponse: latest has base_date set to {year}-01-01", () => {
  const history = [
    { year: 2026, price_per_sqm: 72340000, notice_date: "2026-04-30" },
  ];
  const result = buildResponse({
    address: "서울 강남구 역삼동 736",
    jibun: "736번지",
    san: false,
    history,
  });
  assert.equal(result.latest.base_date, "2026-01-01");
  assert.equal(result.latest.year, 2026);
  assert.equal(result.latest.price_per_sqm, 72340000);
});

test("buildResponse: source_url is correct constant", () => {
  const history = [
    { year: 2026, price_per_sqm: 72340000, notice_date: "2026-04-30" },
  ];
  const result = buildResponse({
    address: "서울 강남구 역삼동 736",
    jibun: "736번지",
    san: false,
    history,
  });
  assert.equal(
    result.source_url,
    "https://www.realtyprice.kr/notice/gsindividual/search.htm"
  );
});

test("buildResponse: output shape includes address, jibun, san", () => {
  const history = [
    { year: 2026, price_per_sqm: 72340000, notice_date: "2026-04-30" },
  ];
  const result = buildResponse({
    address: "서울 강남구 역삼동 736",
    jibun: "736번지",
    san: false,
    history,
  });
  assert.equal(result.address, "서울 강남구 역삼동 736");
  assert.equal(result.jibun, "736번지");
  assert.equal(result.san, false);
});
