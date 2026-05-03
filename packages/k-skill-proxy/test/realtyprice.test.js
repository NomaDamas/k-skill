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
  fetchWithTimeout,
  fetchSigunguList,
  fetchEupmyeondongList,
  fetchGsiSearchList,
  lookupGongsijiga,
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

// ---------------------------------------------------------------------------
// fetchSigunguList
// ---------------------------------------------------------------------------

test("fetchSigunguList: URL includes gubun=sgg and sido=11", async () => {
  let capturedUrl;
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({
        bjdList: [
          { bjd_cd: "11680", bjd_nm: "강남구" },
        ],
      }),
    };
  };
  await fetchSigunguList("11", mockFetch);
  assert.ok(capturedUrl.includes("gubun=sgg"), `URL should include gubun=sgg, got: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("sido=11"), `URL should include sido=11, got: ${capturedUrl}`);
});

test("fetchSigunguList: Referer header is present", async () => {
  let capturedOpts;
  const mockFetch = async (url, opts) => {
    capturedOpts = opts;
    return {
      ok: true,
      json: async () => ({ bjdList: [] }),
    };
  };
  await fetchSigunguList("11", mockFetch);
  assert.equal(capturedOpts.headers.Referer, REFERER);
});

test("fetchSigunguList: parses bjdList and returns mapped array", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      bjdList: [
        { bjd_cd: "11680", bjd_nm: "강남구" },
        { bjd_cd: "11650", bjd_nm: "서초구" },
      ],
    }),
  });
  const result = await fetchSigunguList("11", mockFetch);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { code: "11680", name: "강남구" });
  assert.deepEqual(result[1], { code: "11650", name: "서초구" });
});

test("fetchSigunguList: HTTP 500 → throws UPSTREAM_ERROR with statusCode 502", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 500,
  });
  await assert.rejects(
    () => fetchSigunguList("11", mockFetch),
    (err) => {
      assert.equal(err.code, "UPSTREAM_ERROR");
      assert.equal(err.statusCode, 502);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// fetchEupmyeondongList
// ---------------------------------------------------------------------------

test("fetchEupmyeondongList: URL includes gubun=eub, sido=11, sgg=11680", async () => {
  let capturedUrl;
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ bjdList: [] }),
    };
  };
  await fetchEupmyeondongList("11", "11680", mockFetch);
  assert.ok(capturedUrl.includes("gubun=eub"), `URL should include gubun=eub, got: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("sido=11"), `URL should include sido=11, got: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("sgg=11680"), `URL should include sgg=11680, got: ${capturedUrl}`);
});

test("fetchEupmyeondongList: parses bjdList and returns mapped array", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      bjdList: [
        { bjd_cd: "11680101", bjd_nm: "역삼동" },
      ],
    }),
  });
  const result = await fetchEupmyeondongList("11", "11680", mockFetch);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { code: "11680101", name: "역삼동" });
});

// ---------------------------------------------------------------------------
// fetchGsiSearchList
// ---------------------------------------------------------------------------

test("fetchGsiSearchList: URL includes reg, eub, san=1, bun1=0736", async () => {
  let capturedUrl;
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ gsiList: [] }),
    };
  };
  await fetchGsiSearchList(
    { regCode: "11680", eubCode: "11680101", san: false, bun1: "736", bun2: "" },
    mockFetch
  );
  assert.ok(capturedUrl.includes("reg=11680"), `URL should include reg=11680, got: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("eub=11680101"), `URL should include eub=11680101, got: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("san=1"), `URL should include san=1, got: ${capturedUrl}`);
  assert.ok(capturedUrl.includes("bun1=0736"), `URL should include bun1=0736, got: ${capturedUrl}`);
});

test("fetchGsiSearchList: san=true → san=2 in URL", async () => {
  let capturedUrl;
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ gsiList: [] }),
    };
  };
  await fetchGsiSearchList(
    { regCode: "11680", eubCode: "11680101", san: true, bun1: "1", bun2: "" },
    mockFetch
  );
  assert.ok(capturedUrl.includes("san=2"), `URL should include san=2, got: ${capturedUrl}`);
});

test("fetchGsiSearchList: bun2=5 → bun2=0005 in URL", async () => {
  let capturedUrl;
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ gsiList: [] }),
    };
  };
  await fetchGsiSearchList(
    { regCode: "11680", eubCode: "11680101", san: false, bun1: "736", bun2: "5" },
    mockFetch
  );
  assert.ok(capturedUrl.includes("bun2=0005"), `URL should include bun2=0005, got: ${capturedUrl}`);
});

test("fetchGsiSearchList: returns raw gsiList array", async () => {
  const rawItems = [
    { base_year: "2026", gakuka_w: "72,340,000", notice_ymd: "20260430" },
  ];
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ gsiList: rawItems }),
  });
  const result = await fetchGsiSearchList(
    { regCode: "11680", eubCode: "11680101", san: false, bun1: "736", bun2: "" },
    mockFetch
  );
  assert.deepEqual(result, rawItems);
});

test("fetchGsiSearchList: HTTP error → throws UPSTREAM_ERROR with statusCode 502", async () => {
  const mockFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(
    () => fetchGsiSearchList(
      { regCode: "11680", eubCode: "11680101", san: false, bun1: "736", bun2: "" },
      mockFetch
    ),
    (err) => {
      assert.equal(err.code, "UPSTREAM_ERROR");
      assert.equal(err.statusCode, 502);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// lookupGongsijiga
// ---------------------------------------------------------------------------

// Shared mock data
const MOCK_SGG_LIST = [
  { bjd_cd: "11680", bjd_nm: "강남구" },
  { bjd_cd: "11650", bjd_nm: "서초구" },
  { bjd_cd: "11440", bjd_nm: "마포구" },
];

const MOCK_EUB_LIST = [
  { bjd_cd: "11680101", bjd_nm: "역삼동" },
  { bjd_cd: "11680105", bjd_nm: "삼성동" },
];

const MOCK_GSI_LIST = [
  { base_year: "2025", gakuka_w: "68,600,000", notice_ymd: "20250430" },
  { base_year: "2026", gakuka_w: "72,340,000", notice_ymd: "20260430" },
];

function makeMockFetch({ sggList = MOCK_SGG_LIST, eubList = MOCK_EUB_LIST, gsiList = MOCK_GSI_LIST } = {}) {
  return async (url) => {
    if (url.includes("gubun=sgg")) {
      return { ok: true, json: async () => ({ bjdList: sggList }) };
    }
    if (url.includes("gubun=eub")) {
      return { ok: true, json: async () => ({ bjdList: eubList }) };
    }
    // gsiSearchList
    return { ok: true, json: async () => ({ gsiList }) };
  };
}

test("lookupGongsijiga: success — returns full response shape", async () => {
  const result = await lookupGongsijiga(
    "서울특별시 강남구 역삼동 736",
    makeMockFetch()
  );
  assert.equal(result.address, "서울특별시 강남구 역삼동 736");
  assert.equal(result.jibun, "736번지");
  assert.equal(result.san, false);
  assert.ok(Array.isArray(result.history));
  assert.equal(result.history.length, 2);
  // sorted descending
  assert.equal(result.history[0].year, 2026);
  assert.equal(result.history[1].year, 2025);
  assert.ok("latest" in result);
  assert.equal(result.latest.year, 2026);
  assert.ok("yoy_change_pct" in result);
  assert.equal(
    result.source_url,
    "https://www.realtyprice.kr/notice/gsindividual/search.htm"
  );
});

test("lookupGongsijiga: success with bun2 — jibun is bun1-bun2번지", async () => {
  const result = await lookupGongsijiga(
    "서울특별시 강남구 역삼동 100-5",
    makeMockFetch()
  );
  assert.equal(result.jibun, "100-5번지");
});

test("lookupGongsijiga: REGION_NOT_FOUND when sigungu not in list", async () => {
  await assert.rejects(
    () => lookupGongsijiga("서울특별시 종로구 역삼동 736", makeMockFetch()),
    (err) => {
      assert.equal(err.code, "REGION_NOT_FOUND");
      assert.equal(err.statusCode, 404);
      assert.ok(Array.isArray(err.candidates));
      return true;
    }
  );
});

test("lookupGongsijiga: REGION_NOT_FOUND candidates are up to 3 suggestions", async () => {
  // "강남" is a prefix of "강남구" → should appear as candidate
  const sggList = [
    { bjd_cd: "A", bjd_nm: "강남A구" },
    { bjd_cd: "B", bjd_nm: "강남B구" },
    { bjd_cd: "C", bjd_nm: "강남C구" },
    { bjd_cd: "D", bjd_nm: "강남D구" },
    { bjd_cd: "E", bjd_nm: "전혀무관구" },
  ];
  await assert.rejects(
    () =>
      lookupGongsijiga(
        "서울특별시 강남구 역삼동 736",
        makeMockFetch({ sggList })
      ),
    (err) => {
      assert.equal(err.code, "REGION_NOT_FOUND");
      assert.ok(err.candidates.length <= 3);
      return true;
    }
  );
});

test("lookupGongsijiga: REGION_NOT_FOUND when eupmyeondong not in list", async () => {
  await assert.rejects(
    () =>
      lookupGongsijiga(
        "서울특별시 강남구 없는동 736",
        makeMockFetch()
      ),
    (err) => {
      assert.equal(err.code, "REGION_NOT_FOUND");
      assert.equal(err.statusCode, 404);
      assert.ok(Array.isArray(err.candidates));
      return true;
    }
  );
});

test("lookupGongsijiga: LAND_NOT_FOUND when gsiList is empty", async () => {
  await assert.rejects(
    () =>
      lookupGongsijiga(
        "서울특별시 강남구 역삼동 736",
        makeMockFetch({ gsiList: [] })
      ),
    (err) => {
      assert.equal(err.code, "LAND_NOT_FOUND");
      assert.equal(err.statusCode, 404);
      assert.ok(
        err.message.includes("공시지가가 등재되지 않았습니다")
      );
      return true;
    }
  );
});

test("lookupGongsijiga: eupmyeondong multi-token uses last token for match", async () => {
  // "청계면 청천리" → last token "청천리" must match eub list entry "청천리"
  const eubList = [
    { bjd_cd: "46130310", bjd_nm: "청천리" },
  ];
  const sggList = [
    { bjd_cd: "46130", bjd_nm: "무안군" },
  ];
  const result = await lookupGongsijiga(
    "전라남도 무안군 청계면 청천리 100-5",
    makeMockFetch({ sggList, eubList })
  );
  assert.equal(result.jibun, "100-5번지");
});

test("lookupGongsijiga: eupmyeondong prefix match (strip suffix) resolves single match", async () => {
  // "역삼동" stem "역삼" → matches "역삼동" in list
  const eubList = [
    { bjd_cd: "11680101", bjd_nm: "역삼동" },
    { bjd_cd: "11680105", bjd_nm: "삼성동" },
  ];
  const result = await lookupGongsijiga(
    "서울특별시 강남구 역삼동 736",
    makeMockFetch({ eubList })
  );
  assert.equal(result.address, "서울특별시 강남구 역삼동 736");
});

test("fetchWithTimeout: simulated slow fetch → UPSTREAM_TIMEOUT with statusCode 504", async () => {
  const slowFetch = (url, opts) =>
    new Promise((resolve, reject) => {
      opts.signal.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
      // never resolves on its own
    });

  await assert.rejects(
    () => fetchWithTimeout("https://example.com", {}, 10, slowFetch),
    (err) => {
      assert.equal(err.code, "UPSTREAM_TIMEOUT");
      assert.equal(err.statusCode, 504);
      return true;
    }
  );
});
