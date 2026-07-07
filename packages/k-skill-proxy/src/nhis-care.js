const NHIS_LONG_TERM_CARE_URL =
  "https://apis.data.go.kr/B550928/searchLtcInsttService02/getBillGreentInsttSearchList02";
const NHIS_CHECKUP_BASE_URL = "https://apis.data.go.kr/B550928/HmcSearchService";
const NHIS_CHECKUP_OPERATIONS = {
  "by-region": "getRegnHmcList",
  "by-checkup-type": "getHchkTypesHmcList",
  holiday: "getHolidaysHmcList",
  list: "getHmcList"
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

function normalizeNhisLongTermCareQuery(query = {}) {
  const adminNm = trimOrNull(query.adminNm ?? query.admin_nm ?? query.name ?? query.q ?? query.query);
  const siDoCd = trimOrNull(query.siDoCd ?? query.sido ?? query.sido_cd ?? query.si_do_cd);
  const siGunGuCd = trimOrNull(query.siGunGuCd ?? query.sigungu ?? query.sigungu_cd ?? query.si_gun_gu_cd);
  const serviceKind = trimOrNull(query.serviceKind ?? query.service_kind);
  const pageNo = parseBoundedPositiveInteger(query.pageNo ?? query.page ?? query.page_no, {
    defaultValue: 1,
    max: 1000,
    label: "pageNo"
  });
  const numOfRows = parseBoundedPositiveInteger(query.numOfRows ?? query.perPage ?? query.limit ?? query.num_of_rows, {
    defaultValue: 10,
    max: 100,
    label: "numOfRows"
  });

  if (!adminNm && !siDoCd && !siGunGuCd && !serviceKind) {
    throw new Error("Provide adminNm, siDoCd, siGunGuCd, or serviceKind.");
  }
  if (siDoCd && !/^\d+$/.test(siDoCd)) {
    throw new Error("Provide valid siDoCd.");
  }
  if (siGunGuCd && !/^\d+$/.test(siGunGuCd)) {
    throw new Error("Provide valid siGunGuCd.");
  }
  if (serviceKind && !/^\d+$/.test(serviceKind)) {
    throw new Error("Provide valid serviceKind.");
  }

  return {
    adminNm,
    siDoCd,
    siGunGuCd,
    serviceKind,
    pageNo,
    numOfRows
  };
}

function normalizeNhisCheckupQuery(operation, query = {}) {
  const upstreamOperation = NHIS_CHECKUP_OPERATIONS[operation];
  if (!upstreamOperation) {
    throw new Error("Provide valid NHIS checkup operation.");
  }

  const hmcNm = trimOrNull(query.hmcNm ?? query.hmc_nm ?? query.name ?? query.q ?? query.query);
  const siDoCd = trimOrNull(query.siDoCd ?? query.sido ?? query.sido_cd ?? query.si_do_cd);
  const siGunGuCd = trimOrNull(query.siGunGuCd ?? query.sigungu ?? query.sigungu_cd ?? query.si_gun_gu_cd);
  const hchkTypeCd = trimOrNull(
    query.hchkTypeCd ?? query.hchk_type ?? query.hchk_type_cd ?? query.checkupType ?? query.checkup_type
  );
  const pageNo = parseBoundedPositiveInteger(query.pageNo ?? query.page ?? query.page_no, {
    defaultValue: 1,
    max: 1000,
    label: "pageNo"
  });
  const numOfRows = parseBoundedPositiveInteger(query.numOfRows ?? query.perPage ?? query.limit ?? query.num_of_rows, {
    defaultValue: 10,
    max: 100,
    label: "numOfRows"
  });

  if (!hmcNm && !siDoCd && !siGunGuCd && !hchkTypeCd) {
    throw new Error("Provide hmcNm, siDoCd, siGunGuCd, or hchkTypeCd.");
  }
  if (siDoCd && !/^\d+$/.test(siDoCd)) {
    throw new Error("Provide valid siDoCd.");
  }
  if (siGunGuCd && !/^\d+$/.test(siGunGuCd)) {
    throw new Error("Provide valid siGunGuCd.");
  }
  if (hchkTypeCd && !/^\d+$/.test(hchkTypeCd)) {
    throw new Error("Provide valid hchkTypeCd.");
  }

  return {
    operation,
    upstreamOperation,
    hmcNm,
    siDoCd,
    siGunGuCd,
    hchkTypeCd,
    pageNo,
    numOfRows
  };
}

function isDataGoKrGatewayError(text) {
  return text.includes("<OpenAPI_ServiceResponse")
    || text.includes("SERVICE KEY IS NOT REGISTERED")
    || text.includes("SERVICE_KEY_IS_NOT_REGISTERED");
}

function isUpstreamAuthStatus(status) {
  return status === 401 || status === 403;
}

async function proxyNhisLongTermCareRequest({ params, serviceKey, fetchImpl = global.fetch }) {
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

  const url = new URL(NHIS_LONG_TERM_CARE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("numOfRows", String(params.numOfRows));
  for (const key of ["siDoCd", "siGunGuCd", "serviceKind", "adminNm"]) {
    const value = params[key];
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  if (isUpstreamAuthStatus(response.status) || isDataGoKrGatewayError(body)) {
    return {
      statusCode: 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_forbidden",
        message: "NHIS long-term care upstream rejected the request. The proxy key may not be approved for service 15059029."
      })
    };
  }

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/xml; charset=utf-8",
    body
  };
}

async function proxyNhisCheckupRequest({ params, serviceKey, fetchImpl = global.fetch }) {
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

  const url = new URL(`${NHIS_CHECKUP_BASE_URL}/${params.upstreamOperation}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("numOfRows", String(params.numOfRows));
  for (const key of ["siDoCd", "siGunGuCd", "hchkTypeCd", "hmcNm"]) {
    const value = params[key];
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  if (isUpstreamAuthStatus(response.status) || isDataGoKrGatewayError(body)) {
    return {
      statusCode: 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_forbidden",
        message: "NHIS checkup upstream rejected the request. The proxy key may not be approved for service 15154419."
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
  NHIS_CHECKUP_BASE_URL,
  NHIS_CHECKUP_OPERATIONS,
  NHIS_LONG_TERM_CARE_URL,
  normalizeNhisCheckupQuery,
  normalizeNhisLongTermCareQuery,
  proxyNhisCheckupRequest,
  proxyNhisLongTermCareRequest
};
