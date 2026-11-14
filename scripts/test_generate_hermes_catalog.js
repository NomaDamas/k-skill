"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildCatalog, serialize, run, catalogPathFor } = require("./generate-hermes-catalog.js");

function fixtureRoot(skills) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-hermes-catalog-"));
  for (const [name, manifest] of Object.entries(skills)) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, "skill.json"), JSON.stringify(manifest));
  }
  fs.mkdirSync(path.join(root, "hermes-plugin"), { recursive: true });
  return root;
}

const FM = (name, category) =>
  `name: ${name}\ndescription: ignored-here\nlicense: MIT\nmetadata:\n  category: ${category}\n  locale: ko-KR`;

test("catalog lists every skill.json dir sorted, with category and profiles", () => {
  const root = fixtureRoot({
    "zeta-skill": { name: "zeta-skill", description: "Z 설명", profiles: ["lookup"], frontmatter: FM("zeta-skill", "transit") },
    "alpha-skill": { name: "alpha-skill", description: "A desc", profiles: ["proxy", "lookup"], frontmatter: FM("alpha-skill", "finance") },
  });
  fs.mkdirSync(path.join(root, "not-a-skill"));
  const catalog = buildCatalog(root);
  assert.deepEqual(
    catalog.map((e) => e.name),
    ["alpha-skill", "zeta-skill"],
  );
  assert.deepEqual(catalog[0], {
    name: "alpha-skill",
    description: "A desc",
    category: "finance",
    profiles: ["proxy", "lookup"],
    triggers: [],
  });
});

test("triggers are the quoted When-to-use bullets of instruction.md (Korean search recall)", () => {
  const root = fixtureRoot({
    "dust": { name: "dust", description: "Use when checking AirKorea fine dust", profiles: [], frontmatter: FM("dust", "health") },
  });
  fs.writeFileSync(
    path.join(root, "dust", "instruction.md"),
    '# Dust\n\n## When to use\n\n- "지금 내 위치 미세먼지 어때?"\n- 여기 공기질 괜찮아?\n\n## Inputs\n\n- not-a-trigger\n',
  );
  assert.deepEqual(buildCatalog(root)[0].triggers, ["지금 내 위치 미세먼지 어때?", "여기 공기질 괜찮아?"]);
});

test("skills without a category get null instead of crashing", () => {
  const root = fixtureRoot({
    "odd-skill": { name: "odd-skill", description: "d", profiles: [], frontmatter: "name: odd-skill\ndescription: d" },
  });
  assert.equal(buildCatalog(root)[0].category, null);
});

test("skill whose manifest name disagrees with its directory is rejected", () => {
  const root = fixtureRoot({
    "dir-name": { name: "other-name", description: "d", profiles: [] },
  });
  assert.throws(() => buildCatalog(root), /dir-name.*other-name/);
});

test("skill with empty description is rejected", () => {
  const root = fixtureRoot({ "blank": { name: "blank", description: "  ", profiles: [] } });
  assert.throws(() => buildCatalog(root), /blank.*description/);
});

test("run writes hermes-plugin/catalog.json and --check detects drift", () => {
  const root = fixtureRoot({
    "a-skill": { name: "a-skill", description: "d", profiles: ["lookup"], frontmatter: FM("a-skill", "x") },
  });
  assert.equal(run({ root, check: true }).ok, false, "missing catalog must fail check");
  assert.equal(run({ root }).written, true);
  assert.ok(fs.existsSync(catalogPathFor(root)));
  assert.equal(run({ root, check: true }).ok, true);

  fs.writeFileSync(catalogPathFor(root), serialize([]));
  assert.equal(run({ root, check: true }).ok, false, "stale catalog must fail check");
});

test("serialize is stable, UTF-8 and newline terminated", () => {
  const text = serialize([{ name: "n", description: "한글", category: null, profiles: [] }]);
  assert.ok(text.endsWith("\n"));
  assert.ok(text.includes("한글"), "Korean must not be \\u-escaped");
});

test("the committed catalog matches the real repo", () => {
  const result = run({ check: true });
  assert.equal(result.ok, true, "run `node scripts/generate-hermes-catalog.js`");
});
