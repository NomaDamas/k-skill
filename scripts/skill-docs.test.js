const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("root npm test script includes the skill docs regression suite", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts.test, /node --test scripts\/skill-docs\.test\.js/);
});

test("hwp skill documents environment-aware routing and supported operations", () => {
  const skillPath = path.join(repoRoot, "hwp", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected hwp/SKILL.md to exist");

  const skill = read(path.join("hwp", "SKILL.md"));

  assert.match(skill, /^name: hwp$/m);
  assert.match(skill, /@ohah\/hwpjs/);
  assert.match(skill, /\bhwp-mcp\b/);
  assert.match(skill, /Windows/i);
  assert.match(skill, /JSON/i);
  assert.match(skill, /Markdown/i);
  assert.match(skill, /HTML/i);
  assert.match(skill, /image/i);
  assert.match(skill, /batch/i);
});

test("hwp skill documents inline image verification for markdown output", () => {
  const skill = read(path.join("hwp", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "hwp.md"));

  assert.match(skill, /hwpjs to-markdown document\.hwp -o output\.md --include-images/);
  assert.match(skill, /Markdown:.*(data:|base64)/);
  assert.match(skill, /--images-dir/);
  assert.doesNotMatch(skill, /Markdown:.*이미지 경로 생성 여부 확인/);
  assert.match(featureDoc, /--images-dir/);
});

test("repository docs advertise the hwp skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "hwp.md");
  const featureDoc = read(path.join("docs", "features", "hwp.md"));

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/hwp.md to exist");
  assert.match(readme, /\| HWP 문서 처리 \|/);
  assert.match(readme, /\[HWP 문서 처리\]\(docs\/features\/hwp\.md\)/);
  assert.match(install, /--skill hwp/);
  assert.match(featureDoc, /--include-images/);
  assert.match(featureDoc, /(data:|base64)/);
  assert.match(featureDoc, /Markdown 출력.*(data:|base64)/);
  assert.doesNotMatch(featureDoc, /Markdown 출력.*이미지 (파일 )?경로 생성 여부 확인/);
});

test("repository docs advertise the kakaotalk-mac skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "kakaotalk-mac.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/kakaotalk-mac.md to exist");
  assert.match(readme, /\| 카카오톡 Mac CLI \|/);
  assert.match(readme, /\[카카오톡 Mac CLI\]\(docs\/features\/kakaotalk-mac\.md\)/);
  assert.match(install, /--skill kakaotalk-mac/);
});

test("kakaotalk-mac skill documents safe macOS kakaocli usage", () => {
  const skillPath = path.join(repoRoot, "kakaotalk-mac", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected kakaotalk-mac/SKILL.md to exist");

  const skill = read(path.join("kakaotalk-mac", "SKILL.md"));

  assert.match(skill, /^name: kakaotalk-mac$/m);
  assert.match(skill, /kakaocli/);
  assert.match(skill, /macOS/i);
  assert.match(skill, /KakaoTalk/i);
  assert.match(skill, /Full Disk Access/i);
  assert.match(skill, /Accessibility/i);
  assert.match(skill, /--me/);
  assert.match(skill, /confirm before sending/i);
});
