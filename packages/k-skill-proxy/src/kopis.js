const KOPIS_BASE_URL = "https://www.kopis.or.kr/openApi/restful";

const KOPIS_LIST_OPERATIONS = new Set(["performances", "facilities"]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseBoundedPositiveInteger(value, { defaultValue, max, label }) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`Provide valid ${label}.`);
  }
  const parsed = Number.parseInt(text, 10);
  if (parsed < 1 || parsed > max) {
    throw new Error(`${label} must be between 1 and ${max}.`);
  }
  return parsed;
}

function normalizeYyyymmdd(value, label) {
  const text = trimOrNull(value);
  if (!text) {
    throw new Error(`Provide ${label} as YYYYMMDD.`);
  }
  const digits = text.replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Provide ${label} as YYYYMMDD.`);
  }
  const year = Number.parseInt(digits.slice(0, 4), 10);
  const month = Number.parseInt(digits.slice(4, 6), 10);
  const day = Number.parseInt(digits.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Provide valid ${label}.`);
  }
  return digits;
}

function normalizeKopisListQuery(query = {}, operation = "performances") {
  if (!KOPIS_LIST_OPERATIONS.has(operation)) {
    throw new Error("Unsupported KOPIS operation.");
  }
  const cpage = parseBoundedPositiveInteger(query.cpage ?? query.page, {
    defaultValue: 1,
    max: 1000,
    label: "cpage"
  });
  const rows = parseBoundedPositiveInteger(query.rows ?? query.limit, {
    defaultValue: 10,
    max: 100,
    label: "rows"
  });
  const normalized = { cpage, rows };

  if (operation === "performances") {
    normalized.stdate = normalizeYyyymmdd(query.stdate ?? query.startDate ?? query.start, "stdate");
    normalized.eddate = normalizeYyyymmdd(query.eddate ?? query.endDate ?? query.end, "eddate");
    if (normalized.stdate > normalized.eddate) {
      throw new Error("stdate must be <= eddate.");
    }
  }

  const aliases = operation === "performances"
    ? {
        shcate: ["shcate", "genre"],
        prfplccd: ["prfplccd", "facilityCode"],
        signgucode: ["signgucode", "areaCode"],
        signgucodesub: ["signgucodesub", "sigunguCode"],
        kidstate: ["kidstate"],
        prfstate: ["prfstate"],
        openrun: ["openrun"],
        afterdate: ["afterdate"]
      }
    : {
        shprfnmfct: ["shprfnmfct", "q", "query", "name"],
        fcltychartr: ["fcltychartr"],
        signgucode: ["signgucode", "areaCode"],
        signgucodesub: ["signgucodesub", "sigunguCode"],
        afterdate: ["afterdate"]
      };
  for (const [target, keys] of Object.entries(aliases)) {
    for (const key of keys) {
      const value = trimOrNull(query[key]);
      if (value) {
        normalized[target] = value;
        break;
      }
    }
  }
  return normalized;
}

function normalizeKopisDetailQuery(query = {}, idLabel = "id") {
  const id = trimOrNull(query.id ?? query.mt20id ?? query.mt10id);
  if (!id) {
    throw new Error(`Provide ${idLabel}.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Provide valid ${idLabel}.`);
  }
  return { id };
}

async function proxyKopisRequest({ path, params = {}, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "KOPIS_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(`${KOPIS_BASE_URL}/${path}`);
  url.searchParams.set("service", serviceKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/xml; charset=utf-8",
    body: await response.text()
  };
}

module.exports = {
  KOPIS_BASE_URL,
  normalizeKopisDetailQuery,
  normalizeKopisListQuery,
  proxyKopisRequest
};
