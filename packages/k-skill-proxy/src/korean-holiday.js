const KOREAN_HOLIDAY_BASE_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService";

const HOLIDAY_OPERATIONS = {
  anniversary: "getAnniversaryInfo",
  rest: "getRestDeInfo",
  national: "getHoliDeInfo",
  solarTerm: "get24DivisionsInfo",
  sundry: "getSundryDayInfo"
};

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

function normalizeKoreanHolidayOperation(value) {
  const operation = trimOrNull(value) || "rest";
  if (!Object.hasOwn(HOLIDAY_OPERATIONS, operation)) {
    throw new Error(`operation must be one of: ${Object.keys(HOLIDAY_OPERATIONS).join(", ")}.`);
  }
  return operation;
}

function normalizeKoreanHolidayQuery(query = {}) {
  const operation = normalizeKoreanHolidayOperation(query.operation ?? query.type);
  const solYear = trimOrNull(query.solYear ?? query.year);
  if (!solYear || !/^\d{4}$/.test(solYear)) {
    throw new Error("Provide solYear/year as YYYY.");
  }
  const solMonthRaw = trimOrNull(query.solMonth ?? query.month);
  let solMonth = null;
  if (solMonthRaw) {
    const digits = solMonthRaw.padStart(2, "0");
    if (!/^(0[1-9]|1[0-2])$/.test(digits)) {
      throw new Error("Provide solMonth/month as 01-12.");
    }
    solMonth = digits;
  }
  return {
    operation,
    solYear,
    solMonth,
    pageNo: parseBoundedPositiveInteger(query.pageNo ?? query.page, {
      defaultValue: 1,
      max: 1000,
      label: "pageNo"
    }),
    numOfRows: parseBoundedPositiveInteger(query.numOfRows ?? query.limit, {
      defaultValue: 100,
      max: 1000,
      label: "numOfRows"
    })
  };
}

function isDataGoKrGatewayError(text) {
  return text.includes("<OpenAPI_ServiceResponse")
    || text.includes("SERVICE KEY IS NOT REGISTERED")
    || text.includes("SERVICE_KEY_IS_NOT_REGISTERED");
}

async function proxyKoreanHolidayRequest({ params, serviceKey, fetchImpl = global.fetch }) {
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
  const upstreamOperation = HOLIDAY_OPERATIONS[params.operation];
  const url = new URL(`${KOREAN_HOLIDAY_BASE_URL}/${upstreamOperation}`);
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("solYear", params.solYear);
  if (params.solMonth) {
    url.searchParams.set("solMonth", params.solMonth);
  }

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  if (isDataGoKrGatewayError(body)) {
    return {
      statusCode: 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_forbidden",
        message: "Korean holiday upstream rejected the request. The proxy key may not be approved for service 15012690."
      })
    };
  }
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/xml; charset=utf-8",
    body
  };
}

module.exports = {
  HOLIDAY_OPERATIONS,
  KOREAN_HOLIDAY_BASE_URL,
  normalizeKoreanHolidayQuery,
  proxyKoreanHolidayRequest
};
