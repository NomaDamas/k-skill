// housing-official-price — read-only helpers for realtyprice.kr official
// housing prices. The upstream is a public browser-visible web data surface,
// not a documented OpenAPI.

const REALTYPRICE_BASE_URL = "https://www.realtyprice.kr/notice";
const INDIVIDUAL_HOUSE_REFERER = `${REALTYPRICE_BASE_URL}/hpindividual/search.htm`;
const APARTMENT_REFERER = `${REALTYPRICE_BASE_URL}/m/town/search.do`;
const DEFAULT_TIMEOUT_MS = 30000;

const DEFAULT_HEADERS = {
  "User-Agent": "housing-official-price/0.1 (+https://github.com/NomaDamas/k-skill)",
  "X-Requested-With": "XMLHttpRequest",
};

function makeError(code, message, statusCode, details) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  if (details && typeof details === "object") {
    Object.assign(err, details);
  }
  return err;
}

function parsePnu(value) {
  const pnu = String(value || "").trim();
  if (!/^\d{19}$/.test(pnu)) {
    throw makeError("INVALID_PNU", "PNU must be exactly 19 digits.", 400);
  }

  const bjdCode = pnu.slice(0, 10);
  const san = pnu.slice(10, 11);
  if (san !== "1" && san !== "2") {
    throw makeError("INVALID_PNU", "PNU land-type digit must be 1 or 2.", 400);
  }

  return {
    pnu,
    bjdCode,
    regCode: bjdCode.slice(0, 5),
    eubCode: bjdCode.slice(5, 10),
    san,
    bun1: pnu.slice(11, 15),
    bun2: pnu.slice(15, 19),
  };
}

function buildIndividualHouseHistoryRequest(pnu, options = {}) {
  const parsed = parsePnu(pnu);
  const params = new URLSearchParams({
    page_no: "1",
    gbn: "1",
    year: "",
    reg: parsed.regCode,
    eub: parsed.eubCode,
    san: parsed.san,
    bun1: parsed.bun1,
    bun2: parsed.bun2,
    road_code: "",
    p_initialword: "",
    build_bun1: "",
    build_bun2: "",
    from_year: options.fromYear ? String(options.fromYear) : "",
    to_year: options.toYear ? String(options.toYear) : "",
    dong_gbn: "",
    tabGbn: "Text",
  });

  return {
    method: "GET",
    url: `${REALTYPRICE_BASE_URL}/search/hpiSearchListApi.search?${params.toString()}`,
    headers: {
      ...DEFAULT_HEADERS,
      Referer: INDIVIDUAL_HOUSE_REFERER,
    },
  };
}

function normalizeSearchKeyword(value) {
  return String(value || "").trim();
}

function buildApartmentCandidateSearchRequest(selector = {}) {
  const complexName = normalizeSearchKeyword(selector.complexName);
  if (!complexName) {
    throw makeError(
      "INVALID_SELECTOR",
      "Apartment candidate search requires a non-empty complexName.",
      400
    );
  }

  const params = new URLSearchParams({
    search_gbn: "1",
    search_detail_gbn: "3",
    notice_date: "",
    notice_date_nm: "",
    sido: "",
    sido_nm: "",
    sigungu: "",
    sigungu_nm: "",
    road_reg: "",
    road_initial: "",
    road_initial_nm: "",
    road_code: "",
    road_code_nm: "",
    dongri: "",
    dongri_nm: "",
    reg: "",
    eub: "",
    search_name: complexName,
    search_bun: "",
  });

  return {
    method: "POST",
    url: `${REALTYPRICE_BASE_URL}/m/town/getApt.do`,
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: APARTMENT_REFERER,
    },
    body: params.toString(),
  };
}

function parseNumberish(value) {
  if (value === null || value === undefined) return null;
  const compact = String(value).replace(/,/g, "").trim();
  if (compact === "") return null;
  const number = Number(compact);
  return Number.isFinite(number) ? number : null;
}

function parsePriceWon(value) {
  const number = parseNumberish(value);
  return number === null ? null : Math.trunc(number);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseDateLike(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "") return null;

  const ymd = raw.replace(/[^0-9]/g, "");
  if (ymd.length === 8) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }

  const dotted = raw.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotted) {
    return `${dotted[1]}-${pad2(dotted[2])}-${pad2(dotted[3])}`;
  }

  return null;
}

function parseYear(value) {
  const raw = String(value || "");
  const match = raw.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function normalizeIndividualHouseHistory(list) {
  if (!Array.isArray(list)) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", "Individual-house history list is not an array.", 502);
  }

  return list
    .map((raw) => {
      const year = parseYear(raw.base_ymd || raw.base_date || raw.notice_ymd || raw.notice_date);
      const baseDate = parseDateLike(raw.base_ymd || raw.base_date);
      const noticeDate = parseDateLike(raw.notice_ymd || raw.notice_date || raw.notice_date_org);

      return {
        year,
        base_date: baseDate,
        notice_date: noticeDate,
        price_won: parsePriceWon(raw.hprice_w),
        land_area_sqm: parseNumberish(raw.tbook_area),
        calculated_land_area_sqm: parseNumberish(raw.calc_larea),
        building_gross_area_sqm: parseNumberish(raw.bldg_garea),
        residential_area_sqm: parseNumberish(raw.res_area),
        building_label: raw.dong_gbn || null,
        lot_address: raw.addr || null,
        raw: {
          price_won: raw.hprice_w ?? null,
          land_area_sqm: raw.tbook_area ?? null,
          calculated_land_area_sqm: raw.calc_larea ?? null,
          building_gross_area_sqm: raw.bldg_garea ?? null,
          residential_area_sqm: raw.res_area ?? null,
          base_date: raw.base_ymd || raw.base_date || null,
          notice_date: raw.notice_ymd || raw.notice_date || raw.notice_date_org || null,
        },
      };
    })
    .sort((a, b) => (b.year || 0) - (a.year || 0));
}

function sourceMetadata(endpoint, page) {
  return {
    site: "realtyprice.kr",
    endpoint,
    page,
    api_documented: false,
    access: "public-web-data-surface",
  };
}


function createTimeoutSignal(timeoutMs) {
  const numericTimeoutMs = Number(timeoutMs);
  if (
    !Number.isFinite(numericTimeoutMs) ||
    numericTimeoutMs <= 0 ||
    typeof AbortController !== "function"
  ) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), numericTimeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function buildFetchOptions(request, options = {}) {
  const timeout = options.signal ? null : createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const init = {
    method: request.method,
    headers: request.headers,
    body: request.body,
  };
  const signal = options.signal || (timeout && timeout.signal);
  if (signal) init.signal = signal;
  return { init, timeout };
}

async function fetchJsonRequest(request, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const { init, timeout } = buildFetchOptions(request, options);
  let response;
  try {
    response = await fetchFn(request.url, init);
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw makeError("UPSTREAM_TIMEOUT", "realtyprice.kr request timed out.", 504);
    }
    throw makeError("UPSTREAM_FETCH_ERROR", "realtyprice.kr request failed before a response was received.", 502, {
      cause: err,
    });
  } finally {
    if (timeout) timeout.cancel();
  }

  if (!response.ok) {
    throw makeError(
      "UPSTREAM_HTTP_ERROR",
      `realtyprice.kr returned HTTP ${response.status}.`,
      502,
      { upstreamStatus: response.status }
    );
  }

  try {
    return await response.json();
  } catch (err) {
    throw makeError("UPSTREAM_MALFORMED_JSON", "realtyprice.kr returned malformed JSON.", 502, {
      cause: err,
    });
  }
}

async function fetchTextRequest(request, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const { init, timeout } = buildFetchOptions(request, options);
  let response;
  try {
    response = await fetchFn(request.url, init);
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw makeError("UPSTREAM_TIMEOUT", "realtyprice.kr request timed out.", 504);
    }
    throw makeError("UPSTREAM_FETCH_ERROR", "realtyprice.kr request failed before a response was received.", 502, {
      cause: err,
    });
  } finally {
    if (timeout) timeout.cancel();
  }

  if (!response.ok) {
    throw makeError(
      "UPSTREAM_HTTP_ERROR",
      `realtyprice.kr returned HTTP ${response.status}.`,
      502,
      { upstreamStatus: response.status }
    );
  }

  try {
    return await response.text();
  } catch (err) {
    throw makeError("UPSTREAM_MALFORMED_HTML", "realtyprice.kr returned unreadable HTML.", 502, {
      cause: err,
    });
  }
}

function getModelListPayload(data, label) {
  if (!data || typeof data !== "object") {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", `${label} response is missing model/modelMap.`, 502);
  }

  const payloads = [data.model, data.modelMap].filter(
    (payload) => payload && typeof payload === "object"
  );
  const payload = payloads.find((item) => Object.prototype.hasOwnProperty.call(item, "list"));
  if (!payload) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", `${label} response is missing model.list/modelMap.list.`, 502);
  }

  const list = payload.list;
  if (list !== null && !Array.isArray(list)) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", `${label} model.list/modelMap.list is not an array or null.`, 502);
  }

  return {
    list,
    totalCnt: Number(payload.totalCnt || 0),
  };
}

function buildEmptyIndividualHouseResult(parsed, reason) {
  return {
    status: "empty",
    query: {
      type: "individual-house",
      pnu: parsed.pnu,
    },
    selected: {
      pnu: parsed.pnu,
      bjdCode: parsed.bjdCode,
      regCode: parsed.regCode,
      eubCode: parsed.eubCode,
      san: parsed.san,
      bun1: parsed.bun1,
      bun2: parsed.bun2,
    },
    history: [],
    source: sourceMetadata(
      "/notice/search/hpiSearchListApi.search",
      INDIVIDUAL_HOUSE_REFERER
    ),
    error: {
      code: "INDIVIDUAL_HOUSE_NOT_FOUND",
      message: reason || "No individual-house official price rows were returned for this PNU.",
    },
  };
}

async function lookupIndividualHousePriceByPnu(pnu, options = {}) {
  const parsed = parsePnu(pnu);
  const request = buildIndividualHouseHistoryRequest(parsed.pnu, options);
  const data = await fetchJsonRequest(request, options);
  const { list, totalCnt } = getModelListPayload(data, "Individual-house history");

  if (list === null || list.length === 0) {
    if (totalCnt > 0) {
      throw makeError(
        "UPSTREAM_AMBIGUOUS_EMPTY",
        "realtyprice.kr reported result count but returned an empty individual-house list.",
        502
      );
    }
    return buildEmptyIndividualHouseResult(parsed);
  }

  const history = normalizeIndividualHouseHistory(list);
  const firstRaw = list[0] || {};

  return {
    status: "ok",
    query: {
      type: "individual-house",
      pnu: parsed.pnu,
    },
    selected: {
      pnu: parsed.pnu,
      bjdCode: parsed.bjdCode,
      regCode: parsed.regCode,
      eubCode: parsed.eubCode,
      san: parsed.san,
      bun1: parsed.bun1,
      bun2: parsed.bun2,
      address: firstRaw.full_addr_name || null,
    },
    history,
    source: sourceMetadata(
      "/notice/search/hpiSearchListApi.search",
      INDIVIDUAL_HOUSE_REFERER
    ),
  };
}

function normalizeApartmentCandidates(list) {
  if (!Array.isArray(list)) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", "Apartment candidate list is not an array.", 502);
  }

  return list.map((raw, index) => ({
    noticeDate: String(raw.NOTICE_DATE ?? raw.noticeDate ?? ""),
    aptCode: String(raw.APT_CODE ?? raw.aptCode ?? ""),
    complexName: raw.MOD_APT_NAME || raw.aptName || raw.complexName || null,
    roadAddress: raw.FULL_ROAD_NAME || raw.roadAddress || null,
    landAddress: raw.FULL_BJD_NAME || raw.FULL_ADDR_NAME || raw.landAddress || null,
    regCode: raw.SREG ? String(raw.SREG) : raw.regCode || null,
    eubCode: raw.SEUB ? String(raw.SEUB) : raw.eubCode || null,
    pnu: raw.SPNU ? String(raw.SPNU) : raw.pnu || null,
    rank: raw.RN === undefined || raw.RN === null ? index + 1 : Number(raw.RN),
  }));
}

async function searchApartmentCandidates(selector = {}, options = {}) {
  const request = buildApartmentCandidateSearchRequest(selector);
  const data = await fetchJsonRequest(request, options);
  const { list, totalCnt } = getModelListPayload(data, "Apartment candidate");

  if (list === null || list.length === 0) {
    if (totalCnt > 0) {
      throw makeError(
        "UPSTREAM_AMBIGUOUS_EMPTY",
        "realtyprice.kr reported candidate count but returned an empty apartment list.",
        502
      );
    }
    return {
      status: "empty",
      query: { type: "apartment", complexName: normalizeSearchKeyword(selector.complexName) },
      candidates: [],
      source: sourceMetadata("/notice/m/town/getApt.do", APARTMENT_REFERER),
      error: {
        code: "APARTMENT_CANDIDATE_NOT_FOUND",
        message: "No apartment candidates were returned.",
      },
    };
  }

  return {
    status: "ok",
    query: { type: "apartment", complexName: normalizeSearchKeyword(selector.complexName) },
    candidates: normalizeApartmentCandidates(list),
    source: sourceMetadata("/notice/m/town/getApt.do", APARTMENT_REFERER),
  };
}

function normalizeCandidate(candidate = {}) {
  const aptCode = candidate.aptCode ?? candidate.APT_CODE;
  const noticeDate = candidate.noticeDate ?? candidate.NOTICE_DATE;
  if (aptCode === undefined || aptCode === null || String(aptCode).trim() === "") {
    throw makeError("INVALID_SELECTOR", "Apartment candidate requires aptCode.", 400);
  }
  if (noticeDate === undefined || noticeDate === null || String(noticeDate).trim() === "") {
    throw makeError("INVALID_SELECTOR", "Apartment candidate requires noticeDate.", 400);
  }

  return {
    noticeDate: String(noticeDate).trim(),
    aptCode: String(aptCode).trim(),
    complexName: candidate.complexName || candidate.MOD_APT_NAME || candidate.aptName || null,
    roadAddress: candidate.roadAddress || candidate.FULL_ROAD_NAME || null,
    landAddress: candidate.landAddress || candidate.FULL_BJD_NAME || candidate.FULL_ADDR_NAME || null,
    pnu: candidate.pnu || candidate.SPNU || null,
  };
}

function buildApartmentDetailRequest(candidate) {
  const normalized = normalizeCandidate(candidate);
  const params = new URLSearchParams({
    notice_date: normalized.noticeDate,
    apt_code: normalized.aptCode,
    tiles: "false",
  });

  return {
    method: "POST",
    url: `${REALTYPRICE_BASE_URL}/m/town/detail.do`,
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: APARTMENT_REFERER,
    },
    body: params.toString(),
  };
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, ""));
}

function parseAttributes(tag) {
  const attrs = {};
  for (const match of String(tag || "").matchAll(/([A-Za-z0-9_-]+)\s*=\s*(["'])(.*?)\2/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[3]);
  }
  return attrs;
}

function parseApartmentDongsFromHtml(html) {
  const selectMatch = String(html || "").match(/<select\b[^>]*id=["']sel_dong["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", "Apartment detail page is missing sel_dong options.", 502);
  }

  const options = [];
  for (const optionMatch of selectMatch[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const attrs = parseAttributes(optionMatch[1]);
    const code = attrs.value || "";
    const name = stripTags(optionMatch[2]);
    if (code && name && !name.includes("선택")) {
      options.push({ code, name });
    }
  }

  if (options.length === 0) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", "Apartment detail page returned no dong options.", 502);
  }
  return options;
}

async function listApartmentDongs(candidate, options = {}) {
  const request = buildApartmentDetailRequest(candidate);
  const html = await fetchTextRequest(request, options);
  return {
    status: "ok",
    candidate: normalizeCandidate(candidate),
    dongs: parseApartmentDongsFromHtml(html),
    source: sourceMetadata("/notice/m/town/detail.do", APARTMENT_REFERER),
  };
}

function selectUnique(items, selector, label, ambiguousCode) {
  const codeKey = `${label}Code`;
  const nameKey = `${label}Name`;
  const code = selector[codeKey] === undefined || selector[codeKey] === null
    ? ""
    : String(selector[codeKey]).trim();
  const name = selector[nameKey] === undefined || selector[nameKey] === null
    ? ""
    : String(selector[nameKey]).trim();

  if (code) {
    const match = items.find((item) => String(item.code) === code);
    if (!match) {
      throw makeError("INVALID_SELECTOR", `No ${label} matches code ${code}.`, 404);
    }
    return match;
  }

  if (name) {
    const matches = items.filter((item) => item.name === name);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw makeError(ambiguousCode, `Multiple ${label} choices match ${name}.`, 409, {
        choices: matches,
      });
    }
    throw makeError("INVALID_SELECTOR", `No ${label} matches name ${name}.`, 404);
  }

  if (items.length === 1) return items[0];
  throw makeError(ambiguousCode, `Multiple ${label} choices require an explicit selector.`, 409, {
    choices: items,
  });
}

function normalizeApartmentHos(list) {
  if (!Array.isArray(list)) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", "Apartment ho list is not an array.", 502);
  }
  return list.map((raw) => ({
    code: String(raw.CODE ?? raw.code ?? ""),
    name: String(raw.NAME ?? raw.name ?? ""),
    ktownHoSeq: String(raw.KTOWN_HO_SEQ ?? raw.ktownHoSeq ?? ""),
  })).filter((item) => item.code && item.name);
}

function buildApartmentHoRequest(candidate, dong) {
  const normalized = normalizeCandidate(candidate);
  const params = new URLSearchParams({
    notice_date: normalized.noticeDate,
    apt_code: normalized.aptCode,
    dong_code: String(dong.code),
  });

  return {
    method: "POST",
    url: `${REALTYPRICE_BASE_URL}/m/town/getHo.do`,
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${REALTYPRICE_BASE_URL}/m/town/detail.do`,
    },
    body: params.toString(),
  };
}

async function listApartmentHos(candidate, dong, options = {}) {
  const request = buildApartmentHoRequest(candidate, dong);
  const data = await fetchJsonRequest(request, options);
  const { list } = getModelListPayload(data, "Apartment ho");
  return {
    status: list && list.length > 0 ? "ok" : "empty",
    candidate: normalizeCandidate(candidate),
    dong,
    hos: normalizeApartmentHos(list || []),
    source: sourceMetadata("/notice/m/town/getHo.do", `${REALTYPRICE_BASE_URL}/m/town/detail.do`),
  };
}

function buildApartmentPriceHistoryRequest(candidate, dong, ho) {
  const normalized = normalizeCandidate(candidate);
  const params = new URLSearchParams({
    notice_date: normalized.noticeDate,
    apt_code: normalized.aptCode,
    dong_code: String(dong.code),
    ho_code: String(ho.code),
  });

  return {
    method: "POST",
    url: `${REALTYPRICE_BASE_URL}/m/town/getPriceYear.do`,
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${REALTYPRICE_BASE_URL}/m/town/detail.do`,
    },
    body: params.toString(),
  };
}

function normalizeApartmentPriceHistory(list) {
  if (!Array.isArray(list)) {
    throw makeError("UPSTREAM_SCHEMA_DRIFT", "Apartment price history list is not an array.", 502);
  }

  return list
    .map((raw) => ({
      year: parseYear(raw.NOTICE_DATE_NAME || raw.NOTICE_DATE || raw.NOTICE_DATE_ORG),
      base_date: parseDateLike(raw.NOTICE_DATE_NAME || raw.NOTICE_DATE),
      notice_date: parseDateLike(raw.NOTICE_DATE_ORG),
      price_won: parsePriceWon(raw.NOTICE_AMT),
      private_area_sqm: parseNumberish(raw.PRIV_AREA),
      raw: {
        price_won: raw.NOTICE_AMT ?? null,
        private_area_sqm: raw.PRIV_AREA ?? null,
        base_date: raw.NOTICE_DATE_NAME || raw.NOTICE_DATE || null,
        notice_date: raw.NOTICE_DATE_ORG || null,
      },
    }))
    .sort((a, b) => (b.year || 0) - (a.year || 0));
}

async function lookupApartmentPriceHistory(candidate, dong, ho, options = {}) {
  const request = buildApartmentPriceHistoryRequest(candidate, dong, ho);
  const data = await fetchJsonRequest(request, options);
  const { list, totalCnt } = getModelListPayload(data, "Apartment price history");

  if (list === null || list.length === 0) {
    if (totalCnt > 0) {
      throw makeError(
        "UPSTREAM_AMBIGUOUS_EMPTY",
        "realtyprice.kr reported apartment price count but returned an empty history list.",
        502
      );
    }
    return [];
  }

  return normalizeApartmentPriceHistory(list);
}

function chooseCandidate(candidates, selector) {
  const aptCode = selector.aptCode === undefined || selector.aptCode === null
    ? ""
    : String(selector.aptCode).trim();
  if (aptCode) {
    const match = candidates.find((candidate) => candidate.aptCode === aptCode);
    if (!match) {
      throw makeError("INVALID_SELECTOR", `No apartment candidate matches aptCode ${aptCode}.`, 404);
    }
    return match;
  }

  if (candidates.length === 1) return candidates[0];
  throw makeError(
    "AMBIGUOUS_APARTMENT_CANDIDATE",
    "Multiple apartment candidates require an explicit aptCode or candidate.",
    409,
    { candidates }
  );
}

async function lookupApartmentOfficialPrice(selector = {}, options = {}) {
  let candidate;
  if (selector.candidate) {
    candidate = normalizeCandidate(selector.candidate);
  } else {
    const candidateResult = await searchApartmentCandidates(selector, options);
    if (candidateResult.status === "empty") {
      return {
        status: "empty",
        query: candidateResult.query,
        candidates: [],
        history: [],
        source: candidateResult.source,
        error: candidateResult.error,
      };
    }
    candidate = chooseCandidate(candidateResult.candidates, selector);
  }

  const dongResult = await listApartmentDongs(candidate, options);
  const dong = selectUnique(dongResult.dongs, selector, "dong", "AMBIGUOUS_APARTMENT_DONG");
  const hoResult = await listApartmentHos(candidate, dong, options);
  const ho = selectUnique(hoResult.hos, selector, "ho", "AMBIGUOUS_APARTMENT_HO");
  const history = await lookupApartmentPriceHistory(candidate, dong, ho, options);

  return {
    status: history.length > 0 ? "ok" : "empty",
    query: {
      type: "apartment",
      complexName: selector.complexName || candidate.complexName || null,
    },
    selected: {
      candidate,
      unit: {
        dongCode: String(dong.code),
        dongName: dong.name,
        hoCode: String(ho.code),
        hoName: ho.name,
        ktownHoSeq: ho.ktownHoSeq,
      },
    },
    history,
    source: sourceMetadata("/notice/m/town/getPriceYear.do", `${REALTYPRICE_BASE_URL}/m/town/detail.do`),
  };
}

module.exports = {
  REALTYPRICE_BASE_URL,
  INDIVIDUAL_HOUSE_REFERER,
  APARTMENT_REFERER,
  DEFAULT_TIMEOUT_MS,
  makeError,
  parsePnu,
  buildIndividualHouseHistoryRequest,
  buildApartmentCandidateSearchRequest,
  normalizeIndividualHouseHistory,
  lookupIndividualHousePriceByPnu,
  normalizeApartmentCandidates,
  searchApartmentCandidates,
  buildApartmentDetailRequest,
  parseApartmentDongsFromHtml,
  listApartmentDongs,
  normalizeApartmentHos,
  listApartmentHos,
  buildApartmentPriceHistoryRequest,
  normalizeApartmentPriceHistory,
  lookupApartmentPriceHistory,
  lookupApartmentOfficialPrice,
};
