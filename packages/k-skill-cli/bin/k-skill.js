#!/usr/bin/env node
"use strict";

const {
  assemble,
  bundledFiles,
  listSkills,
  readBundledAsset,
  resolveBundledAsset,
} = require("../src/assemble");
const { runBundledScript } = require("../src/execute");
const { detectRuntime } = require("../src/detect");
const {
  PACKAGE_NAME,
  installLatestGlobal,
  maybePrintUpdateNotice,
} = require("../src/update-check");
const { version: currentVersion } = require("../package.json");

function usage() {
  return [
    "Usage: k-skill <command> [skill]",
    "",
    "Commands:",
    "  instruct <skill>   Print runtime-aware assembled instructions for a skill",
    "  exec <skill> <script> -- [args...]",
    "                     Execute a bundled scripts/ helper with its declared shebang",
    "  read <skill> <file> Read a bundled references/ or text scripts/ asset",
    "  path <skill> <file> Print the absolute path of a bundled asset",
    "  files <skill>      Print local paths of the skill's bundled helper files",
    "  update             Install the newest compatible release for global users",
    "  list               List bundled skills",
    "",
    "Runtime detection: DOLSHOI_ACTION_BROKER_URL enables Dolshoi mode;",
    "CLOAKBROWSER_PEEK_TOKEN marks CloakBrowser availability.",
  ].join("\n");
}

function main() {
  const [command, skillName, assetPath, ...rawArgs] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return 0;
  }

  if (command === "update") {
    console.log(`Installing the newest compatible ${PACKAGE_NAME} release...`);
    return installLatestGlobal().status;
  }

  if (command === "list") {
    for (const name of listSkills()) console.log(name);
    return 0;
  }

  if (["instruct", "files", "exec", "read", "path"].includes(command)) {
    if (!skillName) {
      console.error(`error: "${command}" requires a skill name\n\n${usage()}`);
      return 1;
    }

    try {
      if (command === "instruct") {
        process.stdout.write(assemble(skillName, detectRuntime()));
      } else if (command === "files") {
        for (const filePath of bundledFiles(skillName)) console.log(filePath);
      } else {
        if (!assetPath) {
          console.error(`error: "${command}" requires an asset path\n\n${usage()}`);
          return 1;
        }

        if (command === "exec") {
          const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
          return runBundledScript(skillName, assetPath, args).status;
        }
        if (command === "read") {
          process.stdout.write(readBundledAsset(skillName, assetPath));
          return 0;
        }
        console.log(resolveBundledAsset(skillName, assetPath));
      }
      return 0;
    } catch (error) {
      if (
        ["EUNKNOWNSKILL", "EASSETPATH", "EASSETNOTFOUND", "EUNSUPPORTEDSCRIPT"].includes(
          error.code,
        )
      ) {
        console.error(`error: ${error.message}`);
        return 1;
      }
      throw error;
    }
  }

  console.error(`error: unknown command "${command}"\n\n${usage()}`);
  return 1;
}

async function entrypoint() {
  const exitCode = main();
  if (!process.argv.slice(2).includes("update")) {
    await maybePrintUpdateNotice(currentVersion).catch(() => null);
  }
  process.exitCode = exitCode;
}

entrypoint();
