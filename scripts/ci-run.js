#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { repoRoot } = require("./ci-paths");

function bashCommand() {
  if (process.platform !== "win32") {
    return "bash";
  }
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = [
    path.join(programFiles, "Git", "bin", "bash.exe"),
    path.join(programFiles, "Git", "usr", "bin", "bash.exe"),
    path.join(programFilesX86, "Git", "bin", "bash.exe"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "bash";
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function resolvePython() {
  const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) {
      return cmd;
    }
  }
  throw new Error("python3/python not found");
}

function venvPython() {
  const unix = path.join(repoRoot, ".cache", "python-test-venv", "bin", "python");
  const win = path.join(repoRoot, ".cache", "python-test-venv", "Scripts", "python.exe");
  if (fs.existsSync(unix)) {
    return unix;
  }
  if (fs.existsSync(win)) {
    return win;
  }
  throw new Error("python test venv missing; run npm run prepare:python-test-env first");
}

function run(command, args, options = {}) {
  const winCmd = process.platform === "win32" && (command === "npm" || /\.(cmd|bat)$/i.test(command));
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
    shell: options.shell ?? winCmd,
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runBatched(command, prefixArgs, files, options = {}) {
  const chunkSize = options.chunkSize || 80;
  for (let i = 0; i < files.length; i += chunkSize) {
    run(command, [...prefixArgs, ...files.slice(i, i + chunkSize)], options);
  }
}

function runNodeSyntaxChecks(files, options = {}) {
  for (const file of files) {
    run(process.execPath, ["--check", file], options);
  }
}

module.exports = {
  bashCommand,
  npmCommand,
  resolvePython,
  run,
  runBatched,
  runNodeSyntaxChecks,
  venvPython,
};
