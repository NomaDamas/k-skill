const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { diffYears, getYear, listYears, recordYear } = require("../src/history");

function tempHistoryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yebigun-training-history-"));
  return path.join(dir, "history.json");
}

test("recordYear creates and updates a year's record without touching other years", () => {
  const filePath = tempHistoryPath();

  recordYear(2025, { trainingType: "향방작계", startDate: "2025-05-12", endDate: "2025-05-12", location: "동대" }, filePath);
  recordYear(2026, { trainingType: "동미참", startDate: "2026-06-10", endDate: "2026-06-12", location: "00훈련장" }, filePath);

  assert.equal(getYear(2025, filePath).trainingType, "향방작계");
  assert.equal(getYear(2026, filePath).location, "00훈련장");
  assert.deepEqual(listYears(filePath), ["2025", "2026"]);
});

test("recordYear merges partial updates into the same year instead of overwriting", () => {
  const filePath = tempHistoryPath();

  recordYear(2026, { trainingType: "동미참", startDate: "2026-06-10" }, filePath);
  recordYear(2026, { endDate: "2026-06-12" }, filePath);

  const record = getYear(2026, filePath);
  assert.equal(record.trainingType, "동미참");
  assert.equal(record.startDate, "2026-06-10");
  assert.equal(record.endDate, "2026-06-12");
});

test("diffYears reports field-level changes between two recorded years", () => {
  const filePath = tempHistoryPath();

  recordYear(
    2025,
    { trainingType: "향방작계", startDate: "2025-05-12", endDate: "2025-05-12", location: "00동대", transportProvided: false },
    filePath,
  );
  recordYear(
    2026,
    { trainingType: "향방작계", startDate: "2026-05-18", endDate: "2026-05-18", location: "11훈련장", transportProvided: true },
    filePath,
  );

  const diff = diffYears(2026, 2025, filePath);

  assert.equal(diff.hasPreviousRecord, true);
  assert.deepEqual(
    diff.changes.map((change) => change.field).sort(),
    ["location", "startDate", "endDate", "transportProvided"].sort(),
  );
  const locationChange = diff.changes.find((change) => change.field === "location");
  assert.equal(locationChange.before, "00동대");
  assert.equal(locationChange.after, "11훈련장");
});

test("diffYears flags a missing previous-year record instead of guessing", () => {
  const filePath = tempHistoryPath();
  recordYear(2026, { trainingType: "필승", startDate: "2026-04-01", endDate: "2026-04-01" }, filePath);

  const diff = diffYears(2026, 2025, filePath);

  assert.equal(diff.hasPreviousRecord, false);
  assert.equal(diff.previous, null);
  assert.deepEqual(diff.changes, []);
});

test("diffYears throws when the current year has no record at all", () => {
  const filePath = tempHistoryPath();
  assert.throws(() => diffYears(2026, 2025, filePath), /No recorded training info for 2026/);
});
