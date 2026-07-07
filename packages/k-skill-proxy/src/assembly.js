const ASSEMBLY_BASE_URL = "https://open.assembly.go.kr/portal/openapi";

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

function normalizeAssemblyBillSearchQuery(query = {}) {
  const eraco = trimOrNull(query.ERACO ?? query.eraco ?? query.ageLabel) || "제21대";
  const normalized = {
    Type: "json",
    pIndex: parseBoundedPositiveInteger(query.pIndex ?? query.page, {
      defaultValue: 1,
      max: 10000,
      label: "pIndex"
    }),
    pSize: parseBoundedPositiveInteger(query.pSize ?? query.limit, {
      defaultValue: 10,
      max: 1000,
      label: "pSize"
    }),
    ERACO: eraco
  };
  const aliases = {
    BILL_ID: ["BILL_ID", "billId"],
    BILL_NO: ["BILL_NO", "billNo"],
    BILL_NM: ["BILL_NM", "billName", "q", "query"],
    BILL_KND: ["BILL_KND", "billKind"],
    PPSR_KND: ["PPSR_KND"],
    PPSL_DT: ["PPSL_DT", "proposalDate"],
    JRCMIT_NM: ["JRCMIT_NM", "committeeName"],
    RGS_CONF_RSLT: ["RGS_CONF_RSLT", "result"]
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

function normalizeAssemblyBillDetailQuery(query = {}) {
  const billId = trimOrNull(query.BILL_ID ?? query.billId ?? query.id);
  if (!billId) {
    throw new Error("Provide billId.");
  }
  return { Type: "json", BILL_ID: billId };
}

function normalizeAssemblyVoteQuery(query = {}) {
  const age = trimOrNull(query.AGE ?? query.age);
  const billId = trimOrNull(query.BILL_ID ?? query.billId);
  if (!age) {
    throw new Error("Provide age.");
  }
  if (!billId) {
    throw new Error("Provide billId.");
  }
  if (!/^\d+$/.test(age)) {
    throw new Error("Provide valid age.");
  }
  const normalized = {
    Type: "json",
    pIndex: parseBoundedPositiveInteger(query.pIndex ?? query.page, {
      defaultValue: 1,
      max: 10000,
      label: "pIndex"
    }),
    pSize: parseBoundedPositiveInteger(query.pSize ?? query.limit, {
      defaultValue: 10,
      max: 1000,
      label: "pSize"
    }),
    AGE: age,
    BILL_ID: billId
  };
  const aliases = {
    HG_NM: ["HG_NM", "memberName", "name"],
    POLY_NM: ["POLY_NM", "party"],
    MEMBER_NO: ["MEMBER_NO", "memberNo"],
    VOTE_DATE: ["VOTE_DATE", "voteDate"],
    BILL_NO: ["BILL_NO", "billNo"],
    BILL_NAME: ["BILL_NAME", "billName"],
    CURR_COMMITTEE: ["CURR_COMMITTEE", "committee"],
    RESULT_VOTE_MOD: ["RESULT_VOTE_MOD", "voteResult"],
    CURR_COMMITTEE_ID: ["CURR_COMMITTEE_ID", "committeeId"],
    MONA_CD: ["MONA_CD", "monaCd"]
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

async function proxyAssemblyRequest({ operation, params, apiKey, fetchImpl = global.fetch }) {
  if (!apiKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "ASSEMBLY_API_KEY is not configured on the proxy server."
      })
    };
  }
  const url = new URL(`${ASSEMBLY_BASE_URL}/${operation}`);
  url.searchParams.set("KEY", apiKey);
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
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

module.exports = {
  ASSEMBLY_BASE_URL,
  normalizeAssemblyBillDetailQuery,
  normalizeAssemblyBillSearchQuery,
  normalizeAssemblyVoteQuery,
  proxyAssemblyRequest
};
