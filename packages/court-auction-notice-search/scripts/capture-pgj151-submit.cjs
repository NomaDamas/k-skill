"use strict";

/**
 * Discovery script — capture the canonical PGJ151 search request body and a
 * representative successful response from a real browser submission.
 *
 * Why: courtauction.go.kr uses an aggressive WAF that returns HTTP 400 to
 * direct fetch calls when the session has not been warmed up by a real
 * browser. The only reliable way to capture a ground-truth request body
 * is to drive the live page with Playwright and click the actual 검색 button.
 *
 * Output:
 *   - The exact JSON body the WebSquare submission posts to
 *     /pgj/pgjsearch/searchControllerMain.on
 *   - The HTTP 200 response body (truncated preview).
 *
 * Usage:
 *   node packages/court-auction-notice-search/scripts/capture-pgj151-submit.cjs
 *
 * Slow-by-design: one search per run, default headless. Do NOT loop this script.
 */

const { chromium } = require("playwright-core");

const URL_BASE = "https://www.courtauction.go.kr";
const PGJ151 = `${URL_BASE}/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151F00.xml&pgjId=151F00`;

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  const captures = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/pgj/") && req.method() === "POST" && url.endsWith(".on")) {
      let postData = null;
      try { postData = req.postData(); } catch {}
      captures.push({ kind: "req", url, postData });
    }
  });
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("/pgj/") && url.endsWith(".on") && resp.request().method() === "POST") {
      try {
        const body = await resp.text();
        captures.push({ kind: "resp", url, status: resp.status(), bodyPreview: body.slice(0, 6000) });
      } catch {}
    }
  });

  console.log("[1] Goto PGJ151F00");
  await page.goto(PGJ151, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(7000);
  const initialCount = captures.length;

  console.log("[2] Click input[type=button][value=검색] (id=mf_wfm_mainFrame_btn_gdsDtlSrch)");
  const btn = page.locator('input[type="button"][value="검색"]').first();
  await btn.click({ timeout: 5000 }).catch((e) => console.log("  click err:", e.message));
  await page.waitForTimeout(8000);

  console.log("\n=== POST-CLICK CAPTURES (filter to searchControllerMain) ===");
  const newCaptures = captures.slice(initialCount);
  const interesting = newCaptures.filter((c) => c.url.includes("searchControllerMain"));
  for (const c of interesting) {
    if (c.kind === "req") {
      console.log("\n[REQUEST BODY]");
      try {
        console.log(JSON.stringify(JSON.parse(c.postData), null, 2));
      } catch {
        console.log(c.postData);
      }
    } else {
      console.log(`\n[RESPONSE ${c.status}]`);
      console.log(c.bodyPreview.slice(0, 2500));
    }
  }

  if (interesting.length === 0) {
    console.log("\nNo searchControllerMain capture observed. Site may have rate-limited this IP.");
  }

  await browser.close();
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
