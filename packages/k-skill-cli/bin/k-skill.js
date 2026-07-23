#!/usr/bin/env node
"use strict";

const { assemble, bundledFiles, listSkills } = require("../src/assemble");
const { detectRuntime } = require("../src/detect");

function usage() {
  return [
    "Usage: k-skill <command> [skill]",
    "",
    "Commands:",
    "  instruct <skill>   Print runtime-aware assembled instructions for a skill",
    "  files <skill>      Print local paths of the skill's bundled helper files",
    "  list               List bundled skills",
    "",
    "Runtime detection: DOLSHOI_ACTION_BROKER_URL enables Dolshoi mode;",
    "CLOAKBROWSER_PEEK_TOKEN marks CloakBrowser availability.",
  ].join("\n");
}

function main() {
  const [command, skillName] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return 0;
  }

  if (command === "list") {
    for (const name of listSkills()) console.log(name);
    return 0;
  }

  if (command === "instruct" || command === "files") {
    if (!skillName) {
      console.error(`error: "${command}" requires a skill name\n\n${usage()}`);
      return 1;
    }

    try {
      if (command === "instruct") {
        process.stdout.write(assemble(skillName, detectRuntime()));
      } else {
        for (const filePath of bundledFiles(skillName)) console.log(filePath);
      }
      return 0;
    } catch (error) {
      if (error.code === "EUNKNOWNSKILL") {
        console.error(`error: ${error.message}`);
        return 1;
      }
      throw error;
    }
  }

  console.error(`error: unknown command "${command}"\n\n${usage()}`);
  return 1;
}

process.exitCode = main();
