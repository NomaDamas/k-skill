const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const skillPath = path.join(__dirname, "..", "saju-fortune", "SKILL.md");

test("saju-fortune skill instructs interview-first fortune reading", () => {
  const text = fs.readFileSync(skillPath, "utf8");

  assert.match(text, /^name: saju-fortune$/m);
  assert.match(text, /인터뷰/);
  assert.match(text, /연애운/);
  assert.match(text, /재물운/);
  assert.match(text, /한해 운세/);
  assert.match(text, /saju-fortune/);
  assert.match(text, /MCP 서버를 따로 실행하지 않는다/);
});
