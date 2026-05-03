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
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  REALTYPRICE_BASE_URL,
  REFERER,
  SIDO_MAP,
  makeError,
  parseSido,
  parseAddress,
};
