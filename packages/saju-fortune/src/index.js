const STEMS = [
  { korean: "갑", hanja: "甲", element: "wood", elementKo: "목", yinYang: "yang" },
  { korean: "을", hanja: "乙", element: "wood", elementKo: "목", yinYang: "yin" },
  { korean: "병", hanja: "丙", element: "fire", elementKo: "화", yinYang: "yang" },
  { korean: "정", hanja: "丁", element: "fire", elementKo: "화", yinYang: "yin" },
  { korean: "무", hanja: "戊", element: "earth", elementKo: "토", yinYang: "yang" },
  { korean: "기", hanja: "己", element: "earth", elementKo: "토", yinYang: "yin" },
  { korean: "경", hanja: "庚", element: "metal", elementKo: "금", yinYang: "yang" },
  { korean: "신", hanja: "辛", element: "metal", elementKo: "금", yinYang: "yin" },
  { korean: "임", hanja: "壬", element: "water", elementKo: "수", yinYang: "yang" },
  { korean: "계", hanja: "癸", element: "water", elementKo: "수", yinYang: "yin" }
];

const BRANCHES = [
  { korean: "자", hanja: "子", animal: "쥐", element: "water", elementKo: "수", yinYang: "yang", hourLabel: "23:00-01:00" },
  { korean: "축", hanja: "丑", animal: "소", element: "earth", elementKo: "토", yinYang: "yin", hourLabel: "01:00-03:00" },
  { korean: "인", hanja: "寅", animal: "호랑이", element: "wood", elementKo: "목", yinYang: "yang", hourLabel: "03:00-05:00" },
  { korean: "묘", hanja: "卯", animal: "토끼", element: "wood", elementKo: "목", yinYang: "yin", hourLabel: "05:00-07:00" },
  { korean: "진", hanja: "辰", animal: "용", element: "earth", elementKo: "토", yinYang: "yang", hourLabel: "07:00-09:00" },
  { korean: "사", hanja: "巳", animal: "뱀", element: "fire", elementKo: "화", yinYang: "yin", hourLabel: "09:00-11:00" },
  { korean: "오", hanja: "午", animal: "말", element: "fire", elementKo: "화", yinYang: "yang", hourLabel: "11:00-13:00" },
  { korean: "미", hanja: "未", animal: "양", element: "earth", elementKo: "토", yinYang: "yin", hourLabel: "13:00-15:00" },
  { korean: "신", hanja: "申", animal: "원숭이", element: "metal", elementKo: "금", yinYang: "yang", hourLabel: "15:00-17:00" },
  { korean: "유", hanja: "酉", animal: "닭", element: "metal", elementKo: "금", yinYang: "yin", hourLabel: "17:00-19:00" },
  { korean: "술", hanja: "戌", animal: "개", element: "earth", elementKo: "토", yinYang: "yang", hourLabel: "19:00-21:00" },
  { korean: "해", hanja: "亥", animal: "돼지", element: "water", elementKo: "수", yinYang: "yin", hourLabel: "21:00-23:00" }
];

const REQUIRED_INTERVIEW_FIELDS = ["birthDate", "birthTime", "gender"];
const ANALYSIS_TYPES = new Set(["basic", "fortune", "yongsin", "school_compare", "yongsin_method"]);
const FORTUNE_TYPES = new Set(["general", "career", "wealth", "health", "love"]);
const GENDERS = new Set(["male", "female"]);
const CALENDARS = new Set(["solar", "lunar"]);

const ELEMENT_KO = {
  wood: "목",
  fire: "화",
  earth: "토",
  metal: "금",
  water: "수"
};

const ELEMENT_LABELS = {
  wood: "목(木)",
  fire: "화(火)",
  earth: "토(土)",
  metal: "금(金)",
  water: "수(水)"
};

const ELEMENT_CYCLE = ["wood", "fire", "earth", "metal", "water"];

/**
 * @param {Record<string, unknown>} input
 * @returns {string[]}
 */
function getMissingInterviewFields(input = {}) {
  return REQUIRED_INTERVIEW_FIELDS.filter((field) => !input[field]);
}

/**
 * @param {Record<string, unknown>} input
 */
function normalizeBirthInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("birth input is required.");
  }

  const birthDate = normalizeString(input.birthDate);
  const birthTime = normalizeString(input.birthTime);
  const gender = normalizeString(input.gender);
  const calendar = normalizeString(input.calendar) || "solar";

  if (!birthDate) {
    throw new Error("birthDate is required.");
  }
  if (!isValidDate(birthDate)) {
    throw new Error("birthDate must be YYYY-MM-DD.");
  }
  if (!birthTime) {
    throw new Error("birthTime is required.");
  }
  if (!isValidTime(birthTime)) {
    throw new Error("birthTime must be HH:mm.");
  }
  if (!gender || !GENDERS.has(gender)) {
    throw new Error("gender must be male or female.");
  }
  if (!CALENDARS.has(calendar)) {
    throw new Error("calendar must be solar or lunar.");
  }

  return {
    name: normalizeString(input.name) || undefined,
    hanjaName: normalizeString(input.hanjaName) || undefined,
    birthDate,
    birthTime,
    calendar,
    isLeapMonth: Boolean(input.isLeapMonth),
    gender,
    birthCity: normalizeString(input.birthCity) || undefined
  };
}

/**
 * @param {Record<string, unknown>} birthInput
 * @param {{analysisType?: string, fortuneType?: string, targetYear?: number|string}} options
 */
function analyzeSaju(birthInput, options = {}) {
  const input = normalizeBirthInput(birthInput);
  const analysisType = normalizeString(options.analysisType) || "basic";
  const fortuneType = normalizeString(options.fortuneType) || "general";

  if (!ANALYSIS_TYPES.has(analysisType)) {
    throw new Error("analysisType must be basic, fortune, yongsin, school_compare, or yongsin_method.");
  }
  if (analysisType === "fortune" && !FORTUNE_TYPES.has(fortuneType)) {
    throw new Error("fortuneType must be general, career, wealth, health, or love.");
  }

  const dateParts = parseDate(input.birthDate);
  const timeParts = parseTime(input.birthTime);
  const pillars = calculatePillars(dateParts, timeParts);
  const fiveElements = countFiveElements(pillars);
  const dominantElements = getDominantElements(fiveElements);
  const weakElements = getWeakElements(fiveElements);
  const dayMaster = {
    stem: pillars.day.stem,
    element: pillars.day.stemElement,
    elementKo: ELEMENT_KO[pillars.day.stemElement],
    yinYang: pillars.day.yinYang,
    strength: estimateDayMasterStrength(pillars, fiveElements)
  };

  const result = {
    input,
    pillars,
    dayMaster,
    fiveElements,
    dominantElements,
    weakElements,
    yongsin: selectUsefulElements(dayMaster, fiveElements),
    interview: buildInterviewState(input),
    readingGuide: buildReadingGuide(),
    sources: ["saju-fortune-local-calculation", "fortuneteller-mcp-tool-model"]
  };

  if (analysisType === "fortune") {
    result.fortune = buildFortuneReading(result, fortuneType, options.targetYear);
  } else if (analysisType === "yongsin" || analysisType === "yongsin_method") {
    result.yongsin.analysis = buildYongsinReading(result);
  } else if (analysisType === "school_compare") {
    result.schoolComparison = buildSchoolComparison(result);
  }

  return result;
}

/**
 * @param {"analyze_saju"|"check_compatibility"|"get_daily_fortune"|"get_dae_un"|"get_fortune_by_period"|"convert_calendar"|"manage_settings"|string} name
 * @param {Record<string, unknown>} args
 */
function callSajuTool(name, args = {}) {
  switch (name) {
    case "analyze_saju":
      return analyzeSaju(args, args);
    case "check_compatibility":
      return checkCompatibility(args);
    case "get_daily_fortune":
      return {
        ...analyzeSaju(args, { analysisType: "fortune", fortuneType: "general" }),
        targetDate: normalizeString(args.targetDate) || todayIsoDate()
      };
    case "get_dae_un":
      return buildDaeUn(analyzeSaju(args), args);
    case "get_fortune_by_period":
      return buildPeriodFortune(analyzeSaju(args), args);
    case "convert_calendar":
      return convertCalendar(args);
    case "manage_settings":
      return {
        preset: normalizeString(args.preset) || "balanced",
        note: "saju-fortune는 로컬 패키지이므로 MCP 서버 설정을 저장하지 않습니다."
      };
    default:
      throw new Error(`Unknown saju tool: ${name}`);
  }
}

/**
 * @param {{person1: Record<string, unknown>, person2: Record<string, unknown>}} args
 */
function checkCompatibility(args) {
  if (!args || !args.person1 || !args.person2) {
    throw new Error("person1 and person2 are required.");
  }

  const first = analyzeSaju(args.person1);
  const second = analyzeSaju(args.person2);
  const shared = ELEMENT_CYCLE.filter((element) => first.dominantElements.includes(element) && second.dominantElements.includes(element));
  const complementary = ELEMENT_CYCLE.filter((element) => first.weakElements.includes(element) && second.dominantElements.includes(element));
  const reverseComplementary = ELEMENT_CYCLE.filter((element) => second.weakElements.includes(element) && first.dominantElements.includes(element));
  const sameDayElement = first.dayMaster.element === second.dayMaster.element;
  const score = clamp(
    50 + shared.length * 8 + (complementary.length + reverseComplementary.length) * 10 + (sameDayElement ? 8 : 0),
    0,
    100
  );

  const focusAreas = [];
  if (shared.length) {
    focusAreas.push(`공통으로 강한 ${shared.map(formatElement).join(", ")} 기운은 공감대가 되지만 고집도 같이 커질 수 있습니다.`);
  }
  if (complementary.length || reverseComplementary.length) {
    focusAreas.push("서로 부족한 오행을 보완하는 지점이 있어 역할 분담을 의식하면 관계가 안정됩니다.");
  }
  if (!focusAreas.length) {
    focusAreas.push("두 사주의 중심 기운이 달라 속도와 표현 방식을 맞추는 대화가 중요합니다.");
  }
  focusAreas.push("궁합은 결정론이 아니라 관계를 돌아보는 대화 재료로만 사용하세요.");

  return {
    people: [summarizePerson(first), summarizePerson(second)],
    score,
    sharedElements: shared,
    complementaryElements: [...new Set([...complementary, ...reverseComplementary])],
    focusAreas,
    summary: `두 사람의 궁합은 ${score}점 수준으로, 관계의 장점과 조율 포인트를 함께 보는 해석이 적절합니다.`,
    sources: ["saju-fortune-local-calculation", "fortuneteller-mcp-tool-model"]
  };
}

function calculatePillars(dateParts, timeParts) {
  const year = calculateYearPillar(dateParts);
  const month = calculateMonthPillar(dateParts, year);
  const day = calculateDayPillar(dateParts);
  const hour = calculateHourPillar(timeParts, day);

  return { year, month, day, hour };
}

function calculateYearPillar({ year, month, day }) {
  const sajuYear = month < 2 || (month === 2 && day < 4) ? year - 1 : year;
  return makePillar(mod(sajuYear - 4, 10), mod(sajuYear - 4, 12));
}

function calculateMonthPillar({ month, day }, yearPillar) {
  const monthIndex = getSolarTermMonthIndex(month, day);
  const branchIndex = mod(monthIndex + 2, 12);
  const yearStemIndex = yearPillar.stemIndex;
  let monthStemStart;

  if (yearStemIndex === 0 || yearStemIndex === 5) {
    monthStemStart = 2;
  } else if (yearStemIndex === 1 || yearStemIndex === 6) {
    monthStemStart = 4;
  } else if (yearStemIndex === 2 || yearStemIndex === 7) {
    monthStemStart = 6;
  } else if (yearStemIndex === 3 || yearStemIndex === 8) {
    monthStemStart = 8;
  } else {
    monthStemStart = 0;
  }

  const monthOffset = branchIndex >= 2 ? branchIndex - 2 : branchIndex + 10;
  return makePillar(mod(monthStemStart + monthOffset, 10), branchIndex);
}

function calculateDayPillar({ year, month, day }) {
  const base = Date.UTC(1900, 0, 1, 12);
  const birth = Date.UTC(year, month - 1, day, 12);
  const diffDays = Math.round((birth - base) / 86400000);

  return makePillar(mod(diffDays, 10), mod(10 + diffDays, 12));
}

function calculateHourPillar({ hour }, dayPillar) {
  const branchIndex = hour >= 23 || hour < 1 ? 0 : Math.floor((hour + 1) / 2);
  const stemIndex = mod(dayPillar.stemIndex * 2 + branchIndex, 10);

  return makePillar(stemIndex, branchIndex);
}

function makePillar(stemIndex, branchIndex) {
  const stem = STEMS[stemIndex];
  const branch = BRANCHES[branchIndex];

  return {
    label: `${stem.korean}${branch.korean}`,
    hanja: `${stem.hanja}${branch.hanja}`,
    stem: stem.korean,
    stemHanja: stem.hanja,
    stemElement: stem.element,
    stemElementKo: stem.elementKo,
    branch: branch.korean,
    branchHanja: branch.hanja,
    branchAnimal: branch.animal,
    branchElement: branch.element,
    branchElementKo: branch.elementKo,
    yinYang: stem.yinYang,
    stemIndex,
    branchIndex
  };
}

function getSolarTermMonthIndex(month, day) {
  const starts = [
    [2, 4],
    [3, 6],
    [4, 5],
    [5, 6],
    [6, 6],
    [7, 7],
    [8, 8],
    [9, 8],
    [10, 8],
    [11, 7],
    [12, 7],
    [1, 6]
  ];
  const value = month * 100 + day;

  for (let index = 10; index >= 0; index -= 1) {
    const [startMonth, startDay] = starts[index];
    if (value >= startMonth * 100 + startDay) {
      return index;
    }
  }

  return 11;
}

function countFiveElements(pillars) {
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };

  for (const pillar of Object.values(pillars)) {
    counts[pillar.stemElement] += 1;
    counts[pillar.branchElement] += 1;
  }

  return counts;
}

function getDominantElements(counts) {
  const max = Math.max(...Object.values(counts));
  return ELEMENT_CYCLE.filter((element) => counts[element] === max && max > 0);
}

function getWeakElements(counts) {
  const min = Math.min(...Object.values(counts));
  return ELEMENT_CYCLE.filter((element) => counts[element] === min);
}

function estimateDayMasterStrength(pillars, counts) {
  const dayElement = pillars.day.stemElement;
  const supporting = counts[dayElement] + counts[getGeneratingElement(dayElement)] * 0.7;

  if (supporting >= 3.5) {
    return "strong";
  }
  if (supporting <= 1.5) {
    return "weak";
  }
  return "balanced";
}

function selectUsefulElements(dayMaster, counts) {
  const weakElements = getWeakElements(counts);
  const controlling = getControllingElement(dayMaster.element);
  const generated = getGeneratedElement(dayMaster.element);
  const primary = dayMaster.strength === "strong" ? controlling : getGeneratingElement(dayMaster.element);
  const secondary = weakElements.includes(generated) ? generated : weakElements[0];

  return {
    primary,
    primaryKo: formatElement(primary),
    secondary,
    secondaryKo: formatElement(secondary),
    reasoning: `${dayMaster.elementKo} 일간의 강약과 오행 분포를 함께 보아 ${formatElement(primary)} 기운을 우선 조율점으로 둡니다.`
  };
}

function buildFortuneReading(result, fortuneType, targetYear) {
  const dominant = result.dominantElements.map(formatElement).join(", ");
  const weak = result.weakElements.map(formatElement).join(", ");
  const topicMap = {
    general: {
      label: "종합운",
      summary: `${dominant} 기운이 강하게 드러나므로 장점은 살리고 부족한 ${weak} 기운을 생활 루틴으로 보완하는 해석이 좋습니다.`,
      guidance: ["강한 기운이 과해지는 상황을 먼저 살핍니다.", "부족한 오행을 사람·환경·습관으로 보완합니다."]
    },
    career: {
      label: "직업운",
      summary: `${result.dayMaster.elementKo} 일간은 책임의 중심을 잡을 때 직업운이 안정됩니다. 강한 ${dominant} 기운을 성과 언어로 바꾸는 전략이 좋습니다.`,
      guidance: ["역할과 책임 범위를 명확히 잡으세요.", "성과 기록과 피드백 주기를 짧게 두세요."]
    },
    wealth: {
      label: "재물운",
      summary: `재물운은 강한 ${dominant} 기운을 현금흐름 규칙으로 묶을 때 좋아집니다. 충동적 확장보다 반복 가능한 저축·투자 원칙이 핵심입니다.`,
      guidance: ["큰 결정보다 반복 가능한 예산 규칙을 먼저 세우세요.", "수입원과 지출 항목을 분리해 흐름을 보세요."]
    },
    health: {
      label: "건강운",
      summary: `건강운은 부족한 ${weak} 기운을 보완하는 수면, 식사, 움직임의 균형에서 봅니다. 사주 해석은 의료 진단을 대신하지 않습니다.`,
      guidance: ["무리한 해석보다 컨디션 기록을 우선하세요.", "증상이 있으면 의료 전문가에게 확인하세요."]
    },
    love: {
      label: "연애운",
      summary: `연애운은 관계에서 표현의 속도와 안정감을 맞추는 쪽으로 풀이합니다. 강한 ${dominant} 기운은 매력이지만 과하면 고집으로 보일 수 있습니다.`,
      guidance: ["호감 표현은 선명하게, 결론은 천천히 잡으세요.", "상대의 반응 속도를 존중하면 관계 안정감이 커집니다."]
    }
  };

  return {
    type: fortuneType,
    label: topicMap[fortuneType].label,
    targetYear: targetYear ? Number(targetYear) : undefined,
    summary: topicMap[fortuneType].summary,
    guidance: topicMap[fortuneType].guidance,
    caveat: "사주 풀이는 결정론이나 보장이 아니라 자기점검을 돕는 전통 해석입니다."
  };
}

function buildInterviewState(input) {
  return {
    missingFields: getMissingInterviewFields(input),
    optionalFields: ["name", "hanjaName", "calendar", "isLeapMonth", "birthCity", "topic"],
    suggestedQuestions: [
      "양력/음력, 생년월일, 태어난 시간을 알려주세요.",
      "성별과 태어난 시군구를 알려주면 경도 보정을 더 보수적으로 반영할 수 있어요.",
      "연애운, 재물운, 직업운, 건강운, 한해 운세 중 무엇을 먼저 볼까요?"
    ]
  };
}

function buildReadingGuide() {
  return [
    "먼저 사주팔자와 오행 분포를 짧게 확인한다.",
    "사용자가 고른 주제에 맞춰 강한 기운과 부족한 기운을 연결한다.",
    "단정 대신 가능성, 주의점, 실천 조언을 구분해 말한다.",
    "건강·투자·관계의 중대 결정은 전문가 판단을 대신하지 않는다고 밝힌다."
  ];
}

function buildYongsinReading(result) {
  return `${result.yongsin.primaryKo}을 우선 조율점으로 보고, ${result.yongsin.secondaryKo}을 보조 기운으로 삼아 과한 기운을 누그러뜨리는 흐름입니다.`;
}

function buildSchoolComparison(result) {
  return [
    { school: "ziping", summary: `${result.dayMaster.elementKo} 일간과 월지를 중심으로 강약을 봅니다.` },
    { school: "modern", summary: "현대 해석에서는 성향, 관계, 실행 습관으로 번역해 안내합니다." },
    { school: "shensha", summary: "신살은 보조 단서로만 사용하고 핵심 판단을 대체하지 않습니다." }
  ];
}

function buildDaeUn(result, args) {
  const limit = clamp(Number(args.limit || 10), 1, 12);
  const startAge = result.input.gender === "male" ? 7 : 8;
  const cycles = [];

  for (let index = 0; index < limit; index += 1) {
    const age = startAge + index * 10;
    const stem = STEMS[mod(result.pillars.month.stemIndex + index + 1, 10)];
    const branch = BRANCHES[mod(result.pillars.month.branchIndex + index + 1, 12)];
    cycles.push({ age, label: `${stem.korean}${branch.korean}`, hanja: `${stem.hanja}${branch.hanja}` });
  }

  return { input: result.input, cycles, note: "대운 시작 나이는 로컬 근사값입니다. 정밀 해석은 절기 기준 계산과 함께 보수적으로 안내하세요." };
}

function buildPeriodFortune(result, args) {
  const periodType = normalizeString(args.periodType) || "year";
  return {
    input: result.input,
    periodType,
    target: normalizeString(args.target) || String(new Date().getFullYear()),
    fortune: buildFortuneReading(result, "general", args.target),
    note: "기간운은 기본 사주 구조에 해당 기간의 질문 맥락을 덧붙여 대화형으로 풀이하세요."
  };
}

function convertCalendar(args) {
  const date = normalizeString(args.date);
  const fromCalendar = normalizeString(args.fromCalendar);
  const toCalendar = normalizeString(args.toCalendar);

  if (!date || !isValidDate(date)) {
    throw new Error("date must be YYYY-MM-DD.");
  }
  if (!CALENDARS.has(fromCalendar) || !CALENDARS.has(toCalendar)) {
    throw new Error("fromCalendar and toCalendar must be solar or lunar.");
  }

  return {
    originalDate: date,
    originalCalendar: fromCalendar,
    convertedDate: date,
    convertedCalendar: toCalendar,
    isLeapMonth: Boolean(args.isLeapMonth),
    note: "saju-fortune 내장 변환은 서버 없는 사용을 위한 보수적 placeholder입니다. 정밀 음양력 변환은 upstream 만세력 테이블 기반 결과와 대조하세요."
  };
}

function summarizePerson(result) {
  return {
    name: result.input.name,
    dayMaster: result.dayMaster,
    dominantElements: result.dominantElements,
    weakElements: result.weakElements,
    pillars: {
      year: result.pillars.year.label,
      month: result.pillars.month.label,
      day: result.pillars.day.label,
      hour: result.pillars.hour.label
    }
  };
}

function getGeneratingElement(element) {
  return ELEMENT_CYCLE[mod(ELEMENT_CYCLE.indexOf(element) - 1, ELEMENT_CYCLE.length)];
}

function getGeneratedElement(element) {
  return ELEMENT_CYCLE[mod(ELEMENT_CYCLE.indexOf(element) + 1, ELEMENT_CYCLE.length)];
}

function getControllingElement(element) {
  const map = { wood: "metal", fire: "water", earth: "wood", metal: "fire", water: "earth" };
  return map[element];
}

function formatElement(element) {
  return ELEMENT_LABELS[element] || element;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function parseTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const { year, month, day } = parseDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const { hour, minute } = parseTime(value);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  analyzeSaju,
  callSajuTool,
  checkCompatibility,
  getMissingInterviewFields,
  normalizeBirthInput
};
