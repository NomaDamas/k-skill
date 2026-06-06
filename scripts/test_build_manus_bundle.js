"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const buildScript = path.join(__dirname, "build-manus-bundle.js");

test("build-manus-bundle script exists and is executable as a Node module", () => {
  assert.ok(fs.existsSync(buildScript), "build-manus-bundle.js must exist");
  const checked = spawnSync(process.execPath, ["--check", buildScript], { encoding: "utf8" });
  assert.equal(checked.status, 0, `node --check failed: ${checked.stderr}`);
});

test("discoverSkills finds every root-level skill with a SKILL.md and matches validate-skills.sh", () => {
  const { discoverSkills, EXCLUDED_DIRS } = require("./build-manus-bundle.js");

  const skills = discoverSkills();
  assert.ok(skills.length >= 50, `expected at least 50 skills, got ${skills.length}`);

  for (const name of skills) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, name, "SKILL.md")),
      `discovered skill ${name} must have a SKILL.md`,
    );
    assert.ok(!EXCLUDED_DIRS.has(name), `${name} must not be an excluded tooling dir`);
  }

  const validatorOutput = spawnSync(path.join(__dirname, "validate-skills.sh"), [], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(validatorOutput.status, 0, `validate-skills.sh failed: ${validatorOutput.stderr}`);
});

test("readSkillMeta extracts name and description from YAML frontmatter", () => {
  const { readSkillMeta } = require("./build-manus-bundle.js");

  const sample = readSkillMeta("mfds-food-safety");
  assert.equal(sample.name, "mfds-food-safety");
  assert.ok(sample.description.length > 0, "description must be non-empty");
});

test("EXCLUDED_DIRS stays in lockstep with validate-skills.sh exclusions", () => {
  const { EXCLUDED_DIRS } = require("./build-manus-bundle.js");
  const validator = fs.readFileSync(path.join(__dirname, "validate-skills.sh"), "utf8");

  const required = [
    ".git",
    ".github",
    ".codex",
    ".claude",
    ".changeset",
    "docs",
    "node_modules",
    "packages",
    "python-packages",
    "scripts",
    "examples",
    "legacy",
  ];
  for (const dir of required) {
    assert.ok(
      validator.includes(`! -name ${dir}`),
      `validate-skills.sh must exclude ${dir} (or this list needs updating)`,
    );
    assert.ok(EXCLUDED_DIRS.has(dir), `EXCLUDED_DIRS must also skip ${dir}`);
  }
});

test("legacy folder is not treated as a Manus skill bundle source", () => {
  const { EXCLUDED_DIRS, discoverSkills } = require("./build-manus-bundle.js");

  assert.ok(EXCLUDED_DIRS.has("legacy"));
  assert.ok(!discoverSkills().includes("legacy"));
  assert.ok(!discoverSkills().includes("blue-ribbon-nearby"));
  assert.ok(!discoverSkills().includes("naver-map-route"));
});

test("docs/install-manus.md documents both the GitHub URL path and the .skill bundle path", () => {
  const doc = fs.readFileSync(path.join(repoRoot, "docs", "install-manus.md"), "utf8");
  assert.match(doc, /tree\/main\//, "must explain per-skill folder URL pattern");
  assert.match(doc, /\.skill/, "must document the .skill file flow");
  assert.match(doc, /build:manus-bundle/, "must reference the npm build script");
});

test("docs/install-manus.md advertises the rolling release download URL", () => {
  const doc = fs.readFileSync(path.join(repoRoot, "docs", "install-manus.md"), "utf8");
  assert.match(
    doc,
    /releases\/download\/manus-bundle-latest\/k-skill-manus-all\.zip/,
    "must link to the stable rolling-release download URL",
  );
  assert.match(
    doc,
    /releases\/tag\/manus-bundle-latest/,
    "must link to the rolling-release page",
  );
});

test("manus-bundle workflow exists, targets main, and publishes the expected assets", () => {
  const wfPath = path.join(repoRoot, ".github", "workflows", "manus-bundle.yml");
  assert.ok(fs.existsSync(wfPath), "manus-bundle.yml workflow must exist");
  const wf = fs.readFileSync(wfPath, "utf8");
  assert.match(wf, /branches:\s*\n\s*-\s*main/, "workflow must trigger on push to main");
  assert.match(wf, /npm run build:manus-bundle/, "workflow must invoke the build script");
  assert.match(wf, /manus-bundle-latest/, "workflow must use the stable rolling tag");
  assert.match(wf, /k-skill-manus-all\.zip/, "workflow must upload the combined archive");
  assert.match(wf, /--prerelease/, "rolling release must be marked as prerelease");
  assert.match(wf, /contents:\s*write/, "workflow needs write permission to publish releases");
});
