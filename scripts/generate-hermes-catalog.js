#!/usr/bin/env node
/**
 * Generate hermes-plugin/catalog.json — the offline search index the Hermes
 * plugin uses for `kskill_search`.
 *
 * Source of truth is each skill's `skill.json` (name, description, profiles,
 * frontmatter category) plus the quoted bullets under the `## When to use`
 * section of its `instruction.md` (Korean trigger phrases, which the English
 * descriptions often lack). Run this whenever a skill is added, removed or its
 * description / trigger list changes; `--check` is wired into `npm run lint`.
 *
 * Usage:
 *   node scripts/generate-hermes-catalog.js           # write catalog.json
 *   node scripts/generate-hermes-catalog.js --check   # fail when stale/missing
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const MAX_TRIGGERS = 12;
const MAX_TRIGGER_CHARS = 120;
const WHEN_HEADING = /^##\s+(?:when to use|when to trigger|언제 쓰[나는]|사용 시점|사용 시기|트리거)\b.*$/im;

function catalogPathFor(root) {
  return path.join(root, "hermes-plugin", "catalog.json");
}

function readCategory(frontmatter) {
  const match = /^ {2}category:\s*(.+?)\s*$/m.exec(frontmatter || "");
  return match ? match[1] : null;
}

function stripQuotes(text) {
  return text
    .trim()
    .replace(/^[`"'“”‘’「『]+/, "")
    .replace(/[`"'“”‘’」』]+$/, "")
    .trim();
}

function readTriggers(skillDir) {
  const file = path.join(skillDir, "instruction.md");
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  const heading = WHEN_HEADING.exec(text);
  if (!heading) return [];
  const rest = text.slice(heading.index + heading[0].length);
  const next = rest.search(/^#{1,2}\s/m);
  const section = next === -1 ? rest : rest.slice(0, next);
  const triggers = [];
  for (const line of section.split("\n")) {
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (!bullet) continue;
    const value = stripQuotes(bullet[1]).slice(0, MAX_TRIGGER_CHARS);
    if (value) triggers.push(value);
    if (triggers.length >= MAX_TRIGGERS) break;
  }
  return triggers;
}

function buildCatalog(root = repoRoot) {
  const entries = [];
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "skill.json")))
    .map((entry) => entry.name)
    .sort();

  for (const dir of dirs) {
    const skillDir = path.join(root, dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, "skill.json"), "utf8"));
    if (manifest.name !== dir) {
      throw new Error(`${dir}/skill.json declares name "${manifest.name}" but the directory is "${dir}"`);
    }
    if (typeof manifest.description !== "string" || !manifest.description.trim()) {
      throw new Error(`${dir}/skill.json has an empty description`);
    }
    entries.push({
      name: dir,
      description: manifest.description.trim(),
      category: readCategory(manifest.frontmatter),
      profiles: Array.isArray(manifest.profiles) ? manifest.profiles : [],
      triggers: readTriggers(skillDir),
    });
  }

  return entries;
}

function serialize(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function run({ root = repoRoot, check = false } = {}) {
  const target = catalogPathFor(root);
  const next = serialize(buildCatalog(root));
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;

  if (check) {
    return { ok: current !== null && current.replace(/\r\n/g, "\n") === next, current, next };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, next);
  return { ok: true, written: true, next };
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  const result = run({ check });
  if (check) {
    if (!result.ok) {
      console.error("hermes-plugin/catalog.json is missing or stale. Run: node scripts/generate-hermes-catalog.js");
      process.exit(1);
    }
    console.log("hermes-plugin/catalog.json is up to date");
  } else {
    console.log(`wrote ${path.relative(repoRoot, catalogPathFor(repoRoot))} (${JSON.parse(result.next).length} skills)`);
  }
}

module.exports = { buildCatalog, catalogPathFor, run, serialize };
