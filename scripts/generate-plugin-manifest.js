#!/usr/bin/env node
/**
 * Generate / refresh the Claude Code plugin manifest's `skills` list.
 *
 * This repo is a flat collection of `<skill-name>/SKILL.md` directories at the
 * repo root (NOT under a `skills/` folder), because the npm workspaces +
 * changesets release pipeline depends on that layout. A Claude Code plugin can
 * still expose them by listing each skill directory in the `skills` array of
 * `.claude-plugin/plugin.json` (the field accepts custom directory paths in
 * addition to the default `skills/` dir).
 *
 * Skill discovery mirrors scripts/validate-skills.sh and
 * scripts/build-manus-bundle.js. This script writes the sorted `skills` array
 * into `.claude-plugin/plugin.json` while preserving every other field.
 *
 * Usage:
 *   node scripts/generate-plugin-manifest.js           # write/update plugin.json
 *   node scripts/generate-plugin-manifest.js --check    # exit 1 if out of date
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

// Root-level directories that are never skills. Superset of the exclusion
// lists in scripts/validate-skills.sh and scripts/build-manus-bundle.js so
// that test fixtures under tools/ never leak in. Dot-directories are excluded
// unconditionally below; they are listed here only for documentation.
const EXCLUDED_DIRS = new Set([
  ".git",
  ".github",
  ".codex",
  ".claude",
  ".omc",
  ".omx",
  ".ouroboros",
  ".changeset",
  ".cursor",
  ".vscode",
  ".sisyphus",
  ".idea",
  "docs",
  "dist",
  "legacy",
  "node_modules",
  "packages",
  "python-packages",
  "scripts",
  "examples",
  "tools",
]);

// Skills that exist on disk but must not ship in the plugin (e.g. upstream
// blocked automation and the skill no longer works).
const EXCLUDED_SKILLS = new Set(["blue-ribbon-nearby", "naver-map-route"]);

// Identity fields used when the manifest does not exist yet. Existing values
// are never overwritten; only missing keys are backfilled.
const DEFAULT_MANIFEST = {
  name: "k-skill",
  description:
    "한국인을 위한 90+ Agent Skill 모음 — SRT/KTX/당근/쿠팡/카톡/정부24 등 한국 일상·업무 자동화",
  version: "1.0.0",
  author: { name: "NomaDamas" },
  homepage: "https://github.com/NomaDamas/k-skill",
  repository: "https://github.com/NomaDamas/k-skill",
  license: "MIT",
  skills: [],
};

function manifestPathFor(root) {
  return path.join(root, ".claude-plugin", "plugin.json");
}

/**
 * Discover skill directories (those containing a SKILL.md) directly under
 * `root`, returning sorted plugin-relative paths like `./lotto-results`.
 */
function discoverSkillPaths(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    if (EXCLUDED_SKILLS.has(entry.name)) continue;
    const skillMd = path.join(root, entry.name, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      skills.push(`./${entry.name}`);
    }
  }
  skills.sort();
  return skills;
}

/** Build the manifest object, preserving existing fields and refreshing skills. */
function buildManifest(root) {
  const manifestPath = manifestPathFor(root);
  let manifest = { ...DEFAULT_MANIFEST };
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const [key, value] of Object.entries(DEFAULT_MANIFEST)) {
      if (key === "skills") continue;
      if (manifest[key] === undefined) manifest[key] = value;
    }
  }
  manifest.skills = discoverSkillPaths(root);
  return manifest;
}

function serialize(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Core entry point usable from tests.
 * @returns {{ ok: boolean, manifest: object, current: string, next: string, written?: boolean }}
 */
function run({ root = repoRoot, check = false } = {}) {
  const manifestPath = manifestPathFor(root);
  const manifest = buildManifest(root);
  const next = serialize(manifest);
  const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";

  if (check) {
    return { ok: current === next, manifest, current, next };
  }

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, next);
  return { ok: true, manifest, current, next, written: true };
}

function main() {
  const check = process.argv.includes("--check");
  const result = run({ check });
  const count = result.manifest.skills.length;

  if (check) {
    if (!result.ok) {
      console.error(
        "plugin.json is out of date. Run `node scripts/generate-plugin-manifest.js` and commit the result.",
      );
      let currentSkills = [];
      try {
        currentSkills = result.current ? JSON.parse(result.current).skills || [] : [];
      } catch {
        /* malformed current manifest; treat as empty for the diff */
      }
      const nextSkills = result.manifest.skills;
      const added = nextSkills.filter((s) => !currentSkills.includes(s));
      const removed = currentSkills.filter((s) => !nextSkills.includes(s));
      if (added.length) console.error(`  + ${added.join(", ")}`);
      if (removed.length) console.error(`  - ${removed.join(", ")}`);
      process.exit(1);
    }
    console.log(`plugin.json is up to date (${count} skills).`);
    return;
  }

  console.log(`Wrote .claude-plugin/plugin.json with ${count} skills.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  EXCLUDED_DIRS,
  EXCLUDED_SKILLS,
  DEFAULT_MANIFEST,
  discoverSkillPaths,
  buildManifest,
  serialize,
  run,
  manifestPathFor,
};
