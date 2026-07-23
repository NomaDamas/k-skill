#!/usr/bin/env node
// Syncs pilot skill sources (skill.json, instruction.md, scripts/, references/)
// into packages/k-skill-cli/skills so the npm package bundles them.
// --check verifies the synced copies are up to date without writing.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const targetRoot = path.join(repoRoot, "packages", "k-skill-cli", "skills");

function cliManagedSkills() {
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(repoRoot, name, "skill.json")))
    .sort();
}

function collectSources(skillName) {
  const skillDir = path.join(repoRoot, skillName);
  const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, "skill.json"), "utf8"));
  const pairs = [
    [path.join(skillDir, "skill.json"), "skill.json"],
    [path.join(skillDir, "instruction.md"), "instruction.md"],
  ];

  for (const sub of ["scripts", "references"]) {
    const subDir = path.join(skillDir, sub);
    if (!fs.existsSync(subDir)) continue;
    const stack = [subDir];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name === "__pycache__" || entry.name.startsWith(".")) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else pairs.push([full, path.relative(skillDir, full)]);
      }
    }
  }

  for (const item of manifest.bundle ?? []) {
    pairs.push([path.join(repoRoot, item.from), item.to]);
  }

  return pairs;
}

function main() {
  const check = process.argv.includes("--check");
  const skills = cliManagedSkills();
  let stale = 0;

  for (const skillName of skills) {
    for (const [source, relTarget] of collectSources(skillName)) {
      const target = path.join(targetRoot, skillName, relTarget);
      const sourceBody = fs.readFileSync(source);

      if (check) {
        if (!fs.existsSync(target) || !sourceBody.equals(fs.readFileSync(target))) {
          console.error(`stale: packages/k-skill-cli/skills/${skillName}/${relTarget}`);
          stale += 1;
        }
        continue;
      }

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, sourceBody);
    }
  }

  if (check && stale > 0) {
    console.error(`\n${stale} bundled file(s) out of date. Run: node scripts/sync-cli-skills.js`);
    process.exit(1);
  }

  console.log(
    check
      ? `bundled skill files are up to date (${skills.length} skills)`
      : `synced ${skills.length} skills into packages/k-skill-cli/skills`,
  );
}

main();
