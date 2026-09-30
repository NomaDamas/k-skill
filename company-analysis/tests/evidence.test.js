"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const node_test_1 = __importDefault(require("node:test"));
const runner = (0, node_path_1.resolve)(__dirname, "../scripts/evidence.js");
const sha = (value) => (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
const sectionNames = ["company_snapshot", "business", "recent", "financials", "earnings", "catalyst_risk"];
const headings = ["요약", "주요 사업 · 산업 · 경쟁구도", "최근 사업 현황", "재무제표 분석", "실적발표 분석", "Catalyst & Risk", "출처"];
function fixture(source = "Apple Inc. AAPL 2026-09-20 매출 -100억원. 비중 100%. 접수 2025년.") {
    const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "company-analysis-test-"));
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(root, "sources"));
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(root, "sources", "raw"), source);
    const capture = JSON.stringify({ url: "https://example.org/filing", sha256: sha(source), bytes: Buffer.byteLength(source) });
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(root, "sources", "capture.json"), capture);
    const data = {
        company: { name: "Apple Inc.", ticker: "AAPL", market: "NASDAQ", evidence_source_id: "filing" },
        as_of: "2026-09-22",
        sources: [{ id: "filing", url: "https://example.org/filing", published_at: "2026-09-20", published_date_quote: "2026-09-20",
                file: "sources/raw", sha256: sha(source), capture_file: "sources/capture.json", capture_sha256: sha(capture) }],
        sections: Object.fromEntries(sectionNames.map((name) => [name, []])),
    };
    data.sections.financials = [{ text: "매출 -100억원", statement: "income", period: "2025년", unit: "억원", scope: "연결",
            evidence: [{ source_id: "filing", quote: "매출 -100억원" }] }];
    const path = (0, node_path_1.join)(root, "snapshot.json");
    const run = (raw) => {
        (0, node_fs_1.writeFileSync)(path, raw ?? JSON.stringify(data));
        return (0, node_child_process_1.spawnSync)(process.execPath, [runner, path], { encoding: "utf8" });
    };
    return { root, data, run };
}
(0, node_test_1.default)("same saved evidence yields byte-identical six-section chat", () => {
    const f = fixture();
    try {
        const a = f.run(), b = f.run();
        strict_1.default.equal(a.status, 0);
        strict_1.default.equal(a.stdout, b.stdout);
        strict_1.default.deepEqual([...a.stdout.matchAll(/^## (.+)$/gm)].map((match) => match[1]), headings);
        strict_1.default.match(a.stdout, /> 간이 분석 — 검증된 재무상태표·현금흐름표 자료 없음/);
        strict_1.default.match(a.stdout, /## 요약\n\n- 조회 시점 주가: 확인 불가/);
        strict_1.default.match(a.stdout, /매출 -100억원/);
        strict_1.default.match(a.stdout, /### 손익계산서[\s\S]*매출 -100억원/);
        strict_1.default.match(a.stdout, /### 재무상태표\n\n확인 불가/);
        strict_1.default.match(a.stdout, /### 현금흐름표\n\n확인 불가/);
        strict_1.default.match(a.stdout, /### 주요 일정\n\n확정된 일정 없음/);
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
(0, node_test_1.default)("schedule renders dated events in stable chronological form", () => {
    const f = fixture("Apple Inc. AAPL 2026-09-20 매출 -100억원. September 23, 2026 행사. September 24, 2026부터 September 26, 2026까지 행사. September 27, 2026부터 행사. January 3, 2027 행사.");
    try {
        const evidence = (quote) => [{ source_id: "filing", quote }];
        f.data.schedule = [
            { kind: "from", start: "2026-09-27", date_quote: "September 27, 2026", text: "신규 제품 출시", evidence: evidence("September 27, 2026부터 행사") },
            { kind: "range", start: "2026-09-24", end: "2026-09-26", date_quote: "September 24, 2026", end_date_quote: "September 26, 2026", text: "투자자 행사", evidence: evidence("September 24, 2026부터 September 26, 2026까지 행사") },
            { kind: "date", start: "2027-01-03", date_quote: "January 3, 2027", text: "실적 발표", evidence: evidence("January 3, 2027 행사") },
            { kind: "date", start: "2026-09-23", date_quote: "September 23, 2026", text: "주주총회", evidence: evidence("September 23, 2026 행사") },
        ];
        const a = f.run(), b = f.run();
        strict_1.default.equal(a.status, 0, a.stderr);
        strict_1.default.equal(a.stdout, b.stdout);
        strict_1.default.match(a.stdout, /### 주요 일정\n\n- 9\/23 · 주주총회[\s\S]*- 9\/24~9\/26 · 투자자 행사[\s\S]*- 9\/27~ · 신규 제품 출시[\s\S]*- 2027년 1\/3 · 실적 발표/);
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
for (const [name, mutate] of [
    ["impossible start date", (d) => { d.schedule[0].start = "2026-02-30"; }],
    ["date not present in excerpt", (d) => { d.schedule[0].evidence[0].quote = "Apple Inc. AAPL 2026-09-20"; }],
    ["date differs from source phrase", (d) => { d.schedule[0].start = "2026-09-24"; }],
    ["past event", (d) => { d.schedule[0].start = "2026-09-20"; d.schedule[0].date_quote = "2026-09-20"; }],
    ["false range", (d) => { d.schedule[0].kind = "range"; d.schedule[0].end = "2026-09-24"; }],
    ["number in event text", (d) => { d.schedule[0].text = "매출 100억원 행사"; }],
    ["duplicate event", (d) => { d.schedule.push(structuredClone(d.schedule[0])); }],
]) {
    (0, node_test_1.default)(`schedule fails closed: ${name}`, () => {
        const f = fixture("Apple Inc. AAPL 2026-09-20 매출 -100억원. September 23, 2026 행사.");
        try {
            f.data.schedule = [{ kind: "date", start: "2026-09-23", date_quote: "September 23, 2026", text: "주주총회",
                    evidence: [{ source_id: "filing", quote: "September 23, 2026 행사" }] }];
            mutate(f.data);
            const result = f.run();
            strict_1.default.notEqual(result.status, 0);
            strict_1.default.equal(result.stdout, "");
            strict_1.default.match(result.stderr, /^EVIDENCE_ERROR:/);
        }
        finally {
            (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
        }
    });
}
const mutations = [
    ["tampered raw hash", (d) => { d.sources[0].sha256 = "0".repeat(64); }],
    ["swapped capture URL", (d) => { d.sources[0].url = "https://example.org/other"; }],
    ["future publication", (d) => { d.sources[0].published_at = "2026-09-23"; }],
    ["wrong but valid publication date", (d) => { d.sources[0].published_at = "2026-09-19"; }],
    ["undated numeric source", (d) => { delete d.sources[0].published_at; delete d.sources[0].published_date_quote; }],
    ["invalid date", (d) => { d.as_of = "2026-02-30"; }],
    ["negative becomes positive", (d) => { d.sections.financials[0].text = "매출 100억원"; }],
    ["unsupported percent", (d) => { d.sections.financials[0].text = "매출 -100%"; }],
    ["unsupported number", (d) => { d.sections.financials[0].text = "매출 -101억원"; }],
    ["wrong metric with correct number", (d) => { d.sections.financials[0].text = "영업이익 -100억원"; }],
    ["wrong quote", (d) => { d.sections.financials[0].evidence[0].quote = "매출 -101억원"; }],
    ["missing numeric context", (d) => { delete d.sections.financials[0].unit; }],
    ["missing statement classification", (d) => { delete d.sections.financials[0].statement; }],
    ["invalid statement classification", (d) => { d.sections.financials[0].statement = "cashflow"; }],
    ["identity mismatch", (d) => { d.company.ticker = "MSFT"; }],
    ["path traversal", (d) => { d.sources[0].file = "../raw"; }],
    ["secret query", (d) => { d.sources[0].url = "https://example.org/filing?api_key=x"; }],
    ["unknown section", (d) => { d.sections.extra = []; }],
    ["empty analysis", (d) => { d.sections.financials = []; }],
];
for (const [name, mutate] of mutations) {
    (0, node_test_1.default)(`fail closed: ${name}`, () => {
        const f = fixture();
        try {
            mutate(f.data);
            const result = f.run();
            strict_1.default.notEqual(result.status, 0);
            strict_1.default.equal(result.stdout, "");
            strict_1.default.match(result.stderr, /^EVIDENCE_ERROR:/);
        }
        finally {
            (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
        }
    });
}
(0, node_test_1.default)("three financial statements stay separate when all are sourced", () => {
    const f = fixture("Apple Inc. AAPL 2026-09-20 매출 -100억원. 자산 200억원. 영업현금흐름 50억원.");
    try {
        f.data.sections.financials.push({ text: "자산 200억원", statement: "balance_sheet", period: "2025년 말", unit: "억원", scope: "연결",
            evidence: [{ source_id: "filing", quote: "자산 200억원" }] }, { text: "영업현금흐름 50억원", statement: "cash_flow", period: "2025년", unit: "억원", scope: "연결",
            evidence: [{ source_id: "filing", quote: "영업현금흐름 50억원" }] });
        const result = f.run();
        strict_1.default.equal(result.status, 0, result.stderr);
        strict_1.default.doesNotMatch(result.stdout, /간이 분석/);
        strict_1.default.match(result.stdout, /### 손익계산서[\s\S]*### 재무상태표[\s\S]*### 현금흐름표/);
        strict_1.default.match(result.stdout, /### 재무상태표\n\n- 자산 200억원/);
        strict_1.default.match(result.stdout, /### 현금흐름표\n\n- 영업현금흐름 50억원/);
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
(0, node_test_1.default)("duplicate JSON key is rejected instead of last-write-wins", () => {
    const f = fixture();
    try {
        const raw = JSON.stringify(f.data).replace('"as_of":"2026-09-22"', '"as_of":"2026-09-22","as_of":"2026-09-23"');
        const result = f.run(raw);
        strict_1.default.notEqual(result.status, 0);
        strict_1.default.equal(result.stdout, "");
        strict_1.default.match(result.stderr, /duplicate/);
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
(0, node_test_1.default)("malformed thousands grouping is rejected", () => {
    const f = fixture("Apple Inc. AAPL 2026-09-20 매출 1,00억원.");
    try {
        f.data.sections.financials[0].text = "매출 1,00억원";
        f.data.sections.financials[0].evidence[0].quote = "매출 1,00억원";
        const result = f.run();
        strict_1.default.notEqual(result.status, 0);
        strict_1.default.equal(result.stdout, "");
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
(0, node_test_1.default)("another company's filing with the same number is rejected", () => {
    const f = fixture();
    try {
        const other = "Other Corp. 2026-09-20 매출 -100억원";
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(f.root, "sources", "other"));
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "other", "raw"), other);
        const capture = JSON.stringify({ url: "https://example.org/other", sha256: sha(other), bytes: Buffer.byteLength(other) });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "other", "capture.json"), capture);
        f.data.sources.push({ id: "other", url: "https://example.org/other", published_at: "2026-09-20", published_date_quote: "2026-09-20",
            file: "sources/other/raw", sha256: sha(other), capture_file: "sources/other/capture.json", capture_sha256: sha(capture) });
        f.data.sections.financials[0].evidence = [{ source_id: "other", quote: "매출 -100억원" }];
        const result = f.run();
        strict_1.default.notEqual(result.status, 0);
        strict_1.default.equal(result.stdout, "");
        strict_1.default.match(result.stderr, /does not identify the company/);
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
(0, node_test_1.default)("LG bilingual identity, DART indexed statement, compact schedule and dotted dates", () => {
    const f = fixture("LG전자 LG Electronics 066570 2026.08.14");
    try {
        const add = (id, url, raw, extra = {}) => {
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(f.root, "sources", id));
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", id, "raw"), raw);
            const capture = JSON.stringify({ url, sha256: sha(raw), bytes: Buffer.byteLength(raw) });
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", id, "capture.json"), capture);
            f.data.sources.push({ id, url, file: `sources/${id}/raw`, sha256: sha(raw), capture_file: `sources/${id}/capture.json`, capture_sha256: sha(capture), ...extra });
        };
        f.data.company = { name: "LG전자", aliases: ["LG Electronics"], ticker: "066570", market: "KRX", evidence_source_id: "filing" };
        f.data.sources[0].published_at = "2026-08-14";
        f.data.sources[0].published_date_quote = "2026.08.14";
        f.data.sections.financials = [];
        const node = (eleId, offset, length) => `var node3 = {}; node3['rcpNo'] = "20260814001997"; node3['dcmNo'] = "11531711"; node3['eleId'] = "${eleId}"; node3['offset'] = "${offset}"; node3['length'] = "${length}"; node3['dtd'] = "dart4.xsd";`;
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "raw"), `LG전자 LG Electronics 066570 2026.08.14 ${node("20", "379792", "42569")} ${node("21", "422361", "43599")} ${node("24", "589662", "27388")}`);
        const parent = (0, node_fs_1.readFileSync)((0, node_path_1.join)(f.root, "sources", "raw"), "utf8");
        f.data.sources[0].sha256 = sha(parent);
        const parentCapture = JSON.stringify({ url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814001997", sha256: sha(parent), bytes: Buffer.byteLength(parent) });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "capture.json"), parentCapture);
        f.data.sources[0].url = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814001997";
        f.data.sources[0].capture_sha256 = sha(parentCapture);
        const row = (label, value) => `<table><tr><td>${label}</td><td>${value}</td><td>백만원</td></tr></table>`;
        add("balance", "https://dart.fss.or.kr/report/viewer.do?rcpNo=20260814001997&dcmNo=11531711&eleId=20&offset=379792&length=42569&dtd=dart4.xsd", row("자산", "73,696,206"), { filing_index_source_id: "filing" });
        add("income", "https://dart.fss.or.kr/report/viewer.do?rcpNo=20260814001997&dcmNo=11531711&eleId=21&offset=422361&length=43599&dtd=dart4.xsd", row("매출", "23,826,468"), { filing_index_source_id: "filing" });
        add("cash", "https://dart.fss.or.kr/report/viewer.do?rcpNo=20260814001997&dcmNo=11531711&eleId=24&offset=589662&length=27388&dtd=dart4.xsd", row("영업현금흐름", "3,552,902"), { filing_index_source_id: "filing" });
        for (const id of ["balance", "income", "cash"]) {
            const folder = (0, node_path_1.join)(f.root, "sources", id);
            const extracted = (0, node_child_process_1.spawnSync)(process.execPath, [(0, node_path_1.resolve)(__dirname, "../scripts/dart-rows.js"), folder], { encoding: "utf8" });
            strict_1.default.equal(extracted.status, 0, extracted.stderr);
            const source = f.data.sources.find((entry) => entry.id === id);
            source.text_file = `sources/${id}/rows.txt`;
            source.text_sha256 = sha((0, node_fs_1.readFileSync)((0, node_path_1.join)(folder, "rows.txt")));
        }
        add("event", "https://www.lg.com/global/newsroom/news/corporate/lg-data-centre/", "LG Electronics Sep. 21, 2026 Data Centre World Asia 2026 (DCWA 2026), held September 29–30 at Marina Bay Sands.", { published_at: "2026-09-21", published_date_quote: "Sep. 21, 2026" });
        f.data.sections.financials = [
            { statement: "income", text: "매출 23,826,468 백만원", period: "2026년 2분기", unit: "백만원", scope: "연결", evidence: [{ source_id: "income", quote: "매출 23,826,468 백만원" }] },
            { statement: "balance_sheet", text: "자산 73,696,206 백만원", period: "2026년 6월 말", unit: "백만원", scope: "연결", evidence: [{ source_id: "balance", quote: "자산 73,696,206 백만원" }] },
            { statement: "cash_flow", text: "영업현금흐름 3,552,902 백만원", period: "2026년 상반기", unit: "백만원", scope: "연결", evidence: [{ source_id: "cash", quote: "영업현금흐름 3,552,902 백만원" }] },
        ];
        f.data.schedule = [{ kind: "range", start: "2026-09-29", end: "2026-09-30", date_quote: "Data Centre World Asia 2026 (DCWA 2026), held September 29–30", text: "데이터센터 전시회", evidence: [{ source_id: "event", quote: "Data Centre World Asia 2026 (DCWA 2026), held September 29–30" }] }];
        const result = f.run();
        strict_1.default.equal(result.status, 0, result.stderr);
        strict_1.default.match(result.stdout, /자산 73,696,206 백만원/);
        strict_1.default.match(result.stdout, /### 손익계산서[\s\S]*매출 23,826,468 백만원[\s\S]*### 재무상태표[\s\S]*자산 73,696,206 백만원[\s\S]*### 현금흐름표[\s\S]*영업현금흐름 3,552,902 백만원/);
        strict_1.default.match(result.stdout, /9\/29~9\/30 · 데이터센터 전시회/);
        f.data.schedule[0].end = "2026-10-01";
        strict_1.default.notEqual(f.run().status, 0, "wrong end date must fail closed");
        f.data.schedule[0].end = "2026-09-30";
        f.data.company.aliases = ["Other Electronics"];
        strict_1.default.notEqual(f.run().status, 0, "alias absent from identity must fail closed");
        f.data.company.aliases = ["LG Electronics"];
        const balanceRows = (0, node_fs_1.readFileSync)((0, node_path_1.join)(f.root, "sources", "balance", "rows.txt"));
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "balance", "rows.txt"), "자산 73,696,205 백만원\n");
        f.data.sources.find((source) => source.id === "balance").text_sha256 = sha("자산 73,696,205 백만원\n");
        const alteredRows = f.run();
        strict_1.default.notEqual(alteredRows.status, 0);
        strict_1.default.match(alteredRows.stderr, /DART text extraction/);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "balance", "rows.txt"), balanceRows);
        f.data.sources.find((source) => source.id === "balance").text_sha256 = sha(balanceRows);
        const balance = f.data.sources.find((source) => source.id === "balance");
        balance.url = "https://dart.fss.or.kr/report/viewer.do?rcpNo=20260814001997&dcmNo=11531711&eleId=21&offset=379792&length=42569&dtd=dart4.xsd";
        const wrongCapture = JSON.stringify({ url: balance.url, sha256: balance.sha256, bytes: (0, node_fs_1.readFileSync)((0, node_path_1.join)(f.root, "sources", "balance", "raw")).length });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "balance", "capture.json"), wrongCapture);
        balance.capture_sha256 = sha(wrongCapture);
        const invalid = f.run();
        strict_1.default.notEqual(invalid.status, 0);
        strict_1.default.equal(invalid.stdout, "");
        strict_1.default.match(invalid.stderr, /DART child/);
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
(0, node_test_1.default)("Nasdaq price is taken from the captured symbol and timestamp, never a typed value", () => {
    const f = fixture();
    try {
        const quote = JSON.stringify({ data: { symbol: "AAPL", companyName: "Apple Inc. Common Stock",
                isNasdaqListed: true, marketStatus: "After-Hours", primaryData: {
                    lastSalePrice: "$123.45", lastTradeTimestamp: "Sep 22, 2026 4:00 PM ET"
                } } });
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(f.root, "sources", "quote"));
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "raw"), quote);
        const url = "https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks";
        const capture = JSON.stringify({ url, sha256: sha(quote), bytes: Buffer.byteLength(quote), retrieved_at: "2026-09-23T00:00:30.000Z" });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "capture.json"), capture);
        f.data.sources.push({ id: "quote", url, file: "sources/quote/raw", sha256: sha(quote),
            capture_file: "sources/quote/capture.json", capture_sha256: sha(capture) });
        f.data.invoked_at = "2026-09-23T00:00:00.000Z";
        f.data.price = { source_id: "quote", provider: "nasdaq" };
        const accepted = f.run();
        strict_1.default.equal(accepted.status, 0, accepted.stderr);
        strict_1.default.match(accepted.stdout, /\$123\.45 USD/);
        strict_1.default.match(accepted.stdout, /수집 2026-09-23T00:00:30\.000Z/);
        strict_1.default.equal(accepted.stdout, f.run().stdout);
        f.data.company.ticker = "MSFT";
        const wrongCompany = f.run();
        strict_1.default.notEqual(wrongCompany.status, 0);
        strict_1.default.equal(wrongCompany.stdout, "");
        f.data.company.ticker = "AAPL";
        f.data.invoked_at = "2026-09-23T00:20:00.000Z";
        const wrongTime = f.run();
        strict_1.default.notEqual(wrongTime.status, 0);
        strict_1.default.equal(wrongTime.stdout, "");
        f.data.invoked_at = "2026-09-23T00:00:00.000Z";
        const wrongSymbolRaw = quote.replace('"symbol":"AAPL"', '"symbol":"MSFT"');
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "raw"), wrongSymbolRaw);
        const wrongSymbolCapture = JSON.stringify({ url, sha256: sha(wrongSymbolRaw), bytes: Buffer.byteLength(wrongSymbolRaw), retrieved_at: "2026-09-23T00:00:30.000Z" });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "capture.json"), wrongSymbolCapture);
        f.data.sources.at(-1).sha256 = sha(wrongSymbolRaw);
        f.data.sources.at(-1).capture_sha256 = sha(wrongSymbolCapture);
        const wrongSymbol = f.run();
        strict_1.default.notEqual(wrongSymbol.status, 0);
        strict_1.default.equal(wrongSymbol.stdout, "");
        const impossibleDate = quote.replace("Sep 22, 2026", "Feb 30, 2026");
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "raw"), impossibleDate);
        const changedCapture = JSON.stringify({ url, sha256: sha(impossibleDate), bytes: Buffer.byteLength(impossibleDate), retrieved_at: "2026-09-23T00:00:30.000Z" });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "capture.json"), changedCapture);
        f.data.sources.at(-1).sha256 = sha(impossibleDate);
        f.data.sources.at(-1).capture_sha256 = sha(changedCapture);
        const badDate = f.run();
        strict_1.default.notEqual(badDate.status, 0);
        strict_1.default.equal(badDate.stdout, "");
        const closed = quote.replace('"After-Hours"', '"Closed"').replace("Sep 22, 2026 4:00 PM ET", "Sep 22, 2026");
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "raw"), closed);
        const closedCapture = JSON.stringify({ url, sha256: sha(closed), bytes: Buffer.byteLength(closed), retrieved_at: "2026-09-23T00:00:30.000Z" });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "capture.json"), closedCapture);
        f.data.sources.at(-1).sha256 = sha(closed);
        f.data.sources.at(-1).capture_sha256 = sha(closedCapture);
        const acceptedClosed = f.run();
        strict_1.default.equal(acceptedClosed.status, 0, acceptedClosed.stderr);
        strict_1.default.match(acceptedClosed.stdout, /거래일 Sep 22, 2026 \(시각 미제공\)/);
        const falseOpen = closed.replace('"Closed"', '"Open"');
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "raw"), falseOpen);
        const falseOpenCapture = JSON.stringify({ url, sha256: sha(falseOpen), bytes: Buffer.byteLength(falseOpen), retrieved_at: "2026-09-23T00:00:30.000Z" });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(f.root, "sources", "quote", "capture.json"), falseOpenCapture);
        f.data.sources.at(-1).sha256 = sha(falseOpen);
        f.data.sources.at(-1).capture_sha256 = sha(falseOpenCapture);
        const rejectedOpen = f.run();
        strict_1.default.notEqual(rejectedOpen.status, 0);
        strict_1.default.equal(rejectedOpen.stdout, "");
    }
    finally {
        (0, node_fs_1.rmSync)(f.root, { recursive: true, force: true });
    }
});
