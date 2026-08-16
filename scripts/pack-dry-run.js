#!/usr/bin/env node
"use strict";

const { listPublishableWorkspaces } = require("./ci-paths");
const { npmCommand, run } = require("./ci-run");

const workspaces = listPublishableWorkspaces();
if (workspaces.length === 0) {
  console.error("pack-dry-run: no publishable workspaces found");
  process.exit(1);
}

for (const workspaceName of workspaces) {
  run(npmCommand(), ["pack", "--workspace", workspaceName, "--dry-run"]);
}
