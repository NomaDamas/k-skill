// LH 청약 (Korea Land & Housing Corporation lease/subscription notice) API wrapper.
// Proxies the official data.go.kr LH Lease Notice endpoint so the user never has to
// manage ServiceKey. The upstream base is:
//   http://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1   (list)
//   http://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1 (detail)
//
// The upstream responds with a JSON array whose shape is:
//   [
//     { "CMN": { "CODE": "SUCCESS", "ERR_MSG": "", "TOTAL_CNT": 123 } },
//     { "dsList": [ { PAN_ID, PAN_NM, ... }, ... ] }
//   ]
// Error payloads can also arrive as XML from the common data.go.kr error path, e.g.
// unregistered ServiceKey, so both JSON and XML fault paths must be handled.

const LH_UPSTREAM_BASE_URL = "http://apis.data.go.kr/B552555";
const LH_LIST_PATH = "lhLeaseNoticeInfo1/lhLeaseNoticeInfo1";
const LH_DETAIL_PATH = "lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1";

const LH_DEFAULT_LIST_URL = `${LH_UPSTREAM_BASE_URL}/${LH_LIST_PATH}`;
const LH_DEFAULT_DETAIL_URL = `${LH_UPSTREAM_BASE_URL}/${LH_DETAIL_PATH}`;

// Valid `PAN_SS` filter values (공고 상태). Users pass these in Korean exactly the
// way the upstream catalog documents them. We do NOT guess variants — if the user
// omits this filter, we pass nothing and the upstream returns every status.
const VALID_PAN_SS_VALUES = new Set([
  "공고중",
  "접수중",
  "접수마감",
  "당첨자발표",
  "추정공고"
]);

// Known `UPP_AIS_TP_CD` categories (주택 대분류).
// 06 = 임대주택, 05 = 분양주택, 13 = 주거복지 (신혼희망타운 포함), 01 = 토지, 22 = 상가
const VALID_UPP_AIS_TP_CD_VALUES = new Set([
  "01", "05", "06", "13", "22"
]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseBoundedInt(value, { defaultValue, min, max, label }) {
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

function normalizeDateString(value, label) {
  const trimmed = trimOrNull(value);
  if (trimmed === null) {
    return null;
  }
  // Accept YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD; normalize to YYYY-MM-DD per LH upstream docs.
  const digits = trimmed.replace(/[.\-\/]/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Provide ${label} as YYYY-MM-DD (8 digits).`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function normalizeLhNoticeSearchQuery(query) {
  const normalized = {};

  const panSs = trimOrNull(query.panSs ?? query.PAN_SS ?? query.status);
  if (panSs) {
    if (!VALID_PAN_SS_VALUES.has(panSs)) {
      throw new Error(
        `panSs must be one of: ${Array.from(VALID_PAN_SS_VALUES).join(", ")}.`
      );
    }
    normalized.panSs = panSs;
  }

  const uppAisTpCd = trimOrNull(
    query.uppAisTpCd ?? query.UPP_AIS_TP_CD ?? query.category
  );
  if (uppAisTpCd) {
    if (!VALID_UPP_AIS_TP_CD_VALUES.has(uppAisTpCd)) {
      throw new Error(
        `uppAisTpCd must be one of: ${Array.from(VALID_UPP_AIS_TP_CD_VALUES).join(", ")}.`
      );
    }
    normalized.uppAisTpCd = uppAisTpCd;
  }

  const aisTpCd = trimOrNull(query.aisTpCd ?? query.AIS_TP_CD);
  if (aisTpCd) {
    if (!/^[0-9]{1,4}$/.test(aisTpCd)) {
      throw new Error("aisTpCd must be digits only (1-4 chars).");
    }
    normalized.aisTpCd = aisTpCd;
  }

  const cnpCdNm = trimOrNull(
    query.cnpCdNm ?? query.CNP_CD_NM ?? query.region ?? query.regionName
  );
  if (cnpCdNm) {
    normalized.cnpCdNm = cnpCdNm;
  }

  const panNm = trimOrNull(
    query.panNm ?? query.PAN_NM ?? query.q ?? query.query ?? query.keyword
  );
  if (panNm) {
    normalized.panNm = panNm;
  }

  const panNtStDt = normalizeDateString(
    query.panNtStDt ?? query.PAN_NT_ST_DT ?? query.startDate,
    "panNtStDt"
  );
  if (panNtStDt) {
    normalized.panNtStDt = panNtStDt;
  }

  const clsgDt = normalizeDateString(
    query.clsgDt ?? query.CLSG_DT ?? query.endDate,
    "clsgDt"
  );
  if (clsgDt) {
    normalized.clsgDt = clsgDt;
  }

  normalized.page = parseBoundedInt(query.page ?? query.PAGE ?? query.pageNo, {
    defaultValue: 1,
    min: 1,
    max: 1000,
    label: "page"
  });

  normalized.pageSize = parseBoundedInt(
    query.pageSize ?? query.PG_SZ ?? query.numOfRows ?? query.limit,
    {
      defaultValue: 50,
      min: 1,
      max: 1000,
      label: "pageSize"
    }
  );

  return normalized;
}

function normalizeLhNoticeDetailQuery(query) {
  const panId = trimOrNull(query.panId ?? query.PAN_ID);
  if (!panId) {
    throw new Error("Provide panId.");
  }
  if (!/^[0-9]{4,20}$/.test(panId)) {
    throw new Error("panId must be digits only.");
  }

  const ccrCnntSysDsCd = trimOrNull(
    query.ccrCnntSysDsCd ?? query.CCR_CNNT_SYS_DS_CD ?? query.systemCode
  );
  if (!ccrCnntSysDsCd) {
    throw new Error("Provide ccrCnntSysDsCd.");
  }
  if (!/^[0-9]{1,4}$/.test(ccrCnntSysDsCd)) {
    throw new Error("ccrCnntSysDsCd must be digits only (1-4 chars).");
  }

  const splInfTpCd = trimOrNull(
    query.splInfTpCd ?? query.SPL_INF_TP_CD ?? query.supplyTypeCode
  );
  if (!splInfTpCd) {
    throw new Error("Provide splInfTpCd.");
  }
  if (!/^[0-9]{1,6}$/.test(splInfTpCd)) {
    throw new Error("splInfTpCd must be digits only (1-6 chars).");
  }

  return { panId, ccrCnntSysDsCd, splInfTpCd };
}

function normalizeNoticeItem(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  // Upstream delivers keys in UPPER_SNAKE_CASE. Map to lower snake_case so the
  // proxy response matches other k-skill-proxy JSON shapes.
  const panId = trimOrNull(raw.PAN_ID ?? raw.panId);
  const panNm = trimOrNull(raw.PAN_NM ?? raw.panNm);
  if (!panId && !panNm) {
    return null;
  }

  const uppAisTpCd = trimOrNull(raw.UPP_AIS_TP_CD ?? raw.uppAisTpCd);
  const aisTpCd = trimOrNull(raw.AIS_TP_CD ?? raw.aisTpCd);
  const aisTpCdNm = trimOrNull(raw.AIS_TP_CD_NM ?? raw.aisTpCdNm);
  const cnpCdNm = trimOrNull(raw.CNP_CD_NM ?? raw.cnpCdNm);
  const panSs = trimOrNull(raw.PAN_SS ?? raw.panSs);
  const panDt = trimOrNull(raw.PAN_DT ?? raw.panDt ?? raw.PAN_NT_ST_DT ?? raw.panNtStDt);
  const clsgDt = trimOrNull(raw.CLSG_DT ?? raw.clsgDt ?? raw.PAN_NT_ED_DT ?? raw.panNtEdDt);
  const rcritPblancDt = trimOrNull(raw.RCRIT_PBLANC_DT ?? raw.rcritPblancDt);
  const dtlUrl = trimOrNull(raw.DTL_URL ?? raw.dtlUrl);
  const splInfTpCd = trimOrNull(raw.SPL_INF_TP_CD ?? raw.splInfTpCd);
  const ccrCnntSysDsCd = trimOrNull(raw.CCR_CNNT_SYS_DS_CD ?? raw.ccrCnntSysDsCd);

  return {
    pan_id: panId,
    pan_nm: panNm,
    upp_ais_tp_cd: uppAisTpCd,
    ais_tp_cd: aisTpCd,
    ais_tp_cd_nm: aisTpCdNm,
    cnp_cd_nm: cnpCdNm,
    pan_ss: panSs,
    pan_dt: panDt,
    clsg_dt: clsgDt,
    rcrit_pblanc_dt: rcritPblancDt,
    spl_inf_tp_cd: splInfTpCd,
    ccr_cnnt_sys_ds_cd: ccrCnntSysDsCd,
    detail_url: dtlUrl,
    raw
  };
}

// data.go.kr services return XML on common auth/parameter errors even when JSON
// is requested. Pull resultCode/resultMsg and surface them as a structured error.
function parseXmlErrorEnvelope(xmlText) {
  if (typeof xmlText !== "string" || xmlText.length === 0) {
    return null;
  }
  if (!/<OpenAPI_ServiceResponse>|<response[\s>]|<returnAuthMsg>|<errMsg>/i.test(xmlText)) {
    return null;
  }

  const codeMatch = xmlText.match(/<resultCode>([^<]*)<\/resultCode>/i)
    || xmlText.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/i);
  const msgMatch = xmlText.match(/<resultMsg>([^<]*)<\/resultMsg>/i)
    || xmlText.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/i)
    || xmlText.match(/<errMsg>([^<]*)<\/errMsg>/i);

  const code = codeMatch ? codeMatch[1].trim() : null;
  const message = msgMatch ? msgMatch[1].trim() : "LH upstream returned an error envelope.";

  if (!code && !msgMatch) {
    return null;
  }

  return {
    code: code || "unknown",
    message
  };
}

function buildError({ message, statusCode, code, upstreamCode }) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (upstreamCode) {
    error.upstreamCode = upstreamCode;
  }
  return error;
}

// Parse the LH JSON envelope into { totalCount, items, raw }.
// The upstream envelope shape is a 2-element array:
//   [ { CMN: { CODE, ERR_MSG, TOTAL_CNT } }, { dsList: [...] } ]
// but the proxy is resilient to the more common data.go.kr shape
// `{ response: { body: { items: [...], totalCount } } }` as well.
function extractNoticeEnvelope(parsed) {
  if (Array.isArray(parsed)) {
    const head = parsed[0] || {};
    const body = parsed[1] || {};
    const cmn = head.CMN || head.cmn || {};
    const code = trimOrNull(cmn.CODE ?? cmn.code);
    const errMsg = trimOrNull(cmn.ERR_MSG ?? cmn.errMsg);

    // The LH catalog has historically surfaced `CMN.CODE` as one of
    // `"SUCCESS"`, `"0"`, `"00"`, or `"000"` across different data.go.kr
    // platform eras. Treating all four as success is deliberate — NOT
    // redundant — so that a future data.go.kr normalization that flips the
    // code from `"SUCCESS"` to a numeric form does not start 502'ing
    // otherwise-valid responses. See tests `extractNoticeEnvelope treats
    // array-envelope CMN.CODE="…" as success` for coverage.
    if (code && code !== "SUCCESS" && code !== "0" && code !== "00" && code !== "000") {
      throw buildError({
        message: errMsg || `LH upstream rejected the request (${code}).`,
        statusCode: 502,
        code: "upstream_error",
        upstreamCode: code
      });
    }

    const totalCount = Number.isFinite(Number(cmn.TOTAL_CNT ?? cmn.totalCount))
      ? Number(cmn.TOTAL_CNT ?? cmn.totalCount)
      : null;

    const rawItems = Array.isArray(body.dsList)
      ? body.dsList
      : Array.isArray(body.DS_LIST)
        ? body.DS_LIST
        : [];

    return { totalCount, items: rawItems };
  }

  if (parsed && typeof parsed === "object") {
    const response = parsed.response || parsed;
    const header = response.header || {};
    const headerCode = trimOrNull(header.resultCode);
    if (headerCode && !["00", "000", "0"].includes(headerCode)) {
      throw buildError({
        message: trimOrNull(header.resultMsg) || `LH upstream rejected the request (${headerCode}).`,
        statusCode: 502,
        code: "upstream_error",
        upstreamCode: headerCode
      });
    }

    const body = response.body || {};
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.item)
        ? body.item
        : Array.isArray(body.items?.item)
          ? body.items.item
          : [];

    const totalCount = Number.isFinite(Number(body.totalCount))
      ? Number(body.totalCount)
      : null;

    return { totalCount, items: rawItems };
  }

  return { totalCount: null, items: [] };
}

function buildNoticeListResponseBody(envelope, { page, pageSize, filters }) {
  const items = [];
  for (const raw of envelope.items) {
    const normalized = normalizeNoticeItem(raw);
    if (normalized) {
      items.push(normalized);
    }
  }

  return {
    items,
    summary: {
      page,
      page_size: pageSize,
      returned_count: items.length,
      total_count: envelope.totalCount
    },
    query: filters
  };
}

function buildNoticeDetailResponseBody(envelope, filters) {
  // Detail envelope can return multiple supply rows (per 주택형). Keep them all as
  // `supply_infos` plus a normalized `notice` summary using the first row.
  const supplyInfos = envelope.items.slice();
  const first = supplyInfos[0] || {};
  const notice = normalizeNoticeItem(first) || {
    pan_id: filters.panId,
    pan_nm: null,
    upp_ais_tp_cd: null,
    ais_tp_cd: null,
    ais_tp_cd_nm: null,
    cnp_cd_nm: null,
    pan_ss: null,
    pan_dt: null,
    clsg_dt: null,
    rcrit_pblanc_dt: null,
    spl_inf_tp_cd: filters.splInfTpCd,
    ccr_cnnt_sys_ds_cd: filters.ccrCnntSysDsCd,
    detail_url: null,
    raw: first
  };

  return {
    notice,
    supply_infos: supplyInfos,
    query: filters
  };
}

async function fetchLhUpstream({ url, fetchImpl = global.fetch, timeoutMs = 20000 }) {
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw buildError({
      message: `LH upstream request failed: ${err.message}`,
      statusCode: 502,
      code: "upstream_fetch_failed"
    });
  }

  const text = await response.text();

  if (!response.ok) {
    const xmlError = parseXmlErrorEnvelope(text);
    if (xmlError) {
      throw buildError({
        message: xmlError.message,
        statusCode: response.status === 401 ? 503 : 502,
        code: response.status === 401 ? "upstream_not_authorized" : "upstream_error",
        upstreamCode: xmlError.code
      });
    }
    throw buildError({
      message: `LH upstream responded with HTTP ${response.status}: ${text.slice(0, 200)}`,
      statusCode: response.status === 401 ? 503 : 502,
      code: response.status === 401 ? "upstream_not_authorized" : "upstream_error"
    });
  }

  // data.go.kr sometimes returns 200 + XML envelope carrying the real error.
  const xmlError = parseXmlErrorEnvelope(text);
  if (xmlError) {
    throw buildError({
      message: xmlError.message,
      statusCode: 502,
      code: "upstream_error",
      upstreamCode: xmlError.code
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw buildError({
      message: `LH upstream returned non-JSON payload (first 200 chars): ${text.slice(0, 200)}`,
      statusCode: 502,
      code: "upstream_invalid_payload"
    });
  }

  return parsed;
}

async function fetchLhNoticeList({ serviceKey, filters, fetchImpl = global.fetch }) {
  const url = new URL(LH_DEFAULT_LIST_URL);
  url.searchParams.set("serviceKey", serviceKey);
  // Upstream uses SCREAMING_SNAKE_CASE param names (PG_SZ, PAGE, PAN_SS, etc.).
  url.searchParams.set("PG_SZ", String(filters.pageSize));
  url.searchParams.set("PAGE", String(filters.page));
  if (filters.panSs) {
    url.searchParams.set("PAN_SS", filters.panSs);
  }
  if (filters.uppAisTpCd) {
    url.searchParams.set("UPP_AIS_TP_CD", filters.uppAisTpCd);
  }
  if (filters.aisTpCd) {
    url.searchParams.set("AIS_TP_CD", filters.aisTpCd);
  }
  if (filters.cnpCdNm) {
    url.searchParams.set("CNP_CD_NM", filters.cnpCdNm);
  }
  if (filters.panNm) {
    url.searchParams.set("PAN_NM", filters.panNm);
  }
  if (filters.panNtStDt) {
    url.searchParams.set("PAN_NT_ST_DT", filters.panNtStDt);
  }
  if (filters.clsgDt) {
    url.searchParams.set("CLSG_DT", filters.clsgDt);
  }

  const parsed = await fetchLhUpstream({ url, fetchImpl });
  const envelope = extractNoticeEnvelope(parsed);
  return buildNoticeListResponseBody(envelope, {
    page: filters.page,
    pageSize: filters.pageSize,
    filters: {
      pan_ss: filters.panSs || null,
      upp_ais_tp_cd: filters.uppAisTpCd || null,
      ais_tp_cd: filters.aisTpCd || null,
      cnp_cd_nm: filters.cnpCdNm || null,
      pan_nm: filters.panNm || null,
      pan_nt_st_dt: filters.panNtStDt || null,
      clsg_dt: filters.clsgDt || null
    }
  });
}

async function fetchLhNoticeDetail({ serviceKey, filters, fetchImpl = global.fetch }) {
  const url = new URL(LH_DEFAULT_DETAIL_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("PAN_ID", filters.panId);
  url.searchParams.set("CCR_CNNT_SYS_DS_CD", filters.ccrCnntSysDsCd);
  url.searchParams.set("SPL_INF_TP_CD", filters.splInfTpCd);

  const parsed = await fetchLhUpstream({ url, fetchImpl });
  const envelope = extractNoticeEnvelope(parsed);
  return buildNoticeDetailResponseBody(envelope, {
    pan_id: filters.panId,
    ccr_cnnt_sys_ds_cd: filters.ccrCnntSysDsCd,
    spl_inf_tp_cd: filters.splInfTpCd
  });
}

module.exports = {
  LH_UPSTREAM_BASE_URL,
  LH_LIST_PATH,
  LH_DETAIL_PATH,
  LH_DEFAULT_LIST_URL,
  LH_DEFAULT_DETAIL_URL,
  VALID_PAN_SS_VALUES,
  VALID_UPP_AIS_TP_CD_VALUES,
  normalizeLhNoticeSearchQuery,
  normalizeLhNoticeDetailQuery,
  normalizeNoticeItem,
  parseXmlErrorEnvelope,
  extractNoticeEnvelope,
  buildNoticeListResponseBody,
  buildNoticeDetailResponseBody,
  fetchLhNoticeList,
  fetchLhNoticeDetail
};
