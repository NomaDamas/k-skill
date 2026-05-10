// gongsijiga-search — client-side query helpers for Korean individual official
// land prices (개별공시지가).
//
// Upstream: https://www.realtyprice.kr (public, no API key required)
//
// This module can be used directly from a user's machine without going through
// k-skill-proxy, because realtyprice.kr is a fully open public endpoint.

const {
  REALTYPRICE_BASE_URL,
  REFERER,
  SIDO_MAP,
  makeError,
  parseSido,
  parseAddress,
  normalizeSearchResult,
  buildResponse,
  fetchWithTimeout,
  fetchSigunguList,
  fetchEupmyeondongList,
  fetchGsiSearchList,
  lookupGongsijiga,
  createCache,
} = require("./realtyprice");

module.exports = {
  REALTYPRICE_BASE_URL,
  REFERER,
  SIDO_MAP,
  makeError,
  parseSido,
  parseAddress,
  normalizeSearchResult,
  buildResponse,
  fetchWithTimeout,
  fetchSigunguList,
  fetchEupmyeondongList,
  fetchGsiSearchList,
  lookupGongsijiga,
  createCache,
};
