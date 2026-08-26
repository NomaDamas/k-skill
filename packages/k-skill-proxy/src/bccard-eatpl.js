"use strict";

const DEFAULT_BASE_URL = "https://dev-api.paybooc.ai/api/mer";
const DEFAULT_TIMEOUT_MS = 20000;

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed && trimmed !== "replace-me" ? trimmed : null;
}

function normalizeBccardEatplSearchQuery(query = {}) {
  const location = trimOrNull(query.location ?? query.address);
  const merchantName = trimOrNull(query.merNm ?? query.merchant_name ?? query.merchantName);
  const businessType = trimOrNull(query.merTpbuzNm ?? query.genre ?? query.business_type);
  if (!location && !merchantName && !businessType) {
    throw new Error("Provide at least one of location, merNm, or merTpbuzNm.");
  }
  return {
    location,
    merNm: merchantName,
    merTpbuzNm: businessType
  };
}

function formatTraceNumber(instNm, now, sequence) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  return `${instNm}${date}${String(sequence).padStart(10, "0")}`;
}

function createTraceNumberFactory({ instNm, now = () => new Date() } = {}) {
  let sequence = 0;
  return () => {
    sequence = (sequence % 9999999999) + 1;
    return formatTraceNumber(instNm, now(), sequence);
  };
}

function buildBccardEatplSearchUrl(baseUrl = DEFAULT_BASE_URL) {
  return new URL(`${String(baseUrl).replace(/\/+$/, "")}/v1/search`);
}

async function fetchBccardEatplSearch({
  query,
  instNm,
  baseUrl = DEFAULT_BASE_URL,
  nextTraceNumber,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = global.fetch
} = {}) {
  if (!instNm) {
    const error = new Error("BCCARD_EATPL_INST_NM is not configured on the proxy server.");
    error.code = "upstream_not_configured";
    error.statusCode = 503;
    throw error;
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime.");
  }

  const url = buildBccardEatplSearchUrl(baseUrl);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "k-skill-proxy/bccard-eatpl"
    },
    body: JSON.stringify({
      trnsTrceNo: nextTraceNumber(),
      instNm,
      ...(query.merNm ? { merNm: query.merNm } : {}),
      ...(query.location ? { location: query.location } : {}),
      ...(query.merTpbuzNm ? { merTpbuzNm: query.merTpbuzNm } : {})
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`BC카드 eat.pl API responded with ${response.status}.`);
    error.code = "upstream_error";
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.upstreamStatusCode = response.status;
    error.upstreamBodySnippet = text.slice(0, 200);
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const error = new Error("BC카드 eat.pl API returned invalid JSON.");
    error.code = "invalid_upstream_response";
    error.statusCode = 502;
    throw error;
  }
  if (payload?.rspCode !== "00000" || !Array.isArray(payload?.data)) {
    const error = new Error(payload?.rspMessage || "BC카드 eat.pl API returned an application-level error.");
    error.code = "upstream_semantic_error";
    error.statusCode = 502;
    throw error;
  }
  return {
    items: payload.data.slice(0, 100),
    query,
    attribution: "eat.pl 잇플 · BC카드 결제 데이터 기반",
    upstream: {
      url: url.toString(),
      status_code: response.status,
      provider: "bccard-eatpl"
    }
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  buildBccardEatplSearchUrl,
  createTraceNumberFactory,
  fetchBccardEatplSearch,
  formatTraceNumber,
  normalizeBccardEatplSearchQuery
};
