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
const { formatUpdate, runUpdate, UPDATE_INVOCATION } = require("../src/update");
const { captureInvocation } = require("../src/analytics");
const { version } = require("../package.json");

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
    "  list               List bundled skills",
    "  version            Print the installed CLI version",
    "  update             Update this CLI if outdated and refresh all coding-agent skills",
    "",
    "Options:",
    "  -h, --help         Show this help",
    "  -v, -V, --version  Print the installed CLI version",
    "  --check            With update: report versions without installing",
    "",
    `Agent one-liner: ${UPDATE_INVOCATION}`,
    "",
    "Runtime detection: DOLSHOI_ACTION_BROKER_URL enables Dolshoi mode;",
    "CLOAKBROWSER_PEEK_TOKEN marks CloakBrowser availability.",
  ].join("\n");
}

async function main() {
  const [command, skillName, assetPath, ...rawArgs] = process.argv.slice(2);
  const runtimeMode = detectRuntime().mode;
  let exitCode;

  try {
    if (!command || command === "--help" || command === "-h") {
      console.log(usage());
      exitCode = 0;
      return exitCode;
    }

    if (command === "version" || command === "--version" || command === "-V" || command === "-v") {
      console.log(version);
      exitCode = 0;
      return exitCode;
    }

    if (command === "update") {
      const checkOnly = process.argv.slice(3).includes("--check");
      const result = runUpdate({ checkOnly });
      process.stdout.write(formatUpdate(result));
      exitCode = result.ok ? 0 : 1;
      return exitCode;
    }

    if (command === "list") {
      for (const name of listSkills()) console.log(name);
      exitCode = 0;
      return exitCode;
    }

    if (["instruct", "files", "exec", "read", "path"].includes(command)) {
      if (!skillName) {
        console.error(`error: "${command}" requires a skill name\n\n${usage()}`);
        exitCode = 1;
        return exitCode;
      }

      if (command === "instruct") {
        process.stdout.write(assemble(skillName, detectRuntime()));
      } else if (command === "files") {
        for (const filePath of bundledFiles(skillName)) console.log(filePath);
      } else {
        if (!assetPath) {
          console.error(`error: "${command}" requires an asset path\n\n${usage()}`);
          exitCode = 1;
          return exitCode;
        }

        if (command === "exec") {
          const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
          exitCode = runBundledScript(skillName, assetPath, args).status;
          return exitCode;
        }
        if (command === "read") {
          process.stdout.write(readBundledAsset(skillName, assetPath));
          exitCode = 0;
          return exitCode;
        }
        console.log(resolveBundledAsset(skillName, assetPath));
      }
      exitCode = 0;
      return exitCode;
    }

    console.error(`error: unknown command "${command}"\n\n${usage()}`);
    exitCode = 1;
    return exitCode;
  } catch (error) {
    if (
      ["EUNKNOWNSKILL", "EASSETPATH", "EASSETNOTFOUND", "EUNSUPPORTEDSCRIPT"].includes(
        error.code,
      )
    ) {
      console.error(`error: ${error.message}`);
      exitCode = 1;
      return exitCode;
    }
    throw error;
  } finally {
    await captureInvocation(
      { command, skillName, runtimeMode, success: exitCode === 0 },
      process.env,
    );
  }
}

main().then((exitCode) => {
  process.exitCode = exitCode;
});
