const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeSaju,
  callSajuTool,
  checkCompatibility,
  getMissingInterviewFields,
  normalizeBirthInput
} = require("../src/index");

test("getMissingInterviewFields drives a saju reading interview", () => {
  assert.deepEqual(getMissingInterviewFields({ name: "민준", birthDate: "1990-03-15" }), [
    "birthTime",
    "gender"
  ]);

  assert.deepEqual(
    getMissingInterviewFields({ birthDate: "1990-03-15", birthTime: "10:30", gender: "male" }),
    []
  );
});

test("normalizeBirthInput validates and preserves saju birth details", () => {
  assert.deepEqual(
    normalizeBirthInput({
      name: "민준",
      hanjaName: "民俊",
      birthDate: "1990-03-15",
      birthTime: "10:30",
      calendar: "solar",
      gender: "male",
      birthCity: "서울"
    }),
    {
      name: "민준",
      hanjaName: "民俊",
      birthDate: "1990-03-15",
      birthTime: "10:30",
      calendar: "solar",
      isLeapMonth: false,
      gender: "male",
      birthCity: "서울"
    }
  );

  assert.throws(
    () => normalizeBirthInput({ birthDate: "1990-03-15", birthTime: "25:00", gender: "male" }),
    /birthTime must be HH:mm/
  );
});

test("analyzeSaju returns pillars, element balance, and topic guidance", () => {
  const result = analyzeSaju({
    name: "민준",
    birthDate: "1990-03-15",
    birthTime: "10:30",
    gender: "male",
    birthCity: "서울"
  }, { analysisType: "fortune", fortuneType: "love" });

  assert.equal(result.input.name, "민준");
  assert.equal(result.pillars.year.label, "경오");
  assert.equal(result.pillars.month.label, "기묘");
  assert.equal(result.pillars.day.label, "기묘");
  assert.equal(result.pillars.hour.label, "기사");
  assert.equal(result.dayMaster.element, "earth");
  assert.equal(result.fortune.type, "love");
  assert.match(result.fortune.summary, /관계|연애|표현/);
  assert.ok(result.fiveElements.wood > result.fiveElements.water);
  assert.deepEqual(result.sources, ["saju-fortune-local-calculation", "fortuneteller-mcp-tool-model"]);
});

test("callSajuTool mirrors the upstream MCP tool names without serving MCP", () => {
  const result = callSajuTool("analyze_saju", {
    birthDate: "1990-03-15",
    birthTime: "10:30",
    gender: "male",
    analysisType: "fortune",
    fortuneType: "wealth"
  });

  assert.equal(result.fortune.type, "wealth");
  assert.equal(result.pillars.year.label, "경오");

  assert.throws(() => callSajuTool("unknown_tool", {}), /Unknown saju tool/);
});

test("checkCompatibility compares two profiles with readable guidance", () => {
  const result = checkCompatibility({
    person1: { name: "민준", birthDate: "1990-03-15", birthTime: "10:30", gender: "male" },
    person2: { name: "서연", birthDate: "1992-07-20", birthTime: "14:30", gender: "female" }
  });

  assert.equal(result.people[0].name, "민준");
  assert.equal(result.people[1].name, "서연");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.focusAreas.length >= 2);
  assert.match(result.summary, /궁합|관계/);
});
