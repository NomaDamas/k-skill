const SEARCH_ITEM_PATTERN = /<li\s+class="search_item\s+base"([\s\S]*?)<\/li>/giu;
const TAG_PATTERN = /<[^>]+>/g;
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu;
const ANCHOR_STATION_PATTERN = /(역|기차역|전철역|지하철역|환승역)$/u;
const ANCHOR_CATEGORY_PATTERN =
  /(기차역|전철역|지하철역|역사|광장|공원|거리|테마거리|관광명소|랜드마크|먹자골목|교차로|주차장|정류장|환승센터)/u;
const GAS_STATION_PATTERN = /(주유소|충전소|셀프주유소|가스충전소)/u;

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const BESSEL_A = 6377397.155;
const BESSEL_F = 1 / 299.1528128;
const KATEC_LAT0 = degreesToRadians(38.0);
const KATEC_LON0 = degreesToRadians(128.0);
const KATEC_FALSE_EASTING = 400000.0;
const KATEC_FALSE_NORTHING = 600000.0;
const KATEC_SCALE = 0.9999;
const WGS84_TO_BESSEL = [146.43, -507.89, -681.46];

const BRAND_NAMES = {
  ETC: "자가상표",
  E1G: "E1",
  GSC: "GS칼텍스",
  HDO: "현대오일뱅크",
  NHO: "농협알뜰",
  RTE: "자영알뜰",
  RTX: "고속도로알뜰",
  SKE: "SK에너지",
  SKG: "SK가스",
  SOL: "S-OIL"
};

const PRODUCT_CODE_TO_KEY = {
  B027: "gasoline",
  B034: "premiumGasoline",
  C004: "kerosene",
  D047: "diesel",
  K015: "lpg"
};

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(TAG_PATTERN, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_WORD_PATTERN, "");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractAttribute(fragment, name) {
  const match = fragment.match(new RegExp(`${name}="([^"]*)"`, "iu"));
  return match ? decodeHtml(match[1]).trim() : "";
}

function extractInnerText(fragment, className) {
  const match = fragment.match(
    new RegExp(`<[^>]+class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "iu"),
  );

  return match ? stripTags(match[1]) : "";
}

function parseSearchResultsHtml(html) {
  const items = [];
  let match;

  while ((match = SEARCH_ITEM_PATTERN.exec(String(html || ""))) !== null) {
    const fragment = match[1];
    const id = extractAttribute(fragment, "data-id");
    const name = extractAttribute(fragment, "data-title") || extractInnerText(fragment, "tit_g");

    if (!id || !name) {
      continue;
    }

    const addressMatches = [...fragment.matchAll(/<span class="txt_g">([\s\S]*?)<\/span>/giu)]
      .map((entry) => stripTags(entry[1]))
      .filter(Boolean);

    items.push({
      id,
      name,
      category: extractInnerText(fragment, "txt_ginfo"),
      address: addressMatches.at(-1) || "",
      phone: extractAttribute(fragment, "data-phone") || extractInnerText(fragment, "num_phone") || null
    });
  }

  return items;
}

function scoreAnchorCandidate(query, item) {
  const normalizedQuery = normalizeText(query);
  const normalizedName = normalizeText(item.name);
  const normalizedAddress = normalizeText(item.address);
  const normalizedCategory = normalizeText(item.category);
  let score = 0;

  if (!normalizedQuery) {
    return score;
  }

  if (normalizedName === normalizedQuery) {
    score += 1000;
  }

  if (normalizedName === `${normalizedQuery}역` || normalizedName === normalizedQuery.replace(/역$/u, "")) {
    score += 950;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    score += 800;
  }

  if (normalizedName.includes(normalizedQuery)) {
    score += 600;
  }

  if (normalizedAddress.includes(normalizedQuery)) {
    score += 120;
  }

  if (ANCHOR_STATION_PATTERN.test(item.name) || ANCHOR_CATEGORY_PATTERN.test(item.category)) {
    score += 250;
  }

  if (GAS_STATION_PATTERN.test(`${item.name} ${item.category}`)) {
    score -= 200;
  }

  if (!/^\d+$/.test(String(item.id || ""))) {
    score -= 500;
  }

  if (normalizedCategory.includes("기차역") || normalizedCategory.includes("전철역")) {
    score += 80;
  }

  return score;
}

function rankAnchorCandidates(query, items) {
  return [...(items || [])].sort((left, right) => {
    const scoreDelta = scoreAnchorCandidate(query, right) - scoreAnchorCandidate(query, left);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.name.localeCompare(right.name, "ko");
  });
}

function selectAnchorCandidate(query, items) {
  const ranked = rankAnchorCandidates(query, items);

  if (ranked.length === 0) {
    throw new Error("No Kakao Map place candidate matched that location query.");
  }

  return ranked[0];
}

function normalizeAnchorPanel(panel, searchItem = {}) {
  const summary = panel.summary || {};

  return {
    id: String(summary.confirm_id || searchItem.id || ""),
    name: summary.name || searchItem.name || "",
    category: summary.category?.name3 || summary.category?.name2 || searchItem.category || "",
    address: summary.address?.disp || searchItem.address || "",
    phone: summary.phone_numbers?.[0]?.tel || searchItem.phone || null,
    latitude: toNumber(summary.point?.lat),
    longitude: toNumber(summary.point?.lon),
    sourceUrl: summary.confirm_id ? `https://place.map.kakao.com/${summary.confirm_id}` : null
  };
}

function meridionalArc(phi, semiMajorAxis, eccentricitySquared) {
  const e2 = eccentricitySquared;

  return semiMajorAxis * (
    (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
    ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
    ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
    ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi)
  );
}

function wgs84ToBessel(lat, lon) {
  const [dx, dy, dz] = WGS84_TO_BESSEL;
  const sourceEccentricitySquared = 2 * WGS84_F - WGS84_F ** 2;
  const targetEccentricitySquared = 2 * BESSEL_F - BESSEL_F ** 2;

  const latitudeRadians = degreesToRadians(lat);
  const longitudeRadians = degreesToRadians(lon);
  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const primeVerticalRadius = WGS84_A / Math.sqrt(1 - sourceEccentricitySquared * sinLatitude ** 2);

  const x = primeVerticalRadius * cosLatitude * Math.cos(longitudeRadians) + dx;
  const y = primeVerticalRadius * cosLatitude * Math.sin(longitudeRadians) + dy;
  const z = primeVerticalRadius * (1 - sourceEccentricitySquared) * sinLatitude + dz;

  const besselLongitude = Math.atan2(y, x);
  const horizontal = Math.sqrt(x ** 2 + y ** 2);
  let besselLatitude = Math.atan2(z, horizontal * (1 - targetEccentricitySquared));

  for (let index = 0; index < 8; index += 1) {
    const sinBesselLatitude = Math.sin(besselLatitude);
    const besselRadius = BESSEL_A / Math.sqrt(1 - targetEccentricitySquared * sinBesselLatitude ** 2);
    const nextLatitude = Math.atan2(z + targetEccentricitySquared * besselRadius * sinBesselLatitude, horizontal);

    if (Math.abs(nextLatitude - besselLatitude) < 1e-14) {
      besselLatitude = nextLatitude;
      break;
    }

    besselLatitude = nextLatitude;
  }

  return {
    latitudeRadians: besselLatitude,
    longitudeRadians: besselLongitude
  };
}

function wgs84ToKatec(latitude, longitude) {
  const { latitudeRadians, longitudeRadians } = wgs84ToBessel(latitude, longitude);
  const besselEccentricitySquared = 2 * BESSEL_F - BESSEL_F ** 2;
  const secondEccentricitySquared = besselEccentricitySquared / (1 - besselEccentricitySquared);

  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const tanLatitude = Math.tan(latitudeRadians);

  const primeVerticalRadius = BESSEL_A / Math.sqrt(1 - besselEccentricitySquared * sinLatitude ** 2);
  const tanSquared = tanLatitude ** 2;
  const curvature = secondEccentricitySquared * cosLatitude ** 2;
  const A = (longitudeRadians - KATEC_LON0) * cosLatitude;

  const meridional = meridionalArc(latitudeRadians, BESSEL_A, besselEccentricitySquared);
  const meridionalOrigin = meridionalArc(KATEC_LAT0, BESSEL_A, besselEccentricitySquared);

  const x =
    KATEC_FALSE_EASTING +
    KATEC_SCALE *
      primeVerticalRadius *
      (A + ((1 - tanSquared + curvature) * A ** 3) / 6 +
        ((5 - 18 * tanSquared + tanSquared ** 2 + 72 * curvature - 58 * secondEccentricitySquared) * A ** 5) /
          120);

  const y =
    KATEC_FALSE_NORTHING +
    KATEC_SCALE *
      (meridional - meridionalOrigin +
        primeVerticalRadius *
          tanLatitude *
          (A ** 2 / 2 +
            ((5 - tanSquared + 9 * curvature + 4 * curvature ** 2) * A ** 4) / 24 +
            ((61 - 58 * tanSquared + tanSquared ** 2 + 600 * curvature - 330 * secondEccentricitySquared) * A ** 6) /
              720));

  return {
    x,
    y
  };
}

function formatCoordinate(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error("Coordinate values must be finite numbers.");
  }

  return numericValue.toFixed(4);
}

function buildAroundSearchParams({ x, y, radius, productCode, sort = 1 } = {}) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
    throw new Error("x and y are required KATEC coordinates.");
  }

  const normalizedRadius = Number(radius ?? 1000);
  if (!Number.isFinite(normalizedRadius) || normalizedRadius <= 0 || normalizedRadius > 5000) {
    throw new Error("radius must be a positive number up to 5000 meters.");
  }

  return {
    out: "json",
    x: formatCoordinate(x),
    y: formatCoordinate(y),
    radius: String(Math.round(normalizedRadius)),
    prodcd: productCode || "B027",
    sort: String(sort)
  };
}

function extractOilEntries(payload) {
  const oil = payload?.RESULT?.OIL;

  if (Array.isArray(oil)) {
    return oil;
  }

  if (oil && typeof oil === "object") {
    return [oil];
  }

  return [];
}

function normalizeAroundItem(item) {
  return {
    id: String(item.UNI_ID || item.uni_id || ""),
    brandCode: String(item.POLL_DIV_CO || item.POLL_DIV_CD || item.poll_div_cd || ""),
    brandName:
      BRAND_NAMES[String(item.POLL_DIV_CO || item.POLL_DIV_CD || item.poll_div_cd || "")] ||
      String(item.POLL_DIV_CO || item.POLL_DIV_CD || item.poll_div_cd || ""),
    name: item.OS_NM || item.os_nm || "",
    price: toNumber(item.PRICE ?? item.price),
    distanceMeters: toNumber(item.DISTANCE ?? item.distance),
    katecX: toNumber(item.GIS_X_COOR ?? item.gis_x_coor),
    katecY: toNumber(item.GIS_Y_COOR ?? item.gis_y_coor)
  };
}

function parseAroundResponse(payload) {
  return extractOilEntries(payload)
    .map((item) => normalizeAroundItem(item))
    .filter((item) => item.id && Number.isFinite(item.price));
}

function normalizeProductPrices(priceEntries) {
  const priceList = Array.isArray(priceEntries) ? priceEntries : priceEntries ? [priceEntries] : [];
  const prices = {};
  const raw = {};

  for (const entry of priceList) {
    const productCode = String(entry.PRODCD || entry.prodcd || "");
    const key = PRODUCT_CODE_TO_KEY[productCode] || productCode;
    const price = toNumber(entry.PRICE ?? entry.price);

    raw[productCode] = {
      price,
      tradeDate: String(entry.TRADE_DT || entry.trade_dt || "") || null,
      tradeTime: String(entry.TRADE_TM || entry.trade_tm || "") || null
    };

    if (key) {
      prices[key] = price;
    }
  }

  return {
    prices,
    raw
  };
}

function normalizeDetailItem(payload) {
  const [item] = extractOilEntries(payload);

  if (!item) {
    throw new Error("Opinet detail payload did not include an OIL record.");
  }

  const priceSummary = normalizeProductPrices(item.OIL_PRICE || item.oil_price);
  const brandCode = String(item.POLL_DIV_CO || item.POLL_DIV_CD || item.poll_div_cd || "");

  return {
    id: String(item.UNI_ID || item.uni_id || ""),
    brandCode,
    brandName: BRAND_NAMES[brandCode] || brandCode,
    name: item.OS_NM || item.os_nm || "",
    lotAddress: item.VAN_ADR || item.van_adr || null,
    roadAddress: item.NEW_ADR || item.new_adr || null,
    phone: item.TEL || item.tel || null,
    sigunCode: item.SIGUNCD || item.siguncd || null,
    lpgYn: item.LPG_YN || item.lpg_yn || null,
    isSelf: String(item.SELF_YN || item.self_yn || "N") === "Y",
    hasMaintenance: String(item.MAINT_YN || item.maint_yn || "N") === "Y",
    hasCarWash: String(item.CAR_WASH_YN || item.car_wash_yn || "N") === "Y",
    hasConvenienceStore: String(item.CVS_YN || item.cvs_yn || "N") === "Y",
    kpetroCertified: String(item.KPETRO_YN || item.kpetro_yn || "N") === "Y",
    katecX: toNumber(item.GIS_X_COOR ?? item.gis_x_coor),
    katecY: toNumber(item.GIS_Y_COOR ?? item.gis_y_coor),
    prices: priceSummary.prices,
    rawPrices: priceSummary.raw
  };
}

function sortStationsByPriceAndDistance(items) {
  return [...items].sort((left, right) => {
    if ((left.price ?? Number.POSITIVE_INFINITY) !== (right.price ?? Number.POSITIVE_INFINITY)) {
      return (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY);
    }

    if ((left.distanceMeters ?? Number.POSITIVE_INFINITY) !== (right.distanceMeters ?? Number.POSITIVE_INFINITY)) {
      return (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY);
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "ko");
  });
}

module.exports = {
  BRAND_NAMES,
  PRODUCT_CODE_TO_KEY,
  buildAroundSearchParams,
  normalizeAnchorPanel,
  normalizeAroundItem,
  normalizeDetailItem,
  parseAroundResponse,
  parseSearchResultsHtml,
  rankAnchorCandidates,
  selectAnchorCandidate,
  sortStationsByPriceAndDistance,
  wgs84ToKatec
};
