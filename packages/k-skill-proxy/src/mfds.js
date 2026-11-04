const { classifyUpstreamFailure } = require("./upstream-errors");

const MFDS_UPSTREAM_TIMEOUT_MS = 20000;

const DATA_GO_KR_UPSTREAM_BASE_URL = "https://apis.data.go.kr";
const DRUG_EASY_ENDPOINT = `${DATA_GO_KR_UPSTREAM_BASE_URL}/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`;
const SAFE_STAD_ENDPOINT = `${DATA_GO_KR_UPSTREAM_BASE_URL}/1471000/SafeStadDrugService/getSafeStadDrugInq`;
const IMPROPER_FOOD_ENDPOINT = `${DATA_GO_KR_UPSTREAM_BASE_URL}/1471000/PrsecImproptFoodInfoService03/getPrsecImproptFoodList01`;
const FOOD_RECALL_SAMPLE_URL = "https://openapi.foodsafetykorea.go.kr/api/sample/I0490/json/{start}/{end}";
const FOOD_RECALL_LIVE_URL = "https://openapi.foodsafetykorea.go.kr/api/{apiKey}/I0490/json/{start}/{end}";

const HEALTH_FOOD_INGREDIENT_SAMPLE_URL = "https://openapi.foodsafetykorea.go.kr/api/sample/I-0040/json/{start}/{end}";
const HEALTH_FOOD_INGREDIENT_LIVE_URL = "https://openapi.foodsafetykorea.go.kr/api/{apiKey}/I-0040/json/{start}/{end}";

const HEALTH_FOOD_PRODUCT_SAMPLE_URL = "https://openapi.foodsafetykorea.go.kr/api/sample/I-0050/json/{start}/{end}";
const HEALTH_FOOD_PRODUCT_LIVE_URL = "https://openapi.foodsafetykorea.go.kr/api/{apiKey}/I-0050/json/{start}/{end}";

const INSPECTION_FAIL_SAMPLE_URL = "https://openapi.foodsafetykorea.go.kr/api/sample/I2620/json/{start}/{end}";
const INSPECTION_FAIL_LIVE_URL = "https://openapi.foodsafetykorea.go.kr/api/{apiKey}/I2620/json/{start}/{end}";

const HEALTH_FOOD_PRODUCT_REPORT_SAMPLE_URL = "https://openapi.foodsafetykorea.go.kr/api/sample/I0030/json/{start}/{end}";
const HEALTH_FOOD_PRODUCT_REPORT_LIVE_URL = "https://openapi.foodsafetykorea.go.kr/api/{apiKey}/I0030/json/{start}/{end}";

// FoodSafetyKorea feeds paginate with {start}/{end} row indices and report `total_count` per
// request. The public `sample` key always answers with its first 5 rows and ignores the range, so
// only live-key requests are paged.
const FOODSAFETYKOREA_CONTINUATION_PAGE_SIZE = 1000;
const FOODSAFETYKOREA_MAX_ROWS = 5000;
const FOODSAFETYKOREA_MAX_REQUESTS = 12;

class ProxyError extends Error {
  constructor(message, { code = "proxy_error", statusCode = 502, cause } = {}) {
    super(message, { cause });
    this.code = code;
    this.statusCode = statusCode;
  }
}

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function summarizeText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveInteger(value, fallback, { fieldName, min = 1, max = 50 } = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${fieldName} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringList(item));
  }

  const trimmed = trimOrNull(value);
  return trimmed ? [trimmed] : [];
}

function normalizeMfdsDrugLookupQuery(query) {
  const itemNames = [
    ...normalizeStringList(query.itemName),
    ...normalizeStringList(query.item_name)
  ];
  const uniqueItemNames = [...new Set(itemNames)];

  if (uniqueItemNames.length === 0) {
    throw new Error("Provide at least one itemName.");
  }

  return {
    itemNames: uniqueItemNames,
    limit: parsePositiveInteger(query.limit, 5, { fieldName: "limit", min: 1, max: 20 })
  };
}

function normalizeMfdsFoodSafetyQuery(query) {
  const q = trimOrNull(query.query ?? query.q);
  if (!q) {
    throw new Error("Provide query.");
  }

  return {
    query: q,
    limit: parsePositiveInteger(query.limit, 10, { fieldName: "limit", min: 1, max: 20 })
  };
}

async function requestJson(url, { params, fetchImpl = global.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new ProxyError("A fetch implementation is required.");
  }

  const requestUrl = new URL(url);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        requestUrl.searchParams.set(key, String(value));
      }
    }
  }

  let response;
  try {
    response = await fetchImpl(requestUrl.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": "k-skill-proxy/1.0"
      },
      // Without a deadline a blackholed upstream (data.go.kr / foodsafetykorea)
      // left the route hanging past every client timeout.
      signal: AbortSignal.timeout(MFDS_UPSTREAM_TIMEOUT_MS)
    });
  } catch (error) {
    throw new ProxyError(error.message, { cause: error });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new ProxyError(`Upstream responded with ${response.status}`, {
      code: "upstream_error"
    });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    if (requestUrl.hostname === "openapi.foodsafetykorea.go.kr") {
      throw new ProxyError(
        "FoodSafetyKorea response was not valid JSON. Check FOODSAFETYKOREA_API_KEY on the proxy server.",
        { code: "upstream_invalid_response" }
      );
    }

    const contentType = response.headers.get("content-type") || "unknown";
    throw new ProxyError(`Upstream response was not valid JSON (content-type: ${contentType}).`, {
      code: "upstream_invalid_response"
    });
  }
}

// The food-safety adapters aggregate several upstream sources and deliberately
// degrade to `warnings` when one source is unavailable, so the surviving sources
// keep answering 200. When every source failed on a network error the route must
// still surface the documented 503 upstream_unreachable / 504 upstream_timeout
// contract, so keep the first classified network failure and rethrow it once the
// aggregation has finished.
function collectSourceFailure(error, failures) {
  if (classifyUpstreamFailure(error)) {
    failures.push(error);
  }
}

function throwIfAllSourcesFailed({ failures, successes }) {
  if (successes === 0 && failures.length > 0) {
    throw failures[0];
  }
}

function extractDataGoItems(payload) {
  const items = payload?.body?.items;
  if (!items) {
    return [];
  }

  // Shape A (legacy XML→JSON autoconvert): body.items = { item: [...] | {...} }
  if (!Array.isArray(items) && typeof items === "object") {
    const inner = items.item;
    if (Array.isArray(inner)) {
      return inner.filter((entry) => entry && typeof entry === "object");
    }
    if (inner && typeof inner === "object") {
      return [inner];
    }
    return [];
  }

  // Shape B (native JSON): body.items = [...] flat array of entries.
  // Shape C (wrapped JSON): body.items = [{ item: {...} }, ...] where each entry has a single `item` key.
  if (Array.isArray(items)) {
    return items
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        if (
          entry.item &&
          typeof entry.item === "object" &&
          !Array.isArray(entry.item) &&
          Object.keys(entry).length === 1
        ) {
          return entry.item;
        }
        return entry;
      })
      .filter((entry) => entry && typeof entry === "object");
  }

  return [];
}

function extractFoodSafetyKoreaRows(payload, serviceCode) {
  const raw = payload?.[serviceCode]?.row;
  if (Array.isArray(raw)) {
    return raw.filter((item) => item && typeof item === "object");
  }
  if (raw && typeof raw === "object") {
    return [raw];
  }
  return [];
}

function readFoodSafetyKoreaTotalCount(payload, serviceCode) {
  const parsed = Number.parseInt(String(payload?.[serviceCode]?.total_count ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function buildFoodSafetyKoreaPageUrl(baseUrl, { start, end, filterParam, filterValue }) {
  const url = baseUrl.replace("{start}", String(start)).replace("{end}", String(end));
  if (!filterParam || !filterValue) {
    return url;
  }

  return `${url}/${filterParam}=${encodeURIComponent(filterValue)}`;
}

// Walks the FoodSafetyKorea {start}/{end} range until total_count is exhausted (or a feed reports
// no rows) instead of stopping at the first page, so matches beyond the first page are reachable.
// Requests are bounded by FOODSAFETYKOREA_MAX_ROWS and FOODSAFETYKOREA_MAX_REQUESTS; a feed that
// omits total_count is treated as a single page.
async function fetchPagedFoodSafetyKoreaRows({
  baseUrl,
  serviceCode,
  firstPageSize,
  filterParam,
  filterValue,
  allowPaging,
  fetchImpl
}) {
  const rows = [];
  let start = 1;
  let requests = 0;
  let totalCount = null;

  while (start <= FOODSAFETYKOREA_MAX_ROWS && requests < FOODSAFETYKOREA_MAX_REQUESTS) {
    const pageSize =
      requests === 0
        ? firstPageSize
        : Math.max(firstPageSize, FOODSAFETYKOREA_CONTINUATION_PAGE_SIZE);
    let end = Math.min(start + pageSize - 1, FOODSAFETYKOREA_MAX_ROWS);
    if (totalCount !== null) {
      end = Math.min(end, totalCount);
    }
    if (end < start) {
      break;
    }

    const pagePayload = await requestJson(
      buildFoodSafetyKoreaPageUrl(baseUrl, { start, end, filterParam, filterValue }),
      { fetchImpl }
    );
    const pageRows = extractFoodSafetyKoreaRows(pagePayload, serviceCode);

    requests += 1;
    rows.push(...pageRows);
    totalCount = readFoodSafetyKoreaTotalCount(pagePayload, serviceCode);

    if (!allowPaging || pageRows.length === 0) {
      break;
    }
    if (totalCount === null || rows.length >= totalCount) {
      break;
    }

    start = end + 1;
  }

  return rows;
}

// Uses the upstream filter parameter when the service exposes one for the queried field, and falls
// back to walking the feed when that filter answers with nothing, so an ignored or narrower
// upstream filter can never turn into a silent empty result.
async function fetchFoodSafetyKoreaRowsForQuery({
  baseUrl,
  serviceCode,
  firstPageSize,
  query,
  filterParam,
  allowPaging,
  fetchImpl
}) {
  if (filterParam) {
    const filteredRows = await fetchPagedFoodSafetyKoreaRows({
      baseUrl,
      serviceCode,
      firstPageSize,
      filterParam,
      filterValue: query,
      allowPaging,
      fetchImpl
    });

    if (filteredRows.length > 0) {
      return filteredRows;
    }
  }

  return fetchPagedFoodSafetyKoreaRows({ baseUrl, serviceCode, firstPageSize, allowPaging, fetchImpl });
}

function normalizeHealthFoodIngredientRow(item) {
  return {
    source: "foodsafetykorea_health_food_ingredient",
    ingredient_name: summarizeText(item.APLC_RAWMTRL_NM),
    approval_number: summarizeText(item.HF_FNCLTY_MTRAL_RCOGN_NO),
    functionality: summarizeText(item.FNCLTY_CN),
    daily_intake: summarizeText(item.DAY_INTK_CN),
    precautions: summarizeText(item.IFTKN_ATNT_MATR_CN),
    company_name: summarizeText(item.BSSH_NM),
    approved_at: summarizeText(item.PRMS_DT)
  };
}

function normalizeHealthFoodProductRow(item) {
  return {
    source: "foodsafetykorea_health_food_product",
    ingredient_name: summarizeText(item.RAWMTRL_NM),
    approval_number: summarizeText(item.HF_FNCLTY_MTRAL_RCOGN_NO),
    functionality: summarizeText(item.PRIMARY_FNCLTY),
    daily_intake_low: summarizeText(item.DAY_INTK_LOWLIMIT),
    daily_intake_high: summarizeText(item.DAY_INTK_HIGHLIMIT),
    intake_unit: summarizeText(item.WT_UNIT),
    precautions: summarizeText(item.IFTKN_ATNT_MATR_CN)
  };
}

function normalizeProductReportRow(item) {
  return {
    source: "foodsafetykorea_product_report",
    product_name: summarizeText(item.PRDLST_NM),
    company_name: summarizeText(item.BSSH_NM),
    raw_materials: summarizeText(item.RAWMTRL_NM),
    individual_raw_materials: summarizeText(item.INDIV_RAWMTRL_NM),
    functionality: summarizeText(item.PRIMARY_FNCLTY),
    precautions: summarizeText(item.IFTKN_ATNT_MATR_CN),
    standard: summarizeText(item.STDR_STND),
    product_shape: summarizeText(item.PRDT_SHAP_CD_NM),
    shelf_life: summarizeText(item.POG_DAYCNT),
    approved_at: summarizeText(item.PRMS_DT)
  };
}

function normalizeInspectionFailRow(item) {
  return {
    source: "foodsafetykorea_inspection_fail",
    product_name: summarizeText(item.PRDTNM),
    product_category: summarizeText(item.PRDLST_CD_NM),
    company_name: summarizeText(item.BSSHNM),
    address: summarizeText(item.ADDR),
    fail_item: summarizeText(item.TEST_ITMNM),
    standard: summarizeText(item.STDR_STND),
    test_result: summarizeText(item.TESTANALS_RSLT),
    created_at: summarizeText(item.CRET_DTM),
    inspection_agency: summarizeText(item.INSTT_NM)
  };
}

function filterByName(items, query, nameFields) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  for (const field of nameFields) {
    const matches = items.filter((item) => summarizeText(item[field]).toLowerCase().includes(needle));
    if (matches.length > 0) {
      return matches;
    }
  }

  return [];
}

function normalizeEasyDrugItem(item) {
  return {
    source: "drug_easy_info",
    item_name: summarizeText(item.itemName),
    company_name: summarizeText(item.entpName),
    efficacy: summarizeText(item.efcyQesitm),
    how_to_use: summarizeText(item.useMethodQesitm),
    warnings: summarizeText(item.atpnWarnQesitm),
    cautions: summarizeText(item.atpnQesitm),
    interactions: summarizeText(item.intrcQesitm),
    side_effects: summarizeText(item.seQesitm),
    storage: summarizeText(item.depositMethodQesitm),
    item_seq: summarizeText(item.itemSeq)
  };
}

function normalizeSafeStandbyDrugItem(item) {
  return {
    source: "safe_standby_medicine",
    item_name: summarizeText(item.PRDLST_NM),
    company_name: summarizeText(item.BSSH_NM),
    efficacy: summarizeText(item.EFCY_QESITM),
    how_to_use: summarizeText(item.USE_METHOD_QESITM),
    warnings: summarizeText(item.ATPN_WARN_QESITM),
    cautions: summarizeText(item.ATPN_QESITM),
    interactions: summarizeText(item.INTRC_QESITM),
    side_effects: summarizeText(item.SE_QESITM)
  };
}

function normalizeImproperFoodItem(item) {
  const reasonParts = [summarizeText(item.IMPROPT_ITM), summarizeText(item.INSPCT_RESULT)].filter(Boolean);

  return {
    source: "mfds_improper_food",
    product_name: summarizeText(item.PRDUCT),
    company_name: summarizeText(item.ENTRPS),
    reason: reasonParts.join("; "),
    created_at: summarizeText(item.REGIST_DT),
    category: summarizeText(item.FOOD_TY)
  };
}

function normalizeFoodRecallRow(item) {
  return {
    source: "foodsafetykorea_recall",
    product_name: summarizeText(item.PRDLST_NM || item.PRDTNM),
    company_name: summarizeText(item.BSSH_NM || item.BSSHNM),
    reason: summarizeText(item.RTRVLPRVNS),
    created_at: summarizeText(item.CRET_DTM),
    distribution_deadline: summarizeText(item.DISTBTMLMT),
    category: summarizeText(item.PRDLST_TYPE || item.PRDLST_CD_NM)
  };
}

function filterFoodSafetyItems(items, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  const match = (value) => summarizeText(value).toLowerCase().includes(needle);
  const productMatches = items.filter((item) => match(item.product_name));
  if (productMatches.length > 0) {
    return productMatches;
  }

  const companyMatches = items.filter((item) => match(item.company_name));
  if (companyMatches.length > 0) {
    return companyMatches;
  }

  return items.filter((item) => match(item.reason));
}

async function fetchMfdsDrugLookup({ itemNames, limit, dataGoKrApiKey, fetchImpl = global.fetch }) {
  const items = [];

  for (const itemName of itemNames) {
    const [easyPayload, safePayload] = await Promise.all([
      requestJson(DRUG_EASY_ENDPOINT, {
        fetchImpl,
        params: {
          ServiceKey: dataGoKrApiKey,
          pageNo: 1,
          numOfRows: limit,
          type: "json",
          itemName
        }
      }),
      requestJson(SAFE_STAD_ENDPOINT, {
        fetchImpl,
        params: {
          serviceKey: dataGoKrApiKey,
          pageNo: 1,
          numOfRows: limit,
          type: "json",
          PRDLST_NM: itemName
        }
      })
    ]);

    items.push(...extractDataGoItems(easyPayload).map(normalizeEasyDrugItem));
    items.push(...extractDataGoItems(safePayload).map(normalizeSafeStandbyDrugItem));
  }

  return {
    query: {
      item_names: itemNames,
      limit
    },
    items,
    note: "상호작용 문구는 공식 품목 안내를 그대로 요약한 참고 정보이며, 복용 가능 여부의 최종 판단은 약사·의료진 확인이 필요합니다."
  };
}

async function fetchMfdsFoodSafetySearch({
  query,
  limit,
  dataGoKrApiKey,
  foodsafetyKoreaApiKey,
  fetchImpl = global.fetch
}) {
  const warnings = [];
  const failures = [];
  let successes = 0;
  const rowCount = Math.max(limit * 5, 50);

  const recallUrl = foodsafetyKoreaApiKey
    ? FOOD_RECALL_LIVE_URL.replace("{apiKey}", encodeURIComponent(foodsafetyKoreaApiKey))
    : FOOD_RECALL_SAMPLE_URL;

  // Both sources are independent, so they are queried concurrently: a sequential
  // wait would add their deadlines together (~2x the proxy timeout budget) on top
  // of what the caller is allowed to wait for.
  const [improperItems, recallItems] = await Promise.all([
    (async () => {
      if (!dataGoKrApiKey) {
        warnings.push("DATA_GO_KR_API_KEY is not configured on the proxy server, so improper-food live lookups were skipped.");
        return [];
      }
      try {
        const improperPayload = await requestJson(IMPROPER_FOOD_ENDPOINT, {
          fetchImpl,
          params: {
            ServiceKey: dataGoKrApiKey,
            pageNo: 1,
            numOfRows: rowCount,
            type: "json"
          }
        });
        successes += 1;
        return extractDataGoItems(improperPayload).map(normalizeImproperFoodItem);
      } catch (error) {
        collectSourceFailure(error, failures);
        warnings.push(error.message);
        return [];
      }
    })(),
    (async () => {
      try {
        // I0490 exposes no product-name filter, so the whole recall feed has to be walked before the
        // query can be matched locally.
        const recallRows = await fetchPagedFoodSafetyKoreaRows({
          baseUrl: recallUrl,
          serviceCode: "I0490",
          firstPageSize: rowCount,
          allowPaging: Boolean(foodsafetyKoreaApiKey),
          fetchImpl
        });
        successes += 1;
        if (!foodsafetyKoreaApiKey) {
          warnings.push("FOODSAFETYKOREA_API_KEY is not configured on the proxy server, so recall results use the public sample feed.");
        }
        return recallRows.map(normalizeFoodRecallRow);
      } catch (error) {
        collectSourceFailure(error, failures);
        warnings.push(error.message);
        return [];
      }
    })()
  ]);

  const items = [...improperItems, ...recallItems];

  throwIfAllSourcesFailed({ failures, successes });

  return {
    query,
    items: filterFoodSafetyItems(items, query).slice(0, limit),
    warnings,
    note: "이 결과는 공식 회수·부적합 공개 목록 기반 참고 정보이며, 섭취 가능 여부의 최종 판단은 증상 인터뷰와 의료진 상담이 우선입니다."
  };
}

async function fetchHealthFoodIngredient({ query, limit, foodsafetyKoreaApiKey, fetchImpl = global.fetch }) {
  const warnings = [];
  const fetchCount = Math.max(limit * 10, 100);

  const ingredientUrl = foodsafetyKoreaApiKey
    ? HEALTH_FOOD_INGREDIENT_LIVE_URL.replace("{apiKey}", encodeURIComponent(foodsafetyKoreaApiKey))
    : HEALTH_FOOD_INGREDIENT_SAMPLE_URL;

  const productUrl = foodsafetyKoreaApiKey
    ? HEALTH_FOOD_PRODUCT_LIVE_URL.replace("{apiKey}", encodeURIComponent(foodsafetyKoreaApiKey))
    : HEALTH_FOOD_PRODUCT_SAMPLE_URL;

  const items = [];
  const failures = [];
  let successes = 0;

  // I-0040 filters on APLC_RAWMTRL_NM (the queried ingredient name); I-0050 only filters on CHNG_DT,
  // so that feed is walked end to end (456 rows) and matched locally.
  const [ingredientRows, productRows] = await Promise.all([
    fetchFoodSafetyKoreaRowsForQuery({
      baseUrl: ingredientUrl,
      serviceCode: "I-0040",
      firstPageSize: fetchCount,
      query,
      filterParam: "APLC_RAWMTRL_NM",
      allowPaging: Boolean(foodsafetyKoreaApiKey),
      fetchImpl
    }).then((rows) => {
      successes += 1;
      return rows;
    }).catch((error) => {
      collectSourceFailure(error, failures);
      warnings.push(`I-0040: ${error.message}`);
      return null;
    }),
    fetchPagedFoodSafetyKoreaRows({
      baseUrl: productUrl,
      serviceCode: "I-0050",
      firstPageSize: fetchCount,
      allowPaging: Boolean(foodsafetyKoreaApiKey),
      fetchImpl
    }).then((rows) => {
      successes += 1;
      return rows;
    }).catch((error) => {
      collectSourceFailure(error, failures);
      warnings.push(`I-0050: ${error.message}`);
      return null;
    })
  ]);

  if (ingredientRows) {
    items.push(...ingredientRows.map(normalizeHealthFoodIngredientRow));
  }
  if (productRows) {
    items.push(...productRows.map(normalizeHealthFoodProductRow));
  }

  if (!foodsafetyKoreaApiKey) {
    warnings.push("FOODSAFETYKOREA_API_KEY is not configured on the proxy server, so results use the public sample feed.");
  }

  throwIfAllSourcesFailed({ failures, successes });

  const filtered = filterByName(items, query, ["ingredient_name"]).slice(0, limit);

  return {
    query,
    items: filtered,
    warnings: warnings.length > 0 ? warnings : undefined,
    note: "이 결과는 공식 건강기능식품 기능성 원료 인정현황 기반 참고 정보이며, 섭취 가능 여부의 최종 판단은 의료진 상담이 우선입니다."
  };
}

async function fetchInspectionFail({ query, limit, foodsafetyKoreaApiKey, fetchImpl = global.fetch }) {
  const warnings = [];
  const failures = [];
  let successes = 0;
  const fetchCount = Math.max(limit * 10, 100);

  const url = foodsafetyKoreaApiKey
    ? INSPECTION_FAIL_LIVE_URL.replace("{apiKey}", encodeURIComponent(foodsafetyKoreaApiKey))
    : INSPECTION_FAIL_SAMPLE_URL;

  let items = [];
  try {
    // I2620 filters on PRDTNM; the local filter also matches company and test item, so a product
    // name miss falls back to walking the full feed (559 rows).
    const rows = await fetchFoodSafetyKoreaRowsForQuery({
      baseUrl: url,
      serviceCode: "I2620",
      firstPageSize: fetchCount,
      query,
      filterParam: "PRDTNM",
      allowPaging: Boolean(foodsafetyKoreaApiKey),
      fetchImpl
    });
    items = rows.map(normalizeInspectionFailRow);
    successes += 1;
  } catch (error) {
    collectSourceFailure(error, failures);
    warnings.push(error.message);
  }

  throwIfAllSourcesFailed({ failures, successes });

  if (!foodsafetyKoreaApiKey) {
    warnings.push("FOODSAFETYKOREA_API_KEY is not configured on the proxy server, so results use the public sample feed.");
  }

  const filtered = filterByName(items, query, ["product_name", "company_name", "fail_item"]).slice(0, limit);

  return {
    query,
    items: filtered,
    warnings: warnings.length > 0 ? warnings : undefined,
    note: "이 결과는 공식 검사부적합(국내) 공개 목록 기반 참고 정보이며, 섭취 가능 여부의 최종 판단은 의료진 상담이 우선입니다."
  };
}

async function fetchHealthFoodProductReport({ query, limit, foodsafetyKoreaApiKey, fetchImpl = global.fetch }) {
  const warnings = [];
  const fetchCount = Math.max(limit * 5, 50);

  const baseUrl = foodsafetyKoreaApiKey
    ? HEALTH_FOOD_PRODUCT_REPORT_LIVE_URL.replace("{apiKey}", encodeURIComponent(foodsafetyKoreaApiKey))
    : HEALTH_FOOD_PRODUCT_REPORT_SAMPLE_URL;

  const failures = [];
  let successes = 0;

  // I0030 holds 46k+ rows, so it is queried with the only server-side filters it supports
  // (PRDLST_NM, BSSH_NM) and the filtered totals are paged instead of walking the whole feed. A
  // RAWMTRL_NM request used to be sent here as well, but I0030 reports that parameter as
  // unsupported and answers with unfiltered rows, which silently returned unrelated products.
  const searchFilters = [
    { filterParam: "PRDLST_NM", filterValue: query },
    { filterParam: "BSSH_NM", filterValue: query }
  ];

  const fetches = searchFilters.map(({ filterParam, filterValue }) =>
    fetchPagedFoodSafetyKoreaRows({
      baseUrl,
      serviceCode: "I0030",
      firstPageSize: fetchCount,
      filterParam,
      filterValue,
      allowPaging: Boolean(foodsafetyKoreaApiKey),
      fetchImpl
    }).then((rows) => {
      successes += 1;
      return rows;
    }).catch((error) => {
      collectSourceFailure(error, failures);
      warnings.push(`I0030: ${error.message}`);
      return null;
    })
  );

  const results = await Promise.all(fetches);
  const seen = new Set();
  const items = [];

  const collect = (rows) => {
    for (const row of rows) {
      const key = row.PRDLST_REPORT_NO || `${row.PRDLST_NM}-${row.BSSH_NM}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(normalizeProductReportRow(row));
      }
    }
  };

  results.forEach((rows) => {
    if (rows) {
      collect(rows);
    }
  });

  const nameFields = ["product_name", "company_name", "raw_materials"];
  let matched = filterByName(items, query, nameFields);

  if (matched.length === 0) {
    // I0030 exposes no filter for raw materials, so a query carried only by raw materials would
    // otherwise come back empty; walk a bounded window of the feed and match it locally.
    const fallbackRows = await fetchPagedFoodSafetyKoreaRows({
      baseUrl,
      serviceCode: "I0030",
      firstPageSize: fetchCount,
      allowPaging: Boolean(foodsafetyKoreaApiKey),
      fetchImpl
    }).catch((error) => { warnings.push(`I0030: ${error.message}`); return null; });

    if (fallbackRows) {
      collect(fallbackRows);
      matched = filterByName(items, query, nameFields);
    }
  }

  if (!foodsafetyKoreaApiKey) {
    warnings.push("FOODSAFETYKOREA_API_KEY is not configured on the proxy server, so results use the public sample feed.");
  }

  throwIfAllSourcesFailed({ failures, successes });

  return {
    query,
    items: matched.slice(0, limit),
    warnings: warnings.length > 0 ? warnings : undefined,
    note: "이 결과는 공식 건강기능식품 품목제조 신고사항 기반 참고 정보이며, 섭취 가능 여부의 최종 판단은 의료진 상담이 우선입니다."
  };
}

module.exports = {
  fetchMfdsDrugLookup,
  fetchMfdsFoodSafetySearch,
  fetchHealthFoodIngredient,
  fetchHealthFoodProductReport,
  fetchInspectionFail,
  normalizeMfdsDrugLookupQuery,
  normalizeMfdsFoodSafetyQuery
};
