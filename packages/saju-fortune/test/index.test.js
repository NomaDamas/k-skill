const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  analyzeSaju,
  callSajuTool,
  checkCompatibility,
  getMissingInterviewFields,
  normalizeBirthInput
} = require("../src/index");

const CLI_PATH = path.join(__dirname, "..", "src", "cli.js");

function runCliJson(args) {
  return JSON.parse(execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" }));
}

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
test("analyzeSaju rejects lunar dates until conversion is supported", () => {
  assert.throws(
    () => analyzeSaju({
      birthDate: "1990-03-15",
      birthTime: "10:30",
      calendar: "lunar",
      isLeapMonth: true,
      gender: "male"
    }),
    /lunar calendar conversion is not supported/
  );
});

test("convert_calendar rejects unsupported lunar and solar conversion", () => {
  assert.throws(
    () => callSajuTool("convert_calendar", {
      date: "1990-03-15",
      fromCalendar: "lunar",
      toCalendar: "solar",
      isLeapMonth: true
    }),
    /lunar calendar conversion is not supported/
  );

  assert.deepEqual(callSajuTool("convert_calendar", {
    date: "1990-03-15",
    fromCalendar: "solar",
    toCalendar: "solar"
  }), {
    originalDate: "1990-03-15",
    originalCalendar: "solar",
    convertedDate: "1990-03-15",
    convertedCalendar: "solar",
    isLeapMonth: false,
    note: "동일한 달력 체계라 변환하지 않았습니다."
  });
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

test("analyzeSaju keeps a conservative reading when birth time is unknown", () => {
  const result = analyzeSaju({
    name: "민준",
    birthDate: "1990-03-15",
    gender: "male"
  }, { analysisType: "fortune", fortuneType: "love" });

  assert.equal(result.input.birthTime, undefined);
  assert.equal(result.timeAccuracy, "unknown");
  assert.equal(result.pillars.year.label, "경오");
  assert.equal(result.pillars.month.label, "기묘");
  assert.equal(result.pillars.day.label, "기묘");
  assert.equal(result.pillars.hour, null);
  assert.deepEqual(result.interview.missingFields, ["birthTime"]);
  assert.match(result.limitations.join(" "), /시간|시주|연·월·일/);
  assert.match(result.fortune.caveat, /시간|시주/);
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

test("CLI --tool convert_calendar maps tool-specific calendar flags", () => {
  const result = runCliJson([
    "--tool", "convert_calendar",
    "--date", "1990-03-15",
    "--from-calendar", "solar",
    "--to-calendar", "solar"
  ]);

  assert.equal(result.originalDate, "1990-03-15");
  assert.equal(result.originalCalendar, "solar");
  assert.equal(result.convertedDate, "1990-03-15");
  assert.equal(result.convertedCalendar, "solar");
});

test("CLI --tool check_compatibility accepts JSON person profiles", () => {
  const result = runCliJson([
    "--tool", "check_compatibility",
    "--person1-json", JSON.stringify({ name: "민준", birthDate: "1990-03-15", birthTime: "10:30", gender: "male" }),
    "--person2-json", JSON.stringify({ name: "서연", birthDate: "1992-07-20", birthTime: "14:30", gender: "female" })
  ]);

  assert.equal(result.people[0].name, "민준");
  assert.equal(result.people[1].name, "서연");
  assert.match(result.summary, /궁합|관계/);
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
