const BASE_URL = "https://www.bluer.co.kr";
const LOCATION_SUFFIX_PATTERN = /(역|동|구|시|군|읍|면|리)$/u;
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu;
const ZONE_LINK_PATTERN =
  /href="([^"]*\/search\?[^"]*zone1=[^"]*zone2=[^"]*zone2Lat=[^"]*zone2Lng=[^"]*)"/giu;
const COEX_ZONE_ALIASES = ["삼성동/대치동", "삼성동", "대치동", "봉은사", "봉은사역", "삼성역"];
const LOCATION_QUERY_ALIASES = new Map(
  Object.entries({
    코엑스: COEX_ZONE_ALIASES,
    스타필드코엑스: COEX_ZONE_ALIASES,
    coex: COEX_ZONE_ALIASES,
    starfieldcoex: COEX_ZONE_ALIASES
  }).map(([query, aliases]) => [normalizeText(query), aliases])
);

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_WORD_PATTERN, "");
}

function expandLocationQueryAliases(value) {
  const normalizedValue = normalizeText(value);
  const expanded = [String(value || "")];

  for (const [alias, targets] of LOCATION_QUERY_ALIASES.entries()) {
    if (normalizedValue.includes(alias)) {
      expanded.push(...targets);
    }
  }

  return [...new Set(expanded.filter(Boolean))];
}

function tokenizeLocation(value) {
  const rawTokens = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s,/()]+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  const tokens = new Set();

  for (const token of rawTokens) {
    tokens.add(token);

    const withoutSuffix = token.replace(LOCATION_SUFFIX_PATTERN, "");
    if (withoutSuffix && withoutSuffix.length >= 2) {
      tokens.add(withoutSuffix);
    }
  }

  return [...tokens];
}

function getLocationQueryVariants(query) {
  const rawQuery = String(query || "").trim();

  if (!rawQuery) {
    return [];
  }

  const variants = [{ value: rawQuery, alias: false, penalty: 0 }];
  const seen = new Set([normalizeText(rawQuery)]);

  for (const alias of expandLocationQueryAliases(rawQuery).slice(1)) {
    const normalizedAlias = normalizeText(alias);

    if (!normalizedAlias || seen.has(normalizedAlias)) {
      continue;
    }

    seen.add(normalizedAlias);
    variants.push({
      value: alias,
      alias: true,
      penalty: 40
    });
  }

  return variants;
}

function parseZoneCatalogHtml(html) {
  const zones = [];
  const seen = new Set();
  let match;

  while ((match = ZONE_LINK_PATTERN.exec(html)) !== null) {
    const href = decodeHtml(match[1]);
    const url = new URL(href, BASE_URL);
    const zone1 = url.searchParams.get("zone1");
    const zone2 = url.searchParams.get("zone2");
    const latitude = Number(url.searchParams.get("zone2Lat"));
    const longitude = Number(url.searchParams.get("zone2Lng"));

    if (!zone1 || !zone2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const dedupeKey = `${zone1}::${zone2}::${latitude}::${longitude}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    zones.push({
      zone1,
      zone2,
      latitude,
      longitude,
      href: url.toString()
    });
  }

  if (zones.length === 0) {
    throw new Error("Unable to parse any official Blue Ribbon zones from /search/zone.");
  }

  return zones;
}

function scoreZoneMatch(query, zone) {
  const normalizedQuery = normalizeText(query);
  const normalizedZone1 = normalizeText(zone.zone1);
  const normalizedZone2 = normalizeText(zone.zone2);
  const normalizedCombined = normalizeText(`${zone.zone1} ${zone.zone2}`);

  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedQuery === normalizedZone2) {
    return 1000 + normalizedZone2.length;
  }

  if (normalizedQuery === normalizedCombined) {
    return 950 + normalizedCombined.length;
  }

  if (normalizedZone2.startsWith(normalizedQuery)) {
    return 900 + normalizedQuery.length;
  }

  if (normalizedZone2.includes(normalizedQuery)) {
    return 860 + normalizedQuery.length;
  }

  if (normalizedCombined.includes(normalizedQuery)) {
    return 820 + normalizedQuery.length;
  }

  if (normalizedQuery.includes(normalizedZone2)) {
    return 780 + normalizedZone2.length;
  }

  if (normalizedQuery === normalizedZone1) {
    return 740 + normalizedZone1.length;
  }

  let score = 0;
  for (const token of tokenizeLocation(query)) {
    const normalizedToken = normalizeText(token);
    if (!normalizedToken) {
      continue;
    }

    if (normalizedZone2.includes(normalizedToken)) {
      score += 120 + normalizedToken.length;
      continue;
    }

    if (normalizedCombined.includes(normalizedToken)) {
      score += 90 + normalizedToken.length;
    }
  }

  return score;
}

function findZoneMatches(query, zones, options = {}) {
  const limit = options.limit ?? 5;
  const queryVariants = getLocationQueryVariants(query);

  return zones
    .map((zone) => {
      const bestMatch = queryVariants.reduce(
        (best, variant) => {
          const variantScore = Math.max(0, scoreZoneMatch(variant.value, zone) - variant.penalty);

          if (variantScore > best.score) {
            return {
              score: variantScore,
              matchedQuery: variant.value,
              matchedBy: variant.alias ? "alias" : "query"
            };
          }

          return best;
        },
        {
          score: 0,
          matchedQuery: String(query || ""),
          matchedBy: "query"
        },
      );

      return {
        zone,
        score: bestMatch.score,
        matchedQuery: bestMatch.matchedQuery,
        matchedBy: bestMatch.matchedBy
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.zone.zone2.length - right.zone.zone2.length;
    })
    .slice(0, limit);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(originLatitude, originLongitude, latitude, longitude) {
  if (![originLatitude, originLongitude, latitude, longitude].every(Number.isFinite)) {
    return null;
  }

  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(latitude - originLatitude);
  const longitudeDelta = toRadians(longitude - originLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(originLatitude)) *
      Math.cos(toRadians(latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine)));
}

function normalizeNearbyItem(item, origin = {}) {
  const name = item.name || item.headerInfo?.nameKR || "";
  const address = item.address || item.juso?.roadAddrPart1 || "";
  const ribbonType = item.ribbonType || item.headerInfo?.ribbonType || null;
  const ribbonCount = item.ribbonCount ?? item.headerInfo?.ribbonCount ?? 0;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  return {
    id: Number(item.id),
    name,
    address,
    ribbonType,
    ribbonCount: Number(ribbonCount),
    bookYear: item.bookYear || item.headerInfo?.bookYear || null,
    latitude,
    longitude,
    distanceMeters: calculateDistanceMeters(
      origin.latitude,
      origin.longitude,
      latitude,
      longitude,
    ),
    foodTypes: Array.isArray(item.foodTypes) ? [...item.foodTypes] : [],
    foodDetailTypes: Array.isArray(item.foodDetailTypes) ? [...item.foodDetailTypes] : [],
    redRibbon: Boolean(item.redRibbon),
    seoul: Boolean(item.seoul)
  };
}

function buildBoundingBox(latitude, longitude, distanceMeters) {
  const distanceKilometers = distanceMeters / 1000;
  const latitudeDelta = distanceKilometers / 111.32;
  const longitudeDelta = distanceKilometers / (111.32 * Math.cos(toRadians(latitude)));

  return {
    latitude1: String(latitude - latitudeDelta),
    latitude2: String(latitude + latitudeDelta),
    longitude1: String(longitude - longitudeDelta),
    longitude2: String(longitude + longitudeDelta)
  };
}

module.exports = {
  BASE_URL,
  buildBoundingBox,
  calculateDistanceMeters,
  findZoneMatches,
  normalizeNearbyItem,
  normalizeText,
  parseZoneCatalogHtml
};
