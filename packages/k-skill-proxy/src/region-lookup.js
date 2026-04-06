// Region code lookup: resolves free-text Korean address queries to 5-digit
// LAWD_CD codes used by MOLIT real estate APIs.

let regionData = null;

function loadRegionCodes() {
  if (!regionData) {
    const raw = require("./region-codes.json");
    regionData = Object.entries(raw).map(([lawd_cd, name]) => ({ lawd_cd, name }));
  }
  return regionData;
}

function searchRegionCode(query) {
  if (!query || typeof query !== "string") return [];

  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const entries = loadRegionCodes();
  const results = [];

  for (const entry of entries) {
    if (tokens.every((tok) => entry.name.includes(tok))) {
      results.push(entry);
      if (results.length >= 10) break;
    }
  }

  return results;
}

module.exports = { searchRegionCode, loadRegionCodes };
