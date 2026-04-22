const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LH_DEFAULT_LIST_URL,
  LH_DEFAULT_DETAIL_URL,
  VALID_PAN_SS_VALUES,
  VALID_UPP_AIS_TP_CD_VALUES,
  normalizeLhNoticeSearchQuery,
  normalizeLhNoticeDetailQuery,
  normalizeNoticeItem,
  parseXmlErrorEnvelope,
  extractNoticeEnvelope,
  buildNoticeListResponseBody,
  buildNoticeDetailResponseBody,
  fetchLhNoticeList,
  fetchLhNoticeDetail
} = require("../src/lh-notice");

const SAMPLE_LIST_PAYLOAD = [
  {
    CMN: {
      CODE: "SUCCESS",
      ERR_MSG: "",
      TOTAL_CNT: 3
    }
  },
  {
    dsList: [
      {
        PAN_ID: "2015122300019828",
        PAN_NM: "2026년 상반기 부산광역시 영구임대주택 예비입주자 모집 공고",
        UPP_AIS_TP_CD: "06",
        AIS_TP_CD: "09",
        AIS_TP_CD_NM: "영구임대",
        CNP_CD_NM: "부산광역시",
        PAN_SS: "공고중",
        PAN_DT: "2026-04-21",
        CLSG_DT: "2026-05-06",
        SPL_INF_TP_CD: "051",
        CCR_CNNT_SYS_DS_CD: "03",
        DTL_URL:
          "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?ccrCnntSysDsCd=03&panId=2015122300019828&aisTpCd=09&uppAisTpCd=06&mi=1026"
      },
      {
        PAN_ID: "2015122300019816",
        PAN_NM: "2026 전세임대형 든든주택 1, 2순위 입주자 모집 공고",
        UPP_AIS_TP_CD: "13",
        AIS_TP_CD: "17",
        AIS_TP_CD_NM: "전세임대",
        CNP_CD_NM: "전국",
        PAN_SS: "공고중",
        PAN_DT: "2026-04-21",
        CLSG_DT: "2026-05-08",
        SPL_INF_TP_CD: "072",
        CCR_CNNT_SYS_DS_CD: "03",
        DTL_URL: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300019816"
      },
      {
        PAN_ID: "",
        PAN_NM: ""
      }
    ]
  }
];

const SAMPLE_DETAIL_PAYLOAD = [
  {
    CMN: {
      CODE: "SUCCESS",
      ERR_MSG: "",
      TOTAL_CNT: 2
    }
  },
  {
    dsList: [
      {
        PAN_ID: "2015122300019828",
        PAN_NM: "2026년 상반기 부산광역시 영구임대주택 예비입주자 모집 공고",
        UPP_AIS_TP_CD: "06",
        AIS_TP_CD: "09",
        AIS_TP_CD_NM: "영구임대",
        CNP_CD_NM: "부산광역시",
        PAN_SS: "공고중",
        PAN_DT: "2026-04-21",
        CLSG_DT: "2026-05-06",
        SPL_INF_TP_CD: "051",
        CCR_CNNT_SYS_DS_CD: "03",
        HOUSE_TY: "영구임대 29㎡",
        SPL_CNT: "120"
      },
      {
        PAN_ID: "2015122300019828",
        HOUSE_TY: "영구임대 39㎡",
        SPL_CNT: "80"
      }
    ]
  }
];

const XML_AUTH_ERROR = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<OpenAPI_ServiceResponse>
  <cmmMsgHeader>
    <errMsg>SERVICE ERROR</errMsg>
    <returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>
    <returnReasonCode>30</returnReasonCode>
  </cmmMsgHeader>
</OpenAPI_ServiceResponse>`;

const STANDARD_JSON_ENVELOPE = {
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
    body: {
      totalCount: 1,
      items: [
        {
          PAN_ID: "9999",
          PAN_NM: "standard envelope sample"
        }
      ]
    }
  }
};

test("VALID_PAN_SS_VALUES contains the five documented statuses", () => {
  for (const status of ["공고중", "접수중", "접수마감", "당첨자발표", "추정공고"]) {
    assert.equal(VALID_PAN_SS_VALUES.has(status), true, `missing ${status}`);
  }
});

test("VALID_UPP_AIS_TP_CD_VALUES covers the main LH categories", () => {
  for (const code of ["01", "05", "06", "13", "22"]) {
    assert.equal(VALID_UPP_AIS_TP_CD_VALUES.has(code), true, `missing ${code}`);
  }
});

test("normalizeLhNoticeSearchQuery accepts empty input and applies defaults", () => {
  const normalized = normalizeLhNoticeSearchQuery({});
  assert.equal(normalized.page, 1);
  assert.equal(normalized.pageSize, 50);
  assert.equal(normalized.panSs, undefined);
  assert.equal(normalized.uppAisTpCd, undefined);
  assert.equal(normalized.cnpCdNm, undefined);
});

test("normalizeLhNoticeSearchQuery accepts camelCase, snake_case, and short aliases", () => {
  const normalized = normalizeLhNoticeSearchQuery({
    status: "공고중",
    category: "06",
    region: "서울특별시",
    keyword: "행복주택",
    startDate: "2026-01-01",
    endDate: "2026.12.31",
    page: "2",
    limit: "10"
  });
  assert.equal(normalized.panSs, "공고중");
  assert.equal(normalized.uppAisTpCd, "06");
  assert.equal(normalized.cnpCdNm, "서울특별시");
  assert.equal(normalized.panNm, "행복주택");
  assert.equal(normalized.panNtStDt, "2026-01-01");
  assert.equal(normalized.clsgDt, "2026-12-31");
  assert.equal(normalized.page, 2);
  assert.equal(normalized.pageSize, 10);
});

test("normalizeLhNoticeSearchQuery rejects invalid panSs", () => {
  assert.throws(
    () => normalizeLhNoticeSearchQuery({ status: "대기중" }),
    /panSs must be one of/
  );
});

test("normalizeLhNoticeSearchQuery rejects invalid uppAisTpCd", () => {
  assert.throws(
    () => normalizeLhNoticeSearchQuery({ category: "77" }),
    /uppAisTpCd must be one of/
  );
});

test("normalizeLhNoticeSearchQuery rejects invalid aisTpCd (letters)", () => {
  assert.throws(
    () => normalizeLhNoticeSearchQuery({ aisTpCd: "abc" }),
    /aisTpCd must be digits/
  );
});

test("normalizeLhNoticeSearchQuery clamps page/pageSize to documented bounds", () => {
  const high = normalizeLhNoticeSearchQuery({ page: "99999", pageSize: "99999" });
  assert.equal(high.page, 1000);
  assert.equal(high.pageSize, 1000);

  const low = normalizeLhNoticeSearchQuery({ page: "0", pageSize: "0" });
  assert.equal(low.page, 1);
  assert.equal(low.pageSize, 1);
});

test("normalizeLhNoticeSearchQuery accepts YYYYMMDD and YYYY.MM.DD", () => {
  const a = normalizeLhNoticeSearchQuery({ startDate: "20260101" });
  assert.equal(a.panNtStDt, "2026-01-01");

  const b = normalizeLhNoticeSearchQuery({ startDate: "2026.01.02" });
  assert.equal(b.panNtStDt, "2026-01-02");
});

test("normalizeLhNoticeSearchQuery rejects malformed dates", () => {
  assert.throws(
    () => normalizeLhNoticeSearchQuery({ startDate: "2026" }),
    /panNtStDt as YYYY-MM-DD/
  );
});

test("normalizeLhNoticeDetailQuery requires all three codes", () => {
  assert.throws(
    () => normalizeLhNoticeDetailQuery({}),
    /Provide panId/
  );
  assert.throws(
    () => normalizeLhNoticeDetailQuery({ panId: "2015122300019828" }),
    /Provide ccrCnntSysDsCd/
  );
  assert.throws(
    () =>
      normalizeLhNoticeDetailQuery({
        panId: "2015122300019828",
        ccrCnntSysDsCd: "03"
      }),
    /Provide splInfTpCd/
  );
});

test("normalizeLhNoticeDetailQuery accepts the production payload", () => {
  const normalized = normalizeLhNoticeDetailQuery({
    panId: "2015122300019828",
    ccrCnntSysDsCd: "03",
    splInfTpCd: "051"
  });
  assert.deepEqual(normalized, {
    panId: "2015122300019828",
    ccrCnntSysDsCd: "03",
    splInfTpCd: "051"
  });
});

test("normalizeLhNoticeDetailQuery rejects non-numeric panId", () => {
  assert.throws(
    () =>
      normalizeLhNoticeDetailQuery({
        panId: "abc123",
        ccrCnntSysDsCd: "03",
        splInfTpCd: "051"
      }),
    /panId must be digits/
  );
});

test("normalizeNoticeItem maps upstream SCREAMING_SNAKE_CASE keys to snake_case", () => {
  const result = normalizeNoticeItem({
    PAN_ID: "2015122300019828",
    PAN_NM: "샘플 공고",
    UPP_AIS_TP_CD: "06",
    AIS_TP_CD: "09",
    AIS_TP_CD_NM: "영구임대",
    CNP_CD_NM: "부산광역시",
    PAN_SS: "공고중",
    PAN_DT: "2026-04-21",
    CLSG_DT: "2026-05-06",
    SPL_INF_TP_CD: "051",
    CCR_CNNT_SYS_DS_CD: "03",
    DTL_URL: "https://apply.lh.or.kr/..."
  });

  assert.equal(result.pan_id, "2015122300019828");
  assert.equal(result.pan_nm, "샘플 공고");
  assert.equal(result.upp_ais_tp_cd, "06");
  assert.equal(result.ais_tp_cd_nm, "영구임대");
  assert.equal(result.cnp_cd_nm, "부산광역시");
  assert.equal(result.pan_ss, "공고중");
  assert.equal(result.pan_dt, "2026-04-21");
  assert.equal(result.clsg_dt, "2026-05-06");
  assert.equal(result.spl_inf_tp_cd, "051");
  assert.equal(result.ccr_cnnt_sys_ds_cd, "03");
  assert.equal(result.detail_url, "https://apply.lh.or.kr/...");
  assert.ok(result.raw, "raw pass-through must be kept");
});

test("normalizeNoticeItem drops rows with no panId AND no panNm", () => {
  assert.equal(normalizeNoticeItem({}), null);
  assert.equal(normalizeNoticeItem({ PAN_ID: "" }), null);
  assert.equal(normalizeNoticeItem({ PAN_NM: "   " }), null);
});

test("normalizeNoticeItem keeps rows that have panId only", () => {
  const result = normalizeNoticeItem({ PAN_ID: "123" });
  assert.equal(result.pan_id, "123");
  assert.equal(result.pan_nm, null);
});

test("parseXmlErrorEnvelope pulls code+msg from the OpenAPI_ServiceResponse form", () => {
  const err = parseXmlErrorEnvelope(XML_AUTH_ERROR);
  assert.ok(err);
  assert.equal(err.code, "30");
  assert.match(err.message, /SERVICE_KEY/);
});

test("parseXmlErrorEnvelope returns null for non-XML payloads", () => {
  assert.equal(parseXmlErrorEnvelope(""), null);
  assert.equal(parseXmlErrorEnvelope("Unauthorized"), null);
  assert.equal(parseXmlErrorEnvelope('{"a":1}'), null);
});

test("extractNoticeEnvelope handles the LH [CMN,dsList] array envelope", () => {
  const envelope = extractNoticeEnvelope(SAMPLE_LIST_PAYLOAD);
  assert.equal(envelope.totalCount, 3);
  assert.equal(envelope.items.length, 3);
  assert.equal(envelope.items[0].PAN_ID, "2015122300019828");
});

test("extractNoticeEnvelope throws an error for CMN.CODE != SUCCESS", () => {
  const payload = [
    { CMN: { CODE: "FAIL", ERR_MSG: "Service key invalid", TOTAL_CNT: 0 } },
    { dsList: [] }
  ];
  assert.throws(() => extractNoticeEnvelope(payload), /Service key invalid/);
});

// Regression: the LH catalog has historically surfaced `CMN.CODE` as one of
// `"SUCCESS"`, `"0"`, `"00"`, or `"000"` depending on which era of the
// data.go.kr platform the upstream deploy is on. All four MUST be treated as
// success so that we do not erroneously 502 when data.go.kr normalizes the
// array envelope to the standard numeric code. See the inline comment above
// `extractNoticeEnvelope`'s success-code check for the historical context.
for (const successCode of ["SUCCESS", "0", "00", "000"]) {
  test(`extractNoticeEnvelope treats array-envelope CMN.CODE="${successCode}" as success`, () => {
    const payload = [
      { CMN: { CODE: successCode, ERR_MSG: "", TOTAL_CNT: 1 } },
      {
        dsList: [
          {
            PAN_ID: "1234567890",
            PAN_NM: "success-code regression fixture",
            UPP_AIS_TP_CD: "06"
          }
        ]
      }
    ];
    const envelope = extractNoticeEnvelope(payload);
    assert.equal(envelope.totalCount, 1);
    assert.equal(envelope.items.length, 1);
    assert.equal(envelope.items[0].PAN_ID, "1234567890");
  });
}

// Same regression for the standard data.go.kr `{response:{header,body:{items}}}`
// envelope. Upstream has been seen returning `resultCode` in all three
// numeric forms; XML-based services also tolerate `"0"` despite the catalog
// documenting `"00"` for `B552555`. All three MUST be treated as success so
// that the fallback parser does not erroneously flag a valid response as an
// upstream error.
for (const headerCode of ["0", "00", "000"]) {
  test(`extractNoticeEnvelope treats object-envelope header.resultCode="${headerCode}" as success`, () => {
    const payload = {
      response: {
        header: { resultCode: headerCode, resultMsg: "NORMAL SERVICE." },
        body: {
          totalCount: 1,
          items: [
            {
              PAN_ID: "9999",
              PAN_NM: "object-envelope regression fixture"
            }
          ]
        }
      }
    };
    const envelope = extractNoticeEnvelope(payload);
    assert.equal(envelope.totalCount, 1);
    assert.equal(envelope.items.length, 1);
    assert.equal(envelope.items[0].PAN_ID, "9999");
  });
}

test("extractNoticeEnvelope rejects numeric-like non-success codes (e.g. 22, 10)", () => {
  // Not every `resultCode` that LOOKS numeric is success — data.go.kr uses
  // non-zero integer strings like "22", "10", "30" to signal specific upstream
  // errors (LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR, etc.).
  const arrayPayload = [
    { CMN: { CODE: "22", ERR_MSG: "LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR", TOTAL_CNT: 0 } },
    { dsList: [] }
  ];
  assert.throws(
    () => extractNoticeEnvelope(arrayPayload),
    /LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR/
  );

  const objectPayload = {
    response: {
      header: { resultCode: "10", resultMsg: "APPLICATION ERROR" },
      body: { items: [] }
    }
  };
  assert.throws(() => extractNoticeEnvelope(objectPayload), /APPLICATION ERROR/);
});

test("extractNoticeEnvelope also handles the standard data.go.kr response/body shape", () => {
  const envelope = extractNoticeEnvelope(STANDARD_JSON_ENVELOPE);
  assert.equal(envelope.totalCount, 1);
  assert.equal(envelope.items.length, 1);
  assert.equal(envelope.items[0].PAN_ID, "9999");
});

test("extractNoticeEnvelope returns empty list for unknown shapes", () => {
  assert.deepEqual(extractNoticeEnvelope(null), { totalCount: null, items: [] });
  assert.deepEqual(extractNoticeEnvelope({ foo: "bar" }), { totalCount: null, items: [] });
});

test("buildNoticeListResponseBody produces the proxy-facing JSON shape", () => {
  const envelope = extractNoticeEnvelope(SAMPLE_LIST_PAYLOAD);
  const body = buildNoticeListResponseBody(envelope, {
    page: 1,
    pageSize: 50,
    filters: { pan_ss: "공고중" }
  });
  assert.equal(body.items.length, 2, "empty row must be skipped");
  assert.equal(body.summary.page, 1);
  assert.equal(body.summary.page_size, 50);
  assert.equal(body.summary.returned_count, 2);
  assert.equal(body.summary.total_count, 3);
  assert.equal(body.query.pan_ss, "공고중");
  assert.equal(body.items[0].pan_id, "2015122300019828");
});

test("buildNoticeDetailResponseBody returns notice + supply_infos", () => {
  const envelope = extractNoticeEnvelope(SAMPLE_DETAIL_PAYLOAD);
  const body = buildNoticeDetailResponseBody(envelope, {
    panId: "2015122300019828",
    ccrCnntSysDsCd: "03",
    splInfTpCd: "051"
  });
  assert.equal(body.notice.pan_id, "2015122300019828");
  assert.equal(body.notice.ais_tp_cd_nm, "영구임대");
  assert.equal(body.supply_infos.length, 2);
  assert.equal(body.supply_infos[0].HOUSE_TY, "영구임대 29㎡");
  assert.equal(body.query.panId, "2015122300019828");
});

test("fetchLhNoticeList builds the expected data.go.kr URL and returns parsed items", async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json;charset=UTF-8" },
      text: async () => JSON.stringify(SAMPLE_LIST_PAYLOAD)
    };
  };

  const body = await fetchLhNoticeList({
    serviceKey: "test-key",
    filters: {
      page: 2,
      pageSize: 25,
      panSs: "공고중",
      uppAisTpCd: "06",
      aisTpCd: "09",
      cnpCdNm: "부산광역시",
      panNm: "영구임대",
      panNtStDt: "2026-04-01",
      clsgDt: "2026-05-31"
    },
    fetchImpl: mockFetch
  });

  assert.equal(calls.length, 1);
  const requested = calls[0];
  assert.ok(requested.startsWith(LH_DEFAULT_LIST_URL), `URL must hit list endpoint: ${requested}`);
  assert.match(requested, /PG_SZ=25/);
  assert.match(requested, /PAGE=2/);
  assert.match(requested, /PAN_SS=%EA%B3%B5%EA%B3%A0%EC%A4%91/);
  assert.match(requested, /UPP_AIS_TP_CD=06/);
  assert.match(requested, /AIS_TP_CD=09/);
  assert.match(requested, /CNP_CD_NM=%EB%B6%80%EC%82%B0/);
  assert.match(requested, /PAN_NT_ST_DT=2026-04-01/);
  assert.match(requested, /CLSG_DT=2026-05-31/);
  assert.match(requested, /serviceKey=test-key/);

  assert.equal(body.items.length, 2);
  assert.equal(body.summary.page, 2);
  assert.equal(body.summary.page_size, 25);
  assert.equal(body.summary.total_count, 3);
});

test("fetchLhNoticeList surfaces upstream 401 as upstream_not_authorized (statusCode 503)", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 401,
    headers: { get: () => "text/plain" },
    text: async () => "Unauthorized"
  });

  await assert.rejects(
    fetchLhNoticeList({
      serviceKey: "bad",
      filters: { page: 1, pageSize: 50 },
      fetchImpl: mockFetch
    }),
    (err) => {
      assert.equal(err.code, "upstream_not_authorized");
      assert.equal(err.statusCode, 503);
      return true;
    }
  );
});

test("fetchLhNoticeList surfaces XML SERVICE_KEY error envelopes with upstreamCode", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/xml" },
    text: async () => XML_AUTH_ERROR
  });

  await assert.rejects(
    fetchLhNoticeList({
      serviceKey: "bad",
      filters: { page: 1, pageSize: 50 },
      fetchImpl: mockFetch
    }),
    (err) => {
      assert.equal(err.code, "upstream_error");
      assert.equal(err.statusCode, 502);
      assert.equal(err.upstreamCode, "30");
      assert.match(err.message, /SERVICE_KEY/);
      return true;
    }
  );
});

test("fetchLhNoticeList surfaces non-JSON payloads as upstream_invalid_payload", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    text: async () => "<html>not json</html>"
  });

  await assert.rejects(
    fetchLhNoticeList({
      serviceKey: "x",
      filters: { page: 1, pageSize: 50 },
      fetchImpl: mockFetch
    }),
    (err) => {
      assert.equal(err.code, "upstream_invalid_payload");
      assert.equal(err.statusCode, 502);
      return true;
    }
  );
});

test("fetchLhNoticeList surfaces fetch failures as upstream_fetch_failed", async () => {
  const mockFetch = async () => {
    throw new Error("socket hang up");
  };

  await assert.rejects(
    fetchLhNoticeList({
      serviceKey: "x",
      filters: { page: 1, pageSize: 50 },
      fetchImpl: mockFetch
    }),
    (err) => {
      assert.equal(err.code, "upstream_fetch_failed");
      assert.equal(err.statusCode, 502);
      return true;
    }
  );
});

test("fetchLhNoticeDetail calls the detail endpoint with PAN_ID + SPL_INF_TP_CD + CCR_CNNT_SYS_DS_CD", async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(SAMPLE_DETAIL_PAYLOAD)
    };
  };

  const body = await fetchLhNoticeDetail({
    serviceKey: "test-key",
    filters: { panId: "2015122300019828", ccrCnntSysDsCd: "03", splInfTpCd: "051" },
    fetchImpl: mockFetch
  });

  assert.equal(calls.length, 1);
  const requested = calls[0];
  assert.ok(requested.startsWith(LH_DEFAULT_DETAIL_URL), `URL must hit detail endpoint: ${requested}`);
  assert.match(requested, /PAN_ID=2015122300019828/);
  assert.match(requested, /CCR_CNNT_SYS_DS_CD=03/);
  assert.match(requested, /SPL_INF_TP_CD=051/);

  assert.equal(body.notice.pan_id, "2015122300019828");
  assert.equal(body.supply_infos.length, 2);
});
