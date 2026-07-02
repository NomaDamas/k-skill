const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");

const { APPLICATION_MENUS, VIEW_MENUS } = require("../src/index");

test("--help documents the read-only, login-session-only scope", () => {
  const help = childProcess.execFileSync(process.execPath, [path.join(__dirname, "..", "src", "cli.js"), "--help"], {
    encoding: "utf8",
  });

  assert.match(help, /logged-in browser session/);
  assert.match(help, /never automates PASS/);
});

test("editProfile and honors are routed to APPLICATION_MENUS as navigation-only menus", () => {
  assert.equal(APPLICATION_MENUS.editProfile.mode, "goto");
  assert.equal(APPLICATION_MENUS.honors.mode, "goto");
  assert.equal("editProfile" in VIEW_MENUS, false);
  assert.equal("honors" in VIEW_MENUS, false);
});
