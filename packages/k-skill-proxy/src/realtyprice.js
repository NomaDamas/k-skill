// realtyprice.js — helpers for querying realtyprice.kr 공시지가 (officially published
// land/building prices). This module provides pure parsing utilities and fetch
// helpers; the Fastify route is wired in server.js.
//
// Upstream entry point:
//   https://www.realtyprice.kr/notice/gsindividual/search.htm  (HTML form)
// The actual data comes from AJAX calls described in SKILL.md.

const REALTYPRICE_BASE_URL = "https://www.realtyprice.kr/notice";
const REFERER =
  "https://www.realtyprice.kr/notice/gsindividual/search.htm";

// ---------------------------------------------------------------------------
// 시도 코드 매핑 (17개 시도)
// ---------------------------------------------------------------------------

// Maps every recognized name variant to its 2-digit code.
const SIDO_MAP = {
  // 서울
  "서울특별시": "11",
  "서울": "11",
  // 부산
  "부산광역시": "21",
  "부산": "21",
  // 대구
  "대구광역시": "22",
  "대구": "22",
  // 인천
  "인천광역시": "23",
  "인천": "23",
  // 광주
  "광주광역시": "24",
  "광주": "24",
  // 대전
  "대전광역시": "25",
  "대전": "25",
  // 울산
  "울산광역시": "26",
  "울산": "26",
  // 세종
  "세종특별자치시": "29",
  "세종": "29",
  // 경기
  "경기도": "41",
  "경기": "41",
  // 강원
  "강원특별자치도": "42",
  "강원도": "42",
  "강원": "42",
  // 충북
  "충청북도": "43",
  "충북": "43",
  // 충남
  "충청남도": "44",
  "충남": "44",
  // 전북
  "전북특별자치도": "45",
  "전라북도": "45",
  "전북": "45",
  // 전남
  "전라남도": "46",
  "전남": "46",
  // 경북
  "경상북도": "47",
  "경북": "47",
  // 경남
  "경상남도": "48",
  "경남": "48",
  // 제주
  "제주특별자치도": "50",
  "제주도": "50",
  "제주": "50",
};

// ---------------------------------------------------------------------------
// makeError
// ---------------------------------------------------------------------------

/**
 * Creates an Error with additional `code` and `statusCode` properties.
 * @param {string} code      Machine-readable error code.
 * @param {string} message   Human-readable message.
 * @param {number} statusCode HTTP status code to return to the client.
 */
function makeError(code, message, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

// ---------------------------------------------------------------------------
// parseSido
// ---------------------------------------------------------------------------

/**
 * Maps a Korean 시도 name (full or abbreviated) to its 2-digit string code.
 * Returns null if the name is not recognized.
 * @param {string} text
 * @returns {string|null}
 */
function parseSido(text) {
  if (!text) return null;
  const code = SIDO_MAP[text.trim()];
  return code !== undefined ? code : null;
}

// ---------------------------------------------------------------------------
// parseAddress
// ---------------------------------------------------------------------------

/**
 * Parses a Korean land address string into its structural components.
 *
 * Expected shape (space-separated tokens):
 *   <시도> <시군구> [<읍면동> …] ["산"] <번지[-부번]>
 *
 * Returns:
 *   { sido, sidoCode, sigungu, eupmyeondong, san, bun1, bun2 }
 *
 * Throws:
 *   - code "ADDRESS_PARSE_FAILED" / statusCode 400
 *       when the first token is not a recognised 시도, or there are fewer
 *       than 4 tokens (시도 + 시군구 + 읍면동 + 번지 minimum).
 *   - code "INVALID_BUNJI" / statusCode 400
 *       when bun1 is non-numeric or longer than 4 digits.
 *
 * @param {string} rawAddress
 * @returns {{ sido: string, sidoCode: string, sigungu: string,
 *             eupmyeondong: string, san: boolean, bun1: string, bun2: string }}
 */
function parseAddress(rawAddress) {
  const tokens = (rawAddress || "").trim().split(/\s+/).filter(Boolean);

  // Minimum: sido + sigungu + eupmyeondong + bunji = 4 tokens
  if (tokens.length < 4) {
    throw makeError(
      "ADDRESS_PARSE_FAILED",
      `주소를 파싱할 수 없습니다: "${rawAddress}"`,
      400
    );
  }

  // First token must be a valid 시도
  const sido = tokens[0];
  const sidoCode = parseSido(sido);
  if (sidoCode === null) {
    throw makeError(
      "ADDRESS_PARSE_FAILED",
      `인식할 수 없는 시도입니다: "${sido}"`,
      400
    );
  }

  // Second token is 시군구
  const sigungu = tokens[1];

  // Remaining tokens (after sido + sigungu): [...eupmyeondong tokens, (산?), bunji]
  const rest = tokens.slice(2);

  // The last token is always the bunji (번지) token (possibly with 산 prefix).
  // If the second-to-last token is the standalone "산", it belongs to the
  // bunji group rather than eupmyeondong.
  let bunjiRaw;
  let san = false;
  let eupmyeondongTokens;

  const lastToken = rest[rest.length - 1];
  const secondLast = rest.length >= 2 ? rest[rest.length - 2] : null;

  if (secondLast === "산") {
    // e.g. ["서초동", "산", "1-2"]  → eupmyeondong="서초동", san=true, bunji="1-2"
    san = true;
    bunjiRaw = lastToken;
    eupmyeondongTokens = rest.slice(0, rest.length - 2);
  } else if (/^산\d/.test(lastToken)) {
    // e.g. ["서초동", "산1-2"] → eupmyeondong="서초동", san=true, bunji="1-2"
    san = true;
    bunjiRaw = lastToken.slice(1); // strip leading "산"
    eupmyeondongTokens = rest.slice(0, rest.length - 1);
  } else {
    bunjiRaw = lastToken;
    eupmyeondongTokens = rest.slice(0, rest.length - 1);
  }

  if (eupmyeondongTokens.length === 0) {
    throw makeError(
      "ADDRESS_PARSE_FAILED",
      `읍면동을 파싱할 수 없습니다: "${rawAddress}"`,
      400
    );
  }

  const eupmyeondong = eupmyeondongTokens.join(" ");

  // Strip trailing "번지"
  const bunjiStripped = bunjiRaw.replace(/번지$/, "");

  // Split bun1 / bun2 on "-"
  const dashIdx = bunjiStripped.indexOf("-");
  let bun1, bun2;
  if (dashIdx !== -1) {
    bun1 = bunjiStripped.slice(0, dashIdx);
    bun2 = bunjiStripped.slice(dashIdx + 1);
  } else {
    bun1 = bunjiStripped;
    bun2 = "";
  }

  // Validate bun1: must be numeric and at most 4 digits
  if (!/^\d+$/.test(bun1)) {
    throw makeError(
      "INVALID_BUNJI",
      `번지가 숫자가 아닙니다: "${bun1}"`,
      400
    );
  }
  if (bun1.length > 4) {
    throw makeError(
      "INVALID_BUNJI",
      `번지가 너무 깁니다 (최대 4자리): "${bun1}"`,
      400
    );
  }

  return { sido, sidoCode, sigungu, eupmyeondong, san, bun1, bun2 };
}

// ---------------------------------------------------------------------------
// normalizeSearchResult
// ---------------------------------------------------------------------------

/**
 * Normalizes a single raw item from realtyprice.kr's gsiList response.
 *
 * @param {{ base_year: string, gakuka_w: string, notice_ymd: string, [key: string]: any }} raw
 * @returns {{ year: number, price_per_sqm: number|null, notice_date: string|null }}
 */
function normalizeSearchResult(raw) {
  const year = parseInt(raw.base_year, 10);

  const priceStr = raw.gakuka_w;
  const price_per_sqm =
    priceStr && priceStr.trim() !== ""
      ? parseInt(priceStr.replace(/,/g, ""), 10)
      : null;

  const ymd = raw.notice_ymd || "";
  const notice_date =
    ymd.length === 8
      ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
      : null;

  return { year, price_per_sqm, notice_date };
}

// ---------------------------------------------------------------------------
// buildResponse
// ---------------------------------------------------------------------------

const SOURCE_URL =
  "https://www.realtyprice.kr/notice/gsindividual/search.htm";

/**
 * Assembles the final normalized response from parsed address fields and a
 * history array of normalized search results.
 *
 * @param {{ address: string, jibun: string, san: boolean, history: Array<{year: number, price_per_sqm: number|null, notice_date: string|null}> }} param
 * @returns {object}
 */
function buildResponse({ address, jibun, san, history }) {
  const sorted = [...history].sort((a, b) => b.year - a.year);

  const latestRaw = sorted[0];
  const latest = {
    ...latestRaw,
    base_date: `${latestRaw.year}-01-01`,
  };

  let yoy_change_pct = null;
  if (sorted.length >= 2) {
    const latestPrice = sorted[0].price_per_sqm;
    const prevPrice = sorted[1].price_per_sqm;
    if (latestPrice !== null && prevPrice !== null && prevPrice !== 0) {
      yoy_change_pct =
        Math.round(((latestPrice - prevPrice) / prevPrice) * 100 * 100) / 100;
    }
  }

  return {
    address,
    jibun,
    san,
    latest,
    history: sorted,
    yoy_change_pct,
    source_url: SOURCE_URL,
  };
}

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

/**
 * Wraps a fetch call with an AbortController timeout.
 * @param {string} url
 * @param {object} opts  fetch options (headers, etc.)
 * @param {number} [timeoutMs=30000]
 * @param {Function} [fetchFn=fetch]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...opts, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw makeError(
        "UPSTREAM_TIMEOUT",
        "realtyprice.kr 응답 시간 초과 (30초)",
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// fetchSigunguList
// ---------------------------------------------------------------------------

/**
 * Fetches the 시군구 list for a given 시도 code.
 * @param {string} sidoCode  2-digit sido code (e.g. "11")
 * @param {Function} [fetchFn=fetch]
 * @returns {Promise<Array<{ code: string, name: string }>>}
 */
async function fetchSigunguList(sidoCode, fetchFn = fetch) {
  const url = `${REALTYPRICE_BASE_URL}/bjd/searchBjdApi.bjd?gbn=1&gubun=sgg&sido=${sidoCode}`;
  const res = await fetchWithTimeout(url, { headers: { Referer: REFERER } }, 30000, fetchFn);
  if (!res.ok) {
    throw makeError(
      "UPSTREAM_ERROR",
      `realtyprice.kr 시군구 조회 실패: HTTP ${res.status}`,
      502
    );
  }
  const data = await res.json();
  return (data.bjdList || []).map((item) => ({
    code: item.bjd_cd,
    name: item.bjd_nm,
  }));
}

// ---------------------------------------------------------------------------
// fetchEupmyeondongList
// ---------------------------------------------------------------------------

/**
 * Fetches the 읍면동 list for a given 시도 + 시군구 code.
 * @param {string} sidoCode  2-digit sido code (e.g. "11")
 * @param {string} sggCode   sigungu code (e.g. "11680")
 * @param {Function} [fetchFn=fetch]
 * @returns {Promise<Array<{ code: string, name: string }>>}
 */
async function fetchEupmyeondongList(sidoCode, sggCode, fetchFn = fetch) {
  const url = `${REALTYPRICE_BASE_URL}/bjd/searchBjdApi.bjd?gbn=1&gubun=eub&sido=${sidoCode}&sgg=${sggCode}`;
  const res = await fetchWithTimeout(url, { headers: { Referer: REFERER } }, 30000, fetchFn);
  if (!res.ok) {
    throw makeError(
      "UPSTREAM_ERROR",
      `realtyprice.kr 읍면동 조회 실패: HTTP ${res.status}`,
      502
    );
  }
  const data = await res.json();
  return (data.bjdList || []).map((item) => ({
    code: item.bjd_cd,
    name: item.bjd_nm,
  }));
}

// ---------------------------------------------------------------------------
// fetchGsiSearchList
// ---------------------------------------------------------------------------

/**
 * Fetches the gsiList (공시지가 search results) for a given address.
 * @param {{ regCode: string, eubCode: string, san: boolean, bun1: string, bun2: string }} params
 * @param {Function} [fetchFn=fetch]
 * @returns {Promise<Array>}  raw gsiList items
 */
async function fetchGsiSearchList({ regCode, eubCode, san, bun1, bun2 }, fetchFn = fetch) {
  const bun1Padded = bun1.padStart(4, "0");
  const bun2Padded = bun2 ? bun2.padStart(4, "0") : "";
  const sanParam = san ? "2" : "1";
  const url =
    `${REALTYPRICE_BASE_URL}/search/gsiSearchListApi.search` +
    `?gbn=1&reg=${regCode}&eub=${eubCode}&san=${sanParam}` +
    `&bun1=${bun1Padded}&bun2=${bun2Padded}&tabGbn=Text&page_no=1&year=`;
  const res = await fetchWithTimeout(url, { headers: { Referer: REFERER } }, 30000, fetchFn);
  if (!res.ok) {
    throw makeError(
      "UPSTREAM_ERROR",
      `realtyprice.kr 공시지가 조회 실패: HTTP ${res.status}`,
      502
    );
  }
  const data = await res.json();
  return data.gsiList || [];
}

// ---------------------------------------------------------------------------
// lookupGongsijiga
// ---------------------------------------------------------------------------

/**
 * Main orchestrator: resolves a raw Korean land address to its 공시지가 history.
 *
 * Flow:
 *   1. parseAddress → sidoCode, sigungu, eupmyeondong, san, bun1, bun2
 *   2. fetchSigunguList → find exact match on sigungu name
 *   3. fetchEupmyeondongList → match last token of eupmyeondong (exact then prefix)
 *   4. fetchGsiSearchList → normalize results → buildResponse
 *
 * @param {string} addressRaw
 * @param {Function} [fetchFn=fetch]
 * @returns {Promise<object>}
 */
async function lookupGongsijiga(addressRaw, fetchFn = fetch) {
  // Step 1: parse
  const { sidoCode, sigungu, eupmyeondong, san, bun1, bun2 } =
    parseAddress(addressRaw);

  // Step 2: sigungu list + exact match
  const sggList = await fetchSigunguList(sidoCode, fetchFn);
  const sggMatch = sggList.find((item) => item.name === sigungu);
  if (!sggMatch) {
    const candidates = sggList
      .filter(
        (item) => item.name.includes(sigungu) || sigungu.includes(item.name)
      )
      .slice(0, 3)
      .map((item) => item.name);
    const err = makeError(
      "REGION_NOT_FOUND",
      `시군구를 찾을 수 없습니다: "${sigungu}"`,
      404
    );
    err.candidates = candidates;
    throw err;
  }

  // Step 3: eupmyeondong list + match
  const eubList = await fetchEupmyeondongList(sidoCode, sggMatch.code, fetchFn);

  // The eupmyeondong from parseAddress may be multi-token (e.g. "청계면 청천리").
  // Use the LAST token as the primary matching target.
  const eubTokens = eupmyeondong.split(/\s+/);
  const eubTarget = eubTokens[eubTokens.length - 1];

  // Try exact match first
  let eubMatch = eubList.find((item) => item.name === eubTarget);

  // Then prefix match: strip trailing 동/리/면/읍 suffix from target and compare
  if (!eubMatch) {
    const eubStem = eubTarget.replace(/[동리면읍]$/, "");
    const prefixMatches = eubList.filter(
      (item) =>
        item.name === eubTarget ||
        item.name.startsWith(eubStem)
    );
    if (prefixMatches.length === 1) {
      eubMatch = prefixMatches[0];
    } else {
      // no match or ambiguous
      const candidates = eubList
        .filter(
          (item) =>
            item.name.includes(eubTarget) || eubTarget.includes(item.name)
        )
        .slice(0, 3)
        .map((item) => item.name);
      const err = makeError(
        "REGION_NOT_FOUND",
        `읍면동을 찾을 수 없습니다: "${eupmyeondong}"`,
        404
      );
      err.candidates = candidates;
      throw err;
    }
  }

  // Step 4: fetch gsiList
  const gsiListRaw = await fetchGsiSearchList(
    { regCode: sggMatch.code, eubCode: eubMatch.code, san, bun1, bun2 },
    fetchFn
  );

  if (!gsiListRaw || gsiListRaw.length === 0) {
    throw makeError(
      "LAND_NOT_FOUND",
      "해당 지번의 공시지가가 등재되지 않았습니다. 본번/부번 오타이거나 도로/하천 등 미과세 토지일 수 있습니다.",
      404
    );
  }

  // Step 5: normalize + build response
  const history = gsiListRaw.map(normalizeSearchResult);
  const jibun = bun2 ? `${bun1}-${bun2}번지` : `${bun1}번지`;
  return buildResponse({ address: addressRaw.trim(), jibun, san, history });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
};
