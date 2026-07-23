"use strict";

// Capability-based runtime detection. Mirrors the repository-wide rule:
// Dolshoi credential mode needs DOLSHOI_ACTION_BROKER_URL (vault-run usability
// is asserted by the agent at call time); CloakBrowser mode is detected
// independently via CLOAKBROWSER_PEEK_TOKEN.
function detectRuntime(env = process.env) {
  const dolshoi = Boolean(env.DOLSHOI_ACTION_BROKER_URL);
  const cloakBrowser = Boolean(env.CLOAKBROWSER_PEEK_TOKEN) || dolshoi;

  return {
    mode: dolshoi ? "dolshoi" : "generic",
    dolshoi,
    cloakBrowser,
  };
}

module.exports = { detectRuntime };
