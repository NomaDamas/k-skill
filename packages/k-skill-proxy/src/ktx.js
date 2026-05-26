const { spawn } = require("node:child_process");
const path = require("node:path");

const VALID_TRAIN_TYPES = new Set([
  "airport",
  "all",
  "itx-cheongchun",
  "itx-saemaeul",
  "ktx",
  "mugunghwa",
  "nuriro",
  "tonggeun"
]);

const VALID_SEAT_OPTIONS = new Set([
  "general-first",
  "general-only",
  "special-first",
  "special-only"
]);

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "replace-me") {
    return null;
  }
  return trimmed;
}

function makeKtxError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parseBoundedInteger(value, { defaultValue, min, max, label }) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw makeKtxError(400, "bad_request", `Provide valid ${label}.`);
  }
  const parsed = Number.parseInt(text, 10);
  return Math.min(Math.max(parsed, min), max);
}

function parseBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function normalizeTrainType(value) {
  const trainType = trimOrNull(value) || "ktx";
  if (!VALID_TRAIN_TYPES.has(trainType)) {
    throw makeKtxError(400, "bad_request", `trainType must be one of ${[...VALID_TRAIN_TYPES].join(", ")}.`);
  }
  return trainType;
}

function normalizeSeatOption(value) {
  const seatOption = trimOrNull(value) || "general-first";
  if (!VALID_SEAT_OPTIONS.has(seatOption)) {
    throw makeKtxError(400, "bad_request", `seatOption must be one of ${[...VALID_SEAT_OPTIONS].join(", ")}.`);
  }
  return seatOption;
}

function normalizeBaseTripQuery(query) {
  const departure = trimOrNull(query.departure ?? query.dep ?? query.from);
  const arrival = trimOrNull(query.arrival ?? query.arr ?? query.to);
  const date = trimOrNull(query.date);
  const time = trimOrNull(query.time);

  if (!departure) {
    throw makeKtxError(400, "bad_request", "Provide departure.");
  }
  if (!arrival) {
    throw makeKtxError(400, "bad_request", "Provide arrival.");
  }
  if (!/^\d{8}$/.test(date || "")) {
    throw makeKtxError(400, "bad_request", "Provide date as YYYYMMDD.");
  }
  if (!/^\d{6}$/.test(time || "")) {
    throw makeKtxError(400, "bad_request", "Provide time as HHMMSS.");
  }

  return { departure, arrival, date, time };
}

function normalizePassengerCounts(query) {
  return {
    adults: parseBoundedInteger(query.adults, { defaultValue: 1, min: 0, max: 9, label: "adults" }),
    children: parseBoundedInteger(query.children, { defaultValue: 0, min: 0, max: 9, label: "children" }),
    toddlers: parseBoundedInteger(query.toddlers, { defaultValue: 0, min: 0, max: 9, label: "toddlers" }),
    seniors: parseBoundedInteger(query.seniors, { defaultValue: 0, min: 0, max: 9, label: "seniors" })
  };
}

function addPassengerArgs(args, query) {
  const passengerCounts = normalizePassengerCounts(query);
  args.push("--adults", String(passengerCounts.adults));
  args.push("--children", String(passengerCounts.children));
  args.push("--toddlers", String(passengerCounts.toddlers));
  args.push("--seniors", String(passengerCounts.seniors));
}

function normalizeKtxSearchQuery(query = {}) {
  return {
    ...normalizeBaseTripQuery(query),
    trainType: normalizeTrainType(query.trainType ?? query.train_type),
    limit: parseBoundedInteger(query.limit, { defaultValue: 5, min: 1, max: 20, label: "limit" }),
    includeNoSeats: parseBoolean(query.includeNoSeats ?? query.include_no_seats),
    includeWaitingList: parseBoolean(query.includeWaitingList ?? query.include_waiting_list),
    ...normalizePassengerCounts(query)
  };
}

function normalizeKtxReserveBody(body = {}) {
  const trainId = trimOrNull(body.train_id ?? body.trainId);
  if (!trainId) {
    throw makeKtxError(400, "bad_request", "Provide train_id.");
  }

  return {
    ...normalizeBaseTripQuery(body),
    trainId,
    trainType: normalizeTrainType(body.trainType ?? body.train_type),
    seatOption: normalizeSeatOption(body.seatOption ?? body.seat_option),
    includeNoSeats: parseBoolean(body.includeNoSeats ?? body.include_no_seats),
    includeWaitingList: parseBoolean(body.includeWaitingList ?? body.include_waiting_list),
    tryWaiting: parseBoolean(body.tryWaiting ?? body.try_waiting),
    ncardIndex: body.ncardIndex ?? body.ncard_index,
    ncardNo: trimOrNull(body.ncardNo ?? body.ncard_no),
    ...normalizePassengerCounts(body)
  };
}

function normalizeKtxCancelBody(body = {}) {
  const reservationId = trimOrNull(body.reservation_id ?? body.reservationId ?? body.id);
  if (!reservationId) {
    throw makeKtxError(400, "bad_request", "Provide reservation_id.");
  }
  return { reservationId };
}

function normalizeKtxNcardSearchQuery(query = {}) {
  const rawNcardIndex = query.ncardIndex ?? query.ncard_index;
  if (rawNcardIndex === undefined || rawNcardIndex === null || String(rawNcardIndex).trim() === "") {
    throw makeKtxError(400, "bad_request", "Provide ncardIndex.");
  }
  if (!/^\d+$/.test(String(rawNcardIndex).trim())) {
    throw makeKtxError(400, "bad_request", "Provide valid ncardIndex.");
  }
  const ncardIndex = Number.parseInt(String(rawNcardIndex).trim(), 10);
  if (ncardIndex < 1 || ncardIndex > 999) {
    throw makeKtxError(400, "bad_request", "ncardIndex must be between 1 and 999.");
  }

  return {
    ...normalizeBaseTripQuery(query),
    ncardIndex,
    trainType: normalizeTrainType(query.trainType ?? query.train_type),
    limit: parseBoundedInteger(query.limit, { defaultValue: 5, min: 1, max: 20, label: "limit" })
  };
}

function ensureKtxConfigured(config) {
  if (!config.ktxId || !config.ktxPassword) {
    throw makeKtxError(
      503,
      "upstream_not_configured",
      "KSKILL_KTX_ID/KSKILL_KTX_PASSWORD are not configured."
    );
  }
}

function runKtxHelper(args, config) {
  ensureKtxConfigured(config);

  const scriptPath = path.join(__dirname, "..", "..", "..", "scripts", "ktx_booking.py");
  const commandArgs = [scriptPath, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn("python3", commandArgs, {
      env: {
        ...process.env,
        KSKILL_KTX_ID: config.ktxId,
        KSKILL_KTX_PASSWORD: config.ktxPassword
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(makeKtxError(502, "upstream_error", error.message));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(makeKtxError(502, "upstream_error", stderr || `KTX helper exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(makeKtxError(502, "invalid_upstream_response", "KTX helper returned non-JSON output."));
      }
    });
  });
}

function proxyKtxSearch(query, config) {
  const args = [
    "search",
    query.departure,
    query.arrival,
    query.date,
    query.time,
    "--limit",
    String(query.limit),
    "--train-type",
    query.trainType
  ];

  if (query.includeNoSeats) {
    args.push("--include-no-seats");
  }
  if (query.includeWaitingList) {
    args.push("--include-waiting-list");
  }
  addPassengerArgs(args, query);
  return runKtxHelper(args, config);
}

function proxyKtxReserve(query, config) {
  const args = [
    "reserve",
    query.departure,
    query.arrival,
    query.date,
    query.time,
    "--train-id",
    query.trainId,
    "--train-type",
    query.trainType,
    "--seat-option",
    query.seatOption
  ];

  if (query.includeNoSeats) {
    args.push("--include-no-seats");
  }
  if (query.includeWaitingList) {
    args.push("--include-waiting-list");
  }
  if (query.tryWaiting) {
    args.push("--try-waiting");
  }
  if (query.ncardIndex !== undefined && query.ncardIndex !== null && String(query.ncardIndex).trim() !== "") {
    args.push("--ncard-index", String(query.ncardIndex));
  }
  if (query.ncardNo) {
    args.push("--ncard-no", query.ncardNo);
  }

  addPassengerArgs(args, query);
  return runKtxHelper(args, config);
}

function proxyKtxReservations(config) {
  return runKtxHelper(["reservations"], config);
}

function proxyKtxCancel(query, config) {
  return runKtxHelper(["cancel", query.reservationId], config);
}

function proxyKtxNcards(config) {
  return runKtxHelper(["ncard-list"], config);
}

function proxyKtxNcardSearch(query, config) {
  return runKtxHelper([
    "ncard-search",
    query.departure,
    query.arrival,
    query.date,
    query.time,
    "--ncard-index",
    String(query.ncardIndex),
    "--train-type",
    query.trainType,
    "--limit",
    String(query.limit)
  ], config);
}

module.exports = {
  normalizeKtxCancelBody,
  normalizeKtxNcardSearchQuery,
  normalizeKtxReserveBody,
  normalizeKtxSearchQuery,
  proxyKtxCancel,
  proxyKtxNcardSearch,
  proxyKtxNcards,
  proxyKtxReservations,
  proxyKtxReserve,
  proxyKtxSearch
};
