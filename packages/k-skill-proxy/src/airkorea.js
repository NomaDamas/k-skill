// allow: SIZE_OK - Cohesive AirKorea station/measurement adapter with one shared fallback and redaction contract.
const { fetchWithRetry } = require("./fetch-with-retry");
const { parseRetryAfterSeconds } = require("./data-go-kr-errors");

const STATION_SERVICE_URL = "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc";
const MEASUREMENT_SERVICE_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc";
const GRADE_LABELS = {
  "1": "좋음",
  "2": "보통",
  "3": "나쁨",
  "4": "매우나쁨"
};

function extractOperationFromUrl(baseUrl) {
  try {
    const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "");
    return pathname.split("/").filter(Boolean).pop() || null;
  } catch {
    return null;
  }
}

function extractItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const items = payload?.response?.body?.items;

  if (Array.isArray(items)) {
    return items;
  }

  if (items && typeof items === "object") {
    return [items];
  }

  return [];
}

function toFloat(raw) {
  if (raw === null || raw === undefined || raw === "" || raw === "-") {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function pickStation(stationItems, { regionHint = null, stationName = null } = {}) {
  if (!stationItems.length) {
    throw new Error("측정소 후보가 없습니다.");
  }

  if (stationName) {
    const exactMatch = stationItems.find((item) => item.stationName === stationName);
    if (exactMatch) {
      return exactMatch;
    }

    const partialMatch = stationItems.find((item) =>
      String(item.stationName || "").includes(stationName) || String(item.addr || "").includes(stationName)
    );
    if (partialMatch) {
      return partialMatch;
    }
  }

  if (regionHint) {
    const tokens = [...new Set(String(regionHint).split(/\s+/u).filter(Boolean))].sort((left, right) => right.length - left.length);

    for (const token of tokens) {
      const stationNameMatch = stationItems.find((item) => String(item.stationName || "").includes(token));
      if (stationNameMatch) {
        return stationNameMatch;
      }

      const addressMatch = stationItems.find((item) => String(item.addr || "").includes(token));
      if (addressMatch) {
        return addressMatch;
      }
    }
  }

  return stationItems[0];
}

function resolveStation(stationItems, options = {}) {
  if (stationItems.length > 0) {
    return pickStation(stationItems, options);
  }

  if (options.stationName) {
    return {
      stationName: options.stationName,
      addr: null
    };
  }

  throw new Error("측정소 후보가 없습니다.");
}

function buildStationNameCandidates({ stationName = null, regionHint = null } = {}) {
  const candidates = [];

  if (stationName) {
    candidates.push(String(stationName).trim());
  }

  if (regionHint) {
    const tokens = [...new Set(
      String(regionHint)
        .split(/\s+/u)
        .map((token) => token.trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)
    )];
    candidates.push(...tokens);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function buildRegionTokens(regionHint) {
  return [...new Set(
    String(regionHint || "")
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter(Boolean)
  )];
}

function findMeasurement(measurementItems, stationName) {
  const exactMatch = measurementItems.find((item) => item.stationName === stationName);
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = measurementItems.find((item) => String(item.stationName || "").includes(stationName));
  if (partialMatch) {
    return partialMatch;
  }

  throw new Error(`측정값 응답에서 측정소 '${stationName}' 를 찾지 못했습니다.`);
}

function gradeToLabel(rawGrade, { pollutant, value }) {
  const rawText = rawGrade === null || rawGrade === undefined ? "" : String(rawGrade);
  if (Object.prototype.hasOwnProperty.call(GRADE_LABELS, rawText)) {
    return GRADE_LABELS[rawText];
  }

  const numericValue = toFloat(value);
  if (numericValue === null) {
    return "정보없음";
  }

  const thresholds = pollutant === "pm10"
    ? [[30, "좋음"], [80, "보통"], [150, "나쁨"]]
    : [[15, "좋음"], [35, "보통"], [75, "나쁨"]];

  for (const [threshold, label] of thresholds) {
    if (numericValue <= threshold) {
      return label;
    }
  }

  return "매우나쁨";
}

function buildReport({ stationItems, measurementItems, regionHint = null, stationName = null, lookupMode = null, selectedStation = null }) {
  const station = selectedStation || resolveStation(stationItems, {
    regionHint,
    stationName
  });
  const measurement = findMeasurement(measurementItems, station.stationName);
  const resolvedLookupMode = lookupMode || "fallback";

  return {
    station_name: station.stationName,
    station_address: station.addr ?? null,
    lookup_mode: resolvedLookupMode,
    measured_at: measurement.dataTime ?? null,
    pm10: {
      value: String(measurement.pm10Value ?? "-"),
      grade: gradeToLabel(measurement.pm10Grade, {
        pollutant: "pm10",
        value: measurement.pm10Value
      })
    },
    pm25: {
      value: String(measurement.pm25Value ?? "-"),
      grade: gradeToLabel(measurement.pm25Grade, {
        pollutant: "pm25",
        value: measurement.pm25Value
      })
    },
    khai_grade: measurement.khaiGrade === null || measurement.khaiGrade === undefined || measurement.khaiGrade === ""
      ? "정보없음"
      : gradeToLabel(measurement.khaiGrade, {
        pollutant: "pm10",
        value: measurement.pm10Value
      })
  };
}

async function fetchJson(baseUrl, params, { fetchImpl = global.fetch, headers = {} } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const url = new URL(baseUrl);
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  url.search = searchParams.toString();
  const operation = extractOperationFromUrl(baseUrl);
  let response;
  try {
    response = await fetchWithRetry(url, {
      fetchImpl,
      headers,
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    const error = new Error("AirKorea upstream request failed.");
    error.statusCode = 502;
    error.code = "upstream_fetch_failed";
    error.operation = operation;
    throw error;
  }

  if (!response.ok) {
    // Rate limiting must not degrade into the global handler's default 500.
    // Classify it explicitly and keep the upstream status/operation available
    // for structured attribution logs (the service key is never recorded).
    if (response.status === 429) {
      const error = new Error(`AirKorea upstream rate limited with HTTP 429 for ${operation}.`);
      error.statusCode = 429;
      error.code = "upstream_rate_limited";
      error.upstreamStatus = 429;
      error.operation = operation;
      error.retryAfterSeconds = parseRetryAfterSeconds(response.headers?.get?.("retry-after")) || 60;
      throw error;
    }

    if (response.status === 403) {
      // 403 from data.go.kr means the request is rejected for an
      // operator-actionable reason (utilization not approved, wrong key, or
      // unregistered domain/IP), not a transient outage. Classify it so the
      // fine-dust route logs it at error level and the global handler surfaces
      // it instead of collapsing it into an unclassified 500.
      const error = new Error(
        "AirKorea upstream returned 403 Forbidden. 기술문서 기준 후보 원인: 활용신청 후 동기화 대기(1~2시간), 활용신청하지 않은 API 호출, 서비스키 인코딩/서비스키 오류, 등록하지 않은 도메인 또는 IP.",
      );
      error.statusCode = 403;
      error.code = "upstream_forbidden";
      error.upstreamStatus = 403;
      error.operation = operation;
      throw error;
    }

    const error = new Error(`AirKorea upstream request failed with HTTP ${response.status}.`);
    error.upstreamStatus = response.status;
    error.operation = operation;
    throw error;
  }

  return JSON.parse(await response.text());
}

async function fetchStationLookup({ regionHint = null, stationName = null, serviceKey, fetchImpl = global.fetch, headers = {}, stationServiceUrl = STATION_SERVICE_URL }) {
  if (!serviceKey) {
    throw new Error("AIR_KOREA_OPEN_API_KEY is not configured on the proxy server.");
  }

  const common = {
    serviceKey,
    returnType: "json",
    numOfRows: 50,
    pageNo: 1
  };

  if (regionHint || stationName) {
    return {
      lookupMode: "fallback",
      payload: await fetchJson(`${stationServiceUrl}/getMsrstnList`, {
        ...common,
        addr: regionHint,
        stationName
      }, {
        fetchImpl,
        headers
      })
    };
  }

  throw new Error("regionHint 또는 stationName 이 필요합니다.");
}

async function fetchMeasurementPayload({ stationName, serviceKey, fetchImpl = global.fetch, headers = {}, measurementServiceUrl = MEASUREMENT_SERVICE_URL }) {
  if (!serviceKey) {
    throw new Error("AIR_KOREA_OPEN_API_KEY is not configured on the proxy server.");
  }

  return fetchJson(`${measurementServiceUrl}/getMsrstnAcctoRltmMesureDnsty`, {
    serviceKey,
    returnType: "json",
    numOfRows: 100,
    pageNo: 1,
    stationName,
    dataTerm: "DAILY",
    ver: "1.4"
  }, {
    fetchImpl,
    headers
  });
}

async function fetchCtprvnMeasurementPayload({ sidoName, serviceKey, fetchImpl = global.fetch, headers = {}, measurementServiceUrl = MEASUREMENT_SERVICE_URL }) {
  if (!serviceKey) {
    throw new Error("AIR_KOREA_OPEN_API_KEY is not configured on the proxy server.");
  }

  return fetchJson(`${measurementServiceUrl}/getCtprvnRltmMesureDnsty`, {
    serviceKey,
    returnType: "json",
    numOfRows: 100,
    pageNo: 1,
    sidoName,
    ver: "1.4"
  }, {
    fetchImpl,
    headers
  });
}

async function fetchFineDustReport({ regionHint = null, stationName = null, serviceKey, fetchImpl = global.fetch, headers = {}, stationServiceUrl = STATION_SERVICE_URL, measurementServiceUrl = MEASUREMENT_SERVICE_URL }) {
  let stationLookup;
  let stationItems;
  let station;

  try {
    stationLookup = await fetchStationLookup({
      regionHint,
      stationName,
      serviceKey,
      fetchImpl,
      headers,
      stationServiceUrl
    });
    stationItems = extractItems(stationLookup.payload);
    station = resolveStation(stationItems, {
      regionHint,
      stationName
    });
  } catch (error) {
    const candidates = buildStationNameCandidates({ stationName, regionHint });
    const canTryMeasurementOnlyFallback =
      String(error?.message || "").includes("403 Forbidden") &&
      candidates.length > 0;

    if (!canTryMeasurementOnlyFallback) {
      throw error;
    }

    for (const candidate of candidates) {
      const measurementPayload = await fetchMeasurementPayload({
        stationName: candidate,
        serviceKey,
        fetchImpl,
        headers,
        measurementServiceUrl
      });
      const measurementItems = extractItems(measurementPayload);

      try {
        const matchedMeasurement = findMeasurement(measurementItems, candidate);
        return buildReport({
          stationItems: [{ stationName: matchedMeasurement.stationName, addr: null }],
          measurementItems,
          regionHint,
          stationName: matchedMeasurement.stationName,
          lookupMode: "fallback",
          selectedStation: { stationName: matchedMeasurement.stationName, addr: null }
        });
      } catch {
        // try next candidate
      }
    }

    const regionTokens = buildRegionTokens(regionHint);
    const sidoName = regionTokens[0];
    if (sidoName) {
      const ctprvnPayload = await fetchCtprvnMeasurementPayload({
        sidoName,
        serviceKey,
        fetchImpl,
        headers,
        measurementServiceUrl
      });
      const cityItems = extractItems(ctprvnPayload);
      const specificTokens = regionTokens.length > 1 ? regionTokens.slice(1) : regionTokens;
      const tokenMatches = cityItems.filter((item) =>
        specificTokens.some((token) => String(item.stationName || "").includes(token))
      );

      if (tokenMatches.length > 0) {
        const selectedStation = tokenMatches[0];
        return buildReport({
          stationItems: [{ stationName: selectedStation.stationName, addr: null }],
          measurementItems: cityItems,
          regionHint,
          stationName: selectedStation.stationName,
          lookupMode: "fallback",
          selectedStation: { stationName: selectedStation.stationName, addr: null }
        });
      }

      const stationSamples = cityItems
        .slice(0, 8)
        .map((item) => item.stationName)
        .filter(Boolean);
      const lookupError = new Error(
        `'${regionHint}' 는 현재 바로 매핑되는 단일 측정소를 확정하지 못했습니다. 아래 후보 중 정확한 측정소명으로 다시 조회해 주세요.`,
      );
      lookupError.statusCode = 400;
      lookupError.code = "ambiguous_location";
      lookupError.sidoName = sidoName;
      lookupError.candidateStations = stationSamples;
      throw lookupError;
    }

    throw error;
  }

  const measurementPayload = await fetchMeasurementPayload({
    stationName: station.stationName,
    serviceKey,
    fetchImpl,
    headers,
    measurementServiceUrl
  });

  return buildReport({
    stationItems,
    measurementItems: extractItems(measurementPayload),
    regionHint,
    stationName: station.stationName,
    lookupMode: stationLookup.lookupMode,
    selectedStation: station
  });
}

module.exports = {
  GRADE_LABELS,
  STATION_SERVICE_URL,
  MEASUREMENT_SERVICE_URL,
  buildReport,
  extractItems,
  extractOperationFromUrl,
  parseRetryAfterSeconds,
  fetchFineDustReport,
  fetchCtprvnMeasurementPayload,
  fetchMeasurementPayload,
  fetchStationLookup,
  findMeasurement,
  gradeToLabel,
  pickStation,
  resolveStation,
  toFloat
};
