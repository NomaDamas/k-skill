const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const fixturesDir = path.join(__dirname, "fixtures");

const fixtures = {
  genericHtml: fs.readFileSync(path.join(fixturesDir, "generic-page.html"), "utf8"),
  loginHtml: fs.readFileSync(path.join(fixturesDir, "login-page.html"), "utf8"),
  trainingInfoHtml: fs.readFileSync(path.join(fixturesDir, "training-info-page.html"), "utf8"),
  viewListHtml: fs.readFileSync(path.join(fixturesDir, "view-list-page.html"), "utf8"),
};

async function withMockedBrowserModule(factory, callback) {
  const browserModulePath = require.resolve("../src/browser");
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "playwright-core" || request === "playwright") {
      return factory();
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[browserModulePath];

  // The shared browser runtime lazily loads and caches a chromium module. Reset
  // that cache so each mocked factory is picked up instead of the first one.
  try {
    require("k-skill-browser-runtime").resetChromiumCacheForTests();
  } catch {
    // runtime not resolvable in this environment; module mock still applies
  }

  try {
    const browserModule = require("../src/browser");
    return await callback(browserModule);
  } finally {
    Module._load = originalLoad;
    delete require.cache[browserModulePath];
  }
}

module.exports = { fixtures, withMockedBrowserModule };
