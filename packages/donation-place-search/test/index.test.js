const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CATEGORIES,
  build1365DonationSearchUrl,
  normalizeCategory,
  parseLocationQuery,
  recommendDonationPlaces,
  formatDonationRecommendationReport
} = require("../src/index");

test("normalizeCategory maps Korean aliases to canonical donation categories", () => {
  assert.equal(normalizeCategory("아동"), "children");
  assert.equal(normalizeCategory("동물보호"), "animals");
  assert.equal(normalizeCategory("재난 구호"), "disaster");
  assert.equal(normalizeCategory("환경"), "environment");
  assert.equal(normalizeCategory("모르는분야"), "general");
  assert.ok(CATEGORIES.children.keywords.includes("아동"));
});

test("normalizeCategory prioritizes specific categories in natural donation phrases", () => {
  assert.equal(normalizeCategory("동물 기부"), "animals");
  assert.equal(normalizeCategory("아동 기부"), "children");
  assert.equal(normalizeCategory("환경 모금"), "environment");
  assert.equal(normalizeCategory("장애인 나눔"), "disability");
});

test("parseLocationQuery extracts Korean province and district hints conservatively", () => {
  assert.deepEqual(parseLocationQuery("서울시 마포구 공덕동"), {
    raw: "서울시 마포구 공덕동",
    province: "서울",
    district: "마포구"
  });
  assert.deepEqual(parseLocationQuery("부산 해운대구"), {
    raw: "부산 해운대구",
    province: "부산",
    district: "해운대구"
  });
  assert.deepEqual(parseLocationQuery("온라인"), {
    raw: "온라인",
    province: null,
    district: null
  });
});

test("build1365DonationSearchUrl creates a public 1365 search-assist link without proxy auth", () => {
  const url = new URL(build1365DonationSearchUrl({
    location: "서울 마포구",
    category: "animals",
    keyword: "유기동물"
  }));

  assert.equal(url.origin, "https://www.1365.go.kr");
  assert.equal(url.pathname, "/dntn/main.do");
  assert.equal(url.searchParams.get("query"), "유기동물 서울 마포구");
  assert.equal(url.searchParams.get("category"), "animals");
});

test("build1365DonationSearchUrl treats an empty category list like the default category", () => {
  const url = new URL(build1365DonationSearchUrl({
    location: "서울 마포구",
    category: [],
    keyword: "기부처"
  }));

  assert.equal(url.searchParams.get("category"), "general");
  assert.equal(url.searchParams.get("query"), "기부처 서울 마포구");
});

test("recommendDonationPlaces ranks local category matches before broad national fallback", () => {
  const result = recommendDonationPlaces({
    location: "서울 마포구",
    category: "동물",
    limit: 3
  });

  assert.equal(result.category, "animals");
  assert.equal(result.location.province, "서울");
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].name, "동물권행동 카라");
  assert.equal(result.items[0].match.local, true);
  assert.equal(result.items[0].match.category, true);
  assert.ok(result.items[0].officialSearchUrl.includes("1365.go.kr"));
  assert.ok(result.items.some((item) => item.coverage === "nationwide"));
  assert.ok(result.items.every((item) => item.categories.includes("animals")));
});

test("recommendDonationPlaces emits candidate-specific 1365 search-assist links", () => {
  const result = recommendDonationPlaces({
    location: "서울 마포구",
    category: "동물",
    limit: 3
  });

  const itemUrls = result.items.map((item) => new URL(item.officialSearchUrl));
  const itemQueries = itemUrls.map((url) => url.searchParams.get("query"));

  assert.equal(new Set(result.items.map((item) => item.officialSearchUrl)).size, result.items.length);
  result.items.forEach((item, index) => {
    assert.equal(itemUrls[index].origin, "https://www.1365.go.kr");
    assert.equal(itemUrls[index].searchParams.get("category"), "animals");
    assert.match(itemQueries[index], new RegExp(item.name));
    assert.match(itemQueries[index], /서울 마포구/);
  });
});

test("recommendDonationPlaces treats an empty category list like the optional default", () => {
  const result = recommendDonationPlaces({
    location: "서울 마포구",
    category: [],
    limit: 2
  });

  assert.deepEqual(result.category, ["general"]);
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every((item) => item.match.category));
});

test("recommendDonationPlaces supports multiple category filters and explains no exact local hit", () => {
  const result = recommendDonationPlaces({
    location: "제주 서귀포시",
    category: ["장애", "노인"],
    limit: 4
  });

  assert.deepEqual(result.category, ["disability", "elderly"]);
  assert.equal(result.items.length, 4);
  assert.ok(result.items.every((item) => item.match.category));
  assert.ok(result.meta.notes.some((note) => note.includes("정확한 지역 일치")));
});

test("recommendDonationPlaces uses each matched candidate category in multi-category item links", () => {
  const result = recommendDonationPlaces({
    location: "제주 서귀포시",
    category: ["장애", "노인"],
    limit: 4
  });

  assert.deepEqual(result.category, ["disability", "elderly"]);
  result.items.forEach((item) => {
    const url = new URL(item.officialSearchUrl);
    const urlCategory = url.searchParams.get("category");
    assert.ok(item.categories.includes(urlCategory), `${item.name} URL category ${urlCategory} must match candidate categories`);
  });
});

test("build1365DonationSearchUrl does not allow overriding the official 1365 endpoint", () => {
  assert.throws(
    () => build1365DonationSearchUrl({ baseUrl: "https://example.com/dntn/main.do" }),
    /baseUrl is not supported/
  );
});

test("recommendDonationPlaces rejects malformed non-integer limits", () => {
  assert.throws(() => recommendDonationPlaces({ limit: "2abc" }), /limit must be an integer/);
  assert.throws(() => recommendDonationPlaces({ limit: "1.9" }), /limit must be an integer/);
});

test("formatDonationRecommendationReport creates a concise Korean report with verification cautions", () => {
  const result = recommendDonationPlaces({ location: "서울", category: "아동", limit: 2 });
  const report = formatDonationRecommendationReport(result);

  assert.match(report, /기부처 추천/);
  assert.match(report, /서울/);
  assert.match(report, /아동/);
  assert.match(report, /공식 페이지/);
  assert.match(report, /1365/);
});
