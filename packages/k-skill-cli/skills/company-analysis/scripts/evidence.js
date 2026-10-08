#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Offline evidence gate and deterministic chat renderer. No runtime packages or credentials.
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const dart_rows_1 = require("./dart-rows");
const sections = [
    ["company_snapshot", "요약"],
    ["business", "주요 사업 · 산업 · 경쟁구도"],
    ["recent", "최근 사업 현황"],
    ["financials", "재무제표 분석"],
    ["earnings", "실적발표 분석"],
    ["catalyst_risk", "Catalyst & Risk"],
];
const statements = [
    ["income", "손익계산서"],
    ["balance_sheet", "재무상태표"],
    ["cash_flow", "현금흐름표"],
];
const MAX_JSON = 2_000_000;
const MAX_SOURCE = 20_000_000;
const SHA = /^[0-9a-f]{64}$/;
const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SECRET_KEYS = /^(?:api[_-]?key|service[_-]?key|crtfc[_-]?key|auth(?:orization|[_-]?key)?|access[_-]?token|key|secret|token|password|passwd|session(?:id|[_-]?key)?)$/i;
function fail(message) {
    throw new Error(message);
}
function requiredText(value, label, max = 500) {
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
        fail(`${label}: non-empty single-line text required`);
    }
    return value.trim();
}
function day(value, label) {
    const text = requiredText(value, label, 10);
    const parsed = new Date(`${text}T00:00:00Z`);
    if (!DATE.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        fail(`${label}: canonical YYYY-MM-DD required`);
    }
    return text;
}
function instant(value, label) {
    const text = requiredText(value, label, 24);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) ||
        !Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) {
        fail(`${label}: canonical UTC timestamp required`);
    }
    return text;
}
function localDay(value, zone) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date(value));
    const field = (key) => parts.find((part) => part.type === key)?.value;
    return `${field("year")}-${field("month")}-${field("day")}`;
}
function sourceDate(value, label = "source.published_date_quote") {
    const quoted = requiredText(value, label, 60);
    if (DATE.test(quoted))
        return day(quoted, label);
    const dotted = /^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?$/.exec(quoted);
    if (dotted)
        return day(`${dotted[1]}-${dotted[2].padStart(2, "0")}-${dotted[3].padStart(2, "0")}`, label);
    const english = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?) (\d{1,2}), (\d{4})$/.exec(quoted);
    if (english) {
        const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].findIndex((name) => name === english[1] || name.slice(0, 3) === english[1].replace(".", "").slice(0, 3)) + 1;
        return day(`${english[3]}-${String(month).padStart(2, "0")}-${english[2].padStart(2, "0")}`, label);
    }
    const dayFirst = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/.exec(quoted);
    if (dayFirst) {
        const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(dayFirst[2]) + 1;
        return day(`${dayFirst[3]}-${String(month).padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`, label);
    }
    const korean = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/.exec(quoted);
    if (korean)
        return day(`${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`, label);
    fail(`${label}: unsupported date format`);
}
function compactRange(phrase, label) {
    const years = [...phrase.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => match[0]);
    const uniqueYears = [...new Set(years)];
    const matches = [...phrase.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})\s*[-–]\s*(\d{1,2})\b/g)];
    if (uniqueYears.length !== 1 || matches.length !== 1)
        fail(`${label}: one explicit year and one month-day range required`);
    const match = matches[0];
    const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(match[1]) + 1;
    const start = day(`${uniqueYears[0]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`, label);
    const end = day(`${uniqueYears[0]}-${String(month).padStart(2, "0")}-${match[3].padStart(2, "0")}`, label);
    if (end <= start)
        fail(`${label}: invalid date range`);
    return [start, end];
}
function dartChildParent(child, parent) {
    const childUrl = new URL(child.url), parentUrl = new URL(parent.url);
    if (childUrl.hostname !== "dart.fss.or.kr" || parentUrl.hostname !== "dart.fss.or.kr" ||
        childUrl.pathname !== "/report/viewer.do" || parentUrl.pathname !== "/dsaf001/main.do" ||
        [...parentUrl.searchParams].length !== 1 || !parentUrl.searchParams.get("rcpNo") ||
        [...childUrl.searchParams].length !== 6)
        return false;
    const keys = ["rcpNo", "dcmNo", "eleId", "offset", "length", "dtd"];
    if (keys.some((key) => !childUrl.searchParams.get(key)) ||
        childUrl.searchParams.get("rcpNo") !== parentUrl.searchParams.get("rcpNo"))
        return false;
    const blocks = parent.text.split(/var node\d+\s*=\s*\{\s*\};/);
    return blocks.some((block) => keys.every((key) => new RegExp(`node\\d+\\['${key}'\\]\\s*=\\s*"${childUrl.searchParams.get(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(block)));
}
function shortDay(value, asOf) {
    const [year, month, date] = value.split("-");
    return `${year === asOf.slice(0, 4) ? "" : `${year}년 `}${Number(month)}/${Number(date)}`;
}
function containsTicker(text, ticker) {
    const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, "i").test(text);
}
function url(value) {
    const text = requiredText(value, "source URL", 2048);
    let parsed;
    try {
        parsed = new URL(text);
    }
    catch {
        return fail("source URL: invalid");
    }
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.hash ||
        (parsed.port && parsed.port !== "443") || /[\s<>"'\\]/.test(text) ||
        parsed.hostname === "localhost" || parsed.hostname.endsWith(".local") ||
        /^\d+(?:\.\d+){3}$/.test(parsed.hostname) || parsed.hostname.includes(":") ||
        [...parsed.searchParams.keys()].some((key) => SECRET_KEYS.test(key))) {
        fail("source URL: exact public HTTPS URL without credentials, fragment or secret query required");
    }
    return text;
}
function fileBytes(root, name, expected) {
    const rel = requiredText(name, "source file", 240);
    if ((0, node_path_1.isAbsolute)(rel) || rel.includes("\\") || rel.split("/").includes(".."))
        fail("source file: relative path required");
    const full = (0, node_path_1.resolve)(root, rel);
    if ((0, node_path_1.relative)(root, full).startsWith(".."))
        fail("source file: outside snapshot");
    const realRoot = (0, node_fs_1.realpathSync)(root);
    const realFile = (0, node_fs_1.realpathSync)(full);
    if ((0, node_path_1.relative)(realRoot, realFile).startsWith(".."))
        fail("source file: symlink escapes snapshot");
    const info = (0, node_fs_1.lstatSync)(full);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SOURCE)
        fail("source file: invalid or oversized");
    const raw = (0, node_fs_1.readFileSync)(full);
    if (raw.length > MAX_SOURCE)
        fail("source file: grew beyond size limit");
    if (typeof expected !== "string" || !SHA.test(expected) || (0, node_crypto_1.createHash)("sha256").update(raw).digest("hex") !== expected) {
        fail(`source file: SHA-256 mismatch (${(0, node_path_1.basename)(full)})`);
    }
    return raw;
}
function normalize(value) {
    return value.replace(/\s+/g, " ").trim();
}
function excerpt(value, label) {
    if (typeof value !== "string" || !value.trim() || value.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        fail(`${label}: non-empty text excerpt required`);
    }
    return normalize(value);
}
function numbers(value) {
    if ([...value.matchAll(/\p{Nd}/gu)].some((match) => !/[0-9]/.test(match[0]))) {
        fail("numeric text: non-ASCII digits are ambiguous");
    }
    return [...value.matchAll(/[+\-−]?\d[\d,]*(?:\.\d+)?%?/g)].map((match) => {
        const token = match[0];
        if (token.includes(",") && !/^[+\-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?$/.test(token)) {
            fail("numeric text: invalid thousands grouping");
        }
        return token.replaceAll(",", "").replace("−", "-");
    });
}
function clean(value) {
    return value.replaceAll("\\", "\\\\").replace(/[|<>\[\]*_`]/g, "\\$&");
}
function strictJson(raw) {
    if (raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
        fail("JSON: UTF-8 BOM not allowed");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    const stack = [];
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            const start = i;
            i++;
            for (; i < text.length; i++) {
                if (text[i] === "\\") {
                    i++;
                    continue;
                }
                if (text[i] === '"')
                    break;
            }
            if (i >= text.length)
                fail("JSON: unterminated string");
            const top = stack.at(-1);
            if (top?.kind === "object" && top.expectingKey) {
                const key = JSON.parse(text.slice(start, i + 1));
                const normalized = key.normalize("NFC").toLowerCase();
                if (top.keys.has(normalized))
                    fail(`JSON: duplicate or case-colliding key ${key}`);
                top.keys.add(normalized);
                top.expectingKey = false;
            }
            continue;
        }
        if (char === "{")
            stack.push({ kind: "object", keys: new Set(), expectingKey: true });
        else if (char === "[")
            stack.push({ kind: "array", keys: new Set(), expectingKey: false });
        else if (char === "}" || char === "]")
            stack.pop();
        else if (char === "," && stack.at(-1)?.kind === "object")
            stack.at(-1).expectingKey = true;
    }
    return JSON.parse(text);
}
function priceLine(data, sourceMap, names, ticker, market) {
    if (data.price === undefined)
        return "- 조회 시점 주가: 확인 불가 (검증된 공개 시세 없음)";
    if (!data.price || typeof data.price !== "object")
        fail("price: object required");
    const source = sourceMap.get(requiredText(data.price.source_id, "price.source_id", 64));
    if (!source)
        fail("price: unknown source");
    const invokedAt = instant(data.invoked_at, "invoked_at");
    const retrievedAt = instant(source.retrievedAt, "price capture.retrieved_at");
    const delay = Date.parse(retrievedAt) - Date.parse(invokedAt);
    if (delay < 0 || delay > 600_000)
        fail("price: capture must be within 10 minutes after invocation");
    if (source.publishedAt)
        fail("price: live quote source must not have a filing publication date");
    const endpoint = new URL(source.url);
    const document = strictJson(source.raw);
    if (!document || typeof document !== "object" || Array.isArray(document))
        fail("price: JSON object required");
    let detail;
    if (data.price.provider === "nasdaq") {
        if (!/^NASDAQ(?:-|$)/i.test(market) || endpoint.hostname !== "api.nasdaq.com" ||
            endpoint.pathname !== `/api/quote/${encodeURIComponent(ticker)}/info` ||
            endpoint.searchParams.get("assetclass") !== "stocks" || [...endpoint.searchParams].length !== 1) {
            fail("price: Nasdaq quote endpoint or market mismatch");
        }
        const stock = document.data;
        const quote = stock?.primaryData;
        if (!stock || !quote || stock.symbol !== ticker || stock.isNasdaqListed !== true ||
            !names.some((name) => requiredText(stock.companyName, "price company", 160).toLowerCase().includes(name.toLowerCase()))) {
            fail("price: Nasdaq company or symbol mismatch");
        }
        const value = requiredText(quote.lastSalePrice, "price value", 30);
        if (!/^\$(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/.test(value) || Number(value.slice(1).replaceAll(",", "")) <= 0) {
            fail("price: invalid Nasdaq last sale");
        }
        const marketTime = requiredText(quote.lastTradeTimestamp, "price market time", 80);
        const status = requiredText(stock.marketStatus, "price market status", 60);
        const timed = /^(?:Closed at )?([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM) ET$/.exec(marketTime);
        const dated = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(marketTime);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const match = timed ?? dated;
        if (!match || !months.includes(match[1]) || (dated && status !== "Closed") ||
            (timed && (Number(timed[4]) < 1 || Number(timed[4]) > 12 || Number(timed[5]) > 59))) {
            fail("price: invalid Nasdaq market time");
        }
        const quoteDay = day(`${match[3]}-${String(months.indexOf(match[1]) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`, "price market day");
        const exchangeDay = localDay(retrievedAt, "America/New_York");
        const age = Date.parse(`${exchangeDay}T00:00:00Z`) - Date.parse(`${quoteDay}T00:00:00Z`);
        if (age < 0 || age > 7 * 86_400_000)
            fail("price: Nasdaq quote date is future or stale");
        detail = `${value} USD · ${clean(status)} · ${timed ? "거래시각" : "거래일"} ${clean(marketTime)}${timed ? "" : " (시각 미제공)"}`;
    }
    else if (data.price.provider === "naver-kr") {
        if (!/^(?:KRX|KOSPI|KOSDAQ)$/i.test(market) || endpoint.hostname !== "m.stock.naver.com" ||
            endpoint.pathname !== `/api/stock/${encodeURIComponent(ticker)}/basic` || endpoint.search) {
            fail("price: Naver KR quote endpoint or market mismatch");
        }
        if (document.itemCode !== ticker)
            fail("price: Naver stock code mismatch");
        const listedName = requiredText(document.stockName, "price stock name", 120);
        const value = requiredText(document.closePrice, "price value", 30);
        if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value) || Number(value.replaceAll(",", "")) <= 0) {
            fail("price: invalid Naver displayed price");
        }
        const tradedAt = requiredText(document.localTradedAt, "price market time", 40);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/.test(tradedAt) ||
            !tradedAt.endsWith("+09:00") || !Number.isFinite(Date.parse(tradedAt)))
            fail("price: invalid Naver market time");
        day(tradedAt.slice(0, 10), "price market day");
        const quoteAge = Date.parse(retrievedAt) - Date.parse(tradedAt);
        if (quoteAge < -300_000 || quoteAge > 7 * 86_400_000)
            fail("price: Naver quote time is future or stale");
        const status = requiredText(document.marketStatus, "price market status", 40);
        const session = requiredText(document.marketSessionType, "price session", 40);
        detail = `${value} KRW · ${clean(listedName)} · ${clean(status)}/${clean(session)} · 거래표시 ${clean(tradedAt)}`;
    }
    else
        fail("price: unsupported provider");
    return `- 조회 시점 표시가: ${detail} · 수집 ${retrievedAt} [시세 출처](<${source.url}>)`;
}
function render(path) {
    const inputPath = (0, node_path_1.resolve)(path);
    const rawJson = (0, node_fs_1.readFileSync)(inputPath);
    if (rawJson.length > MAX_JSON)
        fail("input JSON: oversized");
    const data = strictJson(rawJson);
    if (!data || typeof data !== "object")
        fail("input JSON: object required");
    const asOf = day(data.as_of, "as_of");
    const company = data.company;
    if (!company || typeof company !== "object")
        fail("company: object required");
    const name = requiredText(company.name, "company.name", 120);
    const aliases = company.aliases === undefined ? [] : company.aliases;
    if (!Array.isArray(aliases) || aliases.length > 3)
        fail("company.aliases: at most three aliases required");
    const names = [name, ...aliases.map((alias) => requiredText(alias, "company.alias", 120))];
    if (new Set(names.map((item) => item.toLowerCase())).size !== names.length ||
        names.some((item) => item.length < 3))
        fail("company aliases: distinct names of at least three characters required");
    const identifiesCompany = (text) => names.some((item) => text.toLowerCase().includes(item.toLowerCase()));
    const ticker = requiredText(company.ticker, "company.ticker", 32);
    const market = requiredText(company.market, "company.market", 80);
    const identitySourceId = requiredText(company.evidence_source_id, "company.evidence_source_id", 64);
    if (!Array.isArray(data.sources) || data.sources.length > 30)
        fail("sources: array of at most 30 required");
    if (!data.sections || typeof data.sections !== "object" || Array.isArray(data.sections))
        fail("sections: object required");
    if (data.schedule !== undefined && (!Array.isArray(data.schedule) || data.schedule.length > 20)) {
        fail("schedule: array of at most 20 required");
    }
    const sectionKeys = new Set(sections.map(([key]) => key));
    if (Object.keys(data.sections).some((key) => !sectionKeys.has(key)))
        fail("sections: unknown category");
    const root = (0, node_path_1.dirname)(inputPath);
    const sourceMap = new Map();
    for (const source of data.sources) {
        if (!source || typeof source !== "object" || !ID.test(source.id) || sourceMap.has(source.id))
            fail("source id: canonical and unique required");
        const link = url(source.url);
        const publishedAt = source.published_at === undefined ? undefined : day(source.published_at, "source.published_at");
        if (publishedAt && publishedAt > asOf)
            fail(`${source.id}: source published after as_of`);
        const original = fileBytes(root, source.file, source.sha256);
        const captureBytes = fileBytes(root, source.capture_file, source.capture_sha256);
        const capture = strictJson(captureBytes);
        if (capture.url !== link || capture.sha256 !== source.sha256 || capture.bytes !== original.length) {
            fail(`${source.id}: capture metadata differs from source`);
        }
        let textBytes = original;
        if (source.text_file !== undefined || source.text_sha256 !== undefined) {
            if (!source.text_file || !source.text_sha256)
                fail(`${source.id}: text file and hash must be paired`);
            textBytes = fileBytes(root, source.text_file, source.text_sha256);
            const parsed = new URL(link);
            if (parsed.hostname === "dart.fss.or.kr" && parsed.pathname === "/report/viewer.do" &&
                !textBytes.equals(Buffer.from((0, dart_rows_1.extractDartRows)(original)))) {
                fail(`${source.id}: DART text extraction differs from captured HTML`);
            }
        }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(textBytes);
        if (publishedAt) {
            const quote = requiredText(source.published_date_quote, "source.published_date_quote", 60);
            if (!normalize(text).includes(quote) || sourceDate(quote) !== publishedAt) {
                fail(`${source.id}: publication date is not supported by saved source`);
            }
        }
        else if (source.published_date_quote !== undefined)
            fail(`${source.id}: date quote without publication date`);
        sourceMap.set(source.id, { url: link, text: normalize(text), raw: original, publishedAt, retrievedAt: capture.retrieved_at });
    }
    const identitySource = sourceMap.get(identitySourceId);
    if (!identitySource || names.some((item) => !identitySource.text.toLowerCase().includes(item.toLowerCase())) ||
        !containsTicker(identitySource.text, ticker))
        fail("company identity: name/ticker absent from source");
    for (const source of data.sources) {
        if (source.filing_index_source_id === undefined)
            continue;
        const child = sourceMap.get(source.id);
        const parentId = requiredText(source.filing_index_source_id, `${source.id}.filing_index_source_id`, 64);
        const parent = sourceMap.get(parentId);
        if (!parent || parentId === source.id || source.published_at !== undefined ||
            !parent.publishedAt || !identifiesCompany(parent.text) || !dartChildParent(child, parent)) {
            fail(`${source.id}: DART child is not bound to dated issuer filing and exact table of contents`);
        }
        child.publishedAt = parent.publishedAt;
    }
    const schedule = (data.schedule ?? []).map((event, index) => {
        const label = `schedule[${index}]`;
        if (!event || typeof event !== "object" || !["date", "range", "from"].includes(event.kind))
            fail(`${label}: valid kind required`);
        const start = day(event.start, `${label}.start`);
        const end = event.kind === "range" ? day(event.end, `${label}.end`) : undefined;
        if ((event.kind !== "range" && (event.end !== undefined || event.end_date_quote !== undefined)) ||
            (end && (end < start || end < asOf)) || (!end && start < asOf))
            fail(`${label}: inconsistent or past date`);
        const dateQuote = requiredText(event.date_quote, `${label}.date_quote`, 240);
        const endQuote = end === undefined || event.end_date_quote === undefined ? undefined : requiredText(event.end_date_quote, `${label}.end_date_quote`, 60);
        if (end && !endQuote) {
            const dates = compactRange(dateQuote, `${label}.date_quote`);
            if (dates[0] !== start || dates[1] !== end)
                fail(`${label}: range differs from source phrase`);
        }
        else {
            if (sourceDate(dateQuote, `${label}.date_quote`) !== start)
                fail(`${label}: start date differs from source phrase`);
            if (endQuote && sourceDate(endQuote, `${label}.end_date_quote`) !== end)
                fail(`${label}: end date differs from source phrase`);
        }
        if (end && end === start)
            fail(`${label}: one-day event needs kind date`);
        const labelText = requiredText(event.text, `${label}.text`, 240);
        if (numbers(labelText).length)
            fail(`${label}: put dates in start/end; event text must not contain numbers`);
        if (!Array.isArray(event.evidence) || event.evidence.length < 1 || event.evidence.length > 4)
            fail(`${label}: 1–4 evidence excerpts required`);
        let dateSupported = false;
        const links = [];
        const sourceIds = [];
        for (const item of event.evidence) {
            if (!item || typeof item !== "object")
                fail(`${label}: invalid evidence`);
            const source = sourceMap.get(item.source_id);
            if (!source || !source.publishedAt)
                fail(`${label}: dated source required`);
            if (!identifiesCompany(source.text) && !data.sources.find((entry) => entry.id === item.source_id)?.filing_index_source_id)
                fail(`${label}: evidence source does not identify the company`);
            const quote = excerpt(item.quote, `${label}.quote`);
            if (!source.text.includes(quote))
                fail(`${label}: excerpt absent from saved source`);
            if (quote.includes(dateQuote) && (!endQuote || quote.includes(endQuote)))
                dateSupported = true;
            if (!links.includes(source.url))
                links.push(source.url);
            sourceIds.push(item.source_id);
        }
        if (!dateSupported)
            fail(`${label}: date phrase absent from one evidence excerpt`);
        return { kind: event.kind, start, end, text: labelText, links, sourceIds };
    });
    const eventKeys = schedule.map((event) => `${event.kind}\u0000${event.start}\u0000${event.end ?? ""}\u0000${event.text}`);
    if (new Set(eventKeys).size !== eventKeys.length)
        fail("schedule: duplicate event");
    schedule.sort((a, b) => a.start.localeCompare(b.start) || (a.end ?? "").localeCompare(b.end ?? "") || a.text.localeCompare(b.text));
    const totalClaims = sections.reduce((count, [key]) => count + (Array.isArray(data.sections[key]) ? data.sections[key].length : 0), 0);
    if (totalClaims === 0 && schedule.length === 0)
        fail("analysis: at least one sourced claim or schedule event required");
    const lines = [`# ${clean(name)} (${clean(ticker)} · ${clean(market)}) — ${asOf}`];
    const financialClaims = data.sections.financials ?? [];
    const missingStatements = statements.filter(([id]) => !Array.isArray(financialClaims) ||
        !financialClaims.some((claim) => claim && claim.statement === id)).map(([, label]) => label);
    if (missingStatements.length)
        lines.push("", `> 간이 분석 — 검증된 ${missingStatements.join("·")} 자료 없음`);
    const used = new Set();
    const stockPrice = priceLine(data, sourceMap, names, ticker, market);
    if (data.price)
        used.add(data.price.source_id);
    for (const [key, title] of sections) {
        const claims = data.sections[key] ?? [];
        if (!Array.isArray(claims) || claims.length > 20)
            fail(`${key}: array of at most 20 required`);
        lines.push("", `## ${title}`, "");
        if (key === "company_snapshot")
            lines.push(stockPrice);
        if (key !== "financials" && key !== "catalyst_risk" && claims.length === 0) {
            if (key !== "company_snapshot")
                lines.push("확인된 내용 없음");
            continue;
        }
        if (key === "financials" && claims.some((claim) => !claim || typeof claim !== "object" || !statements.some(([id]) => id === claim.statement))) {
            fail("financials: each claim needs a valid statement (income, balance_sheet, cash_flow)");
        }
        const renderClaim = (claim) => {
            if (!claim || typeof claim !== "object")
                fail(`${key}: claim object required`);
            if (key !== "financials" && claim.statement !== undefined)
                fail(`${key}: statement only belongs in financials`);
            const statement = requiredText(claim.text, `${key}.text`, 600);
            if (!Array.isArray(claim.evidence) || claim.evidence.length < 1 || claim.evidence.length > 4)
                fail(`${key}: 1–4 evidence excerpts required`);
            const quoted = [];
            const links = [];
            for (const item of claim.evidence) {
                if (!item || typeof item !== "object")
                    fail(`${key}: invalid evidence`);
                const source = sourceMap.get(item.source_id);
                if (!source)
                    fail(`${key}: unknown source id`);
                if (!identifiesCompany(source.text) && !data.sources.find((entry) => entry.id === item.source_id)?.filing_index_source_id) {
                    fail(`${key}: evidence source does not identify the company`);
                }
                const quote = excerpt(item.quote, `${key}.quote`);
                if (!source.text.includes(quote))
                    fail(`${key}: excerpt absent from saved source ${item.source_id}`);
                quoted.push(quote);
                used.add(item.source_id);
                if (!links.includes(source.url))
                    links.push(source.url);
            }
            const tokens = numbers(statement);
            if (tokens.length) {
                if (claim.evidence.some((item) => !sourceMap.get(item.source_id)?.publishedAt)) {
                    fail(`${key}: numeric evidence requires a dated source`);
                }
                for (const field of ["period", "unit", "scope"])
                    requiredText(claim[field], `${key}.${field}`, 100);
                if (!quoted.some((quote) => quote.includes(normalize(statement)))) {
                    fail(`${key}: numeric statement must occur verbatim in one evidence excerpt`);
                }
                const supported = new Set(quoted.flatMap(numbers));
                if (tokens.some((token) => !supported.has(token)))
                    fail(`${key}: number absent from evidence excerpt`);
            }
            const detail = tokens.length ? ` (${clean(claim.period)} · ${clean(claim.unit)} · ${clean(claim.scope)})` : "";
            lines.push(`- ${clean(statement)}${detail} ${links.map((link, index) => `[출처 ${index + 1}](<${link}>)`).join(" ")}`);
        };
        if (key === "financials") {
            for (const [id, label] of statements) {
                lines.push(`### ${label}`, "");
                const related = claims.filter((claim) => claim.statement === id);
                if (related.length === 0)
                    lines.push("확인 불가 (검증된 자료 없음)");
                else
                    related.forEach(renderClaim);
                lines.push("");
            }
            lines.pop();
        }
        else {
            claims.forEach(renderClaim);
        }
        if (key === "catalyst_risk") {
            if (claims.length === 0)
                lines.push("확인된 내용 없음");
            lines.push("", "### 주요 일정", "");
            if (schedule.length === 0)
                lines.push("확정된 일정 없음");
            for (const event of schedule) {
                const dateText = shortDay(event.start, asOf) + (event.kind === "range" ? `~${shortDay(event.end, asOf)}` : event.kind === "from" ? "~" : "");
                lines.push(`- ${dateText} · ${clean(event.text)} ${event.links.map((link, index) => `[출처 ${index + 1}](<${link}>)`).join(" ")}`);
                event.sourceIds.forEach((id) => used.add(id));
            }
        }
    }
    lines.push("", "## 출처", "");
    if (used.size === 0)
        lines.push("확인된 출처 없음");
    for (const id of used) {
        const source = data.sources.find((item) => item.id === id);
        lines.push(`- [${clean(id)}](<${source.url}>) · 발표 ${sourceMap.get(id)?.publishedAt ?? "미상"} · SHA-256 ${source.sha256}`);
    }
    return lines.join("\n") + "\n";
}
try {
    if (process.argv.length !== 3)
        fail("usage: node scripts/evidence.js SNAPSHOT.json");
    const output = render(process.argv[2]);
    process.stdout.write(output);
}
catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write(`EVIDENCE_ERROR: ${message}\n`);
    process.exitCode = 1;
}
