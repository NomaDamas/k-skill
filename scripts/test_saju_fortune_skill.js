const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const skillDir = path.join(__dirname, "..", "saju-fortune");

test("saju-fortune skill instructs interview-first fortune reading", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, "skill.json"), "utf8"));
  const text = fs.readFileSync(path.join(skillDir, "instruction.md"), "utf8");

  assert.match(manifest.frontmatter, /^name: saju-fortune$/m);
  assert.match(text, /인터뷰/);
  assert.match(text, /연애운/);
  assert.match(text, /재물운/);
  assert.match(text, /한해 운세/);
  assert.match(text, /saju-fortune/);
  assert.match(text, /MCP 서버를 따로 실행하지 않는다/);
});
