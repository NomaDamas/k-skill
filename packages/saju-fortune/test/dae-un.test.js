const test = require("node:test");
const assert = require("node:assert/strict");

const { callSajuTool } = require("../src/index");

function daeUn(birthDate, gender) {
  const result = callSajuTool("get_dae_un", { birthDate, birthTime: "10:00", gender, limit: 3 });
  return result.cycles.map((cycle) => cycle.hanja);
}

test("양남음녀는 월주에서 순행한다", () => {
  // 1984 甲子년(양간), 월주 己巳
  assert.deepEqual(daeUn("1984-05-10", "male"), ["庚午", "辛未", "壬申"]);
  // 1985 乙丑년(음간), 월주 辛巳
  assert.deepEqual(daeUn("1985-05-10", "female"), ["壬午", "癸未", "甲申"]);
});

test("음남양녀는 월주에서 역행한다", () => {
  assert.deepEqual(daeUn("1984-05-10", "female"), ["戊辰", "丁卯", "丙寅"]);
  assert.deepEqual(daeUn("1985-05-10", "male"), ["庚辰", "己卯", "戊寅"]);
});
