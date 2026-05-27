const SEARCH_ITEM_PATTERN = /<li\s+class="search_item\s+base"([\s\S]*?)<\/li>/giu;
const TAG_PATTERN = /<[^>]+>/g;
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu;

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
  let score = 0;

  if (!normalizedQuery) {
    return score;
  }

  if (normalizedName === normalizedQuery) {
    score += 1000;
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

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!isValidCoordinatePair(latitude, longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidCoordinatePair(latitude, longitude) {
  return isValidLatitude(latitude) && isValidLongitude(longitude);
}

function toBooleanYesNo(value) {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === "Y") {
    return true;
  }

  if (normalized === "N") {
    return false;
  }

  return null;
}

function buildMapUrl(name, latitude, longitude) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${latitude},${longitude}`;
}

function parseEgenTimestamp(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`;
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

function getEmergencyRoomRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.list)) {
    return payload.list;
  }

  throw new Error("Unexpected E-Gen emergency room payload shape.");
}

function normalizeEmergencyRoomRows(payload, origin, options = {}) {
  const latitude = Number(origin?.latitude);
  const longitude = Number(origin?.longitude);
  const radius = Number.isFinite(Number(options.radius ?? options.maxDistanceKm)) ? Number(options.radius ?? options.maxDistanceKm) : null;

  if (!isValidCoordinatePair(latitude, longitude)) {
    throw new Error("normalizeEmergencyRoomRows requires valid origin coordinates.");
  }

  return getEmergencyRoomRows(payload)
    .map((row) => {
      const itemLatitude = toNumber(row.LAT ?? row.lat);
      const itemLongitude = toNumber(row.LON ?? row.lon);

      if (!isValidCoordinatePair(itemLatitude, itemLongitude)) {
        return null;
      }

      const distanceKm = toNumber(row.DISTANCE2 ?? row.DISTANCE) ?? haversineDistanceMeters(latitude, longitude, itemLatitude, itemLongitude) / 1000;
      const name = String(row.TITLE || row.name || "").trim();

      if (!name) {
        return null;
      }

      return {
        id: String(row.EMOGCODE || row.id || ""),
        name,
        emergencyGrade: row.CATEGORY1 || null,
        hospitalType: row.CATEGORY2 || null,
        address: row.ADDRROAD || row.ADDRLAGE || null,
        phone: row.TEL || null,
        latitude: itemLatitude,
        longitude: itemLongitude,
        distanceKm: Math.round(distanceKm * 1000) / 1000,
        bedStatus: {
          emergencyRoomOperating: toBooleanYesNo(row.EMOGERYN),
          inpatientBedsOperating: toBooleanYesNo(row.EMOGPRYN),
          traumaCenter: toBooleanYesNo(row.EMOGTRYN),
          pediatricSpecialty: toBooleanYesNo(row.CHILD_SPCLTY_AT),
          currentGeneralCareAvailable: toBooleanYesNo(row.OPERATIONYN),
          pediatricNightCare: toBooleanYesNo(row.NIGHTCAREYN),
          holidayOpen: toBooleanYesNo(row.HOLIDAYYN),
          silson24Linked: toBooleanYesNo(row.SILSON24_CHK)
        },
        schedules: {
          monday: row.MONDAY || null,
          tuesday: row.TUESDAY || null,
          wednesday: row.WEDNESDAY || null,
          thursday: row.THURSDAY || null,
          friday: row.FRIDAY || null,
          saturday: row.SATURDAY || null,
          sunday: row.SUNDAY || null,
          holiday: row.HOLIDAY || null,
          note: row.OPN_BIGO || null
        },
        updatedAt: parseEgenTimestamp(row.EMOGUPDT),
        sourceUrl: "https://www.e-gen.or.kr/egen/search_emergency_room.do",
        mapUrl: buildMapUrl(name, itemLatitude, itemLongitude)
      };
    })
    .filter(Boolean)
    .filter((item) => radius === null || item.distanceKm <= radius)
    .sort((left, right) => left.distanceKm - right.distanceKm || left.name.localeCompare(right.name, "ko"));
}

module.exports = {
  buildMapUrl,
  isValidCoordinatePair,
  isValidLatitude,
  isValidLongitude,
  normalizeAnchorPanel,
  normalizeEmergencyRoomRows,
  parseCoordinateQuery,
  parseEgenTimestamp,
  parseSearchResultsHtml,
  rankAnchorCandidates
};
