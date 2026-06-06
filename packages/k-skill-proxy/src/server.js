const crypto = require("node:crypto");
const Fastify = require("fastify");
const { fetchFineDustReport } = require("./airkorea");
const { fetchWaterLevelReport } = require("./hrfco");
const { KRX_MARKETS, fetchBaseInfo, fetchTradeInfo, getCurrentKstDate, searchStocks } = require("./krx-stock");
const {
  fetchMfdsDrugLookup,
  fetchMfdsFoodSafetySearch,
  fetchHealthFoodIngredient,
  fetchHealthFoodProductReport,
  fetchInspectionFail,
  normalizeMfdsDrugLookupQuery,
  normalizeMfdsFoodSafetyQuery
} = require("./mfds");
const {
  fetchLhNoticeDetail,
  fetchLhNoticeList,
  normalizeLhNoticeDetailQuery,
  normalizeLhNoticeSearchQuery
} = require("./lh-notice");
const { fetchTransactions, VALID_ASSET_TYPES, VALID_DEAL_TYPES } = require("./molit");
const {
  fetchKakaoLocalEndpoint,
  fetchKakaoMobilityDirections,
  normalizeKakaoCategorySearchQuery,
  normalizeKakaoCoordToAddressQuery,
  normalizeKakaoKeywordSearchQuery,
  normalizeKakaoMobilityDirectionsQuery
} = require("./kakao-map");
const { fetchNaverNewsSearch, normalizeNaverNewsSearchQuery } = require("./naver-news");
const { fetchNaverShoppingSearch, normalizeNaverShoppingSearchQuery } = require("./naver-shopping");
const {
  normalizeNtsBusinessStatusQuery,
  normalizeNtsBusinessValidateQuery,
  proxyNtsBusinessRequest
} = require("./nts-business");
const {
  isKstartupErrorBody,
  normalizeKstartupQuery,
  proxyKstartupRequest
} = require("./kstartup");
const { fetchNearbyParkingLots } = require("./parking-lots");
const { searchRegionCode } = require("./region-lookup");
const { resolveEducationOfficeFromNaturalLanguage } = require("./neis-office-codes");
const AIR_KOREA_UPSTREAM_BASE_URL = "http://apis.data.go.kr";
const DATA_GO_KR_UPSTREAM_BASE_URL = "https://apis.data.go.kr";
const DATA4LIBRARY_UPSTREAM_BASE_URL = "https://data4library.kr/api";
const KAKAO_LOCAL_API_BASE_URL = "https://dapi.kakao.com/v2/local";
const KOSIS_OPEN_API_BASE_URL = "https://kosis.kr/openapi";
const SEOUL_OPEN_API_BASE_URL = "http://swopenapi.seoul.go.kr";
const SEOUL_CITYDATA_BASE_URL = "http://openapi.seoul.go.kr:8088";
const KMA_FORECAST_BASE_TIMES = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KMA_FORECAST_READY_MINUTE = 10;
const OPINET_API_BASE_URL = "https://www.opinet.co.kr/api";
const NEIS_MEAL_SERVICE_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo";
const NEIS_SCHOOL_INFO_URL = "https://open.neis.go.kr/hub/schoolInfo";

const ALLOWED_AIRKOREA_ROUTES = new Map([
  ["MsrstnInfoInqireSvc", new Set(["getMsrstnList", "getNearbyMsrstnList", "getTMStdrCrdnt"])],
  ["ArpltnInforInqireSvc", new Set(["getMsrstnAcctoRltmMesureDnsty", "getCtprvnRltmMesureDnsty"])],
  ["UserSportSvc", new Set(["getSvckeyDalyStats"])],
]);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "replace-me") {
    return null;
  }
  return trimmed;
}

function padNumber(value, length) {
  return String(value).padStart(length, "0");
}

function formatKstDate(date) {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);
  return `${padNumber(kstDate.getUTCFullYear(), 4)}${padNumber(kstDate.getUTCMonth() + 1, 2)}${padNumber(kstDate.getUTCDate(), 2)}`;
}

function resolveLatestKmaForecastBase(now = new Date()) {
  const kstDate = new Date(now.getTime() + KST_OFFSET_MS);
  const currentMinutes = (kstDate.getUTCHours() * 60) + kstDate.getUTCMinutes();

  for (let index = KMA_FORECAST_BASE_TIMES.length - 1; index >= 0; index -= 1) {
    const baseTime = KMA_FORECAST_BASE_TIMES[index];
    const baseHour = Number.parseInt(baseTime.slice(0, 2), 10);
    const baseMinute = Number.parseInt(baseTime.slice(2, 4), 10);
    const readyMinutes = (baseHour * 60) + baseMinute + KMA_FORECAST_READY_MINUTE;

    if (currentMinutes >= readyMinutes) {
      return {
        baseDate: formatKstDate(now),
        baseTime
      };
    }
  }

  return {
    baseDate: formatKstDate(new Date(now.getTime() - (24 * 60 * 60 * 1000))),
    baseTime: KMA_FORECAST_BASE_TIMES[KMA_FORECAST_BASE_TIMES.length - 1]
  };
}

function convertLatLonToKmaGrid(latitude, longitude) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan((Math.PI * 0.25) + (slat2 * 0.5)) / Math.tan((Math.PI * 0.25) + (slat1 * 0.5));
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan((Math.PI * 0.25) + (slat1 * 0.5));
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;

  let ro = Math.tan((Math.PI * 0.25) + (olat * 0.5));
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan((Math.PI * 0.25) + ((latitude * DEGRAD) * 0.5));
  ra = (re * sf) / Math.pow(ra, sn);

  let theta = (longitude * DEGRAD) - olon;
  if (theta > Math.PI) {
    theta -= 2.0 * Math.PI;
  }
  if (theta < -Math.PI) {
    theta += 2.0 * Math.PI;
  }
  theta *= sn;

  return {
    nx: Math.floor((ra * Math.sin(theta)) + XO + 0.5),
    ny: Math.floor(ro - (ra * Math.cos(theta)) + YO + 0.5)
  };
}

function buildConfig(env = process.env) {
  return {
    host: env.KSKILL_PROXY_HOST || "127.0.0.1",
    port: parseInteger(env.KSKILL_PROXY_PORT, 4020),
    proxyName: env.KSKILL_PROXY_NAME || "k-skill-proxy",
    airKoreaApiKey: trimOrNull(env.AIR_KOREA_OPEN_API_KEY),
    kmaOpenApiKey: trimOrNull(env.KMA_OPEN_API_KEY),
    seoulOpenApiKey: trimOrNull(env.SEOUL_OPEN_API_KEY),
    hrfcoApiKey: trimOrNull(env.HRFCO_OPEN_API_KEY),
    opinetApiKey: trimOrNull(env.OPINET_API_KEY),
    molitApiKey: trimOrNull(env.DATA_GO_KR_API_KEY),
    data4libraryAuthKey: trimOrNull(env.DATA4LIBRARY_AUTH_KEY),
    foodsafetyKoreaApiKey: trimOrNull(env.FOODSAFETYKOREA_API_KEY),
    kakaoRestApiKey: trimOrNull(env.KAKAO_REST_API_KEY),
    keduInfoKey: trimOrNull(env.KEDU_INFO_KEY),
    krxApiKey: trimOrNull(env.KRX_API_KEY),
    kosisApiKey: trimOrNull(env.KOSIS_API_KEY ?? env.KSKILL_KOSIS_API_KEY),
    naverSearchClientId: trimOrNull(env.NAVER_SEARCH_CLIENT_ID ?? env.NAVER_CLIENT_ID),
    naverSearchClientSecret: trimOrNull(env.NAVER_SEARCH_CLIENT_SECRET ?? env.NAVER_CLIENT_SECRET),
    cacheTtlMs: parseInteger(env.KSKILL_PROXY_CACHE_TTL_MS, 300000),
    rateLimitWindowMs: parseInteger(env.KSKILL_PROXY_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMax: parseInteger(env.KSKILL_PROXY_RATE_LIMIT_MAX, 60)
  };
}

function makeCacheKey(payload) {
  if (!payload || typeof payload !== "object" || typeof payload.route !== "string" || !payload.route) {
    throw new Error(
      "makeCacheKey requires payload.route as a non-empty string to prevent cross-route key collisions."
    );
  }
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isFailureResponse(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (value.error) {
    return true;
  }
  if (value.upstream && value.upstream.degraded) {
    return true;
  }
  const hasWarnings = Array.isArray(value.warnings) && value.warnings.length > 0;
  const emptyItems = Array.isArray(value.items) && value.items.length === 0;
  if (hasWarnings && emptyItems) {
    return true;
  }
  return false;
}

function createMemoryCache() {
  const entries = new Map();

  return {
    get(key) {
      const cached = entries.get(key);
      if (!cached) {
        return null;
      }

      if (cached.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }

      return cached.value;
    },
    set(key, value, ttlMs) {
      if (isFailureResponse(value)) {
        return false;
      }
      entries.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
      return true;
    }
  };
}

function buildRateLimiter(config) {
  const state = new Map();

  return function rateLimit(request, reply) {
    const key = request.ip || "unknown";
    const now = Date.now();
    const current = state.get(key);

    if (!current || current.resetAt <= now) {
      state.set(key, {
        count: 1,
        resetAt: now + config.rateLimitWindowMs
      });
      return true;
    }

    if (current.count >= config.rateLimitMax) {
      reply.code(429).send({
        error: "rate_limited",
        message: "Too many requests.",
        retry_after_ms: current.resetAt - now
      });
      return false;
    }

    current.count += 1;
    return true;
  };
}

function normalizeFineDustQuery(query) {
  const regionHint = trimOrNull(query.regionHint ?? query.region_hint);
  const stationName = trimOrNull(query.stationName ?? query.station_name);

  if (!regionHint && !stationName) {
    throw new Error("Provide regionHint or stationName.");
  }

  return {
    regionHint,
    stationName
  };
}

function parseBoundedPositiveInteger(value, {
  defaultValue,
  min = 1,
  max = 100,
  label
}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`Provide valid ${label}.`);
  }

  const parsed = Number.parseInt(text, 10);
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function normalizeData4LibraryIsbn(value, label = "isbn13") {
  const normalized = trimOrNull(value);
  if (!normalized) {
    throw new Error(`Provide ${label}.`);
  }

  const compact = normalized.replace(/-/g, "").toUpperCase();
  if (!/^(?:\d{9}[\dX]|\d{13})$/.test(compact)) {
    throw new Error(`Provide valid ${label} (10 or 13 digits).`);
  }
  return compact;
}

function parseData4LibraryIsbn10CheckValue(character) {
  return character === "X" ? 10 : Number.parseInt(character, 10);
}

function isValidData4LibraryIsbn10(isbn10) {
  const sum = [...isbn10].reduce((total, digit, index) => (
    total + parseData4LibraryIsbn10CheckValue(digit) * (10 - index)
  ), 0);
  return sum % 11 === 0;
}

function convertData4LibraryIsbn10ToIsbn13(isbn10) {
  const body = `978${isbn10.slice(0, 9)}`;
  const sum = [...body].reduce((total, digit, index) => (
    total + Number.parseInt(digit, 10) * (index % 2 === 0 ? 1 : 3)
  ), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${body}${checkDigit}`;
}

function normalizeData4LibraryIsbn13(value, label = "isbn13") {
  const isbn = normalizeData4LibraryIsbn(value, label);
  if (isbn.length === 13) {
    return isbn;
  }
  if (!isValidData4LibraryIsbn10(isbn)) {
    throw new Error(`Provide valid ${label} (10 or 13 digits).`);
  }
  return convertData4LibraryIsbn10ToIsbn13(isbn);
}

function normalizeData4LibraryPage(query) {
  return {
    pageNo: parseBoundedPositiveInteger(query.pageNo ?? query.page_no ?? query.page, {
      defaultValue: 1,
      min: 1,
      max: 1000,
      label: "pageNo"
    }),
    pageSize: parseBoundedPositiveInteger(query.pageSize ?? query.page_size ?? query.limit, {
      defaultValue: 10,
      min: 1,
      max: 100,
      label: "pageSize"
    })
  };
}

function normalizeData4LibraryBookSearchQuery(query) {
  const keyword = trimOrNull(query.keyword ?? query.q ?? query.query);
  if (!keyword) {
    throw new Error("Provide keyword.");
  }

  return {
    keyword,
    ...normalizeData4LibraryPage(query)
  };
}

function normalizeData4LibraryBookDetailQuery(query) {
  const isbn13 = normalizeData4LibraryIsbn(query.isbn13 ?? query.isbn, "isbn13");
  const loaninfoYN = trimOrNull(query.loaninfoYN ?? query.loanInfoYN ?? query.loan_info_yn ?? query.loanInfo);

  if (loaninfoYN && !/^[YN]$/i.test(loaninfoYN)) {
    throw new Error("loaninfoYN must be Y or N.");
  }

  return {
    isbn13,
    loaninfoYN: loaninfoYN ? loaninfoYN.toUpperCase() : "N"
  };
}

function normalizeData4LibraryBookExistsQuery(query) {
  const libCode = trimOrNull(query.libCode ?? query.libraryCode ?? query.library_code);
  if (!libCode) {
    throw new Error("Provide libraryCode.");
  }

  if (!/^\d+$/.test(libCode)) {
    throw new Error("Provide valid libraryCode.");
  }

  return {
    libCode,
    isbn13: normalizeData4LibraryIsbn13(query.isbn13 ?? query.isbn, "isbn13")
  };
}

function normalizeData4LibraryLibrariesByBookQuery(query) {
  const isbn = normalizeData4LibraryIsbn(query.isbn ?? query.isbn13, "isbn");
  const region = trimOrNull(query.region);
  if (!region) {
    throw new Error("Provide region.");
  }

  if (!/^\d+$/.test(region)) {
    throw new Error("Provide valid region.");
  }

  const normalized = {
    isbn,
    region,
    ...normalizeData4LibraryPage(query)
  };

  const dtlRegion = trimOrNull(query.dtl_region ?? query.dtlRegion ?? query.detailRegion);
  if (dtlRegion) {
    if (!/^\d+$/.test(dtlRegion)) {
      throw new Error("Provide valid dtl_region.");
    }
    normalized.dtl_region = dtlRegion;
  }

  return normalized;
}

function normalizeData4LibraryLibrarySearchQuery(query) {
  const normalized = normalizeData4LibraryPage(query);
  const libCode = trimOrNull(query.libCode ?? query.libraryCode ?? query.library_code);
  const region = trimOrNull(query.region);
  const dtlRegion = trimOrNull(query.dtl_region ?? query.dtlRegion ?? query.detailRegion);

  if (libCode) {
    if (!/^\d+$/.test(libCode)) {
      throw new Error("Provide valid libraryCode.");
    }
    normalized.libCode = libCode;
  }

  if (region) {
    if (!/^\d+$/.test(region)) {
      throw new Error("Provide valid region.");
    }
    normalized.region = region;
  }

  if (dtlRegion) {
    if (!/^\d+$/.test(dtlRegion)) {
      throw new Error("Provide valid dtl_region.");
    }
    normalized.dtl_region = dtlRegion;
  }

  return normalized;
}

function normalizeSeoulSubwayQuery(query) {
  const stationName = trimOrNull(query.stationName ?? query.station_name ?? query.station);
  if (!stationName) {
    throw new Error("Provide stationName.");
  }

  const startIndex = parseInteger(query.startIndex ?? query.start_index, 0);
  const endIndex = parseInteger(query.endIndex ?? query.end_index, 8);

  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error("Provide valid startIndex and endIndex.");
  }

  return {
    stationName,
    startIndex,
    endIndex
  };
}

function normalizeSeoulCityDataQuery(query) {
  const area = trimOrNull(query.area ?? query.areaNm ?? query.area_nm);
  if (!area) {
    throw new Error("Provide area.");
  }
  return { area };
}


function parseBoundedIntegerAlias(query, keys, { defaultValue, min, max, label }) {
  let raw;
  for (const key of keys) {
    if (query[key] !== undefined) {
      raw = query[key];
      break;
    }
  }
  let value = defaultValue;
  if (raw !== undefined) {
    if (typeof raw !== "string" || !/^[+-]?\d+$/.test(raw)) {
      throw new Error(`Provide valid ${label}.`);
    }
    value = Number(raw);
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Provide valid ${label}.`);
  }
  return value;
}

function parseNumberAlias(query, keys, { min, max, label }) {
  let raw;
  for (const key of keys) {
    if (query[key] !== undefined) {
      raw = query[key];
      break;
    }
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`Provide valid ${label}.`);
  }
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Provide valid ${label}.`);
  }
  return value;
}

function normalizeSeoulBikePageQuery(query = {}) {
  const startIndex = parseBoundedIntegerAlias(query, ["startIndex", "start_index", "start"], {
    defaultValue: 1,
    min: 1,
    max: 100000,
    label: "startIndex"
  });
  const endIndex = parseBoundedIntegerAlias(query, ["endIndex", "end_index", "end"], {
    defaultValue: 1000,
    min: 1,
    max: 100000,
    label: "endIndex"
  });
  if (endIndex < startIndex || endIndex - startIndex > 999) {
    throw new Error("Provide valid startIndex and endIndex.");
  }
  return { startIndex, endIndex };
}

function normalizeSeoulBikeNearbyQuery(query = {}) {
  const latitude = parseNumberAlias(query, ["latitude", "lat", "y"], {
    min: -90,
    max: 90,
    label: "latitude"
  });
  const longitude = parseNumberAlias(query, ["longitude", "lon", "lng", "x"], {
    min: -180,
    max: 180,
    label: "longitude"
  });
  const radiusMeters = parseBoundedIntegerAlias(query, ["radiusMeters", "radius_m", "radius"], {
    defaultValue: 500,
    min: 1,
    max: 5000,
    label: "radiusMeters"
  });
  const limit = parseBoundedIntegerAlias(query, ["limit"], {
    defaultValue: 10,
    min: 1,
    max: 50,
    label: "limit"
  });
  return { latitude, longitude, radiusMeters, limit };
}

function parseNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineDistanceMeters(aLat, aLon, bLat, bLon) {
  const earthRadiusMeters = 6371008.8;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLon / 2) ** 2));
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeSeoulBikeRealtimeRow(row, origin = null) {
  const latitude = parseNullableNumber(row.stationLatitude ?? row.latitude ?? row.lat);
  const longitude = parseNullableNumber(row.stationLongitude ?? row.longitude ?? row.lon ?? row.lng);
  const rackTotalCount = parseNullableNumber(row.rackTotCnt ?? row.rack_total_count);
  const availableBikes = parseNullableNumber(row.parkingBikeTotCnt ?? row.available_bikes);
  const sharedPercent = parseNullableNumber(row.shared ?? row.shared_percent);
  const emptyDocks = rackTotalCount === null || availableBikes === null
    ? null
    : Math.max(0, rackTotalCount - availableBikes);
  const distanceMeters = origin && latitude !== null && longitude !== null
    ? Math.round(haversineDistanceMeters(origin.latitude, origin.longitude, latitude, longitude))
    : null;

  return {
    station_id: row.stationId ?? row.station_id ?? null,
    station_name: row.stationName ?? row.station_name ?? null,
    rack_total_count: rackTotalCount,
    available_bikes: availableBikes,
    empty_docks: emptyDocks,
    shared_percent: sharedPercent,
    latitude,
    longitude,
    distance_m: distanceMeters
  };
}

function extractSeoulBikeRows(payload) {
  const status = payload && payload.rentBikeStatus;
  if (!status || !Array.isArray(status.row)) {
    return [];
  }
  return status.row;
}

function getSeoulOpenApiResultCode(result) {
  return result?.CODE ?? result?.["RESULT.CODE"] ?? result?.code ?? null;
}

function getSeoulOpenApiResultMessage(result) {
  return result?.MESSAGE ?? result?.["RESULT.MESSAGE"] ?? result?.message ?? null;
}

function findSeoulOpenApiResultEnvelope(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (payload.RESULT && typeof payload.RESULT === "object") {
    return payload.RESULT;
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object" && value.RESULT && typeof value.RESULT === "object") {
      return value.RESULT;
    }
  }
  return null;
}

function getSeoulOpenApiSemanticError(payload) {
  const result = findSeoulOpenApiResultEnvelope(payload);
  const code = getSeoulOpenApiResultCode(result);
  if (!code) {
    return null;
  }
  const normalizedCode = String(code).toUpperCase();
  if (normalizedCode.startsWith("INFO-")) {
    return null;
  }
  return {
    code: String(code),
    message: getSeoulOpenApiResultMessage(result) || "Seoul Open API returned an application-level error."
  };
}

function buildSeoulBikeSemanticErrorPayload(error, config) {
  return {
    error: "upstream_semantic_error",
    message: "Seoul Bike upstream returned an application-level error.",
    upstream: {
      code: error.code,
      message: error.message
    },
    proxy: {
      name: config.proxyName,
      cache: { hit: false, ttl_ms: config.cacheTtlMs },
      requested_at: new Date().toISOString()
    }
  };
}

function buildSeoulBikeUpstreamErrorPayload(config) {
  return {
    error: "upstream_error",
    message: "Seoul Bike upstream request failed.",
    proxy: {
      name: config.proxyName,
      cache: { hit: false, ttl_ms: config.cacheTtlMs },
      requested_at: new Date().toISOString()
    }
  };
}

function normalizeKosisSearchQuery(query) {
  const searchNm = trimOrNull(query.searchNm ?? query.search_nm ?? query.query ?? query.q);
  if (!searchNm) {
    throw new Error("Provide query.");
  }

  return {
    method: "getList",
    format: "json",
    jsonVD: "Y",
    searchNm,
    resultCount: parseBoundedPositiveInteger(query.resultCount ?? query.result_count ?? query.limit, {
      defaultValue: 20,
      min: 1,
      max: 5000,
      label: "resultCount"
    }),
    startCount: parseBoundedPositiveInteger(query.startCount ?? query.start_count ?? query.start, {
      defaultValue: 1,
      min: 1,
      max: 1000000,
      label: "startCount"
    })
  };
}

function normalizeKosisMetaQuery(query) {
  const orgId = trimOrNull(query.orgId ?? query.org_id) || "101";
  const tblId = trimOrNull(query.tblId ?? query.tableId ?? query.table_id ?? query.tbl_id);
  const type = (trimOrNull(query.type ?? query.metaType ?? query.meta_type) || "TBL").toUpperCase();

  if (!/^\d+$/.test(orgId)) {
    throw new Error("Provide valid orgId.");
  }
  if (!tblId) {
    throw new Error("Provide tableId.");
  }
  if (!["TBL", "ITM", "OBJ"].includes(type)) {
    throw new Error("metaType must be TBL, ITM, or OBJ.");
  }

  return {
    method: "getMeta",
    type,
    format: "json",
    jsonVD: "Y",
    orgId,
    tblId
  };
}

function normalizeKosisDataQuery(query) {
  const orgId = trimOrNull(query.orgId ?? query.org_id) || "101";
  const tblId = trimOrNull(query.tblId ?? query.tableId ?? query.table_id ?? query.tbl_id);
  const itmId = trimOrNull(query.itmId ?? query.itemId ?? query.item_id ?? query.itm_id) || "ALL";
  const prdSe = (trimOrNull(query.prdSe ?? query.prd_se) || "").toUpperCase();
  const startPrdDe = trimOrNull(query.startPrdDe ?? query.start_prd_de ?? query.start);
  const endPrdDe = trimOrNull(query.endPrdDe ?? query.end_prd_de ?? query.end);

  if (!/^\d+$/.test(orgId)) {
    throw new Error("Provide valid orgId.");
  }
  if (!tblId) {
    throw new Error("Provide tableId.");
  }
  if (!["M", "Q", "S", "Y", "F", "IR"].includes(prdSe)) {
    throw new Error("prdSe must be one of M, Q, S, Y, F, IR.");
  }
  if (!startPrdDe || !endPrdDe) {
    throw new Error("Provide start and end periods.");
  }

  const normalized = {
    method: "getList",
    format: "json",
    jsonVD: "Y",
    orgId,
    tblId,
    itmId,
    prdSe,
    startPrdDe,
    endPrdDe
  };

  for (let index = 1; index <= 8; index += 1) {
    const value = trimOrNull(query[`objL${index}`] ?? query[`obj_l${index}`]);
    if (value) {
      normalized[`objL${index}`] = value;
    }
  }
  if (!Object.keys(normalized).some((key) => /^objL\d+$/.test(key))) {
    normalized.objL1 = "ALL";
  }

  return normalized;
}

function normalizeKakaoLocalGeocodeQuery(query) {
  const q = trimOrNull(query.q ?? query.query);
  if (!q) {
    throw new Error("Provide query.");
  }

  return {
    query: q,
    size: parseBoundedPositiveInteger(query.size ?? query.limit, {
      defaultValue: 5,
      min: 1,
      max: 15,
      label: "size"
    }),
    page: parseBoundedPositiveInteger(query.page, {
      defaultValue: 1,
      min: 1,
      max: 45,
      label: "page"
    })
  };
}

function normalizeKmaForecastQuery(query, now = new Date()) {
  const rawNx = parseInteger(query.nx, Number.NaN);
  const rawNy = parseInteger(query.ny, Number.NaN);
  const latitude = parseFloatValue(query.lat ?? query.latitude);
  const longitude = parseFloatValue(query.lon ?? query.longitude ?? query.lng);
  const hasGrid = Number.isFinite(rawNx) && Number.isFinite(rawNy);
  const hasLatLon = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!hasGrid && !hasLatLon) {
    throw new Error("Provide nx/ny or lat/lon.");
  }

  if ((Number.isFinite(rawNx) && !Number.isFinite(rawNy)) || (!Number.isFinite(rawNx) && Number.isFinite(rawNy))) {
    throw new Error("Provide both nx and ny.");
  }

  if ((Number.isFinite(latitude) && !Number.isFinite(longitude)) || (!Number.isFinite(latitude) && Number.isFinite(longitude))) {
    throw new Error("Provide both lat and lon.");
  }

  if (hasLatLon && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
    throw new Error("Provide valid lat and lon.");
  }

  const pageNo = parseInteger(query.pageNo ?? query.page_no, 1);
  const numOfRows = parseInteger(query.numOfRows ?? query.num_of_rows, 1000);
  const dataType = trimOrNull(query.dataType ?? query.data_type)?.toUpperCase() || "JSON";
  const rawBaseDate = trimOrNull(query.baseDate ?? query.base_date);
  const rawBaseTime = trimOrNull(query.baseTime ?? query.base_time);

  if ((rawBaseDate && !rawBaseTime) || (!rawBaseDate && rawBaseTime)) {
    throw new Error("Provide both baseDate and baseTime.");
  }

  if (pageNo < 1 || numOfRows < 1) {
    throw new Error("Provide valid pageNo and numOfRows.");
  }

  if (!["JSON", "XML"].includes(dataType)) {
    throw new Error("Provide dataType as JSON or XML.");
  }

  const { baseDate, baseTime } = rawBaseDate && rawBaseTime
    ? {
        baseDate: rawBaseDate,
        baseTime: rawBaseTime
      }
    : resolveLatestKmaForecastBase(now);

  if (!/^\d{8}$/.test(baseDate) || !/^\d{4}$/.test(baseTime)) {
    throw new Error("Provide baseDate as YYYYMMDD and baseTime as HHMM.");
  }

  const grid = hasGrid ? { nx: rawNx, ny: rawNy } : convertLatLonToKmaGrid(latitude, longitude);

  if (!Number.isFinite(grid.nx) || !Number.isFinite(grid.ny)) {
    throw new Error(hasGrid ? "Provide valid nx and ny." : "Provide valid lat and lon.");
  }

  return {
    baseDate,
    baseTime,
    nx: grid.nx,
    ny: grid.ny,
    pageNo,
    numOfRows,
    dataType
  };
}

function normalizeOpinetAroundQuery(query) {
  const x = parseFloatValue(query.x);
  const y = parseFloatValue(query.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Provide x and y as KATEC coordinates.");
  }
  const radius = parseInteger(query.radius, 1000);
  if (radius <= 0 || radius > 5000) {
    throw new Error("radius must be between 1 and 5000.");
  }
  const prodcd = trimOrNull(query.prodcd) || "B027";
  const sort = parseInteger(query.sort, 1);
  return { x, y, radius, prodcd, sort };
}

function normalizeOpinetDetailQuery(query) {
  const id = trimOrNull(query.id);
  if (!id) {
    throw new Error("Provide id.");
  }
  return { id };
}

function normalizeNeisSchoolMealQuery(query) {
  const atptOfcdcScCode = trimOrNull(
    query.atptOfcdcScCode ??
      query.ATPT_OFCDC_SC_CODE ??
      query.education_office_code ??
      query.educationOfficeCode
  );
  const sdSchulCode = trimOrNull(
    query.sdSchulCode ?? query.SD_SCHUL_CODE ?? query.school_code ?? query.schoolCode
  );
  const dateRaw = trimOrNull(
    query.mlsvYmd ?? query.MLSV_YMD ?? query.meal_date ?? query.mealDate ?? query.date
  );

  if (!atptOfcdcScCode) {
    throw new Error("Provide educationOfficeCode (ATPT_OFCDC_SC_CODE).");
  }
  if (!sdSchulCode) {
    throw new Error("Provide schoolCode (SD_SCHUL_CODE).");
  }
  if (!dateRaw) {
    throw new Error("Provide mealDate (MLSV_YMD) as YYYYMMDD.");
  }

  const mlsvYmd = dateRaw.replaceAll("-", "").replaceAll(".", "");
  if (!/^\d{8}$/.test(mlsvYmd)) {
    throw new Error("mealDate must be YYYYMMDD (8 digits).");
  }

  const mealKindRaw = trimOrNull(
    query.mmealScCode ?? query.MMEAL_SC_CODE ?? query.meal_kind_code ?? query.mealKindCode
  );
  let mmealScCode = null;
  if (mealKindRaw) {
    if (!["1", "2", "3"].includes(mealKindRaw)) {
      throw new Error("mealKindCode must be 1 (breakfast), 2 (lunch), or 3 (dinner).");
    }
    mmealScCode = mealKindRaw;
  }

  const pIndex = parseInteger(query.pIndex ?? query.p_index, 1);
  const pSize = parseInteger(query.pSize ?? query.p_size, 100);
  if (pIndex < 1) {
    throw new Error("pIndex must be >= 1.");
  }
  if (pSize < 1 || pSize > 1000) {
    throw new Error("pSize must be between 1 and 1000.");
  }

  return { atptOfcdcScCode, sdSchulCode, mlsvYmd, mmealScCode, pIndex, pSize };
}

function normalizeNeisSchoolSearchQuery(query) {
  const educationOfficeRaw = trimOrNull(
    query.educationOffice ??
      query.education_office ??
      query.office ??
      query.atpt ??
      query.ATPT_OFCDC_SC_CODE
  );
  const schoolNameRaw = trimOrNull(
    query.schoolName ?? query.school_name ?? query.school ?? query.SCHUL_NM ?? query.schulNm
  );

  if (!educationOfficeRaw) {
    throw new Error("Provide educationOffice (e.g. 서울특별시교육청 or B10).");
  }
  if (!schoolNameRaw) {
    throw new Error("Provide schoolName (e.g. 미래초등학교).");
  }

  const resolved = resolveEducationOfficeFromNaturalLanguage(educationOfficeRaw);
  if (!resolved.ok) {
    if (resolved.reason === "ambiguous") {
      const err = new Error(
        `educationOffice matched multiple offices (${resolved.codes.join(", ")}). Use a more specific name or pass the ATPT code (e.g. B10).`
      );
      err.code = "ambiguous_education_office";
      err.candidate_codes = resolved.codes;
      throw err;
    }
    throw new Error(
      "educationOffice is not a recognized regional office. Use names like 서울특별시교육청 or a code like B10."
    );
  }

  const pIndex = parseInteger(query.pIndex ?? query.p_index, 1);
  const pSize = parseInteger(query.pSize ?? query.p_size, 100);
  if (pIndex < 1) {
    throw new Error("pIndex must be >= 1.");
  }
  if (pSize < 1 || pSize > 1000) {
    throw new Error("pSize must be between 1 and 1000.");
  }

  return {
    educationOfficeInput: educationOfficeRaw,
    atptOfcdcScCode: resolved.code,
    resolvedOfficeLabel: resolved.matchedLabel,
    schulNm: schoolNameRaw,
    pIndex,
    pSize
  };
}

function normalizeRealEstateQuery(query) {
  const lawdCd = trimOrNull(query.lawd_cd ?? query.lawdCd);
  if (!lawdCd || !/^\d{5}$/.test(lawdCd)) {
    throw new Error("Provide lawd_cd as a 5-digit region code.");
  }

  const dealYmd = trimOrNull(query.deal_ymd ?? query.dealYmd);
  if (!dealYmd || !/^\d{6}$/.test(dealYmd)) {
    throw new Error("Provide deal_ymd as YYYYMM.");
  }

  const numOfRows = parseInteger(query.num_of_rows ?? query.numOfRows, 100);
  if (numOfRows < 1 || numOfRows > 1000) {
    throw new Error("num_of_rows must be between 1 and 1000.");
  }

  return { lawdCd, dealYmd, numOfRows };
}

function normalizeParkingLotSearchQuery(query) {
  const latitude = parseFloatValue(query.latitude ?? query.lat);
  const longitude = parseFloatValue(query.longitude ?? query.lon ?? query.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Provide latitude and longitude.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("Provide valid latitude and longitude.");
  }

  const limit = parseInteger(query.limit, 5);
  if (limit < 1 || limit > 50) {
    throw new Error("limit must be between 1 and 50.");
  }

  const radius = parseInteger(query.radius ?? query.max_distance_meters ?? query.maxDistanceMeters, 2000);
  if (radius < 1 || radius > 50000) {
    throw new Error("radius must be between 1 and 50000.");
  }


  const publicOnlyRaw = trimOrNull(query.publicOnly ?? query.public_only);
  const publicOnly = publicOnlyRaw
    ? !["0", "false", "n", "no"].includes(publicOnlyRaw.toLowerCase())
    : true;
  const addressHint = trimOrNull(query.addressHint ?? query.address_hint);
  const parkingType = trimOrNull(query.parkingType ?? query.parking_type);

  return {
    latitude,
    longitude,
    limit,
    radius,
    publicOnly,
    addressHint,
    parkingType
  };
}

function normalizeRegionCodeQuery(query) {
  const q = trimOrNull(query.q ?? query.query);
  if (!q) {
    throw new Error("Provide q (region name query).");
  }
  return { q };
}

function normalizeHanRiverWaterLevelQuery(query) {
  const stationName = trimOrNull(query.stationName ?? query.station_name ?? query.station);
  const stationCode = trimOrNull(query.stationCode ?? query.station_code ?? query.wlobscd);

  if (!stationName && !stationCode) {
    throw new Error("Provide stationName or stationCode.");
  }

  return {
    stationName,
    stationCode
  };
}

function normalizeKrxMarket(value) {
  const normalized = trimOrNull(value)?.toUpperCase();
  if (!normalized || !KRX_MARKETS.includes(normalized)) {
    throw new Error(`Provide market as one of: ${KRX_MARKETS.join(", ")}.`);
  }

  return normalized;
}

function normalizeKoreanStockDate(value) {
  const normalized = trimOrNull(value) || getCurrentKstDate();
  if (!/^\d{8}$/.test(normalized)) {
    throw new Error("Provide bas_dd/date as YYYYMMDD.");
  }

  return normalized;
}

function normalizeKoreanStockCodes(value) {
  const values = Array.isArray(value) ? value : [value];
  const codes = values
    .flatMap((entry) => String(entry || "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (codes.length === 0) {
    throw new Error("Provide code/stockCode/codes.");
  }

  return [...new Set(codes)];
}

function normalizeKoreanStockSearchQuery(query) {
  const q = trimOrNull(query.q ?? query.query);
  if (!q) {
    throw new Error("Provide q/query.");
  }

  const basDd = normalizeKoreanStockDate(query.bas_dd ?? query.basDd ?? query.date);
  const marketValue = trimOrNull(query.market);
  const limit = parseInteger(query.limit, 10);

  if (limit < 1 || limit > 20) {
    throw new Error("limit must be between 1 and 20.");
  }

  return {
    q,
    basDd,
    market: marketValue ? normalizeKrxMarket(marketValue) : null,
    limit
  };
}

function normalizeKoreanStockLookupQuery(query) {
  return {
    market: normalizeKrxMarket(query.market),
    code: normalizeKoreanStockCodes(query.code ?? query.codes ?? query.codeList ?? query.stockCode ?? query.stock_code)[0],
    basDd: normalizeKoreanStockDate(query.bas_dd ?? query.basDd ?? query.date)
  };
}


function isAllowedAirKoreaRoute(service, operation) {
  return ALLOWED_AIRKOREA_ROUTES.get(service)?.has(operation) || false;
}

async function proxyAirKoreaRequest({ service, operation, query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "AIR_KOREA_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  if (!isAllowedAirKoreaRoute(service, operation)) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That AirKorea route is not exposed by this proxy."
      })
    };
  }

  const url = new URL(`${AIR_KOREA_UPSTREAM_BASE_URL}/B552584/${service}/${operation}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "" || key === "serviceKey") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("serviceKey", serviceKey);

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxySeoulSubwayRequest({
  stationName,
  startIndex = 0,
  endIndex = 8,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "SEOUL_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  const encodedStationName = encodeURIComponent(stationName);
  const url = new URL(
    `${SEOUL_OPEN_API_BASE_URL}/api/subway/${apiKey}/json/realtimeStationArrival/${startIndex}/${endIndex}/${encodedStationName}`
  );

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxySeoulCityDataRequest({
  area,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "SEOUL_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  const encodedArea = encodeURIComponent(area);
  const url = new URL(
    `${SEOUL_CITYDATA_BASE_URL}/${apiKey}/json/citydata_ppltn/1/1/${encodedArea}`
  );

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}


function seoulOpenApiNotConfiguredResponse() {
  return {
    statusCode: 503,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({
      error: "upstream_not_configured",
      message: "SEOUL_OPEN_API_KEY is not configured on the proxy server."
    })
  };
}

async function proxySeoulBikeDatasetRequest({
  dataset,
  startIndex = 1,
  endIndex = 1000,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return seoulOpenApiNotConfiguredResponse();
  }

  const url = new URL(
    `${SEOUL_CITYDATA_BASE_URL}/${apiKey}/json/${dataset}/${startIndex}/${endIndex}/`
  );

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxySeoulBikeRealtimeRequest(options) {
  return proxySeoulBikeDatasetRequest({ ...options, dataset: "bikeList" });
}

async function proxySeoulBikeStationsRequest(options) {
  return proxySeoulBikeDatasetRequest({ ...options, dataset: "tbCycleStationInfo" });
}

async function fetchAllSeoulBikeRealtimeRows({ apiKey, fetchImpl = global.fetch }) {
  const first = await proxySeoulBikeRealtimeRequest({
    startIndex: 1,
    endIndex: 1000,
    apiKey,
    fetchImpl
  });
  if (first.statusCode !== 200 || !first.contentType.includes("json")) {
    return { upstream: first, rows: null };
  }

  const payload = JSON.parse(first.body);
  const semanticError = getSeoulOpenApiSemanticError(payload);
  if (semanticError) {
    return { upstream: first, rows: null, semanticError };
  }
  const rows = extractSeoulBikeRows(payload);
  const totalCount = Number(payload.rentBikeStatus?.list_total_count ?? rows.length);
  const safeTotalCount = Number.isFinite(totalCount) ? Math.max(totalCount, rows.length) : rows.length;

  for (let startIndex = 1001; startIndex <= safeTotalCount; startIndex += 1000) {
    const endIndex = Math.min(startIndex + 999, safeTotalCount);
    const next = await proxySeoulBikeRealtimeRequest({ startIndex, endIndex, apiKey, fetchImpl });
    if (next.statusCode !== 200 || !next.contentType.includes("json")) {
      return { upstream: next, rows: null };
    }
    const nextPayload = JSON.parse(next.body);
    const nextSemanticError = getSeoulOpenApiSemanticError(nextPayload);
    if (nextSemanticError) {
      return { upstream: next, rows: null, semanticError: nextSemanticError };
    }
    rows.push(...extractSeoulBikeRows(nextPayload));
  }

  return { upstream: first, rows };
}

async function proxyKmaWeatherRequest({
  baseDate,
  baseTime,
  nx,
  ny,
  pageNo = 1,
  numOfRows = 1000,
  dataType = "JSON",
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KMA_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${DATA_GO_KR_UPSTREAM_BASE_URL}/1360000/VilageFcstInfoService_2.0/getVilageFcst`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("dataType", dataType);
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxyData4LibraryRequest({
  operation,
  params = {},
  authKey,
  fetchImpl = global.fetch
}) {
  const allowedOperations = new Set([
    "libSrch",
    "srchBooks",
    "srchDtlList",
    "bookExist",
    "libSrchByBook"
  ]);

  if (!allowedOperations.has(operation)) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That Data4Library route is not exposed by this proxy."
      })
    };
  }

  if (!authKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "DATA4LIBRARY_AUTH_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${DATA4LIBRARY_UPSTREAM_BASE_URL}/${operation}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "" || key === "authKey" || key === "format") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("authKey", authKey);

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxyKosisRequest({
  operation,
  params = {},
  apiKey,
  fetchImpl = global.fetch
}) {
  const paths = {
    search: "statisticsSearch.do",
    meta: "statisticsData.do",
    data: "Param/statisticsParameterData.do"
  };
  const path = paths[operation];

  if (!path) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That KOSIS route is not exposed by this proxy."
      })
    };
  }

  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KOSIS_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${KOSIS_OPEN_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "" || key === "apiKey") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("apiKey", apiKey);

  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "k-skill-proxy/kosis"
    },
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxyKakaoLocalRequest({
  endpoint,
  params = {},
  apiKey,
  fetchImpl = global.fetch
}) {
  const paths = {
    address: "search/address.json",
    keyword: "search/keyword.json"
  };
  const path = paths[endpoint];

  if (!path) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That Kakao Local route is not exposed by this proxy."
      })
    };
  }

  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KAKAO_REST_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${KAKAO_LOCAL_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "" || key === "apiKey") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetchImpl(url, {
    headers: {
      authorization: `KakaoAK ${apiKey}`,
      "user-agent": "k-skill-proxy/kakao-local"
    },
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

function hasKakaoLocalDocuments(body) {
  try {
    const payload = JSON.parse(String(body || ""));
    return Array.isArray(payload.documents) && payload.documents.length > 0;
  } catch {
    return false;
  }
}

function isSuccessfulJsonResponse(upstream) {
  return upstream.statusCode >= 200 && upstream.statusCode < 300 && upstream.contentType.includes("json");
}

function isKosisErrorBody(body) {
  const text = String(body || "").trim();
  if (!text) {
    return true;
  }
  if (/<error>\s*<err>/i.test(text)) {
    return true;
  }
  if (!(text.startsWith("{") || text.startsWith("["))) {
    return false;
  }

  try {
    const payload = JSON.parse(text.replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":'));
    return Boolean(payload && !Array.isArray(payload) && typeof payload === "object" && (payload.err || payload.errCode || payload.error));
  } catch {
    return false;
  }
}

async function proxyOpinetRequest({ path, params, apiKey, fetchImpl = global.fetch }) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "OPINET_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${OPINET_API_BASE_URL}/${path}`);
  url.searchParams.set("out", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("certkey", apiKey);

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxyHrfcoWaterLevelRequest({
  stationName = null,
  stationCode = null,
  apiKey,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "HRFCO_OPEN_API_KEY is not configured on the proxy server."
      })
    };
  }

  try {
    const report = await fetchWaterLevelReport({
      stationName,
      stationCode,
      serviceKey: apiKey,
      fetchImpl
    });

    return {
      statusCode: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(report)
    };
  } catch (error) {
    const payload = {
      error: error.code || "proxy_error",
      message: error.message
    };

    if (Array.isArray(error.candidateStations)) {
      payload.candidate_stations = error.candidateStations;
    }

    return {
      statusCode: error.statusCode && error.statusCode >= 400 ? error.statusCode : 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payload)
    };
  }
}

async function proxyNeisSchoolMealRequest({
  apiKey,
  atptOfcdcScCode,
  sdSchulCode,
  mlsvYmd,
  mmealScCode = null,
  pIndex = 1,
  pSize = 100,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KEDU_INFO_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(NEIS_MEAL_SERVICE_URL);
  url.searchParams.set("KEY", apiKey);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", String(pIndex));
  url.searchParams.set("pSize", String(pSize));
  url.searchParams.set("ATPT_OFCDC_SC_CODE", atptOfcdcScCode);
  url.searchParams.set("SD_SCHUL_CODE", sdSchulCode);
  url.searchParams.set("MLSV_YMD", mlsvYmd);
  if (mmealScCode) {
    url.searchParams.set("MMEAL_SC_CODE", mmealScCode);
  }

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

async function proxyNeisSchoolInfoRequest({
  apiKey,
  atptOfcdcScCode,
  schulNm,
  pIndex = 1,
  pSize = 100,
  fetchImpl = global.fetch
}) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KEDU_INFO_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(NEIS_SCHOOL_INFO_URL);
  url.searchParams.set("KEY", apiKey);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", String(pIndex));
  url.searchParams.set("pSize", String(pSize));
  url.searchParams.set("ATPT_OFCDC_SC_CODE", atptOfcdcScCode);
  url.searchParams.set("SCHUL_NM", schulNm);

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}



function validateHouseholdWastePaginationQuery(query) {
  const HOUSEHOLD_WASTE_PAGINATION_RULE =
    "Household waste info requires pageNo=1 and numOfRows=100 (page_no and num_of_rows accepted). Other values or non-digit strings return 400.";

  const rawPage = query.pageNo ?? query.page_no;
  const rawNum = query.numOfRows ?? query.num_of_rows;
  const pageProvided =
    rawPage !== undefined && rawPage !== null && String(rawPage).trim() !== "";
  const numProvided =
    rawNum !== undefined && rawNum !== null && String(rawNum).trim() !== "";

  if (!pageProvided || !numProvided) {
    return { ok: false, message: HOUSEHOLD_WASTE_PAGINATION_RULE };
  }

  const parseDigitsOnlyUInt = (raw, label) => {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) {
      return {
        ok: false,
        message: `Invalid ${label} for household waste info: use digits only; pageNo must be 1 and numOfRows must be 100.`
      };
    }
    return { ok: true, value: Number.parseInt(s, 10) };
  };

  const pageParsed = parseDigitsOnlyUInt(rawPage, "pageNo");
  if (!pageParsed.ok) {
    return pageParsed;
  }
  if (pageParsed.value !== 1) {
    return { ok: false, message: HOUSEHOLD_WASTE_PAGINATION_RULE };
  }

  const numParsed = parseDigitsOnlyUInt(rawNum, "numOfRows");
  if (!numParsed.ok) {
    return numParsed;
  }
  if (numParsed.value !== 100) {
    return { ok: false, message: HOUSEHOLD_WASTE_PAGINATION_RULE };
  }

  return { ok: true };
}

function buildServer({ env = process.env, provider = null, now = () => new Date() } = {}) {
  const config = buildConfig(env);
  const cache = createMemoryCache();
  const rateLimit = buildRateLimiter(config);
  const app = Fastify({
    logger: true,
    disableRequestLogging: true
  });

  app.decorate("configValues", config);
  app.decorate("provider", provider || ((params) => fetchFineDustReport({
    ...params,
    serviceKey: config.airKoreaApiKey
  })));

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    if (!rateLimit(request, reply)) {
      return reply;
    }
  });

  app.get("/health", async () => {
    const naverSearchKeysPresent = Boolean(config.naverSearchClientId && config.naverSearchClientSecret);
    return {
      ok: true,
      service: config.proxyName,
      port: config.port,
      upstreams: {
        airKoreaConfigured: Boolean(config.airKoreaApiKey),
        kmaOpenApiConfigured: Boolean(config.kmaOpenApiKey),
        seoulOpenApiConfigured: Boolean(config.seoulOpenApiKey),
        hrfcoConfigured: Boolean(config.hrfcoApiKey),
        opinetConfigured: Boolean(config.opinetApiKey),
        molitConfigured: Boolean(config.molitApiKey),
        lhNoticeConfigured: Boolean(config.molitApiKey),
        data4libraryConfigured: Boolean(config.data4libraryAuthKey),
        foodsafetyKoreaConfigured: Boolean(config.foodsafetyKoreaApiKey),
        neisSchoolMealConfigured: Boolean(config.keduInfoKey),
        krxConfigured: Boolean(config.krxApiKey),
        kakaoLocalConfigured: Boolean(config.kakaoRestApiKey),
        kakaoMapConfigured: Boolean(config.kakaoRestApiKey),
        kakaoMobilityConfigured: Boolean(config.kakaoRestApiKey),
        kosisConfigured: Boolean(config.kosisApiKey),
        naverShoppingConfigured: true,
        naverSearchApiConfigured: naverSearchKeysPresent,
        naverNewsApiConfigured: naverSearchKeysPresent,
        ntsBusinessConfigured: Boolean(config.molitApiKey),
        kstartupConfigured: Boolean(config.molitApiKey)
      },
      auth: {
        tokenRequired: false
      },
      timestamp: new Date().toISOString()
    };
  });

  app.get("/B552584/:service/:operation", async (request, reply) => {
    const { service, operation } = request.params;
    const upstream = await proxyAirKoreaRequest({
      service,
      operation,
      query: request.query,
      serviceKey: config.airKoreaApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    return upstream.body;
  });

  app.get("/v1/fine-dust/report", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeFineDustQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "fine-dust-report",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.airKoreaApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "AIR_KOREA_OPEN_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const report = await app.provider(normalized);
    const payload = {
      ...report,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/seoul-bike/realtime", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeSeoulBikePageQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({ route: "seoul-bike-realtime", ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let upstream;
    try {
      upstream = await proxySeoulBikeRealtimeRequest({
        ...normalized,
        apiKey: config.seoulOpenApiKey
      });
    } catch {
      reply.code(502);
      return buildSeoulBikeUpstreamErrorPayload(config);
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    let payload;
    try {
      payload = JSON.parse(upstream.body);
    } catch {
      reply.code(502);
      return buildSeoulBikeUpstreamErrorPayload(config);
    }
    const semanticError = getSeoulOpenApiSemanticError(payload);
    if (semanticError) {
      reply.code(502);
      return buildSeoulBikeSemanticErrorPayload(semanticError, config);
    }
    payload.proxy = {
      name: config.proxyName,
      cache: { hit: false, ttl_ms: config.cacheTtlMs },
      requested_at: new Date().toISOString()
    };
    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }
    return payload;
  });

  app.get("/v1/seoul-bike/stations", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeSeoulBikePageQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({ route: "seoul-bike-stations", ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let upstream;
    try {
      upstream = await proxySeoulBikeStationsRequest({
        ...normalized,
        apiKey: config.seoulOpenApiKey
      });
    } catch {
      reply.code(502);
      return buildSeoulBikeUpstreamErrorPayload(config);
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    let payload;
    try {
      payload = JSON.parse(upstream.body);
    } catch {
      reply.code(502);
      return buildSeoulBikeUpstreamErrorPayload(config);
    }
    const semanticError = getSeoulOpenApiSemanticError(payload);
    if (semanticError) {
      reply.code(502);
      return buildSeoulBikeSemanticErrorPayload(semanticError, config);
    }
    payload.proxy = {
      name: config.proxyName,
      cache: { hit: false, ttl_ms: config.cacheTtlMs },
      requested_at: new Date().toISOString()
    };
    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }
    return payload;
  });

  app.get("/v1/seoul-bike/nearby", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeSeoulBikeNearbyQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({ route: "seoul-bike-nearby", ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let realtimeResult;
    try {
      realtimeResult = await fetchAllSeoulBikeRealtimeRows({
        apiKey: config.seoulOpenApiKey
      });
    } catch {
      reply.code(502);
      return buildSeoulBikeUpstreamErrorPayload(config);
    }

    const { upstream, rows, semanticError } = realtimeResult;

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    if (semanticError) {
      reply.code(502);
      return buildSeoulBikeSemanticErrorPayload(semanticError, config);
    }
    if (!upstream.contentType.includes("json") || rows === null) {
      return upstream.body;
    }

    const origin = { latitude: normalized.latitude, longitude: normalized.longitude };
    const items = rows
      .map((row) => normalizeSeoulBikeRealtimeRow(row, origin))
      .filter((row) => row.latitude !== null && row.longitude !== null && row.distance_m !== null)
      .filter((row) => row.distance_m <= normalized.radiusMeters)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, normalized.limit);

    const payload = {
      query: {
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        radius_m: normalized.radiusMeters,
        limit: normalized.limit
      },
      count: items.length,
      items,
      proxy: {
        name: config.proxyName,
        cache: { hit: false, ttl_ms: config.cacheTtlMs },
        requested_at: new Date().toISOString()
      }
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }
    return payload;
  });

  app.get("/v1/seoul-subway/arrival", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeSeoulSubwayQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "seoul-subway-arrival",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxySeoulSubwayRequest({
      ...normalized,
      apiKey: config.seoulOpenApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/seoul-density/citydata", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeSeoulCityDataQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "seoul-density-citydata",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxySeoulCityDataRequest({
      ...normalized,
      apiKey: config.seoulOpenApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  async function handleKosisRoute({ operation, normalize, cacheRoute, request, reply }) {
    let normalized;

    try {
      normalized = normalize(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: cacheRoute,
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      reply.code(cached.statusCode);
      reply.header("content-type", cached.contentType);
      return cached.body;
    }

    const upstream = await proxyKosisRequest({
      operation,
      params: normalized,
      apiKey: config.kosisApiKey
    });

    if (upstream.statusCode >= 200 && upstream.statusCode < 300 && !isKosisErrorBody(upstream.body)) {
      cache.set(cacheKey, upstream, config.cacheTtlMs);
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    return upstream.body;
  }

  app.get("/v1/kosis/search", async (request, reply) => handleKosisRoute({
    operation: "search",
    normalize: normalizeKosisSearchQuery,
    cacheRoute: "kosis-search",
    request,
    reply
  }));

  app.get("/v1/kosis/meta", async (request, reply) => handleKosisRoute({
    operation: "meta",
    normalize: normalizeKosisMetaQuery,
    cacheRoute: "kosis-meta",
    request,
    reply
  }));

  app.get("/v1/kosis/data", async (request, reply) => handleKosisRoute({
    operation: "data",
    normalize: normalizeKosisDataQuery,
    cacheRoute: "kosis-data",
    request,
    reply
  }));

  app.get("/v1/kakao-local/geocode", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeKakaoLocalGeocodeQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "kakao-local-geocode",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      reply.code(cached.statusCode);
      reply.header("content-type", cached.contentType);
      return cached.body;
    }

    const address = await proxyKakaoLocalRequest({
      endpoint: "address",
      params: normalized,
      apiKey: config.kakaoRestApiKey
    });
    const upstream = isSuccessfulJsonResponse(address) && !hasKakaoLocalDocuments(address.body)
      ? await proxyKakaoLocalRequest({
          endpoint: "keyword",
          params: normalized,
          apiKey: config.kakaoRestApiKey
        })
      : address;

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, upstream, config.cacheTtlMs);
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);
    return upstream.body;
  });

  app.get("/v1/korea-weather/forecast", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeKmaForecastQuery(request.query || {}, now());
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "korea-weather-forecast",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxyKmaWeatherRequest({
      ...normalized,
      apiKey: config.kmaOpenApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.query = { ...normalized };
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/han-river/water-level", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeHanRiverWaterLevelQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "han-river-water-level",
      stationName: normalized.stationName?.toLowerCase() || null,
      stationCode: normalized.stationCode || null
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxyHrfcoWaterLevelRequest({
      ...normalized,
      apiKey: config.hrfcoApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/opinet/around", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeOpinetAroundQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "opinet-around",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxyOpinetRequest({
      path: "aroundAll.do",
      params: normalized,
      apiKey: config.opinetApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/opinet/detail", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeOpinetDetailQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "opinet-detail",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const upstream = await proxyOpinetRequest({
      path: "detailById.do",
      params: normalized,
      apiKey: config.opinetApiKey
    });

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    if (!upstream.contentType.includes("json")) {
      return upstream.body;
    }

    const payload = JSON.parse(upstream.body);
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });


  app.get("/v1/real-estate/region-code", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeRegionCodeQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "real-estate-region-code",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const results = searchRegionCode(normalized.q);
    const payload = {
      results,
      query: normalized.q,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/real-estate/:assetType/:dealType", async (request, reply) => {
    const { assetType, dealType } = request.params;

    if (!VALID_ASSET_TYPES.has(assetType)) {
      reply.code(404);
      return {
        error: "not_found",
        message: `Unknown asset type: ${assetType}. Valid: apartment, officetel, villa, single-house, commercial`
      };
    }

    if (!VALID_DEAL_TYPES.has(dealType)) {
      reply.code(404);
      return {
        error: "not_found",
        message: `Unknown deal type: ${dealType}. Valid: trade, rent`
      };
    }

    if (assetType === "commercial" && dealType === "rent") {
      reply.code(404);
      return {
        error: "not_found",
        message: "commercial/rent is not available. Only commercial/trade is supported."
      };
    }

    let normalized;

    try {
      normalized = normalizeRealEstateQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "real-estate",
      assetType,
      dealType,
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.molitApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const result = await fetchTransactions({
      assetType,
      dealType,
      lawdCd: normalized.lawdCd,
      dealYmd: normalized.dealYmd,
      numOfRows: normalized.numOfRows,
      serviceKey: config.molitApiKey
    });

    if (result.error) {
      reply.code(502);
      return {
        ...result,
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          },
          requested_at: new Date().toISOString()
        }
      };
    }

    const payload = {
      ...result,
      query: {
        asset_type: assetType,
        deal_type: dealType,
        lawd_cd: normalized.lawdCd,
        deal_ymd: normalized.dealYmd
      },
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/parking-lots/search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeParkingLotSearchQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "parking-lot-search",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.molitApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let result;
    try {
      result = await fetchNearbyParkingLots({
        ...normalized,
        serviceKey: config.molitApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.upstreamCode ? "upstream_error" : "proxy_error",
        message: error.message,
        upstream_code: error.upstreamCode || undefined,
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const payload = {
      ...result,
      query: {
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        limit: normalized.limit,
        radius: normalized.radius,
        public_only: normalized.publicOnly,
        address_hint: normalized.addressHint,
        parking_type: normalized.parkingType
      },
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/household-waste/info", async (request, reply) => {
    const query = request.query || {};
    const sggNm = query["cond[SGG_NM::LIKE]"];

    if (!sggNm || !sggNm.trim()) {
      reply.code(400);
      return {
        error: "bad_request",
        message: "cond[SGG_NM::LIKE] is required"
      };
    }

    const paginationCheck = validateHouseholdWastePaginationQuery(query);
    if (!paginationCheck.ok) {
      reply.code(400);
      return {
        error: "bad_request",
        message: paginationCheck.message
      };
    }

    const pageNo =  "1";
    const numOfRows =  "100";

    const cacheKey = makeCacheKey({
      route: "household-waste-info",
      sggNm: sggNm.trim()
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    if (!config.molitApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: { name: config.proxyName, cache: { hit: false, ttl_ms: config.cacheTtlMs } }
      };
    }

    const url = new URL("https://apis.data.go.kr/1741000/household_waste_info/info");
    url.searchParams.set("serviceKey", config.molitApiKey);
    url.searchParams.set("pageNo", pageNo);
    url.searchParams.set("numOfRows", numOfRows);
    url.searchParams.set("returnType", "json");
    url.searchParams.set("cond[SGG_NM::LIKE]", sggNm.trim());

    let upstreamData;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        reply.code(502);
        return {
          error: "upstream_error",
          message: `Upstream responded with ${res.status}`,
          proxy: { name: config.proxyName, cache: { hit: false, ttl_ms: config.cacheTtlMs } }
        };
      }
      upstreamData = await res.json();
    } catch (err) {
      reply.code(502);
      return {
        error: "upstream_fetch_failed",
        message: err.message,
        proxy: { name: config.proxyName, cache: { hit: false, ttl_ms: config.cacheTtlMs } }
      };
    }

    const payload = {
      ...upstreamData,
      query: { sgg_nm: sggNm.trim(), page_no: pageNo, num_of_rows: numOfRows },
      proxy: {
        name: config.proxyName,
        cache: { hit: false, ttl_ms: config.cacheTtlMs },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/lh-notice/search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeLhNoticeSearchQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "lh-notice-search",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.molitApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let body;
    try {
      body = await fetchLhNoticeList({
        serviceKey: config.molitApiKey,
        filters: normalized
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message,
        upstream_code: error.upstreamCode || undefined,
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    const payload = {
      ...body,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/lh-notice/detail", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeLhNoticeDetailQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "lh-notice-detail",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.molitApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let body;
    try {
      body = await fetchLhNoticeDetail({
        serviceKey: config.molitApiKey,
        filters: normalized
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message,
        upstream_code: error.upstreamCode || undefined,
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    const payload = {
      ...body,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });


  function getNtsUpstreamStatusCode(parsed) {
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed.status_code
      ?? parsed.statusCode
      ?? parsed.resultCode
      ?? parsed.response?.header?.resultCode
      ?? null;
  }

  function isNtsUpstreamSemanticFailure(parsed) {
    const statusCode = getNtsUpstreamStatusCode(parsed);
    if (statusCode === null || statusCode === undefined) {
      return false;
    }

    return !["OK", "00", "0", "SUCCESS"].includes(String(statusCode).toUpperCase());
  }

  const ntsValidateSensitiveResponseKeys = new Set([
    "b_adr",
    "b_nm",
    "b_sector",
    "b_type",
    "corp_no",
    "p_nm",
    "p_nm2",
    "start_dt"
  ]);

  function redactNtsBusinessValidateResponse(value) {
    if (Array.isArray(value)) {
      return value.map(redactNtsBusinessValidateResponse);
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ntsValidateSensitiveResponseKeys.has(key))
        .map(([key, entryValue]) => [key, redactNtsBusinessValidateResponse(entryValue)])
    );
  }

  async function handleNtsBusinessRoute({
    operation,
    route,
    normalizer,
    request,
    reply,
    cacheSuccess = true,
    includeQuery = true,
    responseMapper = (body) => body
  }) {
    let normalized;

    try {
      normalized = normalizer(request.body || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = cacheSuccess
      ? makeCacheKey({
        route,
        ...normalized
      })
      : null;
    if (cacheKey) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          proxy: {
            ...cached.proxy,
            cache: {
              hit: true,
              ttl_ms: config.cacheTtlMs
            }
          }
        };
      }
    }

    let upstream;
    try {
      upstream = await proxyNtsBusinessRequest({
        operation,
        payload: normalized,
        serviceKey: config.molitApiKey
      });
    } catch (error) {
      reply.code(502);
      return {
        error: "proxy_error",
        message: "NTS business upstream request failed.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        error: "upstream_invalid_response",
        message: "NTS business upstream did not return valid JSON.",
        upstream_status: upstream.statusCode,
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    const responseBody = responseMapper(parsed);

    if (
      upstream.statusCode < 200
      || upstream.statusCode >= 300
      || parsed.error
      || isNtsUpstreamSemanticFailure(parsed)
    ) {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        ...responseBody,
        error: parsed.error || "upstream_error",
        upstream_status_code: getNtsUpstreamStatusCode(parsed) || undefined,
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          },
          requested_at: new Date().toISOString()
        }
      };
    }

    const payload = {
      ...responseBody,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };
    if (includeQuery) {
      payload.query = normalized;
    }

    if (cacheKey) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }
    return payload;
  }

  app.post("/v1/nts-business/status", async (request, reply) => handleNtsBusinessRoute({
    operation: "status",
    route: "nts-business-status",
    normalizer: normalizeNtsBusinessStatusQuery,
    request,
    reply
  }));

  app.post("/v1/nts-business/validate", async (request, reply) => handleNtsBusinessRoute({
    operation: "validate",
    route: "nts-business-validate",
    normalizer: normalizeNtsBusinessValidateQuery,
    cacheSuccess: false,
    includeQuery: false,
    responseMapper: redactNtsBusinessValidateResponse,
    request,
    reply
  }));

  async function handleKstartupRoute({ operation, route, request, reply }) {
    let normalized;
    try {
      normalized = normalizeKstartupQuery(operation, request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    normalized.returnType = "json";

    const cacheKey = makeCacheKey({ route, ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let upstream;
    try {
      upstream = await proxyKstartupRequest({
        operation,
        query: normalized,
        serviceKey: config.molitApiKey
      });
    } catch (error) {
      reply.code(502);
      return {
        error: "proxy_error",
        message: "K-Startup upstream request failed.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (upstream.statusCode === 503) {
      reply.code(503);
      let upstreamPayload = null;
      try { upstreamPayload = JSON.parse(upstream.body); } catch { upstreamPayload = null; }
      return {
        error: upstreamPayload?.error || "upstream_not_configured",
        message: upstreamPayload?.message || "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        error: "upstream_invalid_response",
        message: "K-Startup upstream did not return valid JSON.",
        upstream_status: upstream.statusCode,
        upstream_body: upstream.body.slice(0, 500),
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (upstream.statusCode < 200 || upstream.statusCode >= 300 || isKstartupErrorBody(upstream.body)) {
      reply.code(upstream.statusCode >= 400 ? upstream.statusCode : 502);
      return {
        ...parsed,
        error: parsed?.error || "upstream_error",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          },
          requested_at: new Date().toISOString()
        }
      };
    }

    const payload = {
      ...parsed,
      query: normalized,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  }

  app.get("/v1/kstartup/business-info", async (request, reply) => handleKstartupRoute({
    operation: "business-info",
    route: "kstartup-business-info",
    request,
    reply
  }));

  app.get("/v1/kstartup/announcements", async (request, reply) => handleKstartupRoute({
    operation: "announcements",
    route: "kstartup-announcements",
    request,
    reply
  }));

  app.get("/v1/kstartup/contents", async (request, reply) => handleKstartupRoute({
    operation: "contents",
    route: "kstartup-contents",
    request,
    reply
  }));

  app.get("/v1/kstartup/statistics", async (request, reply) => handleKstartupRoute({
    operation: "statistics",
    route: "kstartup-statistics",
    request,
    reply
  }));

  app.get("/v1/mfds/drug-safety/lookup", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeMfdsDrugLookupQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "mfds-drug-safety-lookup",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.molitApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let payload;
    try {
      payload = await fetchMfdsDrugLookup({
        itemNames: normalized.itemNames,
        limit: normalized.limit,
        dataGoKrApiKey: config.molitApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/mfds/food-safety/search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeMfdsFoodSafetyQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "mfds-food-safety-search",
      ...normalized,
      hasImproperFoodKey: Boolean(config.molitApiKey),
      hasRecallKey: Boolean(config.foodsafetyKoreaApiKey)
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let payload;
    try {
      payload = await fetchMfdsFoodSafetySearch({
        query: normalized.query,
        limit: normalized.limit,
        dataGoKrApiKey: config.molitApiKey,
        foodsafetyKoreaApiKey: config.foodsafetyKoreaApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/mfds/food-safety/health-food-ingredient", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeMfdsFoodSafetyQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "mfds-health-food-ingredient",
      ...normalized,
      hasKey: Boolean(config.foodsafetyKoreaApiKey)
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let payload;
    try {
      payload = await fetchHealthFoodIngredient({
        query: normalized.query,
        limit: normalized.limit,
        foodsafetyKoreaApiKey: config.foodsafetyKoreaApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/mfds/food-safety/inspection-fail", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeMfdsFoodSafetyQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "mfds-inspection-fail",
      ...normalized,
      hasKey: Boolean(config.foodsafetyKoreaApiKey)
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let payload;
    try {
      payload = await fetchInspectionFail({
        query: normalized.query,
        limit: normalized.limit,
        foodsafetyKoreaApiKey: config.foodsafetyKoreaApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/mfds/food-safety/product-report", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeMfdsFoodSafetyQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "mfds-product-report",
      ...normalized,
      hasKey: Boolean(config.foodsafetyKoreaApiKey)
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let payload;
    try {
      payload = await fetchHealthFoodProductReport({
        query: normalized.query,
        limit: normalized.limit,
        foodsafetyKoreaApiKey: config.foodsafetyKoreaApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/korean-stock/search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeKoreanStockSearchQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "korean-stock-search",
      q: normalized.q.toLowerCase(),
      basDd: normalized.basDd,
      market: normalized.market,
      limit: normalized.limit
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.krxApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "KRX_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let result;
    try {
      result = await searchStocks({
        query: normalized.q,
        basDd: normalized.basDd,
        market: normalized.market,
        limit: normalized.limit,
        apiKey: config.krxApiKey,
        cache,
        cacheTtlMs: config.cacheTtlMs
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    const payload = {
      items: result.items,
      query: {
        q: normalized.q,
        bas_dd: normalized.basDd,
        market: normalized.market,
        limit: normalized.limit
      },
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    if (result.upstream) {
      payload.upstream = result.upstream;
    }

    if (!result.upstream?.degraded) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }
    return payload;
  });


  app.get("/v1/naver-shopping/search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeNaverShoppingSearchQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "naver-shopping-search",
      q: normalized.query.toLowerCase(),
      limit: normalized.limit,
      page: normalized.page,
      sort: normalized.sort
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let result;
    try {
      result = await fetchNaverShoppingSearch({
        ...normalized,
        clientId: config.naverSearchClientId,
        clientSecret: config.naverSearchClientSecret
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      const payload = {
        error: error.code || "proxy_error",
        message: error.message,
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
      if (error.upstreamStatusCode) {
        payload.upstream = {
          status_code: error.upstreamStatusCode,
          body_snippet: error.upstreamBodySnippet || null
        };
      }
      return payload;
    }

    const payload = {
      items: result.items,
      query: {
        q: normalized.query,
        limit: normalized.limit,
        page: normalized.page,
        sort: normalized.sort
      },
      meta: result.meta,
      upstream: result.upstream,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });


  app.get("/v1/naver-news/search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeNaverNewsSearchQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "naver-news-search",
      q: normalized.query.toLowerCase(),
      display: normalized.display,
      start: normalized.start,
      sort: normalized.sort
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let result;
    try {
      result = await fetchNaverNewsSearch({
        ...normalized,
        clientId: config.naverSearchClientId,
        clientSecret: config.naverSearchClientSecret
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      const payload = {
        error: error.code || "proxy_error",
        message: error.message,
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
      if (error.upstreamStatusCode) {
        payload.upstream = {
          status_code: error.upstreamStatusCode,
          body_snippet: error.upstreamBodySnippet || null
        };
      }
      return payload;
    }

    const payload = {
      items: result.items,
      query: {
        q: normalized.query,
        display: normalized.display,
        start: normalized.start,
        sort: normalized.sort
      },
      meta: result.meta,
      upstream: result.upstream,
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  async function handleKakaoLocalEndpointRoute({
    request,
    reply,
    route,
    endpoint,
    normalize
  }) {
    let normalized;
    try {
      normalized = normalize(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({ route, ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let result;
    try {
      result = await fetchKakaoLocalEndpoint({
        endpoint,
        params: normalized,
        apiKey: config.kakaoRestApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      const payload = {
        error: error.code || "proxy_error",
        message: error.message,
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
      if (error.upstreamStatusCode) {
        payload.upstream = {
          status_code: error.upstreamStatusCode,
          body_snippet: error.upstreamBodySnippet || null
        };
      }
      return payload;
    }

    const payload = {
      ...result.body,
      proxy: {
        name: config.proxyName,
        cache: { hit: false, ttl_ms: config.cacheTtlMs },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    reply.code(result.statusCode);
    reply.header("content-type", "application/json; charset=utf-8");
    return payload;
  }

  app.get("/v1/kakao-map/search/keyword", async (request, reply) => handleKakaoLocalEndpointRoute({
    request,
    reply,
    route: "kakao-map-search-keyword",
    endpoint: "keyword",
    normalize: normalizeKakaoKeywordSearchQuery
  }));

  app.get("/v1/kakao-map/search/category", async (request, reply) => handleKakaoLocalEndpointRoute({
    request,
    reply,
    route: "kakao-map-search-category",
    endpoint: "category",
    normalize: normalizeKakaoCategorySearchQuery
  }));

  app.get("/v1/kakao-map/coord2address", async (request, reply) => handleKakaoLocalEndpointRoute({
    request,
    reply,
    route: "kakao-map-coord2address",
    endpoint: "coord2address",
    normalize: normalizeKakaoCoordToAddressQuery
  }));

  app.get("/v1/kakao-map/coord2region", async (request, reply) => handleKakaoLocalEndpointRoute({
    request,
    reply,
    route: "kakao-map-coord2region",
    endpoint: "coord2region",
    normalize: normalizeKakaoCoordToAddressQuery
  }));

  app.get("/v1/kakao-mobility/directions", async (request, reply) => {
    let normalized;
    try {
      normalized = normalizeKakaoMobilityDirectionsQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({ route: "kakao-mobility-directions", ...normalized });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: { hit: true, ttl_ms: config.cacheTtlMs }
        }
      };
    }

    let result;
    try {
      result = await fetchKakaoMobilityDirections({
        ...normalized,
        apiKey: config.kakaoRestApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      const payload = {
        error: error.code || "proxy_error",
        message: error.message,
        proxy: {
          name: config.proxyName,
          cache: { hit: false, ttl_ms: config.cacheTtlMs }
        }
      };
      if (error.upstreamStatusCode) {
        payload.upstream = {
          status_code: error.upstreamStatusCode,
          body_snippet: error.upstreamBodySnippet || null
        };
      }
      return payload;
    }

    const payload = {
      ...result.body,
      proxy: {
        name: config.proxyName,
        cache: { hit: false, ttl_ms: config.cacheTtlMs },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    reply.code(result.statusCode);
    reply.header("content-type", "application/json; charset=utf-8");
    return payload;
  });

  async function handleData4LibraryRoute({
    request,
    reply,
    route,
    operation,
    normalize,
    queryPayload
  }) {
    let normalized;

    try {
      normalized = normalize(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route,
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.data4libraryAuthKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "DATA4LIBRARY_AUTH_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let upstream;
    try {
      upstream = await proxyData4LibraryRequest({
        operation,
        params: normalized,
        authKey: config.data4libraryAuthKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    const looksJson =
      upstream.contentType.includes("json") ||
      upstream.body.trimStart().startsWith("{") ||
      upstream.body.trimStart().startsWith("[");

    if (!looksJson) {
      return upstream.body;
    }

    let parsed;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      return upstream.body;
    }

    const payload = parsed && !Array.isArray(parsed) && typeof parsed === "object"
      ? { ...parsed }
      : { upstream: parsed };
    payload.query = queryPayload ? queryPayload(normalized) : normalized;
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  }

  app.get("/v1/data4library/library-search", async (request, reply) => handleData4LibraryRoute({
    request,
    reply,
    route: "data4library-library-search",
    operation: "libSrch",
    normalize: normalizeData4LibraryLibrarySearchQuery
  }));

  app.get("/v1/data4library/book-search", async (request, reply) => handleData4LibraryRoute({
    request,
    reply,
    route: "data4library-book-search",
    operation: "srchBooks",
    normalize: normalizeData4LibraryBookSearchQuery
  }));

  app.get("/v1/data4library/book-detail", async (request, reply) => handleData4LibraryRoute({
    request,
    reply,
    route: "data4library-book-detail",
    operation: "srchDtlList",
    normalize: normalizeData4LibraryBookDetailQuery
  }));

  app.get("/v1/data4library/book-exists", async (request, reply) => handleData4LibraryRoute({
    request,
    reply,
    route: "data4library-book-exists",
    operation: "bookExist",
    normalize: normalizeData4LibraryBookExistsQuery,
    queryPayload: (normalized) => ({
      library_code: normalized.libCode,
      isbn13: normalized.isbn13
    })
  }));

  app.get("/v1/data4library/libraries-by-book", async (request, reply) => handleData4LibraryRoute({
    request,
    reply,
    route: "data4library-libraries-by-book",
    operation: "libSrchByBook",
    normalize: normalizeData4LibraryLibrariesByBookQuery
  }));

  app.get("/v1/neis/school-search", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeNeisSchoolSearchQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      const payload = {
        error: error.code === "ambiguous_education_office" ? error.code : "bad_request",
        message: error.message
      };
      if (Array.isArray(error.candidate_codes)) {
        payload.candidate_codes = error.candidate_codes;
      }
      return payload;
    }

    const cacheKey = makeCacheKey({
      route: "neis-school-search",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.keduInfoKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "KEDU_INFO_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let upstream;
    try {
      upstream = await proxyNeisSchoolInfoRequest({
        apiKey: config.keduInfoKey,
        atptOfcdcScCode: normalized.atptOfcdcScCode,
        schulNm: normalized.schulNm,
        pIndex: normalized.pIndex,
        pSize: normalized.pSize
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    const looksJson =
      upstream.contentType.includes("json") ||
      upstream.body.trimStart().startsWith("{") ||
      upstream.body.trimStart().startsWith("[");

    if (!looksJson) {
      return upstream.body;
    }

    let payload;
    try {
      payload = JSON.parse(upstream.body);
    } catch {
      return upstream.body;
    }

    payload.resolved_education_office = {
      input: normalized.educationOfficeInput,
      atpt_ofcdc_sc_code: normalized.atptOfcdcScCode,
      matched_label: normalized.resolvedOfficeLabel
    };
    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };
    payload.query = {
      education_office: normalized.educationOfficeInput,
      school_name: normalized.schulNm,
      p_index: normalized.pIndex,
      p_size: normalized.pSize
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/neis/school-meal", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeNeisSchoolMealQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "neis-school-meal",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.keduInfoKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "KEDU_INFO_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let upstream;
    try {
      upstream = await proxyNeisSchoolMealRequest({
        apiKey: config.keduInfoKey,
        atptOfcdcScCode: normalized.atptOfcdcScCode,
        sdSchulCode: normalized.sdSchulCode,
        mlsvYmd: normalized.mlsvYmd,
        mmealScCode: normalized.mmealScCode,
        pIndex: normalized.pIndex,
        pSize: normalized.pSize
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    reply.code(upstream.statusCode);
    reply.header("content-type", upstream.contentType);

    const looksJson =
      upstream.contentType.includes("json") ||
      upstream.body.trimStart().startsWith("{") ||
      upstream.body.trimStart().startsWith("[");

    if (!looksJson) {
      return upstream.body;
    }

    let payload;
    try {
      payload = JSON.parse(upstream.body);
    } catch {
      return upstream.body;
    }

    payload.proxy = {
      name: config.proxyName,
      cache: {
        hit: false,
        ttl_ms: config.cacheTtlMs
      },
      requested_at: new Date().toISOString()
    };
    payload.query = {
      education_office_code: normalized.atptOfcdcScCode,
      school_code: normalized.sdSchulCode,
      meal_date: normalized.mlsvYmd,
      meal_kind_code: normalized.mmealScCode,
      p_index: normalized.pIndex,
      p_size: normalized.pSize
    };

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      cache.set(cacheKey, payload, config.cacheTtlMs);
    }

    return payload;
  });

  app.get("/v1/korean-stock/base-info", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeKoreanStockLookupQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "korean-stock-base-info",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.krxApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "KRX_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let items;
    try {
      items = await fetchBaseInfo({
        market: normalized.market,
        basDd: normalized.basDd,
        codeList: [normalized.code],
        apiKey: config.krxApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    if (items.length === 0) {
      reply.code(404);
      return {
        error: "not_found",
        message: `기준일 ${normalized.basDd} 에 ${normalized.market} 시장 종목 ${normalized.code} 을(를) 찾지 못했습니다.`
      };
    }

    const payload = {
      items,
      item: items[0],
      query: {
        market: normalized.market,
        code: normalized.code,
        codes: [normalized.code],
        bas_dd: normalized.basDd
      },
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.get("/v1/korean-stock/trade-info", async (request, reply) => {
    let normalized;

    try {
      normalized = normalizeKoreanStockLookupQuery(request.query || {});
    } catch (error) {
      reply.code(400);
      return {
        error: "bad_request",
        message: error.message
      };
    }

    const cacheKey = makeCacheKey({
      route: "korean-stock-trade-info",
      ...normalized
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        proxy: {
          ...cached.proxy,
          cache: {
            hit: true,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    if (!config.krxApiKey) {
      reply.code(503);
      return {
        error: "upstream_not_configured",
        message: "KRX_API_KEY is not configured on the proxy server.",
        proxy: {
          name: config.proxyName,
          cache: {
            hit: false,
            ttl_ms: config.cacheTtlMs
          }
        }
      };
    }

    let items;
    try {
      items = await fetchTradeInfo({
        market: normalized.market,
        basDd: normalized.basDd,
        codeList: [normalized.code],
        apiKey: config.krxApiKey
      });
    } catch (error) {
      reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502);
      return {
        error: error.code || "proxy_error",
        message: error.message
      };
    }

    if (items.length === 0) {
      reply.code(404);
      return {
        error: "not_found",
        message: `기준일 ${normalized.basDd} 에 ${normalized.market} 시장 종목 ${normalized.code} 의 일별 시세를 찾지 못했습니다. 휴장일이거나 데이터가 아직 없을 수 있습니다.`
      };
    }

    const payload = {
      items,
      item: items[0],
      query: {
        market: normalized.market,
        code: normalized.code,
        codes: [normalized.code],
        bas_dd: normalized.basDd
      },
      proxy: {
        name: config.proxyName,
        cache: {
          hit: false,
          ttl_ms: config.cacheTtlMs
        },
        requested_at: new Date().toISOString()
      }
    };

    cache.set(cacheKey, payload, config.cacheTtlMs);
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const payload = {
      error: error.code || (statusCode >= 500 ? "proxy_error" : "request_error"),
      message: error.message
    };

    if (Array.isArray(error.candidateStations)) {
      payload.candidate_stations = error.candidateStations;
    }

    if (Array.isArray(error.candidate_codes)) {
      payload.candidate_codes = error.candidate_codes;
    }

    if (error.sidoName) {
      payload.sido_name = error.sidoName;
    }

    reply.code(statusCode).send(payload);
  });

  return app;
}

async function startServer() {
  const app = buildServer();
  const { host, port } = app.configValues;
  await app.listen({ host, port });
  return app;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildConfig,
  buildServer,
  convertLatLonToKmaGrid,
  createMemoryCache,
  isFailureResponse,
  makeCacheKey,
  normalizeData4LibraryBookDetailQuery,
  normalizeData4LibraryBookExistsQuery,
  normalizeData4LibraryBookSearchQuery,
  normalizeData4LibraryLibrariesByBookQuery,
  normalizeData4LibraryLibrarySearchQuery,
  normalizeFineDustQuery,
  normalizeHanRiverWaterLevelQuery,
  normalizeKakaoLocalGeocodeQuery,
  normalizeKakaoKeywordSearchQuery,
  normalizeKakaoCategorySearchQuery,
  normalizeKakaoCoordToAddressQuery,
  normalizeKakaoMobilityDirectionsQuery,
  normalizeKmaForecastQuery,
  normalizeKosisDataQuery,
  normalizeKosisMetaQuery,
  normalizeKosisSearchQuery,
  normalizeKstartupQuery,
  normalizeKoreanStockLookupQuery,
  normalizeKoreanStockSearchQuery,
  normalizeLhNoticeDetailQuery,
  normalizeLhNoticeSearchQuery,
  normalizeOpinetAroundQuery,
  normalizeOpinetDetailQuery,
  normalizeNeisSchoolMealQuery,
  normalizeNeisSchoolSearchQuery,
  normalizeNaverShoppingSearchQuery,
  normalizeNtsBusinessStatusQuery,
  normalizeNtsBusinessValidateQuery,
  normalizeParkingLotSearchQuery,
  normalizeRealEstateQuery,
  normalizeRegionCodeQuery,
  normalizeSeoulBikeNearbyQuery,
  normalizeSeoulBikePageQuery,
  normalizeSeoulCityDataQuery,
  normalizeSeoulSubwayQuery,
  proxyAirKoreaRequest,
  proxyData4LibraryRequest,
  proxyHrfcoWaterLevelRequest,
  proxyKakaoLocalRequest,
  proxyNeisSchoolMealRequest,
  proxyNeisSchoolInfoRequest,
  proxyKmaWeatherRequest,
  proxyKosisRequest,
  proxyKstartupRequest,
  fetchKakaoLocalEndpoint,
  fetchKakaoMobilityDirections,
  fetchNaverShoppingSearch,
  proxyOpinetRequest,
  proxySeoulBikeRealtimeRequest,
  proxySeoulBikeStationsRequest,
  proxySeoulCityDataRequest,
  proxySeoulSubwayRequest,
  resolveLatestKmaForecastBase,
  startServer
};
