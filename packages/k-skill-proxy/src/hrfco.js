const HRFCO_API_BASE_URL = "https://api.hrfco.go.kr";

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseNumber(value) {
  const trimmed = trimOrNull(value);
  if (trimmed === null) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeToken(value) {
  return trimOrNull(value)?.toLowerCase().replace(/\s+/g, "") || null;
}

function extractStationNameVariants(station) {
  const baseName = trimOrNull(station?.obsnm);
  if (!baseName) {
    return [];
  }

  const variants = new Set([baseName]);
  for (const match of baseName.matchAll(/\(([^()]+)\)/g)) {
    const inner = trimOrNull(match[1]);
    if (inner) {
      variants.add(inner);
    }
  }

  return [...variants];
}

function buildError({ message, statusCode, code, candidateStations = null }) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (candidateStations) {
    error.candidateStations = candidateStations;
  }
  return error;
}

function formatObservedAt(ymdhm) {
  const raw = trimOrNull(ymdhm);
  if (!raw || !/^\d{12}$/.test(raw)) {
    return null;
  }

  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const hour = raw.slice(8, 10);
  const minute = raw.slice(10, 12);
  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}

function dedupeStations(stations) {
  return [...new Map(stations.map((station) => [station.wlobscd, station])).values()];
}

function pickWaterLevelStation(stationItems, { stationName = null, stationCode = null } = {}) {
  const normalizedCode = trimOrNull(stationCode);
  const normalizedName = normalizeToken(stationName);
  const stations = Array.isArray(stationItems) ? stationItems : [];

  if (normalizedCode) {
    const byCode = stations.find((station) => trimOrNull(station.wlobscd) === normalizedCode);
    if (!byCode) {
      throw buildError({
        message: "No HRFCO water-level station matched that stationCode.",
        statusCode: 404,
        code: "station_not_found"
      });
    }
    return byCode;
  }

  if (!normalizedName) {
    throw buildError({
      message: "Provide stationName or stationCode.",
      statusCode: 400,
      code: "bad_request"
    });
  }

  const exactMatches = dedupeStations(
    stations.filter((station) =>
      extractStationNameVariants(station)
        .map((value) => normalizeToken(value))
        .includes(normalizedName)
    )
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    throw buildError({
      message: "Multiple HRFCO water-level stations matched that stationName.",
      statusCode: 400,
      code: "ambiguous_station",
      candidateStations: exactMatches.map((station) => station.obsnm).slice(0, 10)
    });
  }

  const partialMatches = dedupeStations(
    stations.filter((station) => {
      const fields = [...extractStationNameVariants(station), station.addr, station.etcaddr]
        .map((value) => normalizeToken(value))
        .filter(Boolean);
      return fields.some((field) => field.includes(normalizedName));
    })
  );

  if (partialMatches.length === 0) {
    throw buildError({
      message: "No HRFCO water-level station matched that stationName.",
      statusCode: 404,
      code: "station_not_found"
    });
  }

  if (partialMatches.length > 1) {
    throw buildError({
      message: "Multiple HRFCO water-level stations matched that stationName.",
      statusCode: 400,
      code: "ambiguous_station",
      candidateStations: partialMatches.map((station) => station.obsnm).slice(0, 10)
    });
  }

  return partialMatches[0];
}

function buildWaterLevelReport({ stationItems, measurementItems, stationName = null, stationCode = null }) {
  const station = pickWaterLevelStation(stationItems, { stationName, stationCode });
  const measurement = (Array.isArray(measurementItems) ? measurementItems : []).find(
    (item) => trimOrNull(item.wlobscd) === trimOrNull(station.wlobscd)
  );

  if (!measurement) {
    throw buildError({
      message: "No current HRFCO water-level measurement was available for that station.",
      statusCode: 404,
      code: "measurement_not_found"
    });
  }

  return {
    station_code: station.wlobscd,
    station_name: trimOrNull(station.obsnm),
    agency_name: trimOrNull(station.agcnm),
    address: [trimOrNull(station.addr), trimOrNull(station.etcaddr)].filter(Boolean).join(" ") || null,
    observed_at: formatObservedAt(measurement.ymdhm),
    observed_at_raw: trimOrNull(measurement.ymdhm),
    water_level: {
      value_m: parseNumber(measurement.wl),
      unit: "m"
    },
    flow_rate: {
      value_cms: parseNumber(measurement.fw),
      unit: "m^3/s"
    },
    thresholds: {
      interest_level_m: parseNumber(station.attwl),
      warning_level_m: parseNumber(station.wrnwl),
      alarm_level_m: parseNumber(station.almwl),
      serious_level_m: parseNumber(station.srswl),
      plan_flood_level_m: parseNumber(station.pfh)
    },
    special_report_station: trimOrNull(station.fstnyn) === "Y",
    source: {
      provider: "hrfco",
      hydro_type: "waterlevel",
      time_type: "10M"
    }
  };
}

async function fetchJson(url, { fetchImpl = global.fetch } = {}) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw buildError({
      message: `HRFCO upstream request failed with status ${response.status}.`,
      statusCode: 502,
      code: "upstream_error"
    });
  }

  return response.json();
}

async function fetchWaterLevelStations({ serviceKey, fetchImpl = global.fetch }) {
  const url = new URL(`${HRFCO_API_BASE_URL}/${serviceKey}/waterlevel/info.json`);
  const payload = await fetchJson(url, { fetchImpl });
  return Array.isArray(payload.content) ? payload.content : [];
}

async function fetchLatestWaterLevel({ serviceKey, stationCode, fetchImpl = global.fetch }) {
  const url = new URL(`${HRFCO_API_BASE_URL}/${serviceKey}/waterlevel/list/10M/${stationCode}.json`);
  const payload = await fetchJson(url, { fetchImpl });
  return Array.isArray(payload.content) ? payload.content : [];
}

async function fetchWaterLevelReport({ stationName = null, stationCode = null, serviceKey, fetchImpl = global.fetch }) {
  const stations = await fetchWaterLevelStations({ serviceKey, fetchImpl });
  const station = pickWaterLevelStation(stations, { stationName, stationCode });
  const measurements = await fetchLatestWaterLevel({
    serviceKey,
    stationCode: station.wlobscd,
    fetchImpl
  });

  return buildWaterLevelReport({
    stationItems: stations,
    measurementItems: measurements,
    stationCode: station.wlobscd
  });
}

module.exports = {
  HRFCO_API_BASE_URL,
  buildWaterLevelReport,
  fetchLatestWaterLevel,
  fetchWaterLevelReport,
  fetchWaterLevelStations,
  formatObservedAt,
  pickWaterLevelStation
};
