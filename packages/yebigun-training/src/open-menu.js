const { APPLICATION_MENUS, TRAINING_INFO_URL } = require("./menus");
const { inspectYebigunPage } = require("./parse");

function findButtonByLabel(buttonLabel) {
  const candidates = [...document.querySelectorAll("button, a")];
  const target = candidates.find((el) => (el.textContent || "").trim() === buttonLabel);
  if (!target) {
    return false;
  }
  target.click();
  return true;
}

async function openApplicationMenuPage(page, menu) {
  const menuDef = APPLICATION_MENUS[menu];
  if (!menuDef) {
    throw new Error(`Unknown menu "${menu}". Valid options: ${Object.keys(APPLICATION_MENUS).join(", ")}`);
  }

  if (menuDef.mode === "click") {
    await openApplicationMenuByClick(page, menuDef);
  } else {
    await openApplicationMenuByGoto(page, menuDef);
  }

  const url = page.url();
  const title = await page.title().catch(() => null);
  return { menu, label: menuDef.label, url, title, pageInfo: { pageType: "opened", reloginRequired: false, reason: null } };
}

async function openApplicationMenuByClick(page, menuDef) {
  await page.goto(TRAINING_INFO_URL, { waitUntil: "domcontentloaded" });

  const beforeUrl = page.url();
  const beforeHtml = await contentWithRetry(page);
  const beforeInfo = inspectYebigunPage({ url: beforeUrl, html: beforeHtml });
  if (beforeInfo.reloginRequired) {
    throw new Error("yebigun1.mil.kr session is not authenticated or has expired. Ask the user to log in again in the same Chrome profile.");
  }

  const clicked = await page.evaluate(findButtonByLabel, menuDef.label).catch((error) => {
    if (/context was destroyed|navigation/i.test(error.message || "")) {
      return true;
    }
    throw error;
  });

  if (!clicked) {
    throw new Error(`Could not find the "${menuDef.label}" button on the training-info page. The page structure may have changed — re-verify with \`inspect\`.`);
  }

  await waitForNavigationSignal(page, beforeUrl, menuDef.label);
}

async function openApplicationMenuByGoto(page, menuDef) {
  await page.goto(resolveTargetUrl(menuDef.path), { waitUntil: "domcontentloaded" });
  if (/login|lgn/i.test(page.url())) {
    throw new Error("yebigun1.mil.kr session is not authenticated or has expired. Ask the user to log in again in the same Chrome profile.");
  }
}

async function waitForNavigationSignal(page, beforeUrl, label) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const afterUrl = page.url();
  const afterTitle = await page.title().catch(() => "");
  if (afterUrl !== beforeUrl || afterTitle === label || (afterTitle && !/훈련정보/.test(afterTitle))) {
    return;
  }
  throw new Error(`The "${label}" screen did not open after clicking its button. Re-check the page with \`inspect\`.`);
}

async function contentWithRetry(page, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.content();
    } catch (error) {
      if (attempt === attempts - 1 || !/navigating/i.test(error.message || "")) {
        throw error;
      }
      await page.waitForTimeout(200);
    }
  }
  throw new Error("Unreachable");
}

function resolveTargetUrl(targetPath) {
  if (/^https?:\/\//i.test(targetPath)) {
    return targetPath;
  }
  return `https://www.yebigun1.mil.kr${targetPath.startsWith("/") ? "" : "/"}${targetPath}`;
}

module.exports = {
  contentWithRetry,
  openApplicationMenuPage,
  resolveTargetUrl,
};
