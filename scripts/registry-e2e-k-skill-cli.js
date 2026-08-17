#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const packageRoot = process.env.KSKILL_REGISTRY_PACKAGE_ROOT;
if (!packageRoot) {
  console.error("KSKILL_REGISTRY_PACKAGE_ROOT must point to the registry-installed package");
  process.exit(1);
}

const expectedVersion = process.env.KSKILL_REGISTRY_VERSION || "0.2.1";
const binPath = path.join(packageRoot, "bin", "k-skill.js");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const failures = [];

function run(args, env = {}) {
  return childProcess.spawnSync(process.execPath, [binPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DOLSHOI_ACTION_BROKER_URL: "",
      CLOAKBROWSER_PEEK_TOKEN: "",
      ...env,
    },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000,
  });
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(packageJson.name === "@nomadamas/k-skill", `unexpected package name: ${packageJson.name}`);
check(packageJson.version === expectedVersion, `expected ${expectedVersion}, got ${packageJson.version}`);

const list = run(["list"]);
check(list.status === 0, `list failed: ${list.stderr}`);
const skills = list.stdout.trim().split("\n").filter(Boolean);
check(skills.length === 119, `expected 119 skills, got ${skills.length}`);
check(new Set(skills).size === skills.length, "skill list contains duplicates");

const unresolvedScript =
  /(?:python3?|node|bash|uv\s+run)\s+(?:"?\$SKILL_DIR\/|\.\/[a-z0-9-]+\/|[a-z0-9-]+\/|\.\/)?scripts\//;
const unresolvedReference = /\]\((?:\.\/)?references\//;

for (const skill of skills) {
  const generic = run(["instruct", skill]);
  check(generic.status === 0, `${skill} generic assembly failed: ${generic.stderr}`);
  check(generic.stdout.includes("Runtime mode: generic"), `${skill} generic mode marker missing`);
  check(!unresolvedScript.test(generic.stdout), `${skill} generic output has relative script execution`);
  check(!unresolvedReference.test(generic.stdout), `${skill} generic output has relative reference link`);

  const dolshoi = run(["instruct", skill], {
    DOLSHOI_ACTION_BROKER_URL: "http://registry-e2e.invalid",
    CLOAKBROWSER_PEEK_TOKEN: "registry-e2e",
  });
  check(dolshoi.status === 0, `${skill} Dolshoi assembly failed: ${dolshoi.stderr}`);
  check(
    dolshoi.stdout.includes("Runtime mode: dolshoi (CloakBrowser available)"),
    `${skill} Dolshoi mode marker missing`,
  );
  check(!unresolvedScript.test(dolshoi.stdout), `${skill} Dolshoi output has relative script execution`);
  check(!unresolvedReference.test(dolshoi.stdout), `${skill} Dolshoi output has relative reference link`);
}

const assets = [];
for (const skill of skills) {
  const result = run(["files", skill]);
  check(result.status === 0, `${skill} files failed: ${result.stderr}`);

  for (const filePath of result.stdout.trim().split("\n").filter(Boolean)) {
    const marker = `${path.sep}skills${path.sep}${skill}${path.sep}`;
    const index = filePath.indexOf(marker);
    if (index === -1) continue;
    const relativePath = filePath.slice(index + marker.length).split(path.sep).join("/");
    if (relativePath.startsWith("scripts/") || relativePath.startsWith("references/")) {
      assets.push({ skill, relativePath, filePath });
    }
  }
}

check(assets.length === 93, `expected 93 script/reference assets, got ${assets.length}`);
check(
  new Set(assets.map(({ skill, relativePath }) => `${skill}:${relativePath}`)).size === assets.length,
  "asset inventory contains duplicates",
);

for (const asset of assets) {
  const result = run(["path", asset.skill, asset.relativePath]);
  check(result.status === 0, `${asset.skill}/${asset.relativePath} path failed: ${result.stderr}`);
  check(
    path.resolve(result.stdout.trim()) === path.resolve(asset.filePath),
    `${asset.skill}/${asset.relativePath} path mismatch`,
  );
  check(fs.existsSync(result.stdout.trim()), `${asset.skill}/${asset.relativePath} path does not exist`);
}

const references = assets.filter(({ relativePath }) => relativePath.startsWith("references/"));
check(references.length === 8, `expected 8 references, got ${references.length}`);
for (const reference of references) {
  const result = run(["read", reference.skill, reference.relativePath]);
  check(result.status === 0, `${reference.skill}/${reference.relativePath} read failed: ${result.stderr}`);
  check(result.stdout.trim().length > 0, `${reference.skill}/${reference.relativePath} is empty`);
}

const nodeExec = run([
  "exec",
  "korean-character-count",
  "scripts/korean_character_count.js",
  "--",
  "--text",
  "가나다",
  "--format",
  "json",
]);
check(nodeExec.status === 0, `Node helper failed: ${nodeExec.stderr}`);
if (nodeExec.status === 0) {
  check(JSON.parse(nodeExec.stdout).counts.characters === 3, "Node helper returned wrong count");
}

const pythonExec = run([
  "exec",
  "kosis-stats",
  "scripts/run_kosis_stats.py",
  "--",
  "search",
  "--query",
  "인구",
  "--dry-run",
]);
check(pythonExec.status === 0, `Python helper failed: ${pythonExec.stderr}`);
check(
  pythonExec.stdout.includes("/v1/kosis/search") && pythonExec.stdout.includes("searchNm=%EC%9D%B8%EA%B5%AC"),
  "Python helper dry-run URL missing",
);

const uvExec = run(["exec", "popbill", "scripts/popbill_cli.py", "--", "--help"]);
check(uvExec.status === 0, `uv helper failed: ${uvExec.stderr}`);
check(/usage:/i.test(uvExec.stdout), "uv helper help output missing");

const help = run(["--help"]);
check(help.status === 0, `help failed: ${help.stderr}`);
for (const command of ["instruct", "exec", "read", "path", "files", "list"]) {
  check(help.stdout.includes(command), `help omits ${command}`);
}

const unknownSkill = run(["instruct", "not-a-real-skill"]);
check(unknownSkill.status === 1, "unknown skill should exit 1");
check(unknownSkill.stderr.includes("unknown skill"), "unknown skill error missing");

const traversal = run(["path", "kosis-stats", "../../package.json"]);
check(traversal.status === 1, "path traversal should exit 1");
check(traversal.stderr.includes("must stay inside"), "path traversal error missing");

const missingAsset = run(["exec", "kosis-stats", "scripts/missing.py"]);
check(missingAsset.status === 1, "missing asset should exit 1");
check(missingAsset.stderr.includes("not bundled"), "missing asset error missing");

const report = {
  package: packageJson.name,
  version: packageJson.version,
  skills: skills.length,
  genericAssemblies: skills.length,
  dolshoiAssemblies: skills.length,
  assets: assets.length,
  scripts: assets.filter(({ relativePath }) => relativePath.startsWith("scripts/")).length,
  references: references.length,
  pathChecks: assets.length,
  referenceReads: references.length,
  representativeExec: ["node", "python", "uv"],
  invalidInputChecks: ["unknown-skill", "path-traversal", "missing-asset"],
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
