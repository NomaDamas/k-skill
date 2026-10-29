const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const helperPath = path.join(__dirname, "..", "kpic-drug-search", "scripts", "kpic_drug_search.mjs");
const helperUrl = pathToFileURL(helperPath).href;
const helper = import(helperUrl);
const records = [
  { drug_code: "001", drug_name: "타이레놀", drug_enm: "Tylenol", new_field: { raw: [null, "한글"] } },
  { drug_code: "002", drug_name: "Tylenol ER", pack_img: "https://example.invalid/약.png" },
  { drug_code: "003", drug_name: "타이레놀정", price: 0 },
  { drug_code: "004", drug_name: "다른 제형", released: false },
  { drug_code: "005", drug_name: "마지막" },
];

function searchPage(items, { total = items.length, page = 1, limit = 5 } = {}) {
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

function mockResponses(t, payloads) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.ok(payloads.length, "unexpected extra upstream request");
    const payload = payloads.shift();
    if (payload instanceof Error) throw payload;
    return payload instanceof Response ? payload : new Response(JSON.stringify(payload));
  });
  return calls;
}

function runCli(args, payloads) {
  // Exercise the real direct-entry CLI with deterministic upstream responses.
  const bootstrap = `
    const payloads = ${JSON.stringify(payloads)};
    globalThis.fetch = async () => {
      if (!payloads.length) throw new Error("unexpected upstream request");
      return new Response(JSON.stringify(payloads.shift()));
    };
    process.argv = [process.execPath, ${JSON.stringify(helperPath)}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(helperUrl)});
  `;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", bootstrap], { encoding: "utf8" });
}

test("name search collects every page in upstream result order", async (t) => {
  const pages = [
    searchPage(records.slice(0, 2), { total: 5, page: 1, limit: 2 }),
    searchPage(records.slice(2, 4), { total: 5, page: 2, limit: 2 }),
    searchPage(records.slice(4), { total: 5, page: 3, limit: 2 }),
  ];
  mockResponses(t, pages);
  const result = await (await helper).search_drugs_by_name("타이레놀");
  assert.deepEqual(JSON.parse(result), records);
});

test("empty name or code fails before any request", async (t) => {
  const calls = mockResponses(t, []);
  const api = await helper;
  for (const input of ["", " \t\n", undefined, null]) {
    await assert.rejects(api.search_drugs_by_name(input), /Drug name cannot be empty/);
    await assert.rejects(api.get_drug_detail_by_id(input), /Drug code cannot be empty/);
  }
  assert.equal(calls.length, 0);
});

test("no search results is an empty array, but an empty detail array is an error", async (t) => {
  mockResponses(t, [searchPage([]), { ...searchPage([]), totalPages: 1 }, []]);
  const api = await helper;
  assert.equal(await api.search_drugs_by_name("no such drug"), "[]");
  assert.equal(await api.search_drugs_by_name("없는 약"), "[]");
  await assert.rejects(api.get_drug_detail_by_id("missing"), /No drug found with code: missing/);
});

for (const operation of ["search_drugs_by_name", "get_drug_detail_by_id"]) {
  test(`${operation} rejects HTTP, HTML, malformed JSON, and network failures`, async (t) => {
    const invoke = (await helper)[operation];
    mockResponses(t, [new Response("<h1>Unavailable</h1>", { status: 503, statusText: "Unavailable" })]);
    await assert.rejects(invoke("valid"), (error) => {
      assert.equal(error.name, "KPICApiError");
      assert.equal(error.statusCode, 503);
      assert.match(error.message, /API request failed: 503/);
      return true;
    });
    for (const body of ["<html>Login required</html>", '{"items":', ""]) {
      mockResponses(t, [new Response(body)]);
      await assert.rejects(invoke("valid"), /Failed to parse API response/);
    }
    mockResponses(t, [new TypeError("connection reset")]);
    await assert.rejects(invoke("valid"), /Network error: connection reset/);
    t.mock.method(globalThis, "fetch", async () => { throw "non-Error rejection"; });
    await assert.rejects(invoke("valid"), /Unknown error occurred/);
  });
}

test("invalid search shapes and inconsistent pagination are not empty searches", async (t) => {
  const valid = searchPage([records[0]]);
  const invalid = [
    null, [], {}, { ...valid, items: null }, { ...valid, items: [null] },
    { ...valid, items: ["not a drug"] }, { ...valid, total: "1" },
    { ...valid, total: -1 }, { ...valid, page: 2 }, { ...valid, page: "1" },
    { ...valid, limit: 0 }, { ...valid, totalPages: 0 },
    { ...valid, items: [] }, { ...valid, total: 6, totalPages: 2 },
  ];
  for (const payload of invalid) {
    mockResponses(t, [payload]);
    await assert.rejects((await helper).search_drugs_by_name("valid"), /Invalid response format/);
  }
});

test("detail rejects non-array or malformed record shapes", async (t) => {
  for (const payload of [null, {}, { items: [] }, [null], ["not a drug"], [[]]]) {
    mockResponses(t, [payload]);
    await assert.rejects((await helper).get_drug_detail_by_id("valid"), /Invalid response format/);
  }
});

test("a failed or inconsistent later search page never returns partial success", async (t) => {
  const first = searchPage(records.slice(0, 2), { total: 3, limit: 2 });
  const last = searchPage(records.slice(2, 3), { total: 3, page: 2, limit: 2 });
  const badPages = [
    new Response("failed", { status: 502 }), new Error("socket closed"),
    new Response("<html>blocked</html>"), {}, { ...last, items: [] },
    { ...last, page: 1 }, { ...last, total: 4 },
    { ...last, limit: 3, totalPages: 1 },
  ];
  for (const badPage of badPages) {
    const calls = mockResponses(t, [first, badPage]);
    await assert.rejects((await helper).search_drugs_by_name("valid"), /API request failed|Network error|Failed to parse|Invalid response/);
    assert.equal(calls.length, 2);
  }
});

test("CLI reports failure on stderr with nonzero status and no partial JSON", () => {
  const scenarios = [
    { args: ["search_drugs_by_name", "valid"], payloads: [
      searchPage(records.slice(0, 2), { total: 3, limit: 2 }), {},
    ], message: /Invalid response format/ },
    { args: ["get_drug_detail_by_id", "missing"], payloads: [[]], message: /No drug found/ },
    { args: ["search_drugs_by_name", " "], payloads: [], message: /Drug name cannot be empty/ },
    { args: ["get_drug_detail_by_id", ""], payloads: [], message: /Drug code cannot be empty/ },
    { args: ["search", "타이레놀"], payloads: [], message: /Usage:/ },
    { args: [], payloads: [], message: /Usage:/ },
    { args: ["search_drugs_by_name", "valid", "extra"], payloads: [], message: /Usage:/ },
  ];
  for (const { args, payloads, message } of scenarios) {
    const result = runCli(args, payloads);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, message);
  }
});
