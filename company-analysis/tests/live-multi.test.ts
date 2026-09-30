// Optional live smoke: run explicitly with Node 22.6+ from the skill directory.
// It creates temporary snapshots and removes them after each company.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const capture = resolve(__dirname, "../scripts/fetch-public.js");
const evidence = resolve(__dirname, "../scripts/evidence.js");
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const categories = ["company_snapshot", "business", "recent", "financials", "earnings", "catalyst_risk"];
const headings = ["요약", "주요 사업 · 산업 · 경쟁구도", "최근 사업 현황", "재무제표 분석", "실적발표 분석", "Catalyst & Risk", "출처"];
const cases = [
  { name: "Apple Inc.", ticker: "AAPL", market: "NASDAQ",
    identity: "https://data.sec.gov/submissions/CIK0000320193.json",
    release: "https://www.apple.com/newsroom/2026/07/apple-reports-third-quarter-results/",
    quoteUrl: "https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks", provider: "nasdaq",
    date: "2026-07-30", claim: "quarterly revenue of $109.4 billion", period: "FY2026 Q3", unit: "USD billion", scope: "company" },
  { name: "Microsoft", ticker: "MSFT", market: "NASDAQ",
    identity: "https://www.microsoft.com/en-us/investor/earnings/fy-2026-q4/press-release-webcast",
    release: "https://www.microsoft.com/en-us/investor/earnings/fy-2026-q4/press-release-webcast",
    quoteUrl: "https://api.nasdaq.com/api/quote/MSFT/info?assetclass=stocks", provider: "nasdaq",
    date: "2026-07-29", claim: "Revenue was $90.0 billion", period: "FY2026 Q4", unit: "USD billion", scope: "company" },
  { name: "Samsung Electronics", ticker: "005930", market: "KRX",
    identity: "https://www.samsung.com/global/ir/stock-information/listing-Info/",
    release: "https://news.samsung.com/global/samsung-electronics-announces-second-quarter-2026-results",
    quoteUrl: "https://m.stock.naver.com/api/stock/005930/basic", provider: "naver-kr",
    date: "2026-07-30", claim: "KRW 171.5 trillion in consolidated revenue", period: "2026 Q2", unit: "KRW trillion", scope: "consolidated" },
] as const;

for (const company of cases) {
  test(`live source and repeatable form: ${company.name}`, { timeout: 60_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "company-analysis-live-"));
    try {
      mkdirSync(join(root, "sources"));
      const sources = [];
      for (const [id, url, publishedAt] of [
        ["identity", company.identity, undefined], ["release", company.release, company.date],
      ] as const) {
        const out = join(root, "sources", id);
        const fetched = spawnSync(process.execPath, [capture, url, out], { encoding: "utf8", timeout: 25_000 });
        assert.equal(fetched.status, 0, fetched.stderr);
        const raw = readFileSync(join(out, "raw"));
        const metadata = readFileSync(join(out, "capture.json"));
        const manifest = JSON.parse(metadata.toString("utf8"));
        sources.push({ id, url: manifest.url, published_at: publishedAt,
          published_date_quote: publishedAt ? `${publishedAt === "2026-07-29" ? "July 29, 2026" : "July 30, 2026"}` : undefined,
          file: `sources/${id}/raw`, sha256: sha(raw),
          capture_file: `sources/${id}/capture.json`, capture_sha256: sha(metadata) });
        if (id === "identity") {
          assert.ok(raw.toString("utf8").toLowerCase().includes(company.name.toLowerCase()));
          assert.ok(raw.toString("utf8").includes(company.ticker));
        } else assert.ok(raw.toString("utf8").includes(company.claim));
      }
      const invokedAt = new Date().toISOString();
      const quoteOut = join(root, "sources", "price");
      const fetchedPrice = spawnSync(process.execPath, [capture, company.quoteUrl, quoteOut], { encoding: "utf8", timeout: 25_000 });
      assert.equal(fetchedPrice.status, 0, fetchedPrice.stderr);
      const quoteRaw = readFileSync(join(quoteOut, "raw"));
      const quoteCapture = readFileSync(join(quoteOut, "capture.json"));
      sources.push({ id: "price", url: JSON.parse(quoteCapture.toString("utf8")).url, published_at: undefined,
        published_date_quote: undefined,
        file: "sources/price/raw", sha256: sha(quoteRaw),
        capture_file: "sources/price/capture.json", capture_sha256: sha(quoteCapture) });
      const sections: Record<string, unknown[]> = Object.fromEntries(categories.map((name) => [name, []]));
      sections.earnings = [{ text: company.claim, period: company.period, unit: company.unit, scope: company.scope,
        evidence: [{ source_id: "release", quote: company.claim }] }];
      const snapshot = { company: { name: company.name, ticker: company.ticker, market: company.market,
        evidence_source_id: "identity" }, as_of: new Date().toISOString().slice(0, 10), invoked_at: invokedAt,
        price: { source_id: "price", provider: company.provider }, sources, sections };
      const path = join(root, "snapshot.json");
      writeFileSync(path, JSON.stringify(snapshot));
      const run = () => spawnSync(process.execPath, [evidence, path], { encoding: "utf8" });
      const first = run(), second = run();
      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      assert.equal(first.stdout, second.stdout);
      assert.deepEqual([...first.stdout.matchAll(/^## (.+)$/gm)].map((match) => match[1]), headings);
      assert.ok(first.stdout.includes(company.claim));
      assert.match(first.stdout, /조회 시점 표시가: .*수집 .*시세 출처/);
      sections.earnings = [{ text: company.claim.replace(/\d+(?:\.\d+)?/, "999999"), period: company.period,
        unit: company.unit, scope: company.scope, evidence: [{ source_id: "release", quote: company.claim }] }];
      writeFileSync(path, JSON.stringify(snapshot));
      const altered = run();
      assert.notEqual(altered.status, 0);
      assert.equal(altered.stdout, "");
      sections.earnings = [{ text: company.claim, period: company.period, unit: company.unit, scope: company.scope,
        evidence: [{ source_id: "release", quote: company.claim }] }];
      const wrongSecurity = JSON.parse(quoteRaw.toString("utf8"));
      if (company.provider === "nasdaq") wrongSecurity.data.symbol = "WRONG";
      else wrongSecurity.itemCode = "000000";
      const wrongRaw = Buffer.from(JSON.stringify(wrongSecurity));
      const wrongCapture = JSON.parse(quoteCapture.toString("utf8"));
      wrongCapture.sha256 = sha(wrongRaw);
      wrongCapture.bytes = wrongRaw.length;
      const wrongCaptureBytes = Buffer.from(JSON.stringify(wrongCapture));
      writeFileSync(join(quoteOut, "raw"), wrongRaw);
      writeFileSync(join(quoteOut, "capture.json"), wrongCaptureBytes);
      const priceSource = sources.find((source) => source.id === "price");
      assert.ok(priceSource);
      priceSource.sha256 = sha(wrongRaw);
      priceSource.capture_sha256 = sha(wrongCaptureBytes);
      writeFileSync(path, JSON.stringify(snapshot));
      const swappedSecurity = run();
      assert.notEqual(swappedSecurity.status, 0);
      assert.equal(swappedSecurity.stdout, "");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
