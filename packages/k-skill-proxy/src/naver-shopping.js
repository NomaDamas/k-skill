const NAVER_SHOPPING_BASE_URL = "https://search.shopping.naver.com";
const NAVER_SHOPPING_BFF_BASE_URL = "https://ns-portal.shopping.naver.com";
const NAVER_SHOPPING_SEARCH_PATH = "/api/v2/shopping-paged-slot";
const NAVER_SHOPPING_OPEN_API_URL = "https://openapi.naver.com/v1/search/shop.json";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 40;
const ALLOWED_SORTS = new Set(["rel", "date", "price_asc", "price_dsc", "review"]);
const LOCALLY_SORTABLE_BFF_SORTS = new Set(["price_asc", "price_dsc", "review"]);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function decodeHtmlEntities(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFirstValue(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const value = object[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return null;
}

function parseDigits(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const text = stripTags(value);
  if (!text) {
    return null;
  }
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) {
    return null;
  }
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = stripTags(value);
  if (!text) {
    return null;
  }
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function normalizeUrl(value, baseUrl = NAVER_SHOPPING_BASE_URL) {
  const raw = trimOrNull(stripTags(value));
  if (!raw || /^javascript:/i.test(raw)) {
    return null;
  }
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return `${baseUrl}${raw}`;
  }
  return null;
}

function firstUrlFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  for (const key of ["pcUrl", "mobileUrl", "url", "link", "href"]) {
    const normalized = normalizeUrl(value[key]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeUrlCandidate(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeUrlCandidate(entry);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    const objectUrl = firstUrlFromObject(value);
    if (objectUrl) {
      return objectUrl;
    }
    for (const key of ["imageUrl", "image", "thumbnailUrl", "src"]) {
      const normalized = normalizeUrl(value[key]);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  return normalizeUrl(value);
}

function normalizeString(value) {
  const normalized = stripTags(value);
  return normalized || null;
}

function collectCategory(candidate) {
  const category = [];
  for (const key of ["category1Name", "category2Name", "category3Name", "category4Name", "categoryName", "category"]) {
    const value = normalizeString(candidate[key]);
    if (value && !category.includes(value)) {
      category.push(value);
    }
  }
  return category;
}

function normalizeProductCandidate(candidate, { rank, source }) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const title = normalizeString(getFirstValue(candidate, [
    "productName",
    "productTitle",
    "product_name",
    "productTitleOrg",
    "mallProductName",
    "title",
    "name"
  ]));
  const price = parseDigits(getFirstValue(candidate, [
    "lowPrice",
    "price",
    "lprice",
    "salePrice",
    "discountedPrice",
    "mobileLowPrice",
    "minPrice",
    "priceValue"
  ]));

  if (!title || price === null) {
    return null;
  }

  const mallName = normalizeString(getFirstValue(candidate, [
    "mallName",
    "mallNm",
    "mall_name",
    "storeName",
    "sellerName",
    "channelName",
    "adMallName"
  ]));
  const url = normalizeUrl(getFirstValue(candidate, [
    "productUrl",
    "mallProductUrl",
    "crUrl",
    "adcrUrl",
    "url",
    "link"
  ]));
  const imageUrl = normalizeUrl(getFirstValue(candidate, [
    "imageUrl",
    "imgUrl",
    "image",
    "thumbnail",
    "thumbnailUrl",
    "imgSrc"
  ]));
  const productId = normalizeString(getFirstValue(candidate, ["productId", "id", "nvMid", "catalogId"]));
  const reviewCount = parseDigits(getFirstValue(candidate, ["reviewCount", "reviewCnt", "review_count"]));
  const purchaseCount = parseDigits(getFirstValue(candidate, ["purchaseCnt", "purchaseCount", "purchase_count"]));
  const score = parseFloatNumber(getFirstValue(candidate, ["scoreInfo", "score", "rating", "reviewScore"]));
  const category = collectCategory(candidate);
  const adFlag = getFirstValue(candidate, ["isAd", "ad", "adId", "adcrUrl", "adProduct"]);

  return {
    rank,
    product_id: productId,
    title,
    price,
    price_text: formatWon(price),
    mall_name: mallName,
    url,
    image_url: imageUrl,
    category,
    review_count: reviewCount,
    purchase_count: purchaseCount,
    score,
    is_ad: Boolean(adFlag),
    source
  };
}

function normalizeBffProductCandidate(candidate, { rank, source }) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const title = normalizeString(getFirstValue(candidate, [
    "productNameOrg",
    "productName",
    "productTitle",
    "product_name",
    "mallProductName",
    "title",
    "name"
  ]));
  const discountedPrice = parseDigits(getFirstValue(candidate, [
    "discountedSalePrice",
    "discountedKRWSalePrice",
    "couponDiscountedPrice",
    "discountedPrice",
    "mobileLowPrice",
    "lowPrice",
    "price"
  ]));
  const salePrice = parseDigits(getFirstValue(candidate, [
    "salePrice",
    "saleKRWPrice",
    "originPrice",
    "originalPrice",
    "hprice"
  ]));
  const price = discountedPrice ?? salePrice;

  if (!title || price === null) {
    return null;
  }

  const highPrice = salePrice !== null && salePrice > price ? salePrice : parseDigits(candidate.highPrice);
  const imageUrl = normalizeUrlCandidate(candidate.images)
    || normalizeUrlCandidate(getFirstValue(candidate, ["imageUrl", "imgUrl", "image", "thumbnail", "thumbnailUrl", "imgSrc"]));
  const url = normalizeUrlCandidate(getFirstValue(candidate, ["productUrl", "mallProductUrl", "productClickUrl", "crUrl", "adcrUrl", "url", "link"]));
  const cardType = normalizeString(candidate.cardType);
  const sourceType = normalizeString(candidate.sourceType);
  const adFlag = getFirstValue(candidate, ["isAd", "ad", "adId", "adcrUrl", "adProduct"]);
  const isAd = Boolean(adFlag)
    || /ad/i.test(cardType || "")
    || /ad/i.test(sourceType || "");

  return compactProduct({
    rank,
    product_id: normalizeString(getFirstValue(candidate, ["nvMid", "productId", "id", "catalogId", "channelProductId"])),
    title,
    price,
    high_price: highPrice,
    price_text: formatWon(price),
    mall_name: normalizeString(getFirstValue(candidate, ["mallName", "mallNm", "mall_name", "storeName", "sellerName", "channelName", "adMallName"])),
    url,
    image_url: imageUrl,
    category: collectCategory(candidate),
    review_count: parseDigits(getFirstValue(candidate, ["totalReviewCount", "reviewCount", "reviewCnt", "review_count"])),
    purchase_count: parseDigits(getFirstValue(candidate, ["purchaseCount", "purchaseCnt", "purchase_count"])),
    score: parseFloatNumber(getFirstValue(candidate, ["averageReviewScore", "scoreInfo", "score", "rating", "reviewScore"])),
    is_ad: isAd,
    is_brand_store: candidate.isBrandStore === true ? true : undefined,
    product_type: normalizeString(candidate.productType),
    source
  });
}

function compactProduct(product) {
  return Object.fromEntries(
    Object.entries(product).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (Array.isArray(value) && value.length === 0) {
        return false;
      }
      return true;
    })
  );
}

function productDedupKey(product) {
  if (product.product_id) {
    return `id:${product.product_id}`;
  }
  return [product.title, product.price, product.mall_name || "", product.url || ""].join("|").toLowerCase();
}

function compareWithMissingLast(left, right, direction = "asc") {
  const leftMissing = left === undefined || left === null;
  const rightMissing = right === undefined || right === null;
  if (leftMissing && rightMissing) {
    return 0;
  }
  if (leftMissing) {
    return 1;
  }
  if (rightMissing) {
    return -1;
  }
  return direction === "desc" ? right - left : left - right;
}

function applyLocalBffSort(items, sort) {
  if (!LOCALLY_SORTABLE_BFF_SORTS.has(sort)) {
    return items;
  }

  return [...items].sort((left, right) => {
    if (sort === "price_asc") {
      return compareWithMissingLast(left.price, right.price, "asc")
        || compareWithMissingLast(left.review_count, right.review_count, "desc")
        || left.rank - right.rank;
    }
    if (sort === "price_dsc") {
      return compareWithMissingLast(left.price, right.price, "desc")
        || compareWithMissingLast(left.review_count, right.review_count, "desc")
        || left.rank - right.rank;
    }
    if (sort === "review") {
      return compareWithMissingLast(left.review_count, right.review_count, "desc")
        || compareWithMissingLast(left.purchase_count, right.purchase_count, "desc")
        || compareWithMissingLast(left.score, right.score, "desc")
        || compareWithMissingLast(left.price, right.price, "asc")
        || left.rank - right.rank;
    }
    return left.rank - right.rank;
  });
}

function getBffPageNumber(page) {
  return parseDigits(page?.page ?? page?.pageNo ?? page?.pageNumber ?? page?.pagingIndex);
}

function selectBffPages(payload, requestedPage) {
  const pages = Array.isArray(payload?.data) ? payload.data : [];
  if (pages.length === 0) {
    return [];
  }

  const numberedPages = pages.filter((page) => getBffPageNumber(page) === requestedPage);
  if (numberedPages.length > 0) {
    return numberedPages;
  }

  if (requestedPage === 1) {
    return pages.filter((page) => getBffPageNumber(page) === null).length > 0
      ? pages.filter((page) => getBffPageNumber(page) === null)
      : pages.slice(0, 1);
  }

  return [];
}

function getBffSortApplied(sort) {
  if (sort === "rel") {
    return "upstream";
  }
  if (LOCALLY_SORTABLE_BFF_SORTS.has(sort)) {
    return "local";
  }
  return "unsupported";
}

function extractScriptBodies(html) {
  return [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeHtmlEntities(match[1]).trim())
    .filter(Boolean);
}

function parseJsonScriptPayloads(html) {
  const payloads = [];
  const nextDataMatch = String(html).match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      payloads.push(JSON.parse(decodeHtmlEntities(nextDataMatch[1])));
    } catch {
      // Continue with other script candidates.
    }
  }

  for (const body of extractScriptBodies(html)) {
    if (!/(product|mall|lowPrice|price|shopping)/i.test(body)) {
      continue;
    }

    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        payloads.push(JSON.parse(trimmed));
        continue;
      } catch {
        // Try balanced object extraction below.
      }
    }

    const extracted = extractFirstBalancedJson(trimmed);
    if (extracted) {
      try {
        payloads.push(JSON.parse(extracted));
      } catch {
        // Ignore non-JSON scripts.
      }
    }
  }

  return payloads;
}

function extractFirstBalancedJson(text) {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let quote = null;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function collectProductsFromJson(root, limit) {
  const items = [];
  const seen = new Set();

  function addCandidate(candidate) {
    const normalized = normalizeProductCandidate(candidate, {
      rank: items.length + 1,
      source: "embedded-json"
    });
    if (!normalized) {
      return;
    }
    const compacted = compactProduct(normalized);
    const key = productDedupKey(compacted);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push(compacted);
  }

  function visit(value, depth = 0) {
    if (items.length >= limit || depth > 18 || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry, depth + 1);
        if (items.length >= limit) {
          return;
        }
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    addCandidate(value);
    for (const key of ["item", "product", "catalog", "adProduct"]) {
      if (value[key] && typeof value[key] === "object") {
        addCandidate(value[key]);
      }
    }

    for (const child of Object.values(value)) {
      visit(child, depth + 1);
      if (items.length >= limit) {
        return;
      }
    }
  }

  visit(root);
  return items.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

function parseAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeHtmlEntities(match[1]) : null;
}

function extractMallName(fragment) {
  const mallMatch = fragment.match(/<[^>]*(?:class|data-testid)=["'][^"']*(?:mall|store|seller)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  return mallMatch ? normalizeString(mallMatch[1]) : null;
}

function extractImageUrl(fragment) {
  const imageMatch = fragment.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
  return imageMatch ? normalizeUrl(imageMatch[1]) : null;
}

function parseHtmlCards(html, limit) {
  const items = [];
  const seen = new Set();
  const text = String(html);
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(text)) && items.length < limit) {
    const href = parseAttribute(match[1], "href");
    const url = normalizeUrl(href);
    if (!url || !/(?:shopping\.naver\.com|smartstore\.naver\.com|brand\.naver\.com|naver\.com\/)/i.test(url)) {
      continue;
    }

    const title = normalizeString(match[2]);
    if (!title || title.length < 2) {
      continue;
    }

    const fragment = text.slice(match.index, Math.min(text.length, match.index + 1800));
    const priceMatch = fragment.match(/([0-9][0-9,\.]{2,})\s*원/);
    const price = priceMatch ? parseDigits(priceMatch[1]) : null;
    if (price === null) {
      continue;
    }

    const product = compactProduct({
      rank: items.length + 1,
      title,
      price,
      price_text: formatWon(price),
      mall_name: extractMallName(fragment),
      url,
      image_url: extractImageUrl(fragment),
      is_ad: /adProduct|광고|ad_/i.test(fragment),
      source: "html-card"
    });
    const key = productDedupKey(product);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(product);
  }

  return items;
}


function normalizeOpenApiSort(sort) {
  if (sort === "date") {
    return "date";
  }
  if (sort === "price_asc") {
    return "asc";
  }
  if (sort === "price_dsc") {
    return "dsc";
  }
  return "sim";
}

function getOpenApiSortApplied(sort) {
  if (sort === "review") {
    return "unsupported";
  }
  return "upstream";
}

function buildNaverShoppingOpenApiUrl({ query, limit = DEFAULT_LIMIT, page = 1, sort = "rel" } = {}) {
  const url = new URL(NAVER_SHOPPING_OPEN_API_URL);
  const start = ((Math.max(page, 1) - 1) * limit) + 1;
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(limit));
  url.searchParams.set("start", String(Math.min(start, 1000)));
  url.searchParams.set("sort", normalizeOpenApiSort(sort));
  return url;
}

function normalizeNaverShoppingOpenApiPayload(payload, { query = null, limit = DEFAULT_LIMIT, sort = "rel" } = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const normalized = [];
  const seen = new Set();
  const normalizedSort = ALLOWED_SORTS.has(sort) ? sort : "rel";
  const upstreamSort = normalizeOpenApiSort(normalizedSort);

  for (const item of items) {
    if (normalized.length >= limit) {
      break;
    }

    const title = normalizeString(item.title);
    const price = parseDigits(item.lprice ?? item.lowPrice ?? item.price);
    if (!title || price === null) {
      continue;
    }

    const category = [];
    for (const key of ["category1", "category2", "category3", "category4"]) {
      const value = normalizeString(item[key]);
      if (value && !category.includes(value)) {
        category.push(value);
      }
    }

    const product = compactProduct({
      rank: normalized.length + 1,
      product_id: normalizeString(item.productId),
      title,
      price,
      high_price: parseDigits(item.hprice),
      price_text: formatWon(price),
      mall_name: normalizeString(item.mallName),
      url: normalizeUrl(item.link),
      image_url: normalizeUrl(item.image),
      brand: normalizeString(item.brand),
      maker: normalizeString(item.maker),
      product_type: normalizeString(item.productType),
      category,
      is_ad: false,
      source: "naver-openapi"
    });
    const key = productDedupKey(product);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(product);
  }

  return {
    items: normalized,
    meta: {
      query,
      extraction: "naver-openapi",
      item_count: normalized.length,
      total: parseDigits(payload?.total) ?? 0,
      start: parseDigits(payload?.start) ?? null,
      display: parseDigits(payload?.display) ?? null,
      last_build_date: normalizeString(payload?.lastBuildDate),
      sort: normalizedSort,
      upstream_sort: upstreamSort,
      sort_applied: getOpenApiSortApplied(normalizedSort)
    }
  };
}

async function fetchNaverShoppingOpenApiSearch({
  query,
  limit,
  page,
  sort,
  clientId,
  clientSecret,
  fetchImpl = global.fetch
} = {}) {
  const url = buildNaverShoppingOpenApiUrl({ query, limit, page, sort });
  const response = await fetchImpl(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      accept: "application/json"
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();

  if (!response.ok) {
    const error = new Error(`Naver Search API responded with ${response.status}.`);
    error.code = "upstream_error";
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.upstreamStatusCode = response.status;
    error.upstreamBodySnippet = body.slice(0, 200);
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (cause) {
    const error = new Error("Naver Search API returned invalid JSON.");
    error.code = "invalid_upstream_response";
    error.statusCode = 502;
    error.cause = cause;
    throw error;
  }

  const parsed = normalizeNaverShoppingOpenApiPayload(payload, { query, limit, sort });
  return {
    ...parsed,
    upstream: {
      url: url.toString(),
      status_code: response.status,
      content_type: response.headers.get("content-type") || null,
      provider: "naver-search-api"
    }
  };
}

function parseNaverShoppingSearchHtml(html, { query = null, limit = DEFAULT_LIMIT } = {}) {
  const normalizedLimit = clamp(parseInteger(limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const payloads = parseJsonScriptPayloads(html);

  for (const payload of payloads) {
    const items = collectProductsFromJson(payload, normalizedLimit);
    if (items.length > 0) {
      return {
        items,
        meta: {
          query,
          extraction: "embedded-json",
          item_count: items.length
        }
      };
    }
  }

  const items = parseHtmlCards(html, normalizedLimit);
  return {
    items,
    meta: {
      query,
      extraction: items.length > 0 ? "html-card" : "none",
      item_count: items.length
    }
  };
}

function parseNaverShoppingSearchPayload(payload, { query = null, limit = DEFAULT_LIMIT, page = 1, sort = "rel" } = {}) {
  const normalizedLimit = clamp(parseInteger(limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const requestedPage = Math.max(parseInteger(page, 1), 1);
  const normalizedSort = ALLOWED_SORTS.has(sort) ? sort : "rel";
  const items = [];
  const seen = new Set();

  function addCandidate(candidate) {
    const product = normalizeBffProductCandidate(candidate, {
      rank: items.length + 1,
      source: "bff-json"
    });
    if (!product) {
      return;
    }
    const key = productDedupKey(product);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push(product);
  }

  const pages = selectBffPages(payload, requestedPage);
  for (const page of pages) {
    const slots = Array.isArray(page?.slots) ? page.slots : [];
    for (const slot of slots) {
      addCandidate(slot?.data);
    }
  }

  const sortedItems = applyLocalBffSort(items, normalizedSort).slice(0, normalizedLimit);
  const availablePages = (Array.isArray(payload?.data) ? payload.data : [])
    .map(getBffPageNumber)
    .filter((value) => value !== null);

  return {
    items: sortedItems.map((item, index) => ({ ...item, rank: index + 1 })),
    meta: {
      query,
      extraction: sortedItems.length > 0 ? "bff-json" : "none",
      item_count: sortedItems.length,
      page: requestedPage,
      page_size: sortedItems.length,
      available_pages: availablePages,
      sort: normalizedSort,
      sort_applied: getBffSortApplied(normalizedSort)
    }
  };
}

function normalizeNaverShoppingSearchQuery(query) {
  const q = trimOrNull(query.q ?? query.query ?? query.keyword);
  if (!q) {
    throw new Error("Provide q/query.");
  }
  if ([...q].length < 2) {
    throw new Error("q/query must be at least 2 characters.");
  }

  const rawLimit = parseInteger(query.limit ?? query.size ?? query.pagingSize, DEFAULT_LIMIT);
  const rawPage = parseInteger(query.page ?? query.pagingIndex, 1);
  const requestedSort = trimOrNull(query.sort) || "rel";
  const sort = ALLOWED_SORTS.has(requestedSort) ? requestedSort : "rel";

  return {
    query: q,
    limit: clamp(rawLimit, 1, MAX_LIMIT),
    page: Math.max(rawPage, 1),
    sort
  };
}

function buildNaverShoppingSearchUrl({ query, limit = DEFAULT_LIMIT, page = 1, sort = "rel" } = {}) {
  void limit;
  void sort;
  const url = new URL(NAVER_SHOPPING_SEARCH_PATH, NAVER_SHOPPING_BFF_BASE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("source", "shp_gui");
  const normalizedPage = Math.max(parseInteger(page, 1), 1);
  if (normalizedPage > 1) {
    url.searchParams.set("page", String(normalizedPage));
  }
  return url;
}

async function fetchNaverShoppingSearch({ query, limit, page, sort, clientId = null, clientSecret = null, fetchImpl = global.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime.");
  }

  if (clientId && clientSecret) {
    return fetchNaverShoppingOpenApiSearch({ query, limit, page, sort, clientId, clientSecret, fetchImpl });
  }

  const url = buildNaverShoppingSearchUrl({ query, limit, page, sort });
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      referer: `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();

  if (!response.ok) {
    const error = new Error(`Naver Shopping upstream responded with ${response.status}.`);
    error.code = "upstream_error";
    error.statusCode = 502;
    error.upstreamStatusCode = response.status;
    error.upstreamBodySnippet = body.slice(0, 200);
    throw error;
  }

  let parsed;
  try {
    parsed = parseNaverShoppingSearchPayload(JSON.parse(body), { query, limit, page, sort });
  } catch {
    parsed = parseNaverShoppingSearchHtml(body, { query, limit });
  }

  return {
    ...parsed,
    upstream: {
      url: url.toString(),
      status_code: response.status,
      content_type: response.headers.get("content-type") || null,
      provider: "naver-shopping-bff"
    }
  };
}

module.exports = {
  buildNaverShoppingOpenApiUrl,
  buildNaverShoppingSearchUrl,
  fetchNaverShoppingOpenApiSearch,
  fetchNaverShoppingSearch,
  normalizeNaverShoppingOpenApiPayload,
  normalizeNaverShoppingSearchQuery,
  parseNaverShoppingSearchPayload,
  parseNaverShoppingSearchHtml
};
