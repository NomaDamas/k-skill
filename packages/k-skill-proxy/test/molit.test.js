const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseXmlItems,
  extractTag,
  normalizeTradeItem,
  normalizeRentItem,
  computeTradeSummary,
  computeRentSummary,
  fetchTransactions,
  median,
} = require("../src/molit");

const SAMPLE_APT_TRADE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <aptNm>래미안</aptNm>
        <umdNm>반포동</umdNm>
        <excluUseAr>84.99</excluUseAr>
        <floor>12</floor>
        <dealAmount>  245,000</dealAmount>
        <dealYear>2024</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>15</dealDay>
        <buildYear>2009</buildYear>
        <dealingGbn>중개거래</dealingGbn>
        <cdealType></cdealType>
      </item>
      <item>
        <aptNm>래미안</aptNm>
        <umdNm>반포동</umdNm>
        <excluUseAr>84.99</excluUseAr>
        <floor>5</floor>
        <dealAmount>  200,000</dealAmount>
        <dealYear>2024</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>20</dealDay>
        <buildYear>2009</buildYear>
        <dealingGbn>직거래</dealingGbn>
        <cdealType>O</cdealType>
      </item>
      <item>
        <aptNm>아크로리버</aptNm>
        <umdNm>반포동</umdNm>
        <excluUseAr>59.96</excluUseAr>
        <floor>3</floor>
        <dealAmount>  180,000</dealAmount>
        <dealYear>2024</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>22</dealDay>
        <buildYear>2016</buildYear>
        <dealingGbn>중개거래</dealingGbn>
        <cdealType></cdealType>
      </item>
    </items>
    <totalCount>3</totalCount>
  </body>
</response>`;

const SAMPLE_APT_RENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <aptNm>래미안</aptNm>
        <umdNm>반포동</umdNm>
        <excluUseAr>84.99</excluUseAr>
        <floor>12</floor>
        <deposit>  80,000</deposit>
        <monthlyRent>0</monthlyRent>
        <contractType>신규</contractType>
        <dealYear>2024</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>10</dealDay>
        <buildYear>2009</buildYear>
        <cdealType></cdealType>
      </item>
      <item>
        <aptNm>아크로리버</aptNm>
        <umdNm>반포동</umdNm>
        <excluUseAr>59.96</excluUseAr>
        <floor>5</floor>
        <deposit>  10,000</deposit>
        <monthlyRent>  150</monthlyRent>
        <contractType>갱신</contractType>
        <dealYear>2024</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>15</dealDay>
        <buildYear>2016</buildYear>
        <cdealType></cdealType>
      </item>
    </items>
    <totalCount>2</totalCount>
  </body>
</response>`;

const ERROR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>030</resultCode><resultMsg>등록되지 않은 서비스키입니다.</resultMsg></header>
</response>`;

test("parseXmlItems extracts items and totalCount from valid XML", () => {
  const result = parseXmlItems(SAMPLE_APT_TRADE_XML);
  assert.equal(result.error, undefined);
  assert.equal(result.totalCount, 3);
  assert.equal(result.items.length, 3);
});

test("parseXmlItems returns error for non-000 resultCode", () => {
  const result = parseXmlItems(ERROR_XML);
  assert.equal(result.error, "molit_api_030");
  assert.ok(result.message.includes("등록되지 않은 서비스키"));
});

test("parseXmlItems returns error for missing resultCode", () => {
  const result = parseXmlItems("<response><body></body></response>");
  assert.equal(result.error, "parse_error");
});

test("extractTag extracts trimmed value", () => {
  const xml = "<aptNm>  래미안 퍼스티지  </aptNm>";
  assert.equal(extractTag(xml, "aptNm"), "래미안 퍼스티지");
});

test("extractTag returns empty string for missing tag", () => {
  assert.equal(extractTag("<foo>bar</foo>", "missing"), "");
});

test("normalizeTradeItem parses apartment trade correctly", () => {
  const parsed = parseXmlItems(SAMPLE_APT_TRADE_XML);
  const item = normalizeTradeItem(parsed.items[0], "apartment");
  assert.equal(item.name, "래미안");
  assert.equal(item.district, "반포동");
  assert.equal(item.area_m2, 84.99);
  assert.equal(item.floor, 12);
  assert.equal(item.price_10k, 245000);
  assert.equal(item.deal_date, "2024-03-15");
  assert.equal(item.build_year, 2009);
  assert.equal(item.deal_type, "중개거래");
});

test("normalizeTradeItem filters cancelled deals", () => {
  const parsed = parseXmlItems(SAMPLE_APT_TRADE_XML);
  const item = normalizeTradeItem(parsed.items[1], "apartment");
  assert.equal(item, null);
});

test("normalizeTradeItem uses offiNm for officetel", () => {
  const xml = `<offiNm>오피스텔A</offiNm><umdNm>역삼동</umdNm><excluUseAr>33.5</excluUseAr>
    <floor>7</floor><dealAmount>50,000</dealAmount><dealYear>2024</dealYear>
    <dealMonth>1</dealMonth><dealDay>5</dealDay><buildYear>2020</buildYear>
    <dealingGbn>중개거래</dealingGbn><cdealType></cdealType>`;
  const item = normalizeTradeItem(xml, "officetel");
  assert.equal(item.name, "오피스텔A");
});

test("normalizeTradeItem uses mhouseNm and houseType for villa", () => {
  const xml = `<mhouseNm>빌라B</mhouseNm><umdNm>신림동</umdNm><excluUseAr>45.0</excluUseAr>
    <floor>3</floor><dealAmount>30,000</dealAmount><dealYear>2024</dealYear>
    <dealMonth>2</dealMonth><dealDay>10</dealDay><buildYear>2015</buildYear>
    <dealingGbn>직거래</dealingGbn><cdealType></cdealType><houseType>다세대</houseType>`;
  const item = normalizeTradeItem(xml, "villa");
  assert.equal(item.name, "빌라B");
  assert.equal(item.houseType, "다세대");
});

test("normalizeTradeItem uses totalFloorAr and floor=0 for single-house", () => {
  const xml = `<umdNm>수유동</umdNm><totalFloorAr>120.5</totalFloorAr>
    <dealAmount>70,000</dealAmount><dealYear>2024</dealYear>
    <dealMonth>4</dealMonth><dealDay>1</dealDay><buildYear>1990</buildYear>
    <dealingGbn>중개거래</dealingGbn><cdealType></cdealType><houseType>단독</houseType>`;
  const item = normalizeTradeItem(xml, "single-house");
  assert.equal(item.name, "");
  assert.equal(item.area_m2, 120.5);
  assert.equal(item.floor, 0);
  assert.equal(item.houseType, "단독");
});

test("normalizeTradeItem handles commercial with lowercase cdealtype", () => {
  const xml = `<buildingType>업무시설</buildingType><buildingUse>오피스</buildingUse>
    <landUse>상업지역</landUse><umdNm>역삼동</umdNm><buildingAr>200.0</buildingAr>
    <floor>10</floor><dealAmount>500,000</dealAmount><dealYear>2024</dealYear>
    <dealMonth>5</dealMonth><dealDay>20</dealDay><buildYear>2018</buildYear>
    <dealingGbn>중개거래</dealingGbn><cdealtype></cdealtype><shareDealingType></shareDealingType>`;
  const item = normalizeTradeItem(xml, "commercial");
  assert.equal(item.buildingType, "업무시설");
  assert.equal(item.area_m2, 200.0);
  assert.equal(item.price_10k, 500000);
});

test("normalizeRentItem parses apartment rent correctly", () => {
  const parsed = parseXmlItems(SAMPLE_APT_RENT_XML);
  const item = normalizeRentItem(parsed.items[0], "apartment");
  assert.equal(item.name, "래미안");
  assert.equal(item.deposit_10k, 80000);
  assert.equal(item.monthly_rent_10k, 0);
  assert.equal(item.contract_type, "신규");
  assert.equal(item.deal_date, "2024-03-10");
});

test("normalizeRentItem parses monthly rent correctly", () => {
  const parsed = parseXmlItems(SAMPLE_APT_RENT_XML);
  const item = normalizeRentItem(parsed.items[1], "apartment");
  assert.equal(item.deposit_10k, 10000);
  assert.equal(item.monthly_rent_10k, 150);
});

test("median computes correctly for odd-length array", () => {
  assert.equal(median([3, 1, 2]), 2);
});

test("median computes correctly for even-length array", () => {
  assert.equal(median([1, 2, 3, 4]), 2);
});

test("median returns 0 for empty array", () => {
  assert.equal(median([]), 0);
});

test("computeTradeSummary computes stats correctly", () => {
  const items = [
    { price_10k: 100000 },
    { price_10k: 200000 },
    { price_10k: 300000 },
  ];
  const summary = computeTradeSummary(items);
  assert.equal(summary.median_price_10k, 200000);
  assert.equal(summary.min_price_10k, 100000);
  assert.equal(summary.max_price_10k, 300000);
  assert.equal(summary.sample_count, 3);
});

test("computeTradeSummary returns zeros for empty array", () => {
  const summary = computeTradeSummary([]);
  assert.equal(summary.sample_count, 0);
  assert.equal(summary.median_price_10k, 0);
});

test("computeRentSummary computes deposit and rent stats", () => {
  const items = [
    { deposit_10k: 50000, monthly_rent_10k: 0 },
    { deposit_10k: 10000, monthly_rent_10k: 100 },
    { deposit_10k: 30000, monthly_rent_10k: 50 },
  ];
  const summary = computeRentSummary(items);
  assert.equal(summary.median_deposit_10k, 30000);
  assert.equal(summary.min_deposit_10k, 10000);
  assert.equal(summary.max_deposit_10k, 50000);
  assert.equal(summary.monthly_rent_avg_10k, 50);
  assert.equal(summary.sample_count, 3);
});

test("fetchTransactions returns error for invalid endpoint", async () => {
  const result = await fetchTransactions({
    assetType: "unknown",
    dealType: "trade",
    lawdCd: "11680",
    dealYmd: "202403",
    serviceKey: "key",
  });
  assert.equal(result.error, "invalid_endpoint");
});

test("fetchTransactions parses full XML pipeline", async () => {
  const mockFetch = async () => ({
    ok: true,
    text: async () => SAMPLE_APT_TRADE_XML,
  });

  const result = await fetchTransactions({
    assetType: "apartment",
    dealType: "trade",
    lawdCd: "11680",
    dealYmd: "202403",
    serviceKey: "test-key",
    fetchImpl: mockFetch,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.items.length, 2); // 1 cancelled filtered out
  assert.equal(result.total_count, 3);
  assert.equal(result.filtered_count, 2);
  assert.equal(result.items[0].name, "래미안");
  assert.equal(result.items[0].price_10k, 245000);
  assert.equal(result.summary.sample_count, 2);
});

test("fetchTransactions handles rent XML", async () => {
  const mockFetch = async () => ({
    ok: true,
    text: async () => SAMPLE_APT_RENT_XML,
  });

  const result = await fetchTransactions({
    assetType: "apartment",
    dealType: "rent",
    lawdCd: "11680",
    dealYmd: "202403",
    serviceKey: "test-key",
    fetchImpl: mockFetch,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].deposit_10k, 80000);
  assert.ok(result.summary.median_deposit_10k > 0);
});

test("fetchTransactions returns error for upstream failure", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  const result = await fetchTransactions({
    assetType: "apartment",
    dealType: "trade",
    lawdCd: "11680",
    dealYmd: "202403",
    serviceKey: "test-key",
    fetchImpl: mockFetch,
  });

  assert.equal(result.error, "upstream_error");
});

test("fetchTransactions returns error for API error code", async () => {
  const mockFetch = async () => ({
    ok: true,
    text: async () => ERROR_XML,
  });

  const result = await fetchTransactions({
    assetType: "apartment",
    dealType: "trade",
    lawdCd: "11680",
    dealYmd: "202403",
    serviceKey: "test-key",
    fetchImpl: mockFetch,
  });

  assert.equal(result.error, "molit_api_030");
});
