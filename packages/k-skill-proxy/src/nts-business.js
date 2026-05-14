const NTS_BUSINESSMAN_UPSTREAM_BASE_URL = "https://api.odcloud.kr/api/nts-businessman/v1";
const NTS_BATCH_LIMIT = 100;
const NTS_BUSINESS_OPERATIONS = new Set(["status", "validate"]);
const NTS_VALIDATE_OPTIONAL_TEXT_FIELDS = ["p_nm2", "b_nm", "b_sector", "b_type", "b_adr"];
const NTS_VALIDATE_TEXT_FIELD_LIMITS = {
  p_nm: 30,
  p_nm2: 30,
  b_nm: 200,
  b_sector: 100,
  b_type: 100,
  b_adr: 500
};

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeBusinessNumber(value) {
  const raw = trimOrNull(value);
  if (!raw) {
    throw new Error("Provide business registration number (b_no). business registration number must be 10 digits.");
  }
  const normalized = raw.replace(/[^0-9]/g, "");
  if (!/^\d{10}$/.test(normalized)) {
    throw new Error("Provide valid business registration number (b_no) as 10 digits.");
  }
  return normalized;
}

function normalizeNtsBusinessNumbers(value) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(",");
  const numbers = rawValues
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .map((entry) => trimOrNull(entry))
    .filter(Boolean)
    .map(normalizeBusinessNumber);

  const unique = [...new Set(numbers)];
  if (unique.length === 0) {
    throw new Error("Provide b_no as one or more business registration numbers.");
  }
  if (unique.length > NTS_BATCH_LIMIT) {
    throw new Error(`Provide up to ${NTS_BATCH_LIMIT} business registration numbers per request.`);
  }
  return unique;
}

function normalizeNtsStartDate(value) {
  const raw = trimOrNull(value);
  if (!raw) {
    throw new Error("Provide start_dt as YYYYMMDD.");
  }
  const normalized = raw.replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(normalized)) {
    throw new Error("Provide start_dt as YYYYMMDD.");
  }

  const year = Number.parseInt(normalized.slice(0, 4), 10);
  const month = Number.parseInt(normalized.slice(4, 6), 10);
  const day = Number.parseInt(normalized.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Provide start_dt as a valid YYYYMMDD date.");
  }
  return normalized;
}

function normalizeOptionalDigits(value, label) {
  const raw = trimOrNull(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/[^0-9]/g, "");
  if (!normalized) {
    throw new Error(`Provide valid ${label}.`);
  }
  return normalized;
}

function normalizeNtsValidateText(value, fieldName, { required = false } = {}) {
  const normalized = trimOrNull(value);
  if (!normalized) {
    if (required) {
      throw new Error(`Provide ${fieldName} for each business.`);
    }
    return null;
  }

  const maxLength = NTS_VALIDATE_TEXT_FIELD_LIMITS[fieldName];
  if (maxLength && normalized.length > maxLength) {
    throw new Error(`Provide ${fieldName} up to ${maxLength} characters.`);
  }
  return normalized;
}

function normalizeNtsBusinessStatusQuery(body = {}) {
  return {
    b_no: normalizeNtsBusinessNumbers(body.b_no ?? body.business_numbers ?? body.businessNumbers)
  };
}

function normalizeNtsBusinessValidateItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("Each business must be an object.");
  }

  const pNm = normalizeNtsValidateText(
    item.p_nm ?? item.owner_name ?? item.ownerName ?? item.representative_name,
    "p_nm",
    { required: true }
  );

  const normalized = {
    b_no: normalizeBusinessNumber(item.b_no ?? item.business_number ?? item.businessNumber),
    start_dt: normalizeNtsStartDate(item.start_dt ?? item.startDate ?? item.opening_date),
    p_nm: pNm
  };

  for (const key of NTS_VALIDATE_OPTIONAL_TEXT_FIELDS) {
    const value = normalizeNtsValidateText(item[key], key);
    if (value) {
      normalized[key] = value;
    }
  }

  const corpNo = normalizeOptionalDigits(item.corp_no ?? item.corpNo, "corp_no");
  if (corpNo) {
    if (!/^\d{13}$/.test(corpNo)) {
      throw new Error("Provide valid corp_no as 13 digits.");
    }
    normalized.corp_no = corpNo;
  }

  return normalized;
}

function normalizeNtsBusinessValidateQuery(body = {}) {
  const businesses = body.businesses;
  if (!Array.isArray(businesses) || businesses.length === 0) {
    throw new Error("Provide businesses as a non-empty array.");
  }
  if (businesses.length > NTS_BATCH_LIMIT) {
    throw new Error(`Provide up to ${NTS_BATCH_LIMIT} businesses per request.`);
  }

  return {
    businesses: businesses.map(normalizeNtsBusinessValidateItem)
  };
}

async function proxyNtsBusinessRequest({ operation, payload, serviceKey, fetchImpl = global.fetch }) {
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

  if (!NTS_BUSINESS_OPERATIONS.has(operation)) {
    return {
      statusCode: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "not_found",
        message: "That NTS business route is not exposed by this proxy."
      })
    };
  }

  const url = new URL(`${NTS_BUSINESSMAN_UPSTREAM_BASE_URL}/${operation}`);
  url.searchParams.set("serviceKey", serviceKey);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });

  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body: await response.text()
  };
}

module.exports = {
  normalizeBusinessNumber,
  normalizeNtsBusinessNumbers,
  normalizeNtsBusinessStatusQuery,
  normalizeNtsBusinessValidateItem,
  normalizeNtsBusinessValidateQuery,
  normalizeNtsStartDate,
  proxyNtsBusinessRequest
};
