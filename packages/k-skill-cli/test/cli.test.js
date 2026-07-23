const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const { assemble, bundledFiles, listSkills, renderTemplate, KNOWN_PROFILES } = require("../src/assemble");
const { detectRuntime } = require("../src/detect");

const packageRoot = path.join(__dirname, "..");
const binPath = path.join(packageRoot, "bin", "k-skill.js");

const GENERIC = { mode: "generic", dolshoi: false, cloakBrowser: false };
const DOLSHOI = { mode: "dolshoi", dolshoi: true, cloakBrowser: true };

test("detectRuntime is capability-based", () => {
  assert.equal(detectRuntime({}).mode, "generic");
  assert.equal(detectRuntime({ DOLSHOI_ACTION_BROKER_URL: "http://x" }).mode, "dolshoi");
  assert.equal(detectRuntime({ CLOAKBROWSER_PEEK_TOKEN: "t" }).mode, "generic");
  assert.equal(detectRuntime({ CLOAKBROWSER_PEEK_TOKEN: "t" }).cloakBrowser, true);
});

test("renderTemplate emits only always + matching mode sections", () => {
  const raw = "<!-- mode:always -->\n- both\n<!-- mode:dolshoi -->\n- dolshoi only\n<!-- mode:generic -->\n- generic only\n";

  assert.equal(renderTemplate(raw, "dolshoi"), "- both\n- dolshoi only");
  assert.equal(renderTemplate(raw, "generic"), "- both\n- generic only");
});

test("every bundled skill declares only known profiles and assembles in both modes", () => {
  const skills = listSkills();

  assert.ok(skills.length >= 5, "expected at least the five pilot skills to be bundled");

  for (const skillName of skills) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "skills", skillName, "skill.json"), "utf8"),
    );

    for (const profile of manifest.profiles) {
      assert.ok(KNOWN_PROFILES.includes(profile), `${skillName} profile ${profile} must be known`);
    }

    for (const runtime of [GENERIC, DOLSHOI]) {
      const output = assemble(skillName, runtime);

      assert.match(output, /^# .+ — assembled instructions/, `${skillName} ${runtime.mode} header`);
      assert.match(output, /## Runtime rules/);
      assert.match(output, /call `clarify`/, `${skillName} must keep the clarify boundary in ${runtime.mode}`);
      assert.doesNotMatch(output, /<!-- mode:/, `${skillName} ${runtime.mode} must not leak mode markers`);
    }
  }
});

function runtimeRulesSection(output) {
  const match = output.match(/## Runtime rules\n([\s\S]*?)\n\n# /);
  assert.ok(match, "expected a Runtime rules section followed by the skill body");
  return match[1];
}

test("dolshoi and generic runtime rules differ for vault/browser skills", () => {
  const generic = runtimeRulesSection(assemble("srt-booking", GENERIC));
  const dolshoi = runtimeRulesSection(assemble("srt-booking", DOLSHOI));

  assert.match(dolshoi, /request_vault_credential/);
  assert.doesNotMatch(generic, /request_vault_credential/);
  assert.match(generic, /~\/\.config\/k-skill\/secrets\.env/);
  assert.doesNotMatch(dolshoi, /secrets\.env/);
  assert.match(dolshoi, /CloakBrowser first/);
  assert.match(generic, /Do not automate payment here/);
  assert.doesNotMatch(dolshoi, /Do not automate payment here/);
});

test("hard-boundary skill keeps its boundary in dolshoi mode", () => {
  const dolshoi = assemble("yebigun-training", DOLSHOI);

  assert.match(dolshoi, /never automate the bounded final step/);
});

test("bundledFiles lists helper files for directory-package skills", () => {
  const files = bundledFiles("kosis-stats");

  assert.ok(files.some((f) => f.endsWith("scripts/run_kosis_stats.py")));
  assert.ok(files.some((f) => f.endsWith("references/kosis-openapi-guide.md")));
  assert.ok(bundledFiles("srt-booking").some((f) => f.endsWith("scripts/srt_booking.py")));
});

test("assembled instructions match committed snapshots", () => {
  const snapshotDir = path.join(__dirname, "snapshots");
  const update = process.env.UPDATE_SNAPSHOTS === "1";

  for (const skillName of listSkills()) {
    for (const runtime of [GENERIC, DOLSHOI]) {
      const output = assemble(skillName, runtime);
      const snapshotPath = path.join(snapshotDir, `${skillName}.${runtime.mode}.md`);

      if (update) {
        fs.mkdirSync(snapshotDir, { recursive: true });
        fs.writeFileSync(snapshotPath, output);
        continue;
      }

      assert.ok(fs.existsSync(snapshotPath), `missing snapshot ${skillName}.${runtime.mode}.md — run UPDATE_SNAPSHOTS=1 npm test`);
      assert.equal(
        output,
        fs.readFileSync(snapshotPath, "utf8"),
        `${skillName} ${runtime.mode} assembly drifted from its snapshot — review the diff, then run UPDATE_SNAPSHOTS=1 npm test`,
      );
    }
  }
});

test("CLI binary handles instruct, files, list, and errors", () => {
  const run = (args, env = {}) =>
    childProcess.spawnSync("node", [binPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, DOLSHOI_ACTION_BROKER_URL: "", CLOAKBROWSER_PEEK_TOKEN: "", ...env },
    });

  const list = run(["list"]);
  assert.equal(list.status, 0);
  assert.ok(list.stdout.includes("srt-booking"));

  const generic = run(["instruct", "srt-booking"]);
  assert.equal(generic.status, 0);
  assert.match(generic.stdout, /Runtime mode: generic/);

  const dolshoi = run(["instruct", "srt-booking"], { DOLSHOI_ACTION_BROKER_URL: "http://x" });
  assert.match(dolshoi.stdout, /Runtime mode: dolshoi/);

  const unknown = run(["instruct", "nope"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown skill/);

  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: k-skill/);
});
