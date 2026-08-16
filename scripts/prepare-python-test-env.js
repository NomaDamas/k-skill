#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const venvDir = path.join(repoRoot, ".cache", "python-test-venv");

function resolveSystemPython() {
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

function venvPython(dir) {
  const unix = path.join(dir, "bin", "python");
  const win = path.join(dir, "Scripts", "python.exe");
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(win)) return win;
  return null;
}

function run(command, args) {
  const needsWinShell =
    process.platform === "win32" &&
    (command === "npm" || /\.(cmd|bat)$/i.test(command));
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    windowsHide: true,
    shell: needsWinShell,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function venvHasPip(dir) {
  const venv = venvPython(dir);
  if (!venv) {
    return false;
  }
  const result = spawnSync(venv, ["-m", "pip", "--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

const python = resolveSystemPython();
fs.mkdirSync(path.dirname(venvDir), { recursive: true });
if (!venvHasPip(venvDir)) {
  fs.rmSync(venvDir, { recursive: true, force: true });
  run(python, ["-m", "venv", venvDir]);
}

const venv = venvPython(venvDir);
if (!venv) {
  throw new Error(`failed to create python test venv at ${venvDir}`);
}

if (!venvHasPip(venvDir)) {
  run(venv, ["-m", "ensurepip", "--upgrade"]);
}

run(venv, ["-m", "pip", "install", "--quiet", "beautifulsoup4", "openpyxl==3.1.5", "SRTrain==2.6.7"]);
