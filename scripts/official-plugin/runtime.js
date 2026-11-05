#!/usr/bin/env node
"use strict";

// This local-only adapter deliberately has no instruct/update/network command.
const fs = require("node:fs");
const path = require("node:path");
const { resolveBundledAsset } = require("./assemble");
const { runBundledScript } = require("./execute");

function main(args) {
  const [command, name, asset, ...rest] = args;
  if (command === "list" && args.length === 1) {
    const root = path.resolve(__dirname, "../skills");
    console.log(fs.readdirSync(root).filter((item) => fs.existsSync(path.join(root, item, "SKILL.md"))).sort().join("\n"));
    return 0;
  }
  if (command === "exec") {
    if (!name || !asset) throw new Error("usage: exec <skill> scripts/<file> -- [args]");
    const forwarded = rest[0] === "--" ? rest.slice(1) : rest;
    return runBundledScript(name, asset, forwarded).status;
  }
  if ((command === "read" || command === "path") && args.length === 3) {
    const file = resolveBundledAsset(name, asset, ["scripts", "references", "assets", "templates"]);
    if (command === "read") process.stdout.write(fs.readFileSync(file));
    else console.log(file);
    return 0;
  }
  throw new Error("Supported local commands: list, read, path, exec. Instructions and updates come from the installed plugin, not a remote CLI.");
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
