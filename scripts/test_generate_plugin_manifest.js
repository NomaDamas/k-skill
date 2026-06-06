"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  discoverSkillPaths,
  buildManifest,
  serialize,
  run,
  manifestPathFor,
  EXCLUDED_SKILLS,
} = require("./generate-plugin-manifest.js");

/** Create a throwaway repo-like tree and return its root path. */
function makeFixtureRoot(layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-manifest-"));
  for (const [relPath, contents] of Object.entries(layout)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return root;
}

const SKILL_FM = "---\nname: x\ndescription: y\n---\n";

test("discoverSkillPaths returns sorted ./-prefixed dirs that contain SKILL.md", () => {
  const root = makeFixtureRoot({
    "lotto-results/SKILL.md": SKILL_FM,
    "ktx-booking/SKILL.md": SKILL_FM,
    "not-a-skill/README.md": "no skill here",
    "top-level-file.md": "ignored",
  });
  assert.deepEqual(discoverSkillPaths(root), ["./ktx-booking", "./lotto-results"]);
});

test("discoverSkillPaths excludes infrastructure dirs and nested fixtures", () => {
  const root = makeFixtureRoot({
    "lotto-results/SKILL.md": SKILL_FM,
    // Excluded root dirs that happen to contain a SKILL.md somewhere.
    "packages/k-lotto/SKILL.md": SKILL_FM,
    "scripts/SKILL.md": SKILL_FM,
    "tools/k-skill-qa-bot/test/fixtures/skills/kbo-results/SKILL.md": SKILL_FM,
    "docs/SKILL.md": SKILL_FM,
    // Dot-directory must be skipped regardless of contents.
    ".github/SKILL.md": SKILL_FM,
  });
  assert.deepEqual(discoverSkillPaths(root), ["./lotto-results"]);
});

test("discoverSkillPaths drops deprecated EXCLUDED_SKILLS", () => {
  assert.ok(EXCLUDED_SKILLS.has("blue-ribbon-nearby"));
  const root = makeFixtureRoot({
    "blue-ribbon-nearby/SKILL.md": SKILL_FM,
    "lotto-results/SKILL.md": SKILL_FM,
  });
  assert.deepEqual(discoverSkillPaths(root), ["./lotto-results"]);
});

test("discoverSkillPaths ignores legacy skills even when they contain SKILL.md", () => {
  const root = makeFixtureRoot({
    "legacy/blue-ribbon-nearby/SKILL.md": SKILL_FM,
    "legacy/naver-map-route/SKILL.md": SKILL_FM,
    "naver-map-route/SKILL.md": SKILL_FM,
    "lotto-results/SKILL.md": SKILL_FM,
  });

  assert.ok(EXCLUDED_SKILLS.has("naver-map-route"));
  assert.deepEqual(discoverSkillPaths(root), ["./lotto-results"]);
});

test("buildManifest backfills identity fields and preserves author overrides", () => {
  const root = makeFixtureRoot({ "lotto-results/SKILL.md": SKILL_FM });
  // Pre-seed a manifest with a custom description that must survive.
  fs.mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    manifestPathFor(root),
    serialize({ name: "k-skill", description: "custom desc", skills: [] }),
  );

  const manifest = buildManifest(root);
  assert.equal(manifest.description, "custom desc"); // not clobbered
  assert.equal(manifest.license, "MIT"); // backfilled from default
  assert.deepEqual(manifest.skills, ["./lotto-results"]); // always refreshed
});

test("run --check passes when manifest matches, fails after drift", () => {
  const root = makeFixtureRoot({ "lotto-results/SKILL.md": SKILL_FM });

  // First write, then a check should agree.
  const written = run({ root });
  assert.equal(written.written, true);
  assert.equal(run({ root, check: true }).ok, true);

  // Add a new skill on disk -> check must now report drift.
  fs.mkdirSync(path.join(root, "ktx-booking"));
  fs.writeFileSync(path.join(root, "ktx-booking", "SKILL.md"), SKILL_FM);
  assert.equal(run({ root, check: true }).ok, false);
});

test("run writes deterministic, trailing-newline JSON", () => {
  const root = makeFixtureRoot({ "lotto-results/SKILL.md": SKILL_FM });
  run({ root });
  const raw = fs.readFileSync(manifestPathFor(root), "utf8");
  assert.ok(raw.endsWith("\n"));
  assert.equal(raw, serialize(buildManifest(root)));
});

test("marketplace manifest uses Claude validator-supported top-level keys", () => {
  const marketplacePath = path.join(__dirname, "..", ".claude-plugin", "marketplace.json");
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  assert.deepEqual(Object.keys(marketplace).sort(), ["name", "owner", "plugins"]);
});
