"use strict";

const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.join(__dirname, "..");
const templatesDir = path.join(packageRoot, "templates");
const skillsDir = path.join(packageRoot, "skills");

const KNOWN_PROFILES = [
  "core",
  "proxy",
  "browser",
  "vault",
  "action:booking",
  "action:commerce",
  "action:submission",
  "action:account",
  "action:recruiting",
  "legal",
  "lookup",
  "local",
  "operations",
];

function profileTemplatePath(profile) {
  return path.join(templatesDir, `${profile.replace(":", "-")}.md`);
}

function listSkills() {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, "skill.json")))
    .sort();
}

function loadSkill(skillName) {
  const dir = path.join(skillsDir, skillName);
  const manifestPath = path.join(dir, "skill.json");

  if (!fs.existsSync(manifestPath)) {
    const known = listSkills();
    const error = new Error(
      `unknown skill "${skillName}". Known skills: ${known.join(", ") || "(none bundled)"}`,
    );
    error.code = "EUNKNOWNSKILL";
    throw error;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  for (const profile of manifest.profiles ?? []) {
    if (!KNOWN_PROFILES.includes(profile)) {
      throw new Error(`skill "${skillName}" declares unknown profile "${profile}"`);
    }
  }

  return {
    dir,
    manifest,
    instruction: fs.readFileSync(path.join(dir, "instruction.md"), "utf8"),
  };
}

// Template files interleave `<!-- mode:always -->`, `<!-- mode:dolshoi -->`,
// and `<!-- mode:generic -->` markers. Only the sections matching the detected
// mode (plus always-sections) are emitted.
function renderTemplate(raw, mode) {
  const lines = raw.split("\n");
  const output = [];
  let current = "always";

  for (const line of lines) {
    const marker = line.match(/^<!-- mode:(always|dolshoi|generic) -->$/);
    if (marker) {
      current = marker[1];
      continue;
    }
    if (current === "always" || current === mode) output.push(line);
  }

  return output.join("\n").trim();
}

function assemble(skillName, runtime) {
  const { manifest, instruction } = loadSkill(skillName);
  const profiles = ["core", ...(manifest.profiles ?? []).filter((p) => p !== "core")];

  const blocks = profiles
    .map((profile) => {
      const templatePath = profileTemplatePath(profile);
      const rendered = renderTemplate(fs.readFileSync(templatePath, "utf8"), runtime.mode);
      return rendered;
    })
    .filter(Boolean);

  const header = [
    `# ${manifest.name} — assembled instructions`,
    "",
    `Runtime mode: ${runtime.mode}${runtime.cloakBrowser ? " (CloakBrowser available)" : ""}`,
    "",
    "## Runtime rules",
    "",
    blocks.join("\n"),
  ].join("\n");

  // instruction.md may also use mode markers for mode-specific sections.
  return `${header}\n\n${renderTemplate(instruction, runtime.mode)}\n`;
}

function bundledFiles(skillName) {
  const { dir } = loadSkill(skillName);
  const results = [];

  for (const sub of ["scripts", "references", "tests"]) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    const stack = [subDir];
    while (stack.length) {
      const currentDir = stack.pop();
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else results.push(full);
      }
    }
  }

  return results.sort();
}

module.exports = { assemble, bundledFiles, listSkills, loadSkill, renderTemplate, KNOWN_PROFILES };
