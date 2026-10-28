"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const { resolveBundledAsset } = require("./assemble");

function splitShebang(value) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function resolveShebangCommand(command, env) {
  const executable = command.split(/[\\/]/).pop().toLowerCase();

  if (executable === "python" || executable === "python3") {
    return env.KSKILL_PYTHON || (process.platform === "win32" ? "python" : command);
  }

  return executable === "node" ? process.execPath : command;
}

function resolveRunner(scriptPath, env = process.env) {
  const firstLine = fs.readFileSync(scriptPath, "utf8").split(/\r?\n/, 1)[0];

  if (firstLine.startsWith("#!")) {
    const parts = splitShebang(firstLine.slice(2));
    if (parts[0] === "/usr/bin/env") {
      const args = parts.slice(parts[1] === "-S" ? 2 : 1);
      if (args.length) {
        const [command, ...prefixArgs] = args;
        return {
          command: resolveShebangCommand(command, env),
          args: [...prefixArgs, scriptPath],
        };
      }
    }

    if (parts[0]) {
      return { command: resolveShebangCommand(parts[0], env), args: [...parts.slice(1), scriptPath] };
    }
  }

  switch (path.extname(scriptPath).toLowerCase()) {
    case ".py":
      return { command: env.KSKILL_PYTHON || (process.platform === "win32" ? "python" : "python3"), args: [scriptPath] };
    case ".js":
    case ".cjs":
    case ".mjs":
      return { command: process.execPath, args: [scriptPath] };
    case ".sh":
      return { command: env.KSKILL_BASH || "bash", args: [scriptPath] };
    default: {
      const error = new Error(
        `cannot determine a runner for "${path.basename(scriptPath)}"; use a supported shebang or .py/.js/.sh extension`,
      );
      error.code = "EUNSUPPORTEDSCRIPT";
      throw error;
    }
  }
}

function runBundledScript(skillName, relativePath, args = [], options = {}) {
  const scriptPath = resolveBundledAsset(skillName, relativePath, ["scripts"]);
  const runner = resolveRunner(scriptPath, options.env || process.env);
  const result = childProcess.spawnSync(runner.command, [...runner.args, ...args], {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...options.env,
      KSKILL_BUNDLED_SKILL_DIR: path.dirname(path.dirname(scriptPath)),
    },
    encoding: options.encoding,
    stdio: options.stdio || "inherit",
  });

  if (result.error) throw result.error;
  if (result.signal) {
    const error = new Error(`script terminated by signal ${result.signal}`);
    error.code = "ESCRIPTSIGNAL";
    throw error;
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

module.exports = { resolveRunner, runBundledScript };
