const KSTARTUP_UPSTREAM_BASE_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01";

const KSTARTUP_OPERATIONS = new Map([
  ["business-info", { path: "getBusinessInformation01", allowed: new Set(["page", "perPage", "returnType", "biz_category_cd", "supt_biz_titl_nm", "biz_yr"]) }],
  ["announcements", {
    path: "getAnnouncementInformation01",
    allowed: new Set([
      "page", "perPage", "returnType",
      "intg_pbanc_yn", "intg_pbanc_biz_nm", "biz_pbanc_nm",
      "supt_biz_clsfc", "aply_trgt_ctnt", "supt_regin",
      "pbanc_rcpt_bgng_dt", "pbanc_rcpt_end_dt",
      "aply_trgt", "biz_enyy", "biz_trgt_age", "prfn_matr",
      "rcrt_prgs_yn"
    ])
  }],
  ["contents", { path: "getContentInformation01", allowed: new Set(["page", "perPage", "returnType", "clss_cd", "titl_nm"]) }],
  ["statistics", { path: "getStatisticalInformation01", allowed: new Set(["page", "perPage", "returnType", "titl_nm", "file_nm"]) }]
]);

const KSTARTUP_INTEGER_FIELDS = new Set(["page", "perPage"]);
const KSTARTUP_DATE_FIELDS = new Set(["pbanc_rcpt_bgng_dt", "pbanc_rcpt_end_dt"]);
const KSTARTUP_YN_FIELDS = new Set(["intg_pbanc_yn", "rcrt_prgs_yn"]);
const KSTARTUP_TEXT_FIELD_LIMITS = {
  supt_biz_titl_nm: 300,
  intg_pbanc_biz_nm: 300,
  biz_pbanc_nm: 300,
  supt_biz_clsfc: 100,
  aply_trgt_ctnt: 300,
  supt_regin: 200,
  aply_trgt: 200,
  biz_enyy: 200,
  biz_trgt_age: 200,
  prfn_matr: 200,
  biz_category_cd: 50,
  clss_cd: 50,
  titl_nm: 300,
  file_nm: 1000
};
const KSTARTUP_MAX_PER_PAGE = 100;

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeKstartupYear(value) {
  const raw = trimOrNull(value);
  if (!raw) {
    return null;
  }
  if (!/^\d{4}$/.test(raw)) {
    throw new Error("Provide biz_yr as a 4-digit year (e.g. 2024).");
  }
  return raw;
}

function normalizeKstartupDate(value, field) {
  const raw = trimOrNull(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(normalized)) {
    throw new Error(`Provide ${field} as YYYYMMDD.`);
  }
  const year = Number.parseInt(normalized.slice(0, 4), 10);
  const month = Number.parseInt(normalized.slice(4, 6), 10);
  const day = Number.parseInt(normalized.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Provide ${field} as a valid YYYYMMDD date.`);
  }
  return normalized;
}

function normalizeKstartupYn(value, field) {
  const raw = trimOrNull(value);
  if (!raw) {
    return null;
  }
  const upper = raw.toUpperCase();
  if (upper !== "Y" && upper !== "N") {
    throw new Error(`Provide ${field} as Y or N.`);
  }
  return upper;
}

function normalizeKstartupInteger(value, field, { min, max }) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== raw.replace(/^\+/, "")) {
    throw new Error(`Provide ${field} as a positive integer.`);
  }
  if (parsed < min) {
    throw new Error(`Provide ${field} >= ${min}.`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`Provide ${field} <= ${max}.`);
  }
  return parsed;
}

function normalizeKstartupText(value, field) {
  const raw = trimOrNull(value);
  if (raw === null) {
    return null;
  }
  const maxLength = KSTARTUP_TEXT_FIELD_LIMITS[field];
  if (maxLength && raw.length > maxLength) {
    throw new Error(`Provide ${field} up to ${maxLength} characters.`);
  }
  return raw;
}

function normalizeKstartupReturnType() {
  // K-Startup proxy forces returnType=json so callers cannot ask for XML
  // through the proxy. Use --direct mode to fetch XML directly.
  return "json";
}

function normalizeKstartupQuery(operation, query = {}) {
  const definition = KSTARTUP_OPERATIONS.get(operation);
  if (!definition) {
    throw new Error(`Unknown K-Startup operation: ${operation}`);
  }

  const normalized = {};
  const page = normalizeKstartupInteger(query.page, "page", { min: 1 });
  normalized.page = page === null ? 1 : page;

  const perPage = normalizeKstartupInteger(query.perPage ?? query.per_page, "perPage", { min: 1, max: KSTARTUP_MAX_PER_PAGE });
  normalized.perPage = perPage === null ? 10 : perPage;

  normalized.returnType = normalizeKstartupReturnType();

  for (const field of definition.allowed) {
    if (field === "page" || field === "perPage" || field === "returnType") {
      continue;
    }
    const raw = query[field] ?? query[field.toLowerCase()];
    let value = null;
    if (field === "biz_yr") {
      value = normalizeKstartupYear(raw);
    } else if (KSTARTUP_DATE_FIELDS.has(field)) {
      value = normalizeKstartupDate(raw, field);
    } else if (KSTARTUP_YN_FIELDS.has(field)) {
      value = normalizeKstartupYn(raw, field);
    } else if (KSTARTUP_INTEGER_FIELDS.has(field)) {
      value = normalizeKstartupInteger(raw, field, { min: 1 });
    } else {
      value = normalizeKstartupText(raw, field);
    }
    if (value !== null && value !== undefined) {
      normalized[field] = value;
    }
  }

  if (
    normalized.pbanc_rcpt_bgng_dt &&
    normalized.pbanc_rcpt_end_dt &&
    normalized.pbanc_rcpt_bgng_dt > normalized.pbanc_rcpt_end_dt
  ) {
    throw new Error("Provide pbanc_rcpt_bgng_dt earlier than or equal to pbanc_rcpt_end_dt.");
  }

  return normalized;
}

async function proxyKstartupRequest({ operation, query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
      })
    };
  }

  const definition = KSTARTUP_OPERATIONS.get(operation);
  if (!definition) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That K-Startup route is not exposed by this proxy."
      })
    };
  }

  const url = new URL(`${KSTARTUP_UPSTREAM_BASE_URL}/${definition.path}`);
  url.searchParams.set("ServiceKey", serviceKey);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "" || key === "ServiceKey") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  // Always force JSON regardless of upstream defaults or caller overrides.
  url.searchParams.set("returnType", "json");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "k-skill-proxy/kstartup"
    },
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

function isKstartupErrorBody(body) {
  const text = String(body || "").trim();
  if (!text) {
    return true;
  }
  if (/<errMsg>|<returnAuthMsg>|SERVICE_KEY_IS_NOT_REGISTERED|LIMITED_NUMBER_OF_SERVICE_REQUESTS|DEADLINE_HAS_EXPIRED|SERVICE_ACCESS_DENIED/i.test(text)) {
    return true;
  }
  if (!(text.startsWith("{") || text.startsWith("["))) {
    return false;
  }
  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object") {
      return false;
    }
    if (payload.error || payload.errMsg || payload.returnAuthMsg) {
      return true;
    }
    if (payload.response && payload.response.header) {
      const code = String(payload.response.header.resultCode ?? "").trim();
      return code && code !== "00";
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  KSTARTUP_OPERATIONS,
  KSTARTUP_UPSTREAM_BASE_URL,
  normalizeKstartupQuery,
  proxyKstartupRequest,
  isKstartupErrorBody
};
