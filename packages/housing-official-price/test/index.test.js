const test = require("node:test");
const assert = require("node:assert/strict");

const {
  INDIVIDUAL_HOUSE_REFERER,
  APARTMENT_REFERER,
  parsePnu,
  buildIndividualHouseHistoryRequest,
  buildApartmentCandidateSearchRequest,
  normalizeIndividualHouseHistory,
  lookupIndividualHousePriceByPnu,
  normalizeApartmentCandidates,
  searchApartmentCandidates,
  parseApartmentDongsFromHtml,
  lookupApartmentOfficialPrice,
} = require("../src/index");


const SAMPLE_PNU = "9999999999199999999";
const SECOND_SAMPLE_PNU = "9999999999199989999";
const SAMPLE_BJD_CODE = "9999999999";
const SAMPLE_REG_CODE = "99999";
const SAMPLE_EUB_CODE = "99999";
const SAMPLE_COMPLEX_NAME = "샘플하우징";
const SAMPLE_COMPLEX_A_NAME = "샘플하우징A동";
const SAMPLE_COMPLEX_B_NAME = "샘플하우징B동";
const SAMPLE_LAND_ADDRESS = "테스트시 샘플구 예시동 999";
const SECOND_SAMPLE_LAND_ADDRESS = "테스트시 샘플구 예시동 998-1";
const SAMPLE_ROAD_ADDRESS = "테스트시 샘플구 예시대로 999";
const SECOND_SAMPLE_ROAD_ADDRESS = "테스트시 샘플구 예시대로 998";
const SAMPLE_APT_CODE = "99000001";
const SECOND_SAMPLE_APT_CODE = "99000002";

test("parsePnu rejects empty and malformed PNUs deterministically", () => {
  for (const value of ["", " ", "999999999919999999", "999999999919999999X"]) {
    assert.throws(
      () => parsePnu(value),
      (err) => {
        assert.equal(err.code, "INVALID_PNU");
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  }
});

test("parsePnu decomposes a 19-digit PNU into realtyprice land-address parts", () => {
  assert.deepEqual(parsePnu(SAMPLE_PNU), {
    pnu: SAMPLE_PNU,
    bjdCode: SAMPLE_BJD_CODE,
    regCode: SAMPLE_REG_CODE,
    eubCode: SAMPLE_EUB_CODE,
    san: "1",
    bun1: "9999",
    bun2: "9999",
  });
});

test("buildIndividualHouseHistoryRequest encodes hpiSearchListApi params from PNU", () => {
  const request = buildIndividualHouseHistoryRequest(SAMPLE_PNU);
  const url = new URL(request.url);

  assert.equal(request.method, "GET");
  assert.equal(url.origin + url.pathname, "https://www.realtyprice.kr/notice/search/hpiSearchListApi.search");
  assert.equal(url.searchParams.get("gbn"), "1");
  assert.equal(url.searchParams.get("reg"), SAMPLE_REG_CODE);
  assert.equal(url.searchParams.get("eub"), SAMPLE_EUB_CODE);
  assert.equal(url.searchParams.get("san"), "1");
  assert.equal(url.searchParams.get("bun1"), "9999");
  assert.equal(url.searchParams.get("bun2"), "9999");
  assert.equal(url.searchParams.get("page_no"), "1");
  assert.equal(url.searchParams.get("tabGbn"), "Text");
  assert.equal(request.headers.Referer, INDIVIDUAL_HOUSE_REFERER);
});

test("buildApartmentCandidateSearchRequest encodes a quick complex-name search", () => {
  const request = buildApartmentCandidateSearchRequest({ complexName: SAMPLE_COMPLEX_NAME });
  const body = new URLSearchParams(request.body);

  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://www.realtyprice.kr/notice/m/town/getApt.do");
  assert.equal(request.headers.Referer, APARTMENT_REFERER);
  assert.equal(body.get("search_gbn"), "1");
  assert.equal(body.get("search_detail_gbn"), "3");
  assert.equal(body.get("search_name"), SAMPLE_COMPLEX_NAME);
  assert.equal(body.get("search_bun"), "");
});

test("buildApartmentCandidateSearchRequest rejects malformed apartment selectors", () => {
  assert.throws(
    () => buildApartmentCandidateSearchRequest({ complexName: " " }),
    (err) => {
      assert.equal(err.code, "INVALID_SELECTOR");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

const INDIVIDUAL_HOUSE_FIXTURE = [
  {
    base_ymd: "2026.1.1",
    notice_ymd: "20260430",
    dong_gbn: "주건물",
    addr: "999",
    full_addr_name: SAMPLE_LAND_ADDRESS,
    tbook_area: "57.50",
    calc_larea: "21.20",
    bldg_garea: "60.00",
    res_area: "55.25",
    hprice_w: " 232,000,000",
  },
  {
    base_ymd: "2025.1.1",
    notice_ymd: "20250430",
    dong_gbn: "주건물",
    addr: "999",
    full_addr_name: SAMPLE_LAND_ADDRESS,
    tbook_area: "57.50",
    calc_larea: "21.20",
    bldg_garea: "60.00",
    res_area: "55.25",
    hprice_w: " 224,000,000",
  },
];

test("normalizeIndividualHouseHistory normalizes yearly price, area, and date fields with raw traceability", () => {
  const history = normalizeIndividualHouseHistory(INDIVIDUAL_HOUSE_FIXTURE);

  assert.equal(history.length, 2);
  assert.deepEqual(history[0], {
    year: 2026,
    base_date: "2026-01-01",
    notice_date: "2026-04-30",
    price_won: 232000000,
    land_area_sqm: 57.5,
    calculated_land_area_sqm: 21.2,
    building_gross_area_sqm: 60,
    residential_area_sqm: 55.25,
    building_label: "주건물",
    lot_address: "999",
    raw: {
      price_won: " 232,000,000",
      land_area_sqm: "57.50",
      calculated_land_area_sqm: "21.20",
      building_gross_area_sqm: "60.00",
      residential_area_sqm: "55.25",
      base_date: "2026.1.1",
      notice_date: "20260430",
    },
  });
});

test("lookupIndividualHousePriceByPnu returns normalized JSON for a synthetic fixture", async () => {
  let requestedUrl;
  const fetchFn = async (url) => {
    requestedUrl = String(url);
    return makeJsonResponse({
      model: {
        totalCnt: 2,
        list: INDIVIDUAL_HOUSE_FIXTURE,
      },
    });
  };

  const result = await lookupIndividualHousePriceByPnu(SAMPLE_PNU, { fetchFn });

  assert.equal(new URL(requestedUrl).searchParams.get("bun1"), "9999");
  assert.equal(result.status, "ok");
  assert.equal(result.query.pnu, SAMPLE_PNU);
  assert.equal(result.selected.pnu, SAMPLE_PNU);
  assert.equal(result.selected.address, SAMPLE_LAND_ADDRESS);
  assert.equal(result.history[0].price_won, 232000000);
  assert.equal(result.source.endpoint, "/notice/search/hpiSearchListApi.search");
});

test("lookupIndividualHousePriceByPnu returns a typed empty result for an empty upstream list", async () => {
  const result = await lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
    fetchFn: async () => makeJsonResponse({ model: { totalCnt: 0, list: null } }),
  });

  assert.equal(result.status, "empty");
  assert.deepEqual(result.history, []);
  assert.equal(result.error.code, "INDIVIDUAL_HOUSE_NOT_FOUND");
});


test("lookupIndividualHousePriceByPnu accepts modelMap fallback payloads", async () => {
  const result = await lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
    fetchFn: async () => makeJsonResponse({
      modelMap: {
        totalCnt: 2,
        list: INDIVIDUAL_HOUSE_FIXTURE,
      },
    }),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.history.length, 2);
  assert.equal(result.history[0].price_won, 232000000);
});

test("lookupIndividualHousePriceByPnu distinguishes upstream HTTP errors", async () => {
  await assert.rejects(
    () =>
      lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
        fetchFn: async () => makeJsonResponse({ message: "maintenance" }, 503),
      }),
    (err) => {
      assert.equal(err.code, "UPSTREAM_HTTP_ERROR");
      assert.equal(err.statusCode, 502);
      assert.equal(err.upstreamStatus, 503);
      return true;
    }
  );
});

test("lookupIndividualHousePriceByPnu distinguishes malformed JSON from schema drift", async () => {
  await assert.rejects(
    () =>
      lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
        fetchFn: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } }),
      }),
    (err) => {
      assert.equal(err.code, "UPSTREAM_MALFORMED_JSON");
      return true;
    }
  );

  await assert.rejects(
    () =>
      lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
        fetchFn: async () => makeJsonResponse({ ok: true }),
      }),
    (err) => {
      assert.equal(err.code, "UPSTREAM_SCHEMA_DRIFT");
      return true;
    }
  );
});

test("lookupIndividualHousePriceByPnu distinguishes timeout aborts", async () => {
  await assert.rejects(
    () =>
      lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
        fetchFn: async () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        },
      }),
    (err) => {
      assert.equal(err.code, "UPSTREAM_TIMEOUT");
      assert.equal(err.statusCode, 504);
      return true;
    }
  );
});


test("lookupIndividualHousePriceByPnu provides a bounded default timeout signal", async () => {
  let seenSignal;
  const result = await lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
    fetchFn: async (_url, opts) => {
      seenSignal = opts.signal;
      return makeJsonResponse({ model: { totalCnt: 0, list: null } });
    },
  });

  assert.equal(result.status, "empty");
  assert.ok(seenSignal, "fetch should receive an AbortController signal by default");
});

test("lookupIndividualHousePriceByPnu rejects with UPSTREAM_TIMEOUT when its own timeout aborts", async () => {
  let seenSignal;
  await assert.rejects(
    () =>
      lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
        timeoutMs: 1,
        fetchFn: async (_url, opts) => {
          seenSignal = opts.signal;
          assert.ok(seenSignal, "fetch should receive a timeout signal");
          return new Promise((_resolve, reject) => {
            seenSignal.addEventListener("abort", () => {
              const err = new Error("aborted by test timeout");
              err.name = "AbortError";
              reject(err);
            }, { once: true });
          });
        },
      }),
    (err) => {
      assert.equal(err.code, "UPSTREAM_TIMEOUT");
      assert.equal(err.statusCode, 504);
      return true;
    }
  );
  assert.equal(seenSignal.aborted, true);
});

test("lookupIndividualHousePriceByPnu preserves a caller-provided abort signal", async () => {
  const controller = new AbortController();
  let seenSignal;
  const result = await lookupIndividualHousePriceByPnu(SAMPLE_PNU, {
    signal: controller.signal,
    timeoutMs: 1,
    fetchFn: async (_url, opts) => {
      seenSignal = opts.signal;
      return makeJsonResponse({ model: { totalCnt: 0, list: null } });
    },
  });

  assert.equal(result.status, "empty");
  assert.equal(seenSignal, controller.signal);
});

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const APARTMENT_CANDIDATE_FIXTURE = [
  {
    NOTICE_DATE: "20260626",
    APT_CODE: SAMPLE_APT_CODE,
    MOD_APT_NAME: SAMPLE_COMPLEX_A_NAME,
    FULL_ROAD_NAME: SAMPLE_ROAD_ADDRESS,
    FULL_BJD_NAME: SAMPLE_LAND_ADDRESS,
    SREG: SAMPLE_REG_CODE,
    SEUB: SAMPLE_EUB_CODE,
    SPNU: SAMPLE_PNU,
    RN: 1,
  },
  {
    NOTICE_DATE: "20260626",
    APT_CODE: SECOND_SAMPLE_APT_CODE,
    MOD_APT_NAME: SAMPLE_COMPLEX_B_NAME,
    FULL_ROAD_NAME: SECOND_SAMPLE_ROAD_ADDRESS,
    FULL_BJD_NAME: SECOND_SAMPLE_LAND_ADDRESS,
    SREG: SAMPLE_REG_CODE,
    SEUB: SAMPLE_EUB_CODE,
    SPNU: SECOND_SAMPLE_PNU,
    RN: 2,
  },
];

const APARTMENT_DETAIL_HTML = `
  <form name="apt_form">
    <input type="hidden" name="notice_date" value="20260626"/>
    <input type="hidden" name="apt_code" value="${SAMPLE_APT_CODE}"/>
  </form>
  <div class="bulidTitle"><p>${SAMPLE_COMPLEX_A_NAME}</p></div>
  <select id="sel_dong" onchange="getHo()">
    <option value="">동 선택</option>
    <option value="1">A</option>
    <option value="2">B</option>
  </select>
`;

const APARTMENT_HO_FIXTURE = [
  { CODE: 1, NAME: "101", KTOWN_HO_SEQ: 9900101, DONG_CODE: 1, APT_CODE: SAMPLE_APT_CODE },
  { CODE: 2, NAME: "201", KTOWN_HO_SEQ: 9900201, DONG_CODE: 1, APT_CODE: SAMPLE_APT_CODE },
];

const APARTMENT_PRICE_FIXTURE = [
  {
    NOTICE_DATE_NAME: "2026.1.1",
    NOTICE_DATE_ORG: "20260626",
    NOTICE_AMT: "     232,000,000",
    PRIV_AREA: 57.5,
    DONG_NAME: "A",
    HO_NAME: "101",
    APT_NAME: SAMPLE_COMPLEX_A_NAME,
    FULL_ROAD_NAME: SAMPLE_ROAD_ADDRESS,
    FULL_BJD_NAME: SAMPLE_LAND_ADDRESS,
    REG: SAMPLE_REG_CODE,
    BJD_CODE: SAMPLE_BJD_CODE,
    APT_CODE: SAMPLE_APT_CODE,
    DONG_CODE: 1,
    HO_CODE: 1,
  },
  {
    NOTICE_DATE_NAME: "2025.1.1",
    NOTICE_DATE_ORG: "20250626",
    NOTICE_AMT: "     224,000,000",
    PRIV_AREA: 57.5,
    DONG_NAME: "A",
    HO_NAME: "101",
    APT_NAME: SAMPLE_COMPLEX_A_NAME,
    FULL_ROAD_NAME: SAMPLE_ROAD_ADDRESS,
    FULL_BJD_NAME: SAMPLE_LAND_ADDRESS,
    REG: SAMPLE_REG_CODE,
    BJD_CODE: SAMPLE_BJD_CODE,
    APT_CODE: SAMPLE_APT_CODE,
    DONG_CODE: 1,
    HO_CODE: 1,
  },
];

test("normalizeApartmentCandidates exposes explicit apartment candidates without selecting one", () => {
  assert.deepEqual(normalizeApartmentCandidates(APARTMENT_CANDIDATE_FIXTURE), [
    {
      noticeDate: "20260626",
      aptCode: SAMPLE_APT_CODE,
      complexName: SAMPLE_COMPLEX_A_NAME,
      roadAddress: SAMPLE_ROAD_ADDRESS,
      landAddress: SAMPLE_LAND_ADDRESS,
      regCode: SAMPLE_REG_CODE,
      eubCode: SAMPLE_EUB_CODE,
      pnu: SAMPLE_PNU,
      rank: 1,
    },
    {
      noticeDate: "20260626",
      aptCode: SECOND_SAMPLE_APT_CODE,
      complexName: SAMPLE_COMPLEX_B_NAME,
      roadAddress: SECOND_SAMPLE_ROAD_ADDRESS,
      landAddress: SECOND_SAMPLE_LAND_ADDRESS,
      regCode: SAMPLE_REG_CODE,
      eubCode: SAMPLE_EUB_CODE,
      pnu: SECOND_SAMPLE_PNU,
      rank: 2,
    },
  ]);
});

test("searchApartmentCandidates uses mocked fetch and returns normalized candidates", async () => {
  let requestBody;
  const result = await searchApartmentCandidates(
    { complexName: SAMPLE_COMPLEX_NAME },
    {
      fetchFn: async (url, opts) => {
        assert.equal(String(url), "https://www.realtyprice.kr/notice/m/town/getApt.do");
        requestBody = opts.body;
        return makeJsonResponse({ model: { list: APARTMENT_CANDIDATE_FIXTURE } });
      },
    }
  );

  assert.equal(new URLSearchParams(requestBody).get("search_name"), SAMPLE_COMPLEX_NAME);
  assert.equal(result.status, "ok");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].aptCode, SAMPLE_APT_CODE);
});


test("searchApartmentCandidates accepts modelMap fallback payloads", async () => {
  const result = await searchApartmentCandidates(
    { complexName: SAMPLE_COMPLEX_NAME },
    {
      fetchFn: async () => makeJsonResponse({ modelMap: { totalCnt: 2, list: APARTMENT_CANDIDATE_FIXTURE } }),
    }
  );

  assert.equal(result.status, "ok");
  assert.equal(result.candidates[0].complexName, SAMPLE_COMPLEX_A_NAME);
});

test("lookupApartmentOfficialPrice does not silently choose ambiguous candidates", async () => {
  await assert.rejects(
    () =>
      lookupApartmentOfficialPrice(
        { complexName: SAMPLE_COMPLEX_NAME, dongName: "A", hoName: "101" },
        {
          fetchFn: async () => makeJsonResponse({ model: { list: APARTMENT_CANDIDATE_FIXTURE } }),
        }
      ),
    (err) => {
      assert.equal(err.code, "AMBIGUOUS_APARTMENT_CANDIDATE");
      assert.equal(err.statusCode, 409);
      assert.equal(err.candidates.length, 2);
      return true;
    }
  );
});

test("parseApartmentDongsFromHtml extracts explicit dong choices from the detail page", () => {
  assert.deepEqual(parseApartmentDongsFromHtml(APARTMENT_DETAIL_HTML), [
    { code: "1", name: "A" },
    { code: "2", name: "B" },
  ]);
});

test("lookupApartmentOfficialPrice resolves explicit candidate, dong, and ho to price history", async () => {
  const calls = [];
  const result = await lookupApartmentOfficialPrice(
    {
      candidate: {
        noticeDate: "20260626",
        aptCode: SAMPLE_APT_CODE,
        complexName: SAMPLE_COMPLEX_A_NAME,
      },
      dongName: "A",
      hoName: "101",
    },
    {
      fetchFn: async (url, opts) => {
        calls.push({ url: String(url), body: opts.body });
        if (String(url).endsWith("/m/town/detail.do")) {
          return makeTextResponse(APARTMENT_DETAIL_HTML);
        }
        if (String(url).endsWith("/m/town/getHo.do")) {
          return makeJsonResponse({ model: { list: APARTMENT_HO_FIXTURE } });
        }
        if (String(url).endsWith("/m/town/getPriceYear.do")) {
          return makeJsonResponse({ model: { list: APARTMENT_PRICE_FIXTURE } });
        }
        throw new Error(`unexpected url: ${url}`);
      },
    }
  );

  assert.equal(new URLSearchParams(calls[1].body).get("dong_code"), "1");
  assert.equal(new URLSearchParams(calls[2].body).get("ho_code"), "1");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.selected.unit, {
    dongCode: "1",
    dongName: "A",
    hoCode: "1",
    hoName: "101",
    ktownHoSeq: "9900101",
  });
  assert.equal(result.history[0].year, 2026);
  assert.equal(result.history[0].price_won, 232000000);
  assert.equal(result.history[0].private_area_sqm, 57.5);
  assert.equal(result.source.endpoint, "/notice/m/town/getPriceYear.do");
});

function makeTextResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}
