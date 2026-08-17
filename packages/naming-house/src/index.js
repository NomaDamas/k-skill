const hanja = require("hanja").default;
const strokeCounter = require("korean-stroke");
const { analyzeSaju } = require("saju-fortune");

const CANONICAL_ELEMENTS = ["wood", "fire", "earth", "metal", "water"];
const ELEMENT_KO = { wood: "목", fire: "화", earth: "토", metal: "금", water: "수" };
const GENERATING = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
const OVERCOMING = { wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood" };
const HANGUL_RE = /^[가-힣]{1,3}$/;
const CJK_RE = /^[\u4E00-\u9FFF]+$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeElement(value) {
  if (!value) return "unknown";
  const text = String(value).toLowerCase();
  if (text.includes("木") || text.includes("wood")) return "wood";
  if (text.includes("火") || text.includes("fire")) return "fire";
  if (text.includes("土") || text.includes("earth")) return "earth";
  if (text.includes("金") || text.includes("metal")) return "metal";
  if (text.includes("水") || text.includes("water")) return "water";
  if (CANONICAL_ELEMENTS.includes(text)) return text;
  return "unknown";
}

function elementForStrokes(strokes) {
  const digit = Math.abs(Number(strokes) || 0) % 10;
  if (digit === 1 || digit === 2) return "wood";
  if (digit === 3 || digit === 4) return "fire";
  if (digit === 5 || digit === 6) return "earth";
  if (digit === 7 || digit === 8) return "metal";
  return "water";
}

function localRomanizeKorean(text) {
  return Array.from(text).map((char) => {
    const code = char.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return char;
    const initials = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
    const vowels = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
    const finals = ["", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h"];
    const initial = Math.floor(code / 588);
    const vowel = Math.floor((code % 588) / 28);
    const final = code % 28;
    return initials[initial] + vowels[vowel] + finals[final];
  }).join("");
}

function relationOf(first, second) {
  if (!CANONICAL_ELEMENTS.includes(first) || !CANONICAL_ELEMENTS.includes(second)) return "unknown";
  if (first === second) return "neutral";
  if (GENERATING[first] === second) return "generating";
  if (OVERCOMING[first] === second) return "overcoming";
  return "neutral";
}

function parseDate(value) {
  if (!DATE_RE.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function parseTime(value) {
  if (!TIME_RE.test(value || "")) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function getMissingNamingFields(input = {}) {
  const missing = [];
  if (!trimString(input.surname)) missing.push("surname");
  if (!trimString(input.birthDate)) missing.push("birthDate");
  if (!trimString(input.gender)) missing.push("gender");
  if (!Array.isArray(input.candidates)) missing.push("candidates");
  return missing;
}

function normalizePreferences(preferences = {}) {
  const normalized = { ...preferences };
  normalized.style = trimString(normalized.style);
  normalized.maxCandidates = normalized.maxCandidates == null ? 10 : Number(normalized.maxCandidates);
  if (!Number.isInteger(normalized.maxCandidates) || normalized.maxCandidates < 1 || normalized.maxCandidates > 50) {
    throw new Error("maxCandidates must be between 1 and 50.");
  }
  normalized.preferredElements = Array.isArray(normalized.preferredElements)
    ? normalized.preferredElements.map(normalizeElement).filter((item) => CANONICAL_ELEMENTS.includes(item))
    : [];
  normalized.avoidSyllables = Array.isArray(normalized.avoidSyllables) ? normalized.avoidSyllables.map(trimString).filter(Boolean) : [];
  normalized.preferredSyllables = Array.isArray(normalized.preferredSyllables) ? normalized.preferredSyllables.map(trimString).filter(Boolean) : [];
  return normalized;
}

function normalizeCandidate(candidate, index) {
  if (!candidate || typeof candidate !== "object") throw new Error("candidate must be an object.");
  const givenName = trimString(candidate.givenName);
  const hanjaName = trimString(candidate.hanjaName);
  if (!HANGUL_RE.test(givenName || "")) throw new Error("candidate givenName must be 1-3 Hangul syllables.");
  if (hanjaName && !CJK_RE.test(hanjaName)) throw new Error("candidate hanjaName must contain only CJK characters.");
  return {
    givenName,
    ...(hanjaName ? { hanjaName } : {}),
    ...(trimString(candidate.meaning) ? { meaning: trimString(candidate.meaning) } : {}),
    tags: Array.isArray(candidate.tags) ? candidate.tags.map(trimString).filter(Boolean) : [],
    index
  };
}

function normalizeNamingInput(input = {}) {
  const missing = getMissingNamingFields(input);
  if (missing.length) throw new Error(`Missing required naming fields: ${missing.join(", ")}.`);
  const surname = trimString(input.surname);
  const surnameHanja = trimString(input.surnameHanja);
  const birthDate = trimString(input.birthDate);
  const birthTime = trimString(input.birthTime);
  const calendar = trimString(input.calendar) || "solar";
  const gender = trimString(input.gender);
  const birthCity = trimString(input.birthCity);

  if (!HANGUL_RE.test(surname || "")) throw new Error("surname must be 1-3 Hangul syllables.");
  if (surnameHanja && !CJK_RE.test(surnameHanja)) throw new Error("surnameHanja must contain only CJK characters.");
  if (!parseDate(birthDate)) throw new Error("birthDate must be YYYY-MM-DD and a valid date.");
  if (birthTime && !parseTime(birthTime)) throw new Error("birthTime must be HH:mm.");
  if (gender !== "male" && gender !== "female") throw new Error("gender must be male or female.");
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) throw new Error("candidates must be a non-empty array.");

  return {
    surname,
    ...(surnameHanja ? { surnameHanja } : {}),
    birthDate,
    ...(birthTime ? { birthTime } : {}),
    calendar,
    gender,
    ...(birthCity ? { birthCity } : {}),
    preferences: normalizePreferences(input.preferences),
    candidates: input.candidates.map(normalizeCandidate)
  };
}

function uniqueCanonical(elements) {
  const set = new Set(elements.map(normalizeElement).filter((item) => CANONICAL_ELEMENTS.includes(item)));
  return CANONICAL_ELEMENTS.filter((item) => set.has(item));
}

function extractYongsinElements(yongsin) {
  if (!yongsin) return [];
  if (Array.isArray(yongsin)) return yongsin;
  const elements = [];
  if (yongsin.primary) elements.push(yongsin.primary);
  if (yongsin.secondary) elements.push(yongsin.secondary);
  if (Array.isArray(yongsin.elements)) elements.push(...yongsin.elements);
  if (Array.isArray(yongsin.usefulElements)) elements.push(...yongsin.usefulElements);
  if (Array.isArray(yongsin.recommendedElements)) elements.push(...yongsin.recommendedElements);
  return elements;
}

async function buildNamingContext(rawInput) {
  const input = normalizeNamingInput(rawInput);
  const saju = analyzeSaju({
    name: input.surname,
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    calendar: input.calendar,
    gender: input.gender,
    birthCity: input.birthCity
  }, { analysisType: "yongsin" });
  let neededElements = uniqueCanonical([
    ...extractYongsinElements(saju.yongsin),
    ...(saju.weakElements || []),
    ...(input.preferences.preferredElements || [])
  ]);
  const limitations = [...(saju.limitations || [])];
  if (!neededElements.length) {
    neededElements = uniqueCanonical(saju.weakElements || []);
  }
  if (!neededElements.length) {
    neededElements = [...CANONICAL_ELEMENTS];
    limitations.push("balanced-saju-no-specific-needed-element");
  }
  return {
    input,
    saju: {
      fiveElements: saju.fiveElements,
      weakElements: saju.weakElements || [],
      dominantElements: saju.dominantElements || [],
      yongsin: saju.yongsin,
      limitations: saju.limitations || [],
      dayMaster: saju.dayMaster
    },
    neededElements,
    limitations,
    sources: ["saju-fortune"]
  };
}

async function getHanjaStrokeProfile(surnameHanja, hanjaName) {
  const text = `${surnameHanja || ""}${hanjaName || ""}`;
  const warnings = [];
  const limitations = [];
  if (!text || !CJK_RE.test(text)) {
    return { source: "hanja-stroke-order", available: false, warnings, limitations: ["hanja-stroke-unavailable"], strokes: [], relationships: [] };
  }
  const strokes = [];
  for (const char of Array.from(text)) {
    try {
      const strokeOrder = hanja.getStrokes(char);
      const count = typeof strokeOrder === "string" ? Array.from(strokeOrder).length : 0;
      if (!Number.isFinite(count) || count <= 0) throw new Error("invalid stroke count");
      strokes.push({ char, strokes: count, element: elementForStrokes(count), source: "hanja" });
    } catch (error) {
      limitations.push("hanja-stroke-unavailable");
      warnings.push(`hanja stroke unavailable for ${char}: ${error.message}`);
    }
  }
  const relationships = [];
  for (let index = 0; index < strokes.length - 1; index += 1) {
    relationships.push(relationOf(strokes[index].element, strokes[index + 1].element));
  }
  return { source: "hanja-stroke-order", available: strokes.length === Array.from(text).length, warnings, limitations, strokes, relationships };
}

function getHangulStrokeProfile(text) {
  const strokes = Array.from(text).map((char) => {
    const count = Number(strokeCounter(char));
    return { char, strokes: count, element: elementForStrokes(count), source: "korean-stroke" };
  });
  const relationships = [];
  for (let index = 0; index < strokes.length - 1; index += 1) {
    relationships.push(relationOf(strokes[index].element, strokes[index + 1].element));
  }
  return {
    source: "korean-stroke-hangul",
    available: true,
    warnings: [],
    limitations: ["hangul-stroke-fallback-reduced-precision"],
    strokes,
    relationships
  };
}

async function buildStrokeProfile(candidate, context) {
  if (candidate.hanjaName) {
    const hanja = await getHanjaStrokeProfile(context.input.surnameHanja, candidate.hanjaName);
    if (hanja.available) return hanja;
    return { ...hanja, limitations: [...new Set([...hanja.limitations, "hanja-stroke-unavailable"])] };
  }
  return getHangulStrokeProfile(`${context.input.surname}${candidate.givenName}`);
}

function scoreElementBalance(strokes, neededElements, preferences) {
  const nameElements = uniqueCanonical(strokes.map((entry) => entry.element));
  let score = 20;
  const matchedNeededElements = neededElements.filter((element) => nameElements.includes(element));
  score += Math.min(16, matchedNeededElements.length * 8);
  if (strokes[0] && neededElements.some((element) => GENERATING[strokes[0].element] === element)) score += 4;
  const incompatibleElements = nameElements.filter((nameElement) => neededElements.some((needed) => OVERCOMING[nameElement] === needed));
  score -= Math.min(12, incompatibleElements.length * 6);
  if ((preferences.preferredElements || []).some((element) => nameElements.includes(element))) score += 4;
  return { score: clamp(score, 0, 40), nameElements, matchedNeededElements, incompatibleElements };
}

function scoreStrokeHarmony(profile, candidate) {
  let score = 15;
  for (const relationship of profile.relationships) {
    if (relationship === "generating") score += 5;
    else if (relationship === "neutral") score += 2;
    else if (relationship === "overcoming") score -= 5;
    else score -= 2;
  }
  const total = profile.strokes.reduce((sum, entry) => sum + entry.strokes, 0);
  const last = total % 10;
  if (last !== 0 && last !== 4) score += 3;
  const givenStrokeCounts = profile.strokes.slice(-Array.from(candidate.givenName).length).map((entry) => entry.strokes);
  if (new Set(givenStrokeCounts).size > 1) score += 2;
  if (profile.source === "korean-stroke-hangul") score -= 4;
  return clamp(score, 0, 30);
}

async function scoreSoundFlow(fullName, givenName, preferences) {
  let score = 10;
  if ([3, 4].includes(Array.from(fullName).length)) score += 4;
  if (Array.from(givenName).length === 2) score += 3;
  const syllables = Array.from(givenName);
  if (!syllables.some((char, index) => index > 0 && char === syllables[index - 1])) score += 2;
  const romanized = localRomanizeKorean(fullName);
  if (romanized && romanized.length >= 3 && romanized.length <= 16) score += 1;
  if ((preferences.avoidSyllables || []).some((item) => fullName.includes(item))) score -= 4;
  return { score: clamp(score, 0, 20), romanized };
}

function scorePreferenceFit(candidate, preferences) {
  let score = 5;
  const explanations = [];
  if ((preferences.preferredSyllables || []).some((item) => candidate.givenName.includes(item))) {
    score += 2;
    explanations.push("선호 음절이 반영되었습니다.");
  }
  if (preferences.style && (candidate.tags || []).includes(preferences.style)) score += 2;
  if (candidate.meaning) score += 1;
  if ((preferences.avoidSyllables || []).some((item) => candidate.givenName.includes(item))) {
    score -= 4;
    explanations.push("피해야 할 음절이 포함되어 감점했습니다.");
  }
  return { score: clamp(score, 0, 10), explanations };
}

function gradeFor(score) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "weak";
}

async function scoreNameCandidate(rawCandidate, context, options = {}) {
  const candidate = rawCandidate.index == null ? normalizeCandidate(rawCandidate, options.index || 0) : rawCandidate;
  const fullName = `${context.input.surname}${candidate.givenName}`;
  const strokeProfileRaw = await buildStrokeProfile(candidate, context);
  const elementBalance = scoreElementBalance(strokeProfileRaw.strokes, context.neededElements, context.input.preferences);
  const strokeHarmony = scoreStrokeHarmony(strokeProfileRaw, candidate);
  const soundFlow = await scoreSoundFlow(fullName, candidate.givenName, context.input.preferences);
  const preferenceFit = scorePreferenceFit(candidate, context.input.preferences);
  const components = {
    elementBalance: elementBalance.score,
    strokeHarmony,
    soundFlow: soundFlow.score,
    preferenceFit: preferenceFit.score
  };
  const score = clamp(Math.round(Object.values(components).reduce((sum, item) => sum + item, 0)), 0, 100);
  const limitations = [...new Set([...(context.limitations || []), ...(strokeProfileRaw.limitations || [])])];
  const sources = ["naming-house-local-scoring", ...context.sources];
  if (strokeProfileRaw.source === "hanja-stroke-order" && strokeProfileRaw.available !== false && strokeProfileRaw.strokes.length) sources.push("hanja");
  if (strokeProfileRaw.source === "korean-stroke-hangul") sources.push("korean-stroke");
  const neededKo = context.neededElements.map((element) => ELEMENT_KO[element] || element).join("·");
  const explanation = [
    `사주 보완 오행(${neededKo})과 이름 오행의 겹침을 ${components.elementBalance}점으로 보았습니다.`,
    `획수 흐름은 ${strokeProfileRaw.source === "hanja-stroke-order" ? "한자 필획" : "한글 획수 fallback"} 기준 ${components.strokeHarmony}점입니다.`,
    `발음 흐름과 길이는 ${components.soundFlow}점입니다.`,
    ...preferenceFit.explanations
  ];
  if (limitations.includes("hangul-stroke-fallback-reduced-precision")) explanation.push("한자가 없어 한글 획수 기준으로 보수적으로 채점했습니다.");
  if (limitations.includes("hanja-stroke-unavailable")) explanation.push("일부 한자 획수는 확인되지 않아 한자 수리 해석을 확정하지 않았습니다.");

  return {
    fullName,
    surname: context.input.surname,
    givenName: candidate.givenName,
    ...(candidate.hanjaName ? { hanjaName: candidate.hanjaName } : {}),
    romanized: soundFlow.romanized,
    score,
    grade: gradeFor(score),
    components,
    elementProfile: {
      neededElements: context.neededElements,
      nameElements: elementBalance.nameElements,
      matchedNeededElements: elementBalance.matchedNeededElements,
      incompatibleElements: elementBalance.incompatibleElements
    },
    strokeProfile: {
      source: strokeProfileRaw.source,
      strokes: strokeProfileRaw.strokes,
      relationships: strokeProfileRaw.relationships,
      warnings: strokeProfileRaw.warnings || [],
      limitations: strokeProfileRaw.limitations || [],
      available: strokeProfileRaw.available !== false,
    },
    explanation,
    limitations,
    sources: [...new Set(sources)],
    index: candidate.index
  };
}

async function recommendNames(rawInput, options = {}) {
  const context = await buildNamingContext(rawInput);
  const scores = [];
  for (const candidate of context.input.candidates) {
    scores.push(await scoreNameCandidate(candidate, context, { index: candidate.index }));
  }
  scores.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.components.elementBalance !== left.components.elementBalance) return right.components.elementBalance - left.components.elementBalance;
    if (right.components.strokeHarmony !== left.components.strokeHarmony) return right.components.strokeHarmony - left.components.strokeHarmony;
    const nameCompare = left.fullName.localeCompare(right.fullName, "ko");
    if (nameCompare !== 0) return nameCompare;
    return left.index - right.index;
  });
  const limit = options.maxCandidates || context.input.preferences.maxCandidates;
  const recommendations = scores.slice(0, limit).map((item, index) => {
    const { index: _index, ...publicScore } = item;
    return { ...publicScore, rank: index + 1 };
  });
  return {
    input: context.input,
    context: {
      saju: context.saju,
      neededElements: context.neededElements
    },
    recommendations,
    limitations: [...new Set([...(context.limitations || []), ...recommendations.flatMap((item) => item.limitations || [])])],
    sources: [...new Set(recommendations.flatMap((item) => item.sources || []))]
  };
}

async function callNamingHouseTool(name, args = {}) {
  switch (name) {
    case "recommend_names":
      return recommendNames(args);
    case "score_name": {
      const input = args.input || { ...args, candidates: args.candidates || [args.candidate || { givenName: args.givenName, hanjaName: args.hanjaName }] };
      const candidate = args.candidate || (input.candidates && input.candidates[0]);
      const context = await buildNamingContext(input);
      return { context, score: await scoreNameCandidate(candidate, context, { index: 0 }) };
    }
    case "interview_state": {
      const missingFields = getMissingNamingFields(args);
      return {
        missingFields,
        suggestedQuestions: missingFields.map((field) => ({ field, question: questionForField(field) }))
      };
    }
    default:
      throw new Error(`Unknown naming-house tool: ${name}`);
  }
}

function questionForField(field) {
  const questions = {
    surname: "성씨를 한글로 알려주세요.",
    birthDate: "양력 생년월일을 YYYY-MM-DD 형식으로 알려주세요.",
    gender: "사주 계산에 사용할 성별을 male 또는 female 중 하나로 알려주세요.",
    candidates: "검토할 후보 이름을 한글 이름과 가능한 한자까지 알려주세요."
  };
  return questions[field] || `${field} 값을 알려주세요.`;
}

module.exports = {
  getMissingNamingFields,
  normalizeNamingInput,
  buildNamingContext,
  scoreNameCandidate,
  recommendNames,
  callNamingHouseTool,
  adapters: {
    getHanjaStrokeProfile,
    getHangulStrokeProfile
  }
};
