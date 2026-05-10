const OFFICIAL_1365_DONATION_URL = "https://www.1365.go.kr/dntn/main.do";

const CATEGORIES = Object.freeze({
  general: {
    label: "일반/종합",
    keywords: ["일반", "종합", "기부", "나눔", "모금"]
  },
  children: {
    label: "아동·청소년",
    keywords: ["아동", "어린이", "청소년", "보육", "결식", "교육"]
  },
  elderly: {
    label: "노인",
    keywords: ["노인", "어르신", "독거", "요양"]
  },
  disability: {
    label: "장애",
    keywords: ["장애", "장애인", "발달장애", "이동권"]
  },
  animals: {
    label: "동물보호",
    keywords: ["동물", "동물보호", "유기동물", "반려동물"]
  },
  environment: {
    label: "환경",
    keywords: ["환경", "기후", "생태", "숲", "해양"]
  },
  disaster: {
    label: "재난·구호",
    keywords: ["재난", "구호", "긴급", "재해", "복구"]
  },
  health: {
    label: "보건·의료",
    keywords: ["의료", "보건", "환자", "치료", "질병"]
  },
  poverty: {
    label: "생계·주거",
    keywords: ["생계", "주거", "저소득", "취약계층", "노숙"]
  },
  international: {
    label: "해외구호",
    keywords: ["해외", "국제", "난민", "개발협력"]
  }
});

const PROVINCE_ALIASES = Object.freeze([
  ["서울", /서울|서울특별시|서울시/],
  ["부산", /부산|부산광역시|부산시/],
  ["대구", /대구|대구광역시|대구시/],
  ["인천", /인천|인천광역시|인천시/],
  ["광주", /광주|광주광역시|광주시/],
  ["대전", /대전|대전광역시|대전시/],
  ["울산", /울산|울산광역시|울산시/],
  ["세종", /세종|세종특별자치시|세종시/],
  ["경기", /경기|경기도/],
  ["강원", /강원|강원도|강원특별자치도/],
  ["충북", /충북|충청북도/],
  ["충남", /충남|충청남도/],
  ["전북", /전북|전라북도|전북특별자치도/],
  ["전남", /전남|전라남도/],
  ["경북", /경북|경상북도/],
  ["경남", /경남|경상남도/],
  ["제주", /제주|제주도|제주특별자치도/]
]);

const DONATION_PLACES = Object.freeze([
  {
    id: "kara",
    name: "동물권행동 카라",
    categories: ["animals"],
    coverage: "local",
    locations: ["서울", "마포구"],
    description: "동물권 교육, 유기동물 구조·입양, 동물복지 캠페인을 하는 비영리단체입니다.",
    homepageUrl: "https://www.ekara.org/",
    verification: "공식 홈페이지의 후원/결산 공시와 1365 기부포털 등록 여부를 함께 확인하세요."
  },

  {
    id: "animal-freedom",
    name: "동물자유연대",
    categories: ["animals"],
    coverage: "nationwide",
    locations: ["전국", "경기", "남양주"],
    description: "반려동물 복지, 구조동물 보호, 동물학대 대응과 정책 캠페인을 진행합니다.",
    homepageUrl: "https://www.animals.or.kr/",
    verification: "구조·보호 캠페인별 후원 목적과 기부금영수증 안내를 공식 페이지에서 확인하세요."
  },
  {
    id: "korean-cat-protection",
    name: "한국고양이보호협회",
    categories: ["animals"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "길고양이 보호, 치료지원, 입양·캠페인 활동에 초점을 둔 동물보호 단체입니다.",
    homepageUrl: "https://www.catcare.or.kr/",
    verification: "치료지원·입양 캠페인의 현재 모금 상태를 공식 공지에서 확인하세요."
  },
  {
    id: "kfem",
    name: "환경운동연합",
    categories: ["environment"],
    coverage: "local",
    locations: ["서울", "종로구"],
    description: "기후위기, 생태보전, 생활환경 이슈를 다루는 환경 시민단체입니다.",
    homepageUrl: "https://kfem.or.kr/",
    verification: "지역 조직과 캠페인별 모금 목적을 공식 페이지에서 확인하세요."
  },
  {
    id: "beautiful-store",
    name: "아름다운가게",
    categories: ["poverty", "environment", "general"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "물품 기부와 재사용 판매 수익으로 국내외 공익활동을 지원합니다.",
    homepageUrl: "https://www.beautifulstore.org/",
    verification: "방문 전 가까운 매장의 접수 가능 물품과 운영시간을 확인하세요."
  },
  {
    id: "goodwill",
    name: "굿윌스토어",
    categories: ["disability", "poverty", "general"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "물품 기부를 장애인 일자리와 직업훈련으로 연결하는 기부처입니다.",
    homepageUrl: "https://www.goodwillstore.org/",
    verification: "가까운 지점의 물품 기증 기준과 방문수거 가능 여부를 확인하세요."
  },
  {
    id: "childfund",
    name: "초록우산",
    categories: ["children", "poverty", "disaster"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "아동 복지, 결연, 긴급지원, 인재양성 사업을 운영하는 아동복지 전문기관입니다.",
    homepageUrl: "https://www.childfund.or.kr/",
    verification: "캠페인별 후원금 사용처와 연차보고서를 공식 페이지에서 확인하세요."
  },
  {
    id: "korean-red-cross",
    name: "대한적십자사",
    categories: ["disaster", "health", "poverty", "international"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "재난구호, 취약계층 지원, 헌혈·보건, 국제구호 사업을 수행합니다.",
    homepageUrl: "https://www.redcross.or.kr/",
    verification: "긴급모금은 모금 기간과 목적이 자주 바뀌므로 공식 공지에서 최신 상태를 확인하세요."
  },
  {
    id: "community-chest",
    name: "사회복지공동모금회 사랑의열매",
    categories: ["general", "poverty", "children", "elderly", "disability"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "지역 공동모금과 배분사업을 운영하는 대표 법정 모금기관입니다.",
    homepageUrl: "https://chest.or.kr/",
    verification: "지역지회·캠페인별 배분 분야와 공시자료를 확인하세요."
  },

  {
    id: "miral",
    name: "밀알복지재단",
    categories: ["disability", "children", "poverty", "international"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "장애인, 아동, 에너지 취약계층, 해외구호 사업을 운영하는 복지재단입니다.",
    homepageUrl: "https://www.miral.org/",
    verification: "사업별 지정후원 가능 여부와 공시자료를 공식 페이지에서 확인하세요."
  },
  {
    id: "okfoundation",
    name: "노인의료나눔재단",
    categories: ["elderly", "health", "poverty"],
    coverage: "nationwide",
    locations: ["전국"],
    description: "취약계층 어르신 의료비와 건강 지원 사업에 초점을 둔 재단입니다.",
    homepageUrl: "https://www.ok6595.or.kr/",
    verification: "현재 지원사업과 후원금 사용처를 공식 페이지에서 확인하세요."
  },
  {
    id: "babsang",
    name: "밥상공동체복지재단 연탄은행",
    categories: ["poverty", "elderly"],
    coverage: "nationwide",
    locations: ["전국", "강원", "원주"],
    description: "에너지 취약계층 연탄·난방 지원과 지역 복지사업을 운영합니다.",
    homepageUrl: "https://www.babsang.or.kr/",
    verification: "계절성 캠페인이 많으므로 현재 모금 주제와 물품/봉사 필요 여부를 확인하세요."
  },
  {
    id: "greenpeace-korea",
    name: "그린피스 서울사무소",
    categories: ["environment", "international"],
    coverage: "nationwide",
    locations: ["서울", "전국"],
    description: "기후·해양·생물다양성 관련 국제 환경 캠페인을 진행합니다.",
    homepageUrl: "https://www.greenpeace.org/korea/",
    verification: "캠페인 성격과 기부금 영수증 처리 주체를 공식 페이지에서 확인하세요."
  },
  {
    id: "snuh-children",
    name: "서울대학교어린이병원 후원회",
    categories: ["children", "health"],
    coverage: "local",
    locations: ["서울", "종로구"],
    description: "중증·희귀질환 아동 치료와 병원 내 환아 지원에 초점을 둔 후원처입니다.",
    homepageUrl: "https://www.snuh.org/child/",
    verification: "병원 후원 경로와 지정기부 가능 범위를 공식 병원 페이지에서 확인하세요."
  }
]);

function normalizeCategoryToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeCategory(input) {
  if (Array.isArray(input)) {
    return input.map(normalizeCategory).filter((value, index, values) => values.indexOf(value) === index);
  }

  const query = normalizeCategoryToken(input);
  if (!query) {
    return "general";
  }

  const categoryEntries = Object.entries(CATEGORIES);
  for (const [key, category] of categoryEntries) {
    if (query === key.toLowerCase()) {
      return key;
    }
    if (key !== "general" && category.keywords.some((keyword) => query.includes(normalizeCategoryToken(keyword)))) {
      return key;
    }
  }

  for (const [key, category] of categoryEntries) {
    if (category.keywords.some((keyword) => query.includes(normalizeCategoryToken(keyword)))) {
      return key;
    }
  }

  return "general";
}

function parseLocationQuery(location) {
  const raw = String(location || "").trim();
  let province = null;
  for (const [normalized, pattern] of PROVINCE_ALIASES) {
    if (pattern.test(raw)) {
      province = normalized;
      break;
    }
  }

  const districtMatches = [...raw.matchAll(/([가-힣A-Za-z0-9]+(?:구|군|시))/g)]
    .map((match) => match[1])
    .filter((value) => !/^(서울|부산|대구|인천|광주|대전|울산|세종)시?$/.test(value));
  const district = districtMatches[0] || null;

  return { raw, province, district };
}

function normalizeCategoriesForSearch(input) {
  const normalized = normalizeCategory(input);
  if (!Array.isArray(normalized)) {
    return [normalized];
  }
  return normalized.length ? normalized : ["general"];
}

function build1365DonationSearchUrl(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "baseUrl")) {
    throw new Error("baseUrl is not supported for 1365 donation search-assist links.");
  }

  const url = new URL(OFFICIAL_1365_DONATION_URL);
  const [category] = normalizeCategoriesForSearch(options.category);
  const parts = [options.keyword, options.location].map((value) => String(value || "").trim()).filter(Boolean);
  url.searchParams.set("query", parts.join(" ") || CATEGORIES[category].label);
  url.searchParams.set("category", category);
  return url.toString();
}

function buildCandidateSearchKeyword(place, keyword) {
  const baseKeyword = String(keyword || "").trim();
  if (!baseKeyword || baseKeyword.includes(place.name)) {
    return place.name;
  }
  return `${place.name} ${baseKeyword}`;
}

function selectCandidateSearchCategory(place, categories) {
  return categories.find((category) => place.categories.includes(category)) || categories[0];
}

function scoreDonationPlace(place, categories, location) {
  const categoryMatch = categories.some((category) => place.categories.includes(category));
  const provinceMatch = !!location.province && place.locations.includes(location.province);
  const districtMatch = !!location.district && place.locations.includes(location.district);
  const nationwide = place.coverage === "nationwide" || place.locations.includes("전국");
  const localMatch = districtMatch || provinceMatch;

  let score = 0;
  if (categoryMatch) score += 60;
  if (districtMatch) score += 35;
  else if (provinceMatch) score += 25;
  else if (nationwide) score += 10;
  if (place.coverage === "local" && localMatch) score += 5;

  return {
    score,
    category: categoryMatch,
    local: localMatch,
    nationwide
  };
}

function recommendDonationPlaces(options = {}) {
  const limit = normalizeLimit(options.limit);
  const location = parseLocationQuery(options.location || "");
  const categories = normalizeCategoriesForSearch(options.category);
  const keyword = String(options.keyword || categories.map((category) => CATEGORIES[category].label).join(" ")).trim();

  const ranked = DONATION_PLACES
    .map((place) => ({ place, match: scoreDonationPlace(place, categories, location) }))
    .filter(({ match }) => match.category)
    .sort((a, b) => b.match.score - a.match.score || a.place.name.localeCompare(b.place.name, "ko"));

  const items = ranked.slice(0, limit).map(({ place, match }) => ({
    ...place,
    match,
    officialSearchUrl: build1365DonationSearchUrl({
      location: location.raw,
      category: selectCandidateSearchCategory(place, categories),
      keyword: buildCandidateSearchKeyword(place, keyword)
    })
  }));

  const notes = [
    "추천 목록은 기부 실행 전 공식 페이지와 1365 기부포털에서 등록·모금기간·기부금영수증 가능 여부를 재확인해야 합니다."
  ];
  if (items.length > 0 && !items.some((item) => item.match.local)) {
    notes.push("정확한 지역 일치 기부처를 찾지 못해 전국 단위 기부처를 우선 제안했습니다.");
  }
  if (items.length === 0) {
    notes.push("조건에 맞는 기본 후보가 없어 1365 기부포털 확인 보조 링크로 최신 등록 기부처를 직접 확인해야 합니다.");
  }

  return {
    location,
    category: Array.isArray(options.category) ? categories : categories[0],
    items,
    officialSearchUrl: build1365DonationSearchUrl({ location: location.raw, category: categories[0], keyword }),
    meta: {
      totalCandidates: ranked.length,
      limit,
      source: "curated-fallback-plus-1365-search-assist",
      notes
    }
  };
}

function normalizeLimit(value) {
  if (value === undefined || value === null || value === "") {
    return 5;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error("limit must be an integer between 1 and 20.");
  }
  if (parsed < 1 || parsed > 20) {
    throw new Error("limit must be between 1 and 20.");
  }
  return parsed;
}

function formatDonationRecommendationReport(result) {
  const categoryLabels = (Array.isArray(result.category) ? result.category : [result.category])
    .map((category) => CATEGORIES[category]?.label || category)
    .join(", ");
  const where = result.location.raw || "지역 미지정";
  const lines = [`## 기부처 추천 (${where} / ${categoryLabels})`, ""];

  if (result.items.length === 0) {
    lines.push("조건에 맞는 기본 후보를 찾지 못했습니다.");
  } else {
    result.items.forEach((item, index) => {
      const locality = item.match.local ? "지역 일치" : item.coverage === "nationwide" ? "전국" : "참고";
      lines.push(`${index + 1}. ${item.name} — ${item.description}`);
      lines.push(`   - 분야: ${item.categories.map((category) => CATEGORIES[category]?.label || category).join(", ")} / 범위: ${locality}`);
      lines.push(`   - 공식 페이지: ${item.homepageUrl}`);
      lines.push(`   - 1365 확인 보조 링크: ${item.officialSearchUrl}`);
    });
  }

  lines.push("");
  lines.push("확인 메모:");
  for (const note of result.meta.notes) {
    lines.push(`- ${note}`);
  }
  lines.push(`- 1365 링크는 검색 보조용입니다. 최신 모금 상태는 1365 공식 페이지에서 직접 다시 확인하세요: ${result.officialSearchUrl}`);
  return lines.join("\n");
}

module.exports = {
  CATEGORIES,
  DONATION_PLACES,
  OFFICIAL_1365_DONATION_URL,
  build1365DonationSearchUrl,
  formatDonationRecommendationReport,
  normalizeCategory,
  parseLocationQuery,
  recommendDonationPlaces
};
