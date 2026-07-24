const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function loadLckResults() {
  const candidates = [];
  const packageNames = ["lck-analytics", "lck-results"];

  if (process.env.GLOBAL_NPM_ROOT) {
    for (const packageName of packageNames) {
      candidates.push(path.join(process.env.GLOBAL_NPM_ROOT, packageName, "src", "index.js"));
    }
  }

  try {
    const globalRoot = await detectGlobalNpmRoot();
    for (const packageName of packageNames) {
      candidates.push(path.join(globalRoot, packageName, "src", "index.js"));
    }
  } catch {
    // ignore detection failure and continue to local fallback
  }

  candidates.push(path.resolve(__dirname, "..", "..", "packages", "lck-analytics", "src", "index.js"));

  const entryPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entryPath) {
    throw new Error("Could not find lck-analytics package. Install it globally with `npm install -g lck-analytics` or run from the k-skill repo.");
  }

  return import(pathToFileURL(entryPath).href);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readText(filePath, fallback = "") {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function formatOutput(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveCachePaths(baseDir) {
  return {
    root: baseDir,
    historical: path.join(baseDir, "historical-analysis.json"),
    live: path.join(baseDir, "live"),
    reports: path.join(baseDir, "reports"),
  };
}

async function detectGlobalNpmRoot() {
  const { execFileSync } = require("node:child_process");
  return execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
}

module.exports = {
  ensureDir,
  formatOutput,
  loadLckResults,
  parseArgs,
  readJson,
  readText,
  resolveCachePaths,
  writeJson,
};
