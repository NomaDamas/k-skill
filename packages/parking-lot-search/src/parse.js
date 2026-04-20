const SEARCH_ITEM_PATTERN = /<li\s+class="search_item\s+base"([\s\S]*?)<\/li>/giu;
const TAG_PATTERN = /<[^>]+>/g;
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu;
const ANCHOR_STATION_PATTERN = /(역|기차역|전철역|지하철역|환승역)$/u;
const ANCHOR_CATEGORY_PATTERN =
  /(기차역|전철역|지하철역|역사|광장|공원|거리|테마거리|관광명소|랜드마크|먹자골목|교차로|주차장|정류장|환승센터)/u;
const PARKING_PATTERN = /(주차장|공영주차장|민영주차장|주차타워)/u;

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

  if (PARKING_PATTERN.test(`${item.name} ${item.category}`)) {
    score -= 100;
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

function parseCoordinateQuery(locationQuery) {
  const match = String(locationQuery || "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,/ ]\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  return {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanYesNo(value) {
  return String(value || "").trim().toUpperCase() === "Y";
}

function haversineDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusMeters = 6371008.8;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const originLatitude = toRadians(latitudeA);
  const targetLatitude = toRadians(latitudeB);

  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(targetLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function buildMapUrl(name, latitude, longitude) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${latitude},${longitude}`;
}

function getParkingItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const items = payload?.response?.body?.items ?? payload?.body?.items ?? payload?.items ?? [];
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

function isPublicParking(row, publicOnly) {
  if (!publicOnly) {
    return true;
  }

  return String(row.prkplceSe || row["주차장구분"] || "").trim() === "공영";
}

function normalizeParkingLotRows(payload, origin, options = {}) {
  const latitude = Number(origin?.latitude);
  const longitude = Number(origin?.longitude);
  const publicOnly = options.publicOnly !== false;
  const maxDistanceMeters = Number.isFinite(Number(options.radius ?? options.maxDistanceMeters))
    ? Number(options.radius ?? options.maxDistanceMeters)
    : null;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("normalizeParkingLotRows requires finite origin coordinates.");
  }

  const items = getParkingItems(payload)
    .filter((row) => isPublicParking(row, publicOnly))
    .map((row) => {
      const itemLatitude = toNumber(row.latitude ?? row["위도"]);
      const itemLongitude = toNumber(row.longitude ?? row["경도"]);

      if (!Number.isFinite(itemLatitude) || !Number.isFinite(itemLongitude)) {
        return null;
      }

      const name = String(row.prkplceNm ?? row["주차장명"] ?? "").trim();
      const roadAddress = String(row.rdnmadr ?? row["소재지도로명주소"] ?? "").trim();
      const lotAddress = String(row.lnmadr ?? row["소재지지번주소"] ?? "").trim();
      const distanceMeters = haversineDistanceMeters(latitude, longitude, itemLatitude, itemLongitude);

      return {
        id: String(row.prkplceNo ?? row["주차장관리번호"] ?? "").trim(),
        name,
        category: String(row.prkplceSe ?? row["주차장구분"] ?? "").trim() || null,
        type: String(row.prkplceType ?? row["주차장유형"] ?? "").trim() || null,
        address: roadAddress || lotAddress || null,
        roadAddress: roadAddress || null,
        lotAddress: lotAddress || null,
        latitude: itemLatitude,
        longitude: itemLongitude,
        distanceMeters,
        capacity: toNumber(row.prkcmprt ?? row["주차구획수"]),
        grade: String(row.feedingSe ?? row["급지구분"] ?? "").trim() || null,
        alternateDayEnforcement: String(row.enforceSe ?? row["부제시행구분"] ?? "").trim() || null,
        operatingDays: String(row.operDay ?? row["운영요일"] ?? "").trim() || null,
        weekday: {
          open: String(row.weekdayOperOpenHhmm ?? row["평일운영시작시각"] ?? "").trim() || null,
          close: String(row.weekdayOperColseHhmm ?? row["평일운영종료시각"] ?? "").trim() || null
        },
        saturday: {
          open: String(row.satOperOperOpenHhmm ?? row["토요일운영시작시각"] ?? "").trim() || null,
          close: String(row.satOperCloseHhmm ?? row["토요일운영종료시각"] ?? "").trim() || null
        },
        holiday: {
          open: String(row.holidayOperOpenHhmm ?? row["공휴일운영시작시각"] ?? "").trim() || null,
          close: String(row.holidayCloseOpenHhmm ?? row["공휴일운영종료시각"] ?? "").trim() || null
        },
        feeInfo: String(row.parkingchrgeInfo ?? row["요금정보"] ?? "").trim() || null,
        basicTime: toNumber(row.basicTime ?? row["주차기본시간"]),
        basicCharge: toNumber(row.basicCharge ?? row["주차기본요금"]),
        additionalUnitTime: toNumber(row.addUnitTime ?? row["추가단위시간"]),
        additionalUnitCharge: toNumber(row.addUnitCharge ?? row["추가단위요금"]),
        dailyTicketTime: toNumber(row.dayCmmtktAdjTime ?? row["1일주차권요금적용시간"]),
        dailyTicketCharge: toNumber(row.dayCmmtkt ?? row["1일주차권요금"]),
        monthlyTicketCharge: toNumber(row.monthCmmtkt ?? row["월정기권요금"]),
        paymentMethods: String(row.metpay ?? row["결제방법"] ?? "").trim() || null,
        notes: String(row.spcmnt ?? row["특기사항"] ?? "").trim() || null,
        managementAgency: String(row.institutionNm ?? row["관리기관명"] ?? "").trim() || null,
        phone: String(row.phoneNumber ?? row["전화번호"] ?? "").trim() || null,
        hasAccessibleParking: toBooleanYesNo(row.pwdbsPpkZoneYn ?? row["장애인전용주차구역보유여부"]),
        referenceDate: String(row.referenceDate ?? row["데이터기준일자"] ?? "").trim() || null,
        providerCode: String(row.instt_code ?? row["제공기관코드"] ?? "").trim() || null,
        providerName: String(row.instt_nm ?? row["제공기관기관명"] ?? row["제공기관명"] ?? "").trim() || null,
        mapUrl: buildMapUrl(name, itemLatitude, itemLongitude)
      };
    })
    .filter(Boolean)
    .filter((item) => (maxDistanceMeters === null ? true : item.distanceMeters <= maxDistanceMeters))
    .sort((left, right) => {
      if (left.distanceMeters !== right.distanceMeters) {
        return left.distanceMeters - right.distanceMeters;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), "ko");
    });

  const dedupedItems = [];
  const seen = new Set();

  for (const item of items) {
    const key = [item.id, item.name, item.address, item.latitude, item.longitude].join("::");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedItems.push(item);
  }

  return dedupedItems;
}

function extractAddressHint(address) {
  const parts = String(address || "").trim().split(/\s+/u).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0] || null;
}

module.exports = {
  buildMapUrl,
  extractAddressHint,
  getParkingItems,
  haversineDistanceMeters,
  normalizeAnchorPanel,
  normalizeParkingLotRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates,
  toNumber
};
