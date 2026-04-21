const { normalizeParkingLotRows } = require("../../parking-lot-search/src/parse");

// Data.go.kr now serves this endpoint over HTTPS and redirects HTTP requests
// with a 301 Moved Permanently, which causes Node `fetch` to surface a
// non-OK response even though the actual service is healthy. Use HTTPS
// directly so the proxy never depends on cross-protocol redirect handling.
const PARKING_LOT_API_URL = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";

// Upstream does not support working address-based or geographic filters, and
// per-page latency is proportional to row count. We therefore cache the
// entire dataset in-process and serve nearby lookups by coordinate-distance
// filtering over the cached rows. This keeps most requests near-instant,
// while the periodic background refresh pays the full-dataset latency once
// per TTL window regardless of how many clients are calling.
const DATASET_PAGE_SIZE = 300;
const DATASET_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DATASET_FETCH_TIMEOUT_MS = 45000;

const datasetCache = {
  rows: null,
  fetchedAt: 0,
  loadPromise: null
};

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildParkingLotApiUrl({
  serviceKey,
  pageNo = 1,
  numOfRows = DATASET_PAGE_SIZE,
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
  numOfRows = DATASET_PAGE_SIZE,
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
    signal: AbortSignal.timeout(DATASET_FETCH_TIMEOUT_MS)
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

async function loadFullDataset({ serviceKey, fetchImpl, publicOnly = false }) {
  const now = Date.now();
  if (datasetCache.rows && now - datasetCache.fetchedAt < DATASET_CACHE_TTL_MS) {
    return datasetCache.rows;
  }
  if (datasetCache.loadPromise) {
    return datasetCache.loadPromise;
  }

  datasetCache.loadPromise = (async () => {
    try {
      const firstPage = await fetchParkingLotPage({
        serviceKey,
        pageNo: 1,
        numOfRows: DATASET_PAGE_SIZE,
        publicOnly,
        fetchImpl
      });
      const totalCountRaw = getBody(firstPage).totalCount;
      const totalCount = parseInteger(totalCountRaw, getItems(firstPage).length);
      const totalPages = Math.max(1, Math.ceil(totalCount / DATASET_PAGE_SIZE));

      let remainingPages = [];
      if (totalPages > 1) {
        const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
        remainingPages = await Promise.all(pageNumbers.map((pageNo) => fetchParkingLotPage({
          serviceKey,
          pageNo,
          numOfRows: DATASET_PAGE_SIZE,
          publicOnly,
          fetchImpl
        })));
      }

      const rows = [firstPage, ...remainingPages].flatMap((payload) => getItems(payload));
      datasetCache.rows = rows;
      datasetCache.fetchedAt = Date.now();
      return rows;
    } finally {
      datasetCache.loadPromise = null;
    }
  })();

  return datasetCache.loadPromise;
}

function resetParkingDatasetCacheForTests() {
  datasetCache.rows = null;
  datasetCache.fetchedAt = 0;
  datasetCache.loadPromise = null;
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
  fetchImpl = global.fetch
}) {
  if (!serviceKey) {
    return {
      error: "upstream_not_configured",
      message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
    };
  }

  const cacheAgeBefore = datasetCache.rows ? Date.now() - datasetCache.fetchedAt : null;
  const cacheHit = datasetCache.rows !== null && cacheAgeBefore !== null && cacheAgeBefore < DATASET_CACHE_TTL_MS;

  const rows = await loadFullDataset({ serviceKey, fetchImpl, publicOnly: false });

  const mergedPayload = {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        items: rows,
        pageNo: 1,
        numOfRows: rows.length,
        totalCount: rows.length
      }
    }
  };

  const typeFiltered = parkingType
    ? rows.filter((row) => String(row.prkplceType ?? row["주차장유형"] ?? "").trim() === String(parkingType).trim())
    : rows;
  const filteredPayload = parkingType
    ? {
        response: {
          header: mergedPayload.response.header,
          body: {
            ...mergedPayload.response.body,
            items: typeFiltered,
            numOfRows: typeFiltered.length,
            totalCount: typeFiltered.length
          }
        }
      }
    : mergedPayload;

  const allItems = normalizeParkingLotRows(filteredPayload, { latitude, longitude }, { radius, publicOnly });

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
      source: "data.go.kr",
      datasetCacheHit: cacheHit,
      datasetSize: rows.length,
      datasetFetchedAt: new Date(datasetCache.fetchedAt).toISOString()
    },
    upstream: {
      endpoint: PARKING_LOT_API_URL,
      total_count: rows.length
    }
  };
}

module.exports = {
  PARKING_LOT_API_URL,
  DATASET_PAGE_SIZE,
  DATASET_CACHE_TTL_MS,
  buildParkingLotApiUrl,
  fetchNearbyParkingLots,
  fetchParkingLotPage,
  loadFullDataset,
  resetParkingDatasetCacheForTests
};
