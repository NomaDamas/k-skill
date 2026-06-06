#!/usr/bin/env node
/**
 * Build Manus.ai-compatible bundles for k-skill.
 *
 * Manus accepts ONE skill per upload (`.skill`/`.zip`/folder) and offers no
 * multi-skill bulk import path, so this script emits one `.skill` per skill
 * plus a single combined download archive.
 *
 * Each `.skill` archive contains a single top-level `<skill-name>/` folder
 * that matches the layout produced by the public Anthropic skill-creator
 * packager (https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/package_skill.py).
 * That nested layout is load-bearing: flattening it breaks Manus import.
 *
 * Skill discovery mirrors `scripts/validate-skills.sh`. Requires the system
 * `zip` command (preinstalled on macOS and GitHub Actions ubuntu-latest).
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist", "manus");

// Directories at the repo root that are NEVER skills, mirroring
// scripts/validate-skills.sh's exclusion list.
const EXCLUDED_DIRS = new Set([
  ".git",
  ".github",
  ".codex",
  ".claude",
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
]);

function ensureZipAvailable() {
  const probe = spawnSync("zip", ["-v"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    console.error(
      "ERROR: the `zip` command is required to build Manus bundles.\n" +
        "  - macOS: preinstalled.\n" +
        "  - Debian/Ubuntu: sudo apt-get install -y zip\n" +
        "  - Windows: install via WSL or Git Bash, or use 7-Zip and zip the folders manually.",
    );
    process.exit(2);
  }
}

function discoverSkills() {
  const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;
    const skillMd = path.join(repoRoot, entry.name, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      skills.push(entry.name);
    }
  }
  skills.sort();
  return skills;
}

function readSkillMeta(skillName) {
  const skillMd = path.join(repoRoot, skillName, "SKILL.md");
  const raw = fs.readFileSync(skillMd, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: skillName, description: "" };
  const fm = match[1];
  const grab = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return {
    name: grab("name") || skillName,
    description: grab("description"),
  };
}

function rimrafSync(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function buildSkillArchive(skillName) {
  const archivePath = path.join(distDir, `${skillName}.skill`);
  rimrafSync(archivePath);
  // zip is run from the repo root and asked to add the whole `<skillName>/`
  // folder; the resulting archive therefore has `<skillName>/SKILL.md` etc. at
  // its root, which matches the public Anthropic packager layout.
  const result = spawnSync(
    "zip",
    [
      "-r",
      "-q",
      "-X", // strip extra file attributes for reproducible archives
      archivePath,
      skillName,
      "-x",
      `${skillName}/node_modules/*`,
      "-x",
      `${skillName}/__pycache__/*`,
      "-x",
      `${skillName}/*/__pycache__/*`,
      "-x",
      `${skillName}/.DS_Store`,
      "-x",
      `${skillName}/*/.DS_Store`,
    ],
    { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.status !== 0) {
    throw new Error(`zip failed for ${skillName} (exit ${result.status})`);
  }
  return archivePath;
}

function buildAllInOneArchive(skillNames) {
  // Bundle all the .skill files together so users can download a single
  // release asset and then drag-drop the individual .skill files into Manus.
  const allInOne = path.join(distDir, "k-skill-manus-all.zip");
  rimrafSync(allInOne);
  const relativeNames = skillNames.map((s) => `${s}.skill`);
  relativeNames.push("INDEX.md");
  const result = spawnSync("zip", ["-q", "-X", "-j", allInOne, ...relativeNames.map((n) => path.join(distDir, n))], {
    cwd: distDir,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`zip failed for k-skill-manus-all.zip (exit ${result.status})`);
  }
  return allInOne;
}

function writeIndex(skillMetas) {
  const lines = [];
  lines.push("# k-skill — Manus.ai 가져오기용 번들");
  lines.push("");
  lines.push("이 폴더에는 NomaDamas/k-skill 의 모든 스킬이 Manus.ai 호환 `.skill` 아카이브로 빌드되어 있다.");
  lines.push("");
  lines.push("## 사용 방법");
  lines.push("");
  lines.push("1. Manus.ai 에서 **스킬 업로드** 화면을 연다.");
  lines.push("2. 원하는 `<skill-name>.skill` 파일을 드래그-드롭하거나 파일 선택으로 업로드한다.");
  lines.push("3. 한 번의 업로드는 한 개의 스킬을 등록한다. 필요한 스킬만큼 반복한다.");
  lines.push("");
  lines.push("`.skill` 파일은 사실상 ZIP 아카이브이며, 내부에는 단일 최상위 폴더 `<skill-name>/`(SKILL.md + 보조 리소스)가 들어 있다.");
  lines.push("");
  lines.push("Manus.ai 는 **하나의 아카이브로 여러 스킬을 한꺼번에 등록하는 기능을 공식 지원하지 않는다.** `k-skill-manus-all.zip` 은 단순히 모든 `.skill` 파일을 한 번에 받기 위한 편의 번들이다. 압축을 풀면 N개의 `.skill` 파일이 나오며 그 파일들을 Manus 에 하나씩 업로드해야 한다.");
  lines.push("");
  lines.push("## 포함된 스킬");
  lines.push("");
  lines.push("| 스킬 이름 | 설명 | 파일 |");
  lines.push("| --- | --- | --- |");
  for (const meta of skillMetas) {
    const desc = (meta.description || "").replace(/\|/g, "\\|");
    lines.push(`| \`${meta.name}\` | ${desc} | \`${meta.name}.skill\` |`);
  }
  lines.push("");
  lines.push(`총 ${skillMetas.length}개 스킬.`);
  lines.push("");
  fs.writeFileSync(path.join(distDir, "INDEX.md"), lines.join("\n"));
}

function main() {
  ensureZipAvailable();
  rimrafSync(distDir);
  fs.mkdirSync(distDir, { recursive: true });

  const skills = discoverSkills();
  if (skills.length === 0) {
    console.error("ERROR: no skills with SKILL.md found at repo root.");
    process.exit(1);
  }

  const metas = [];
  for (const skill of skills) {
    process.stdout.write(`packing ${skill}.skill ... `);
    buildSkillArchive(skill);
    metas.push(readSkillMeta(skill));
    process.stdout.write("ok\n");
  }

  writeIndex(metas);
  buildAllInOneArchive(skills);

  console.log("");
  console.log(`built ${skills.length} .skill files in ${path.relative(repoRoot, distDir)}/`);
  console.log(`combined download: ${path.relative(repoRoot, path.join(distDir, "k-skill-manus-all.zip"))}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = {
  EXCLUDED_DIRS,
  discoverSkills,
  readSkillMeta,
};
