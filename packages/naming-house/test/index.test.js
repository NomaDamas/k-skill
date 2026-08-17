const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  adapters,
  buildNamingContext,
  callNamingHouseTool,
  getMissingNamingFields,
  normalizeNamingInput,
  recommendNames,
  scoreNameCandidate
} = require("../src/index");

const CLI_PATH = path.join(__dirname, "..", "src", "cli.js");

function sampleInput(overrides = {}) {
  return {
    surname: "김",
    surnameHanja: "金",
    birthDate: "2024-05-18",
    birthTime: "09:20",
    calendar: "solar",
    gender: "female",
    birthCity: "서울",
    preferences: { style: "modern", maxCandidates: 10 },
    candidates: [
      { givenName: "서아", hanjaName: "瑞雅", tags: ["modern"] },
      { givenName: "하린", hanjaName: "河潾" },
      { givenName: "지유", hanjaName: "志柔" }
    ],
    ...overrides
  };
}

test("getMissingNamingFields returns required fields in interview order", () => {
  assert.deepEqual(getMissingNamingFields({}), ["surname", "birthDate", "gender", "candidates"]);
  assert.deepEqual(getMissingNamingFields({ surname: "김", birthDate: "2024-05-18", gender: "female", candidates: [] }), []);
});

test("normalizeNamingInput validates and preserves valid inputs", () => {
  const normalized = normalizeNamingInput(sampleInput({ surname: " 김 ", candidates: [{ givenName: " 서아 ", hanjaName: "瑞雅" }] }));
  assert.equal(normalized.surname, "김");
  assert.equal(normalized.calendar, "solar");
  assert.equal(normalized.preferences.maxCandidates, 10);
  assert.equal(normalized.candidates[0].givenName, "서아");
  assert.equal(normalized.candidates[0].index, 0);
});

test("normalizeNamingInput rejects invalid gender date time candidate and maxCandidates", () => {
  assert.throws(() => normalizeNamingInput(sampleInput({ gender: "unknown" })), /gender must be male or female/);
  assert.throws(() => normalizeNamingInput(sampleInput({ birthDate: "2024-02-31" })), /birthDate must be YYYY-MM-DD/);
  assert.throws(() => normalizeNamingInput(sampleInput({ birthTime: "25:00" })), /birthTime must be HH:mm/);
  assert.throws(() => normalizeNamingInput(sampleInput({ candidates: [{ givenName: "A" }] })), /candidate givenName must be 1-3 Hangul syllables/);
  assert.throws(() => normalizeNamingInput(sampleInput({ preferences: { maxCandidates: 0 } })), /maxCandidates must be between 1 and 50/);
});

test("buildNamingContext calls saju-fortune and exposes needed elements", async () => {
  const context = await buildNamingContext(sampleInput());
  assert.equal(context.input.surname, "김");
  assert.ok(context.saju.fiveElements);
  assert.ok(Array.isArray(context.neededElements));
  assert.ok(context.neededElements.length > 0);
  assert.ok(context.sources.includes("saju-fortune"));
});

test("recommendNames ranks candidates deterministically", async () => {
  const first = await recommendNames(sampleInput());
  const second = await recommendNames(sampleInput());
  assert.deepEqual(first, second);
  assert.equal(first.recommendations.length, 3);
  assert.deepEqual(first.recommendations.map((item) => item.rank), [1, 2, 3]);
  assert.ok(first.recommendations[0].score >= first.recommendations[1].score);
});

test("Hanja candidates use real per-character stroke counts", async () => {
  // Given: candidates whose Hanja have different official stroke sequences
  const input = sampleInput({
    surname: "정",
    surnameHanja: "鄭",
    candidates: [
      { givenName: "초희", hanjaName: "草熙" },
      { givenName: "초희", hanjaName: "初熙" },
      { givenName: "초희", hanjaName: "楚熙" }
    ]
  });

  // When: the candidates are scored
  const result = await recommendNames(input);

  // Then: every character has a real stroke count and the candidates differ
  const profiles = new Map(result.recommendations.map((item) => [
    item.hanjaName,
    item.strokeProfile
  ]));
  assert.deepEqual(profiles.get("草熙").strokes.map((entry) => entry.strokes), [15, 10, 14]);
  assert.deepEqual(profiles.get("初熙").strokes.map((entry) => entry.strokes), [15, 8, 14]);
  assert.deepEqual(profiles.get("楚熙").strokes.map((entry) => entry.strokes), [15, 13, 14]);
  assert.equal(new Set(Array.from(profiles.values(), (profile) => profile.strokes.map((entry) => entry.strokes).join(","))).size, 3);
  assert.ok(Array.from(profiles.values()).every((profile) => profile.available));
});

test("Hanja candidate reports stroke provenance", async () => {
  const result = await recommendNames(sampleInput({ candidates: [{ givenName: "서아", hanjaName: "瑞雅" }] }));
  const [score] = result.recommendations;
  assert.equal(score.strokeProfile.source, "hanja-stroke-order");
  assert.equal(score.strokeProfile.available, true);
  assert.equal(score.sources.includes("hanja"), true);
  assert.deepEqual(score.strokeProfile.strokes.map((entry) => entry.source), ["hanja", "hanja", "hanja"]);
  assert.deepEqual(score.strokeProfile.strokes.map((entry) => entry.strokes), [8, 13, 12]);
  assert.equal(score.limitations.includes("hanja-stroke-unavailable"), false);
});

test("candidate without Hanja uses korean-stroke fallback with limitation", async () => {
  const result = await recommendNames(sampleInput({ surnameHanja: undefined, candidates: [{ givenName: "도윤" }] }));
  const [score] = result.recommendations;
  assert.equal(score.strokeProfile.source, "korean-stroke-hangul");
  assert.ok(score.sources.includes("korean-stroke"));
  assert.ok(score.limitations.includes("hangul-stroke-fallback-reduced-precision"));
});

test("buildNamingContext prioritizes saju yongsin primary and secondary elements", async () => {
  const context = await buildNamingContext(sampleInput());
  assert.equal(context.neededElements[0], context.saju.yongsin.primary);
  assert.ok(context.neededElements.includes(context.saju.yongsin.secondary));
});

test("scoreNameCandidate returns component ranges and clamped score", async () => {
  const context = await buildNamingContext(sampleInput());
  const score = await scoreNameCandidate({ givenName: "서아", hanjaName: "瑞雅", tags: ["modern"] }, context, { index: 0 });
  assert.equal(score.fullName, "김서아");
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.ok(score.components.elementBalance >= 0 && score.components.elementBalance <= 40);
  assert.ok(score.components.strokeHarmony >= 0 && score.components.strokeHarmony <= 30);
  assert.ok(score.components.soundFlow >= 0 && score.components.soundFlow <= 20);
  assert.ok(score.components.preferenceFit >= 0 && score.components.preferenceFit <= 10);
  assert.ok(["excellent", "good", "fair", "weak"].includes(score.grade));
});

test("avoid and preferred syllables affect preferenceFit and explanation", async () => {
  const context = await buildNamingContext(sampleInput({ preferences: { preferredSyllables: ["아"], avoidSyllables: ["서"] } }));
  const score = await scoreNameCandidate({ givenName: "서아" }, context, { index: 0 });
  assert.ok(score.components.preferenceFit < 7);
  assert.match(score.explanation.join(" "), /피해야 할 음절|선호 음절/);
});

test("unknown birth time keeps saju limitation", async () => {
  const result = await recommendNames(sampleInput({ birthTime: undefined }));
  assert.match(result.limitations.join(" "), /시간|시주|연·월·일/);
});

test("lunar date rejects through saju-fortune policy", async () => {
  await assert.rejects(() => recommendNames(sampleInput({ calendar: "lunar" })), /lunar calendar conversion is not supported/);
});

test("callNamingHouseTool supports tool names and rejects unknown names", async () => {
  const interview = await callNamingHouseTool("interview_state", { surname: "김" });
  assert.ok(interview.missingFields.includes("birthDate"));

  const recommended = await callNamingHouseTool("recommend_names", sampleInput());
  assert.equal(recommended.recommendations.length, 3);

  const scored = await callNamingHouseTool("score_name", { input: sampleInput(), candidate: { givenName: "서아", hanjaName: "瑞雅" } });
  assert.equal(scored.score.fullName, "김서아");

  await assert.rejects(() => callNamingHouseTool("unknown_tool", {}), /Unknown naming-house tool/);
});

test("CLI recommend_names prints JSON", () => {
  const stdout = execFileSync(process.execPath, [CLI_PATH, "--tool", "recommend_names", "--input-json", JSON.stringify(sampleInput())], { encoding: "utf8" });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.recommendations.length, 3);
});

test("CommonJS adapter exposes deterministic Hanja stroke profiles", async () => {
  const profile = await adapters.getHanjaStrokeProfile("金", "瑞雅");
  assert.equal(profile.available, true);
  assert.deepEqual(profile.strokes.map((entry) => entry.strokes), [8, 13, 12]);
});
