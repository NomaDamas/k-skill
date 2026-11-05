#!/usr/bin/env node
// Resolves a merchant's Kakao Map aggregate rating for the bccard-eatpl-search table.
//
// Step 1 uses the official Kakao Local keyword search through k-skill-proxy
// (the REST API key lives server-side) to resolve the merchant to a stable
// Kakao place id. Step 2 reads the public Kakao Map mobile search page and
// takes the displayed aggregate rating of that exact place id. Any doubt —
// no candidate, several candidates, missing rating, unreachable upstream —
// yields a null rating with an explicit status instead of a guess.

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export const DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org";
export const KAKAO_MOBILE_SEARCH_URL = "https://m.map.kakao.com/actions/searchView";
export const DEFAULT_TIMEOUT_MS = 10000;

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const ADDRESS_SIGNIFICANT_SUFFIX = /[구군동읍면리로길]$/;

function baseResult(query) {
  return {
    query,
    status: "error",
    kakaoPlaceId: null,
    kakaoPlaceName: null,
    kakaoPlaceUrl: null,
    rating: null,
    reviewCount: null
  };
}

export function tokenSet(text) {
  if (!text) {
    return [];
  }
  return String(text)
    .split(/\s+/)
    .map((token) => token.replace(/[^0-9A-Za-z가-힣]/g, "").toLowerCase())
    .filter((token) => token.length > 0 && /[a-z가-힣]/.test(token));
}

function significantAddressTokens(address) {
  return tokenSet(address).filter((token) => ADDRESS_SIGNIFICANT_SUFFIX.test(token));
}

function sharesSignificantAddressToken(left, right) {
  const rightTokens = new Set(significantAddressTokens(right));
  return significantAddressTokens(left).some((token) => rightTokens.has(token));
}

function candidateAddresses(document) {
  return [document.road_address_name, document.address_name].filter(Boolean);
}

function isAddressCompatible(document, address) {
  return candidateAddresses(document).some((candidateAddress) =>
    sharesSignificantAddressToken(candidateAddress, address)
  );
}

function matchesName(document, needleTokens) {
  const nameTokens = new Set(tokenSet(document.place_name));
  return needleTokens.every((needle) => nameTokens.has(needle));
}

export function pickKakaoCandidate(documents, { name, address }) {
  const needleTokens = tokenSet(name);
  if (needleTokens.length === 0 || !Array.isArray(documents) || documents.length === 0) {
    return { status: "no_match" };
  }
  const nameMatches = documents.filter((document) => matchesName(document, needleTokens));
  if (nameMatches.length === 0) {
    return { status: "no_match" };
  }
  const hasAddressConstraint = significantAddressTokens(address).length > 0;
  if (!hasAddressConstraint) {
    return nameMatches.length === 1
      ? { status: "ok", document: nameMatches[0] }
      : { status: "ambiguous", candidates: nameMatches.length };
  }
  const compatible = nameMatches.filter((document) => isAddressCompatible(document, address));
  if (compatible.length === 1) {
    return { status: "ok", document: compatible[0] };
  }
  return compatible.length === 0 ? { status: "no_match" } : { status: "ambiguous", candidates: compatible.length };
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseSearchViewItems(html) {
  if (typeof html !== "string" || html.length === 0) {
    return [];
  }
  const chunks = html.split('<li class="search_item').slice(1);
  const items = [];
  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-id="(\d+)"/);
    const titleMatch = chunk.match(/data-title="([^"]*)"/);
    if (!idMatch || !titleMatch) {
      continue;
    }
    const ratingIndex = chunk.search(/num_rate">[0-9.]+</);
    let rating = null;
    let reviewCount = null;
    if (ratingIndex !== -1) {
      rating = Number.parseFloat(chunk.match(/num_rate">([0-9.]+)</)[1]);
      const countMatch = chunk.slice(ratingIndex).match(/txt_num">\((\d+)\)/);
      reviewCount = countMatch ? Number.parseInt(countMatch[1], 10) : null;
    }
    items.push({
      id: idMatch[1],
      title: decodeHtmlEntities(titleMatch[1]),
      rating,
      reviewCount
    });
  }
  return items;
}

async function fetchText(url, { fetchImpl, timeoutMs, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupKakaoPlaceRating({
  name,
  address = "",
  proxyBaseUrl = DEFAULT_PROXY_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
}) {
  const result = baseResult({ name, address });
  if (!name || !String(name).trim()) {
    result.status = "no_match";
    return result;
  }

  let documents;
  try {
    const searchUrl =
      `${proxyBaseUrl}/v1/kakao-map/search/keyword?` +
      new URLSearchParams({ query: String(name).trim(), size: "15" });
    const payload = JSON.parse(await fetchText(searchUrl, { fetchImpl, timeoutMs, headers: {} }));
    documents = Array.isArray(payload.documents) ? payload.documents : null;
    if (documents === null) {
      throw new Error("missing documents array");
    }
  } catch (error) {
    result.status = "error";
    result.error = `kakao local search failed: ${error.message}`;
    return result;
  }

  const picked = pickKakaoCandidate(documents, { name, address });
  if (picked.status !== "ok") {
    result.status = picked.status;
    return result;
  }

  const place = picked.document;
  result.kakaoPlaceId = place.id;
  result.kakaoPlaceName = place.place_name;
  result.kakaoPlaceUrl = place.place_url || `http://place.map.kakao.com/${place.id}`;

  let html;
  try {
    const searchViewUrl =
      `${KAKAO_MOBILE_SEARCH_URL}?` + new URLSearchParams({ q: String(name).trim() });
    html = await fetchText(searchViewUrl, {
      fetchImpl,
      timeoutMs,
      headers: { "user-agent": MOBILE_USER_AGENT, "accept-language": "ko-KR,ko;q=0.9" }
    });
  } catch (error) {
    result.status = "error";
    result.error = `kakao map rating page failed: ${error.message}`;
    return result;
  }

  const item = parseSearchViewItems(html).find((candidate) => candidate.id === place.id);
  if (!item || item.rating === null) {
    result.status = "no_rating";
    return result;
  }
  result.status = "ok";
  result.rating = item.rating;
  result.reviewCount = item.reviewCount;
  return result;
}

function printUsage() {
  console.error(
    "usage: kakao-place-rating.mjs --name <가맹점명> [--address <주소>] " +
      "[--proxy-base-url <url>] [--timeout-ms <ms>]"
  );
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        name: { type: "string" },
        address: { type: "string", default: "" },
        "proxy-base-url": { type: "string", default: process.env.KSKILL_PROXY_BASE_URL || DEFAULT_PROXY_BASE_URL },
        "timeout-ms": { type: "string", default: String(DEFAULT_TIMEOUT_MS) },
        help: { type: "boolean", default: false }
      }
    });
  } catch {
    printUsage();
    return 2;
  }
  if (args.values.help || !args.values.name) {
    printUsage();
    return args.values.help ? 0 : 2;
  }
  const timeoutMs = Number.parseInt(args.values["timeout-ms"], 10);
  const result = await lookupKakaoPlaceRating({
    name: args.values.name,
    address: args.values.address,
    proxyBaseUrl: args.values["proxy-base-url"],
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
