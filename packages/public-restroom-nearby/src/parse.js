const { TextDecoder } = require("node:util");

const SEARCH_ITEM_PATTERN = /<li\s+class="search_item\s+base"([\s\S]*?)<\/li>/giu;
const TAG_PATTERN = /<[^>]+>/g;
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu;

const REGION_ENTRIES = [
  ["서울특별시", "6110000_ALL", ["서울특별시", "서울"]],
  ["부산광역시", "6260000_ALL", ["부산광역시", "부산"]],
  ["대구광역시", "6270000_ALL", ["대구광역시", "대구"]],
  ["인천광역시", "6280000_ALL", ["인천광역시", "인천"]],
  ["광주광역시", "6290000_ALL", ["광주광역시", "광주"]],
  ["대전광역시", "6300000_ALL", ["대전광역시", "대전"]],
  ["울산광역시", "6310000_ALL", ["울산광역시", "울산"]],
  ["세종특별자치시", "5690000_ALL", ["세종특별자치시", "세종"]],
  ["경기도", "6410000_ALL", ["경기도", "경기"]],
  ["강원특별자치도", "6530000_ALL", ["강원특별자치도", "강원도", "강원"]],
  ["충청북도", "6430000_ALL", ["충청북도", "충북"]],
  ["충청남도", "6440000_ALL", ["충청남도", "충남"]],
  ["전북특별자치도", "6540000_ALL", ["전북특별자치도", "전라북도", "전북"]],
  ["전라남도", "6460000_ALL", ["전라남도", "전남"]],
  ["경상북도", "6470000_ALL", ["경상북도", "경북"]],
  ["경상남도", "6480000_ALL", ["경상남도", "경남"]],
  ["제주특별자치도", "6500000_ALL", ["제주특별자치도", "제주도", "제주"]],
];

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
      address: addressMatches.at(-1) || ""
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
    score += 100;
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

function inferRegion(value) {
  const normalized = normalizeText(value);

  for (const [name, orgCode, aliases] of REGION_ENTRIES) {
    for (const alias of aliases) {
      if (normalized.startsWith(normalizeText(alias))) {
        return { name, orgCode };
      }
    }
  }

  return null;
}

function buildDatasetDownloadUrl(options = {}) {
  const url = new URL("https://file.localdata.go.kr/file/download/public_restroom_info/info");

  if (options.orgCode) {
    url.searchParams.set("orgCode", options.orgCode);
  }

  return url.toString();
}

function decodeDatasetBuffer(buffer) {
  const asUtf8 = Buffer.from(buffer).toString("utf8");

  if (asUtf8.includes("개방자치단체코드") && asUtf8.includes("화장실명")) {
    return asUtf8;
  }

  return new TextDecoder("euc-kr").decode(buffer);
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  const text = String(csvText || "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        value += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (character === "\n") {
      row.push(value.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  if (value || row.length > 0) {
    row.push(value.replace(/\r$/u, ""));
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows.filter((entry) => entry.some((cell) => cell !== ""));

  if (!headerRow || headerRow.length === 0) {
    return [];
  }

  return dataRows.map((cells) => {
    const record = {};

    for (let index = 0; index < headerRow.length; index += 1) {
      record[headerRow[index]] = cells[index] ?? "";
    }

    return record;
  });
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

function extractDistrict(address) {
  const match = String(address || "")
    .trim()
    .match(/^(?:\S+)\s+(\S+(?:구|군|시))/u);

  return match ? match[1] : null;
}

function normalizePublicRestroomRows(csvText, origin, options = {}) {
  const latitude = Number(origin?.latitude);
  const longitude = Number(origin?.longitude);
  const limit = options.limit ?? null;
  const maxDistanceMeters = Number.isFinite(Number(options.maxDistanceMeters))
    ? Number(options.maxDistanceMeters)
    : null;
  const preferredDistrict = String(options.preferredDistrict || "").trim() || null;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("normalizePublicRestroomRows requires finite origin coordinates.");
  }

  const items = parseCsv(csvText)
    .map((row) => {
      const itemLatitude = toNumber(row["WGS84위도"]);
      const itemLongitude = toNumber(row["WGS84경도"]);

      if (!Number.isFinite(itemLatitude) || !Number.isFinite(itemLongitude)) {
        return null;
      }

      const distanceMeters = haversineDistanceMeters(latitude, longitude, itemLatitude, itemLongitude);
      const roadAddress = String(row["소재지도로명주소"] || "").trim();
      const lotAddress = String(row["소재지지번주소"] || "").trim();
      const address = roadAddress || lotAddress;

      return {
        id: String(row["관리번호"] || "").trim(),
        name: String(row["화장실명"] || "").trim(),
        type: String(row["구분명"] || "").trim(),
        address,
        roadAddress: roadAddress || null,
        lotAddress: lotAddress || null,
        latitude: itemLatitude,
        longitude: itemLongitude,
        distanceMeters,
        phone: String(row["전화번호"] || "").trim() || null,
        managementAgency: String(row["관리기관명"] || "").trim() || null,
        openTimeCategory: String(row["개방시간"] || "").trim() || null,
        openTimeDetail: String(row["개방시간상세"] || "").trim() || null,
        hasEmergencyBell: toBooleanYesNo(row["비상벨설치여부"]),
        hasBabyChangingTable: toBooleanYesNo(row["기저귀교환대유무"]),
        hasAccessibleFacility:
          (toNumber(row["남성용-장애인용대변기수"]) || 0) +
            (toNumber(row["남성용-장애인용소변기수"]) || 0) +
            (toNumber(row["여성용-장애인용대변기수"]) || 0) >
          0,
        mapUrl: buildMapUrl(String(row["화장실명"] || "").trim(), itemLatitude, itemLongitude)
      };
    })
    .filter(Boolean)
    .filter((item) => (maxDistanceMeters === null ? true : item.distanceMeters <= maxDistanceMeters))
    .sort((left, right) => {
      if (preferredDistrict) {
        const leftMatchesDistrict = extractDistrict(left.address) === preferredDistrict;
        const rightMatchesDistrict = extractDistrict(right.address) === preferredDistrict;

        if (leftMatchesDistrict !== rightMatchesDistrict) {
          return leftMatchesDistrict ? -1 : 1;
        }
      }

      if (left.distanceMeters !== right.distanceMeters) {
        return left.distanceMeters - right.distanceMeters;
      }

      if (left.type !== right.type) {
        return left.type.localeCompare(right.type, "ko");
      }

      return left.name.localeCompare(right.name, "ko");
    });

  const dedupedItems = [];
  const seen = new Set();

  for (const item of items) {
    const key = [item.name, item.address, item.latitude, item.longitude, item.type].join("::");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedItems.push(item);
  }

  if (limit === null) {
    return dedupedItems;
  }

  return dedupedItems.slice(0, limit);
}

module.exports = {
  buildDatasetDownloadUrl,
  decodeDatasetBuffer,
  extractDistrict,
  inferRegion,
  normalizeAnchorPanel,
  normalizePublicRestroomRows,
  parseCoordinateQuery,
  parseSearchResultsHtml,
  rankAnchorCandidates
};
