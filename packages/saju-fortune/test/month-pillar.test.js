const test = require("node:test");
const assert = require("node:assert/strict");

const { analyzeSaju } = require("../src/index");

function monthPillar(birthDate) {
  return analyzeSaju({ birthDate, birthTime: "12:00", gender: "male" }).pillars.month.hanja;
}

test("1월 1~5일(소한 이전)은 직전 子월로 계산한다", () => {
  assert.equal(monthPillar("2000-01-01"), "丙子");
  assert.equal(monthPillar("2000-01-05"), "丙子");
  assert.equal(monthPillar("2024-01-03"), "甲子");
});

test("소한 이후 1월과 입춘 경계는 기존 월주를 유지한다", () => {
  assert.equal(monthPillar("1999-12-07"), "丙子");
  assert.equal(monthPillar("1999-12-31"), "丙子");
  assert.equal(monthPillar("2000-01-06"), "丁丑");
  assert.equal(monthPillar("2000-02-03"), "丁丑");
  assert.equal(monthPillar("2000-02-04"), "戊寅");
  assert.equal(monthPillar("2024-01-06"), "乙丑");
});
