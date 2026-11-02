#!/usr/bin/env node
// Adapted from kpic-mcp; original MIT notice: ../references/LICENSE.md.
import { pathToFileURL } from "node:url";

const SEARCH_URL = "https://www.health.kr/api/searchDrug";
const DETAIL_URL = "https://health.kr/searchDrug/ajax/ajax_result_drug2.asp";
const SEARCH_LIMIT = 5;

class KPICApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "KPICApiError";
    this.statusCode = statusCode;
  }
}

async function fetchJson(url, headers) {
  try {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      throw new KPICApiError(`API request failed: ${response.status} ${response.statusText}`, response.status);
    }
    const text = await response.text();
    try {
      // The detail endpoint serves JSON with a text/html content type.
      return JSON.parse(text);
    } catch (error) {
      throw new KPICApiError(`Failed to parse API response: ${error.message}`);
    }
  } catch (error) {
    if (error instanceof KPICApiError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new KPICApiError(`Network error: ${error.message}`);
    }
    throw new KPICApiError("Unknown error occurred");
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSearchPage(data, page, previous) {
  if (!isRecord(data) || !Array.isArray(data.items) || !data.items.every(isRecord)) {
    throw new KPICApiError("Invalid response format: expected search items array of objects");
  }
  const { total, limit, totalPages } = data;
  if (
    !Number.isSafeInteger(total) || total < 0 ||
    !Number.isSafeInteger(limit) || limit < 1 ||
    !Number.isSafeInteger(totalPages) || totalPages < 0 ||
    data.page !== page
  ) {
    throw new KPICApiError("Invalid response format: invalid search pagination");
  }
  const expectedPages = Math.ceil(total / limit);
  if (totalPages !== expectedPages && !(total === 0 && totalPages === 1)) {
    throw new KPICApiError("Invalid response format: inconsistent search page count");
  }
  if (previous && (total !== previous.total || limit !== previous.limit || totalPages !== previous.totalPages)) {
    throw new KPICApiError("Invalid response format: search pagination changed between pages");
  }
  const expectedItems = Math.min(limit, Math.max(0, total - (page - 1) * limit));
  if (data.items.length !== expectedItems) {
    throw new KPICApiError("Invalid response format: incomplete search page");
  }
}

/** Return every search result as a pretty JSON array, preserving upstream fields. */
export async function search_drugs_by_name(drugname) {
  if (typeof drugname !== "string" || !drugname.trim()) {
    throw new KPICApiError("Drug name cannot be empty");
  }
  const items = [];
  let first;
  let page = 1;
  do {
    const query = new URLSearchParams({
      page: String(page), limit: String(first?.limit ?? SEARCH_LIMIT), drugName: drugname, total: "1",
    });
    const data = await fetchJson(`${SEARCH_URL}?${query}`, {
      accept: "application/json",
      "accept-language": "ko,en-US;q=0.9,en;q=0.8",
    });
    validateSearchPage(data, page, first);
    first ??= data;
    items.push(...data.items);
    page += 1;
  } while (page <= first.totalPages);
  return JSON.stringify(items, null, 2);
}

/** Return the original detail array without selecting, renaming, or sanitizing fields. */
export async function get_drug_detail_by_id(drugcode) {
  if (typeof drugcode !== "string" || !drugcode.trim()) {
    throw new KPICApiError("Drug code cannot be empty");
  }
  const query = new URLSearchParams({ drug_cd: drugcode, _: String(Date.now()) });
  const data = await fetchJson(`${DETAIL_URL}?${query}`, {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "ko,en-US;q=0.9,en;q=0.8,ru;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    Referer: `https://health.kr/searchDrug/result_drug.asp?drug_cd=${encodeURIComponent(drugcode)}`,
  });
  if (!Array.isArray(data) || !data.every(isRecord)) {
    throw new KPICApiError("Invalid response format: expected array of objects");
  }
  if (data.length === 0) {
    throw new KPICApiError(`No drug found with code: ${drugcode}`);
  }
  return JSON.stringify(data, null, 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [operation, value, ...extra] = process.argv.slice(2);
    const commands = { search_drugs_by_name, get_drug_detail_by_id };
    if (!Object.hasOwn(commands, operation) || value === undefined || extra.length) {
      throw new KPICApiError(
        'Usage: node kpic_drug_search.mjs search_drugs_by_name "drug name" | get_drug_detail_by_id "drug code"',
      );
    }
    console.log(await commands[operation](value));
  } catch (error) {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
