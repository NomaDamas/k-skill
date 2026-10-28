"use strict";

// Installed as runtime/assemble.js to supply the existing CLI executor's
// asset-resolution contract, without shipping its dynamic instruction loader.
const fs = require("node:fs");
const path = require("node:path");
const skillsRoot = path.resolve(__dirname, "../skills");

function resolveBundledAsset(name, relativePath, allowedRoots = ["scripts", "references"]) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("invalid skill name");
  const dir = path.join(skillsRoot, name);
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) throw new Error(`unknown skill: ${name}`);
  const normalized = path.posix.normalize(String(relativePath).replaceAll("\\", "/"));
  if (path.posix.isAbsolute(normalized) || normalized.startsWith("../") ||
      /^[A-Za-z]:/.test(normalized) || !allowedRoots.includes(normalized.split("/")[0])) {
    throw new Error("asset path must remain inside the requested skill");
  }
  const file = path.resolve(dir, normalized);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`missing bundled asset: ${normalized}`);
  if (!fs.realpathSync(file).startsWith(`${fs.realpathSync(dir)}${path.sep}`)) {
    throw new Error("symbolic link escapes the skill");
  }
  return file;
}
module.exports = { resolveBundledAsset };
