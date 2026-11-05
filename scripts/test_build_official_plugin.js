"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { buildPlan, run, rewriteLocalAccess } = require("./build-official-plugin");

const sourceRoot = path.resolve(__dirname, "..");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-plugin-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of [".claude-plugin", "packages/k-skill-cli/templates", "scripts/official-plugin"]) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }
  fs.copyFileSync(path.join(sourceRoot, ".claude-plugin/plugin.json"), path.join(root, ".claude-plugin/plugin.json"));
  fs.copyFileSync(path.join(sourceRoot, "LICENSE"), path.join(root, "LICENSE"));
  fs.cpSync(path.join(sourceRoot, "packages/k-skill-cli/templates"), path.join(root, "packages/k-skill-cli/templates"), { recursive: true });
  fs.cpSync(path.join(sourceRoot, "scripts/official-plugin"), path.join(root, "scripts/official-plugin"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages/k-skill-cli/src"), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, "packages/k-skill-cli/src/execute.js"), path.join(root, "packages/k-skill-cli/src/execute.js"));
  skill(root, "example", "Read the result.\n");
  return root;
}
function skill(root, name, instruction, profiles = ["lookup"]) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), "existing adapter must not change\n");
  fs.writeFileSync(path.join(dir, "instruction.md"), instruction);
  fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify({
    name, description: `Use when the user asks for ${name} results.`, profiles,
    frontmatter: `name: ${name}\ndescription: Use when the user asks for ${name} results.\nlicense: MIT`,
  }));
}
function text(plan, name) { return plan.files.get(name).toString("utf8"); }

test("builds static instructions without changing the existing adapter", (t) => {
  const root = fixture(t);
  const plan = buildPlan(root);
  const body = text(plan, "skills/example/SKILL.md");
  assert.match(body, /^---\nname: example\n/);
  assert.match(body, /Read the result/);
  assert.match(body, /irreversible external side effect/);
  assert.doesNotMatch(body, /@nomadamas\/k-skill.*(?:instruct|update)/);
  assert.doesNotMatch(body, /mode:|DOLSHOI_ACTION_BROKER_URL/);
  assert.equal(fs.readFileSync(path.join(root, "example/SKILL.md"), "utf8"), "existing adapter must not change\n");
});

test("rewrites CLI asset commands to the bundled runtime, not a registry package", () => {
  const input = "npx -y @nomadamas/k-skill@0 exec example scripts/tool.js -- one\n" +
    "npx --yes @nomadamas/k-skill@0 read example references/rules.md\n";
  const result = rewriteLocalAccess(input);
  assert.doesNotMatch(result, /npx|@nomadamas/);
  assert.match(result, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/runtime\/k-skill.js" exec example/);
});

test("bundles runtime assets and manifest bundle entries, not tests or credentials", (t) => {
  const root = fixture(t);
  const dir = path.join(root, "example");
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.writeFileSync(path.join(dir, "scripts/tool.js"), "console.log('ok');\n");
  fs.writeFileSync(path.join(dir, "scripts/.env"), "not for distribution");
  fs.writeFileSync(path.join(dir, "scripts/test_tool.py"), "test only");
  const plan = buildPlan(root);
  assert.ok(plan.files.has("skills/example/scripts/tool.js"));
  assert.ok(!plan.files.has("skills/example/scripts/.env"));
  assert.ok(!plan.files.has("skills/example/scripts/test_tool.py"));
  assert.equal(text(plan, "runtime/execute.js"), fs.readFileSync(path.join(root, "packages/k-skill-cli/src/execute.js"), "utf8"));
});

test("rejects links and path traversal rather than following them", (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "example/references"));
  fs.symlinkSync(path.join(root, "LICENSE"), path.join(root, "example/references/license.md"));
  assert.throws(() => buildPlan(root), /symbolic link/);
});

test("fails when an included skill still fetches behavioral instructions", (t) => {
  const root = fixture(t);
  skill(root, "unsafe", "Run `npx -y @nomadamas/k-skill@0 instruct unsafe` first.\n");
  assert.throws(() => buildPlan(root), /external.*instruction/i);
});

test("documents heyyumi's exclusion without deleting or changing its source", (t) => {
  const root = fixture(t);
  skill(root, "heyyumi", "Run `npx -y heyyumi guide` and follow the server rules.\n");
  const plan = buildPlan(root);
  assert.deepEqual(plan.skills, ["example"]);
  assert.equal(plan.excluded[0].name, "heyyumi");
  assert.match(text(plan, "README.md"), /heyyumi/);
  assert.ok(fs.existsSync(path.join(root, "heyyumi/SKILL.md")));
});

test("official setup checks this bundle instead of installing mutable CLI stubs", (t) => {
  const root = fixture(t);
  skill(root, "k-skill-setup", "npx -y @nomadamas/k-skill@0 instruct k-skill-setup\n", ["operations"]);
  const body = text(buildPlan(root), "skills/k-skill-setup/SKILL.md");
  assert.doesNotMatch(body, /\binstruct\b|skills add|marketplace add|@latest/);
  assert.match(body, /runtime\/k-skill.js/);
});

test("check mode catches content, extra-file, missing-file and permission drift", (t) => {
  const root = fixture(t);
  const output = path.join(root, "packages/k-skill-plugin");
  assert.equal(run({ root, output }).ok, true);
  assert.equal(run({ root, output, check: true }).ok, true);
  const readme = path.join(output, "README.md");
  fs.appendFileSync(readme, "drift\n");
  assert.equal(run({ root, output, check: true }).ok, false);
  run({ root, output });
  fs.writeFileSync(path.join(output, "unexpected.txt"), "drift");
  assert.equal(run({ root, output, check: true }).ok, false);
  run({ root, output });
  fs.unlinkSync(readme);
  assert.equal(run({ root, output, check: true }).ok, false);
});

test("protects awk argument literals from native skill invocation substitution", (t) => {
  const root = fixture(t);
  skill(root, "awk-example", "```sh\nawk '{ print $0 }' input.txt\n```\n");
  const plan = buildPlan(root);
  const body = text(plan, "skills/awk-example/SKILL.md");
  assert.ok(!body.includes("$0"));
  assert.ok(text(plan, "skills/awk-example/references/k-skill-official-workflow.md").includes("print $0"));
  assert.match(fs.readFileSync(path.join(root, "awk-example/instruction.md"), "utf8"), /print \$0/);
});

test("long workflows stay in a packaged reference rather than overflowing SKILL.md", (t) => {
  const root = fixture(t);
  skill(root, "long-example", "# Long workflow\n\n## Steps\n" + "A reviewed step.\n".repeat(510));
  const plan = buildPlan(root);
  assert.ok(text(plan, "skills/long-example/SKILL.md").split("\n").length < 500);
  assert.match(text(plan, "skills/long-example/SKILL.md"), /references\/k-skill-official-workflow.md/);
  assert.match(text(plan, "skills/long-example/references/k-skill-official-workflow.md"), /A reviewed step/);
});

test("refuses output directory symlinks without writing through them", (t) => {
  const root = fixture(t);
  const output = path.join(root, "packages/k-skill-plugin");
  fs.mkdirSync(path.join(root, "untouched"));
  fs.symlinkSync(path.join(root, "untouched"), output);
  assert.throws(() => run({ root, output }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(path.join(root, "untouched")), []);
});

test("bundled runtime reads local references, executes local helpers, and rejects instruct", (t) => {
  const root = fixture(t);
  const dir = path.join(root, "example");
  fs.mkdirSync(path.join(dir, "references"));
  fs.writeFileSync(path.join(dir, "references/rules.md"), "Local reviewed rules.\n");
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.writeFileSync(path.join(dir, "scripts/echo.js"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
  const output = path.join(root, "packages/k-skill-plugin");
  run({ root, output });
  const cli = path.join(output, "runtime/k-skill.js");
  function call(...args) { return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" }); }
  assert.equal(call("read", "example", "references/rules.md").stdout, "Local reviewed rules.\n");
  const executed = call("exec", "example", "scripts/echo.js", "--", "a; echo unsafe", "two words");
  assert.equal(executed.status, 0);
  assert.deepEqual(JSON.parse(executed.stdout), ["a; echo unsafe", "two words"]);
  assert.notEqual(call("read", "example", "../../LICENSE").status, 0);
  assert.notEqual(call("read", "../example", "references/rules.md").status, 0);
  assert.notEqual(call("instruct", "example").status, 0);
  assert.notEqual(call("update").status, 0);
});


test("bundles root legal notices and links them from the native skill", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "example/NOTICE"), "Upstream attribution.\n");
  fs.writeFileSync(path.join(root, "example/DISCLAIMER.md"), "Read this legal notice.\n");
  const plan = buildPlan(root);
  assert.equal(text(plan, "skills/example/NOTICE"), "Upstream attribution.\n");
  assert.match(text(plan, "skills/example/SKILL.md"), /\[DISCLAIMER\.md\]\(DISCLAIMER\.md\)/);
});

test("concrete helper and reference commands in the real bundle resolve locally", () => {
  const plan = buildPlan(sourceRoot);
  let checked = 0;
  for (const [name, bytes] of plan.files) {
    if (!name.endsWith(".md")) continue;
    const pattern = /node "\$\{CLAUDE_PLUGIN_ROOT\}\/runtime\/k-skill\.js"\s+(?:exec|read|path)\s+([a-z0-9-]+)\s+((?:scripts|references)\/[a-zA-Z0-9_./-]+\.(?:py|js|mjs|cjs|sh|md|json|pin|txt))\b/g;
    for (const match of bytes.toString("utf8").matchAll(pattern)) {
      assert.ok(plan.files.has(`skills/${match[1]}/${match[2]}`), `${name}: missing ${match[1]}/${match[2]}`);
      checked++;
    }
  }
  assert.ok(checked > 100, `only checked ${checked} concrete local asset commands`);
});
