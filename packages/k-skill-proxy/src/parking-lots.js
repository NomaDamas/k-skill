const { normalizeParkingLotRows } = require("../../parking-lot-search/src/parse");

const PARKING_LOT_API_URL = "http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildParkingLotApiUrl({
  serviceKey,
  pageNo = 1,
  numOfRows = 1000,
  addressHint = null,
  addressField = "rdnmadr",
  publicOnly = true,
  parkingType = null,
  apiBaseUrl = PARKING_LOT_API_URL
}) {
  const url = new URL(apiBaseUrl);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("type", "json");

  if (publicOnly) {
    url.searchParams.set("prkplceSe", "공영");
  }
  if (parkingType) {
    url.searchParams.set("prkplceType", parkingType);
  }
  if (addressHint) {
    url.searchParams.set(addressField, addressHint);
  }

  return url.toString();
}

async function fetchParkingLotPage({
  serviceKey,
  pageNo = 1,
  numOfRows = 1000,
  addressHint = null,
  addressField = "rdnmadr",
  publicOnly = true,
  parkingType = null,
  fetchImpl = global.fetch
}) {
  const url = buildParkingLotApiUrl({
    serviceKey,
    pageNo,
    numOfRows,
    addressHint,
    addressField,
    publicOnly,
    parkingType
  });
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    const error = new Error(`Parking lot API HTTP error: ${response.status}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const resultCode = payload?.response?.header?.resultCode;
  if (resultCode && resultCode !== "00") {
    const error = new Error(payload?.response?.header?.resultMsg || "Parking lot API returned an error.");
    error.statusCode = resultCode === "03" ? 404 : 502;
    error.upstreamCode = resultCode;
    throw error;
  }

  return payload;
}

function getBody(payload) {
  return payload?.response?.body || payload?.body || {};
}

function getItems(payload) {
  const items = getBody(payload).items ?? payload?.items ?? [];
  if (Array.isArray(items)) {
    return items;
  }
  if (Array.isArray(items.item)) {
    return items.item;
  }
  if (items.item && typeof items.item === "object") {
    return [items.item];
  }
  return [];
}

function mergeParkingLotPayloads(payloads) {
  const first = payloads[0] || { response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: {} } };
  const body = getBody(first);
  return {
    response: {
      header: first.response?.header || { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        ...body,
        items: payloads.flatMap((payload) => getItems(payload)),
        pageNo: 1,
        numOfRows: payloads.reduce((sum, payload) => sum + getItems(payload).length, 0),
        totalCount: body.totalCount ?? payloads.reduce((sum, payload) => sum + getItems(payload).length, 0)
      }
    }
  };
}

async function fetchNearbyParkingLots({
  latitude,
  longitude,
  serviceKey,
  limit = 5,
  radius = 2000,
  addressHint = null,
  publicOnly = true,
  parkingType = null,
  numOfRows = 1000,
  maxPages = 1,
  fetchImpl = global.fetch
}) {
  if (!serviceKey) {
    return {
      error: "upstream_not_configured",
      message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
    };
  }

  const pageCount = Math.max(1, Math.min(10, parseInteger(maxPages, 1)));
  const payloads = [];
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    payloads.push(await fetchParkingLotPage({
      serviceKey,
      pageNo,
      numOfRows,
      addressHint,
      publicOnly,
      parkingType,
      fetchImpl
    }));
  }

  const mergedPayload = mergeParkingLotPayloads(payloads);
  const allItems = normalizeParkingLotRows(mergedPayload, { latitude, longitude }, { radius, publicOnly });

  return {
    anchor: {
      name: "입력 좌표",
      address: addressHint,
      latitude,
      longitude
    },
    items: allItems.slice(0, limit),
    meta: {
      total: allItems.length,
      limit,
      radius,
      publicOnly,
      addressHint,
      numOfRows,
      maxPages: pageCount,
      source: "data.go.kr"
    },
    upstream: {
      endpoint: PARKING_LOT_API_URL,
      pages: pageCount,
      total_count: getBody(payloads[0] || {}).totalCount ?? null
    }
  };
}

module.exports = {
  PARKING_LOT_API_URL,
  buildParkingLotApiUrl,
  fetchNearbyParkingLots,
  fetchParkingLotPage
};
