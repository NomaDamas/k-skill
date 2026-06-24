const {
  BRANCHES,
  ELEMENT_CYCLE,
  ELEMENT_KO,
  ELEMENT_LABELS,
  STEMS,
  UNKNOWN_TIME_LIMITATION
} = require("./constants");
const { getMissingInterviewFields, normalizeString } = require("./input");
const { clamp, mod } = require("./pillars");

function countFiveElements(pillars) {
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };

  for (const pillar of Object.values(pillars)) {
    if (!pillar) {
      continue;
    }
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
  const caveats = ["사주 풀이는 결정론이나 보장이 아니라 자기점검을 돕는 전통 해석입니다."];

  if (result.timeAccuracy === "unknown") {
    caveats.push(UNKNOWN_TIME_LIMITATION);
  }

  return {
    type: fortuneType,
    label: topicMap[fortuneType].label,
    targetYear: targetYear ? Number(targetYear) : undefined,
    summary: topicMap[fortuneType].summary,
    guidance: topicMap[fortuneType].guidance,
    caveat: caveats.join(" ")
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

function summarizePerson(result) {
  return {
    name: result.input.name,
    dayMaster: result.dayMaster,
    dominantElements: result.dominantElements,
    weakElements: result.weakElements,
    timeAccuracy: result.timeAccuracy,
    pillars: {
      year: result.pillars.year.label,
      month: result.pillars.month.label,
      day: result.pillars.day.label,
      hour: result.pillars.hour ? result.pillars.hour.label : null
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

module.exports = {
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
};
