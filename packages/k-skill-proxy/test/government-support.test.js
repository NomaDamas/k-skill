const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGovernmentSupportQuery,
  parseBizinfoPage,
  parseNipaPage,
  parseKoccaPage,
  parseSmtechPage,
  buildGovernmentSupportSurvey,
  fetchHtmlSourcePage,
  fetchKstartupPage
} = require("../src/government-support");
const { buildServer } = require("../src/server");

test("government support query normalizes sources, keyword, and bounded pages", () => {
  assert.deepEqual(
    normalizeGovernmentSupportQuery({
      sources: "kstartup,bizinfo,nipa,kocca,smtech",
      keyword: "AI 바우처",
      maxPages: "3",
      perPage: "50"
    }),
    {
      sources: ["kstartup", "bizinfo", "nipa", "kocca", "smtech"],
      keyword: "AI 바우처",
      maxPages: 3,
      perPage: 50
    }
  );

  assert.throws(
    () => normalizeGovernmentSupportQuery({ sources: "unknown" }),
    /sources must contain/
  );
  assert.throws(
    () => normalizeGovernmentSupportQuery({ maxPages: "11" }),
    /maxPages must be between 1 and 10/
  );
});

test("public portal parsers return one stable normalized schema", () => {
  const bizinfo = parseBizinfoPage(`
    <tr><td>1</td><td>수출</td>
    <td><a href="/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_42">AI 수출 바우처</a></td>
    <td>2026-08-01 ~ 2026-09-01</td><td>중소벤처기업부</td><td>중진공</td>
    <td>2026-08-10</td><td>100</td></tr>
  `);
  const nipa = parseNipaPage(`
    <tr><td>1</td><td>D-7</td><td><a href="/home/2-2/16900">AI 사업화 지원</a>
    <span class="box">AI</span> 신청기간 : 2026-08-18 14:00 ~ 2026-09-17 15:00</td>
    <td>담당자</td><td><span class="bco">2026-08-18</span></td></tr>
  `);
  const kocca = parseKoccaPage(`
    <tr><td><span class="category_color1">콘텐츠</span></td>
    <td><a href="/kocca/pims/view.do?intcNo=1234&menuNo=204104">콘텐츠 스타트업 지원</a></td>
    <td data-label="공고일">2026-08-20</td>
    <td data-label="접수기간">2026-08-20 ~ 2026-09-20</td></tr>
  `);
  const smtech = parseSmtechPage(`
    <tr><td>SMTECH</td><td>기술개발</td>
    <td><a href="/front/ifg/no/notice02_detail.do?ancmId=A100">AI R&amp;D 지원</a></td>
    <td>2026. 08. 28 ~ 2026. 09. 28</td><td>2026-08-21</td></tr>
  `);

  for (const item of [bizinfo[0], nipa[0], kocca[0], smtech[0]]) {
    assert.deepEqual(
      Object.keys(item),
      ["source", "id", "title", "field", "org", "apply_start", "apply_end", "reg_date", "url"]
    );
    assert.match(item.url, /^https:\/\//);
  }
  assert.equal(bizinfo[0].id, "PBLN_42");
  assert.equal(nipa[0].apply_end, "2026-09-17");
  assert.equal(kocca[0].source, "kocca");
  assert.equal(smtech[0].title, "AI R&D 지원");
});

test("KOCCA parser preserves two-digit live announcement dates", () => {
  const [item] = parseKoccaPage(`
    <tr><td><span class="category_color1">콘텐츠</span></td>
    <td><a href="/kocca/pims/view.do?intcNo=5678&menuNo=204104">실시간 공고</a></td>
    <td data-label="공고일">26.08.26</td>
    <td data-label="접수기간">26.08.26 ~ 26.09.07</td></tr>
  `);

  assert.equal(item.apply_start, "2026-08-26");
  assert.equal(item.apply_end, "2026-09-07");
  assert.equal(item.reg_date, "2026-08-26");
});

test("government support upstream calls include bounded timeout signals", async () => {
  const seen = [];
  const fetchImpl = async (_url, options) => {
    seen.push(options);
    return {
      ok: true,
      status: 200,
      async text() {
        return `
          <tr><td><span class="category_color1">콘텐츠</span></td>
          <td><a href="/kocca/pims/view.do?intcNo=5678">실시간 공고</a></td>
          <td data-label="공고일">2026-08-26</td>
          <td data-label="접수기간">2026-08-26 ~ 2026-09-07</td></tr>
        `;
      }
    };
  };

  await fetchHtmlSourcePage("kocca", 1, { fetchImpl });
  assert.ok(seen[0].signal);

  await fetchKstartupPage(1, 1, {
    serviceKey: "test-key",
    fetchImpl: async (_url, options) => {
      seen.push(options);
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [{ id: "one" }] };
        }
      };
    }
  });
  assert.ok(seen.at(-1).signal);
});

test("survey preserves partial results and reports source failures", async () => {
  const fetchSourcePage = async (source) => {
    if (source === "nipa") {
      throw new Error("HTTP 403");
    }
    return [{
      source,
      id: `${source}-1`,
      title: source === "bizinfo" ? "AI 바우처" : "일반 지원",
      field: "",
      org: "",
      apply_start: "",
      apply_end: "",
      reg_date: "",
      url: `https://example.invalid/${source}`
    }];
  };

  const result = await buildGovernmentSupportSurvey({
    query: {
      sources: ["bizinfo", "nipa"],
      keyword: "AI",
      maxPages: 1,
      perPage: 20
    },
    fetchSourcePage
  });

  assert.equal(result.complete, false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].source, "bizinfo");
  assert.deepEqual(result.sources.nipa, {
    ok: false,
    pages_fetched: 0,
    item_count: 0,
    error: "HTTP 403"
  });
});

test("government support route rejects unsafe survey bounds before network access", async (t) => {
  const app = buildServer();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/v1/government-support/survey?maxPages=99"
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "bad_request",
    message: "maxPages must be between 1 and 10."
  });
});
