const CONSUMER24_RECALL_BASE_URL =
  "https://www.consumer.go.kr/openapi/recall/contents/index.do";
const CONSUMER24_GOODS_BASE_URL = "https://www.consumer.go.kr/openapi/goods";

const CONSUMER24_SERVICES = Object.freeze({
  "00000031": { name: "위생용품", cntntsId: "0501" },
  "00000030": { name: "생활화학제품", cntntsId: "0401" },
  "00000029": { name: "의약외품", cntntsId: "0205" },
  "00000028": { name: "생활방사선제품", cntntsId: "0405" },
  "00000014": { name: "화장품", cntntsId: "0206" },
  "00000013": { name: "먹는물", cntntsId: "0403" },
  "00000012": { name: "축산물", cntntsId: "0203" },
  "00000011": { name: "해외리콜", cntntsId: null },
  "00000010": { name: "공산품", cntntsId: "0101" },
  "00000009": { name: "의료기기", cntntsId: "0207" },
  "00000008": { name: "의약품", cntntsId: "0204" },
  "00000007": { name: "식품", cntntsId: "0201" },
  "00000006": { name: "자동차", cntntsId: "0301" }
});

const CONSUMER24_GOODS = Object.freeze({
  "01_20": "희귀의약품정보",
  "01_21": "수입식품허가정보",
  "02_14": "통신판매사업자",
  "02_33": "동물약국정보"
});

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result || null;
}

function boundedInteger(value, field, fallback, max) {
  const raw = trimOrNull(value);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${field} must be a positive integer.`);
  const parsed = Number(raw);
  if (parsed < 1 || parsed > max) {
    throw new Error(`${field} must be between 1 and ${max}.`);
  }
  return parsed;
}

function serviceIdFor(value) {
  const serviceId = trimOrNull(value) || "00000010";
  if (!CONSUMER24_SERVICES[serviceId]) {
    throw new Error(`Unknown consumer24 service_id: ${serviceId}.`);
  }
  return serviceId;
}

function normalizeConsumer24RecallQuery(query = {}) {
  const serviceId = serviceIdFor(query.service_id ?? query.openapiSvcId);
  const service = CONSUMER24_SERVICES[serviceId];
  if (!service.cntntsId) {
    throw new Error(`${service.name} does not use the recall contents endpoint.`);
  }
  const normalized = {
    serviceId,
    pageNo: boundedInteger(query.pageNo ?? query.page, "pageNo", 1, 100000),
    cntPerPage: boundedInteger(query.cntPerPage ?? query.perPage, "cntPerPage", 10, 100),
    cntntsId: service.cntntsId
  };
  for (const field of [
    "productNm",
    "bsnmNm",
    "modlNmInfo",
    "recallProcssInfo",
    "recallPublictBgnde",
    "recallPublictEndde",
    "recallProcssInfo",
    "recallEntrpsInfo",
    "recallBgnde",
    "recallEndde"
  ]) {
    const value = trimOrNull(query[field]);
    if (value) normalized[field] = value;
  }
  return normalized;
}

function normalizeConsumer24GoodsQuery(query = {}) {
  const goodsCd = trimOrNull(query.goodsCd ?? query.goods_cd);
  if (!goodsCd || !CONSUMER24_GOODS[goodsCd]) {
    throw new Error("goodsCd must be one of 01_20, 01_21, 02_14, 02_33.");
  }
  return {
    goodsCd,
    pageNo: boundedInteger(query.pageNo ?? query.page, "pageNo", 1, 100000),
    cntPerPage: boundedInteger(query.cntPerPage ?? query.perPage, "cntPerPage", 10, 100)
  };
}

function xmlText(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : null;
}

function parseConsumer24Xml(xml) {
  const text = String(xml || "");
  const code = xmlText(text, "code");
  const codeMsg = xmlText(text, "codeMsg");
  const contents = [...text.matchAll(/<content>([\s\S]*?)<\/content>/gi)].map((match) => {
    const row = {};
    for (const field of [
      "cntntsId", "recallSn", "productNm", "bsnmNm", "modlNmInfo",
      "recallProcssInfo", "recallEntrpsInfo", "infoOriginInstt",
      "infoOriginUrl", "infoCreatInstt", "infoCreatUrl", "recallImgUrls"
    ]) {
      row[field] = xmlText(match[1], field);
    }
    return row;
  });
  return {
    code: code || null,
    codeMsg: codeMsg || null,
    allCnt: Number(xmlText(text, "allCnt") || 0),
    items: contents
  };
}

function consumer24KeyEnv(serviceId) {
  return `CONSUMER24_SERVICE_KEY_${serviceId}`;
}

function buildConsumer24ServiceKeys(env) {
  const keys = {};
  for (const serviceId of Object.keys(CONSUMER24_SERVICES)) {
    keys[serviceId] = trimOrNull(
      env[consumer24KeyEnv(serviceId)] ||
      env[`KSKILL_${consumer24KeyEnv(serviceId)}`]
    );
  }
  keys["00000035"] = trimOrNull(
    env.CONSUMER24_SERVICE_KEY_00000035 ||
    env.KSKILL_CONSUMER24_SERVICE_KEY_00000035
  );
  return keys;
}

async function proxyConsumer24RecallRequest({ query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: `Consumer24 service key is not configured for ${query.serviceId}.`
      })
    };
  }
  const url = new URL(CONSUMER24_RECALL_BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(query.pageNo));
  url.searchParams.set("cntPerPage", String(query.cntPerPage));
  url.searchParams.set("cntntsId", query.cntntsId);
  for (const field of Object.keys(query)) {
    if (!["serviceId", "pageNo", "cntPerPage", "cntntsId"].includes(field)) {
      url.searchParams.set(field, query[field]);
    }
  }
  const response = await fetchImpl(url, {
    headers: { accept: "application/xml, text/xml", "user-agent": "k-skill-proxy/consumer24" },
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/xml; charset=utf-8",
    body: await response.text()
  };
}

async function proxyConsumer24GoodsRequest({ query, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "Consumer24 service key is not configured for goods information."
      })
    };
  }
  const url = new URL(`${CONSUMER24_GOODS_BASE_URL}/${query.goodsCd}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(query.pageNo));
  url.searchParams.set("cntPerPage", String(query.cntPerPage));
  const response = await fetchImpl(url, {
    headers: { accept: "application/xml, text/xml", "user-agent": "k-skill-proxy/consumer24" },
    signal: AbortSignal.timeout(20000)
  });
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/xml; charset=utf-8",
    body: await response.text()
  };
}

module.exports = {
  CONSUMER24_GOODS,
  CONSUMER24_GOODS_BASE_URL,
  CONSUMER24_RECALL_BASE_URL,
  CONSUMER24_SERVICES,
  buildConsumer24ServiceKeys,
  consumer24KeyEnv,
  normalizeConsumer24GoodsQuery,
  normalizeConsumer24RecallQuery,
  parseConsumer24Xml,
  proxyConsumer24GoodsRequest,
  proxyConsumer24RecallRequest
};
