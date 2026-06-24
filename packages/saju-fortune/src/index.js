const {
  ANALYSIS_TYPES,
  ELEMENT_CYCLE,
  ELEMENT_KO,
  FORTUNE_TYPES,
  UNKNOWN_TIME_LIMITATION
} = require("./constants");
const {
  convertCalendar,
  getMissingInterviewFields,
  normalizeBirthInput,
  normalizeString,
  parseDate,
  parseTime,
  rejectUnsupportedLunarInput,
  todayIsoDate
} = require("./input");
const { calculatePillars, clamp } = require("./pillars");
const {
  buildDaeUn,
  buildFortuneReading,
  buildInterviewState,
  buildPeriodFortune,
  buildReadingGuide,
  buildSchoolComparison,
  buildYongsinReading,
  countFiveElements,
  estimateDayMasterStrength,
  formatElement,
  getDominantElements,
  getWeakElements,
  selectUsefulElements,
  summarizePerson
} = require("./readings");

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
  rejectUnsupportedLunarInput(input);

  const dateParts = parseDate(input.birthDate);
  const timeParts = input.birthTime ? parseTime(input.birthTime) : null;
  const pillars = calculatePillars(dateParts, timeParts);
  const fiveElements = countFiveElements(pillars);
  const dominantElements = getDominantElements(fiveElements);
  const weakElements = getWeakElements(fiveElements);
  const timeAccuracy = input.birthTime ? "known" : "unknown";
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
    timeAccuracy,
    limitations: timeAccuracy === "unknown" ? [UNKNOWN_TIME_LIMITATION] : [],
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
  const focusAreas = buildCompatibilityFocusAreas(shared, complementary, reverseComplementary);

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

function buildCompatibilityFocusAreas(shared, complementary, reverseComplementary) {
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
  return focusAreas;
}

module.exports = {
  analyzeSaju,
  callSajuTool,
  checkCompatibility,
  getMissingInterviewFields,
  normalizeBirthInput
};
