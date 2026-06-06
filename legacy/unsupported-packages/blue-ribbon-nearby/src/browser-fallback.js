/**
 * Browser-based fallback for Blue Ribbon nearby search.
 *
 * bluer.co.kr이 자동화 접근을 차단(403)할 때, rebrowser-playwright + stealth 패치로
 * 실제 Chrome 브라우저를 통해 zone 카탈로그와 nearby 검색 결과를 가져온다.
 *
 * 조건:
 * - rebrowser-playwright가 설치되어 있어야 한다 (optional dependency)
 * - Google Chrome이 시스템에 설치되어 있어야 한다
 * - headed 모드 (디스플레이 필요)
 *
 * 사용:
 *   const { browserFetchZoneCatalog, browserFetchNearby } = require("./browser-fallback");
 *   const html = await browserFetchZoneCatalog();
 *   const json = await browserFetchNearby(params);
 */

const BASE_URL = "https://www.bluer.co.kr";
const SEARCH_ZONE_URL = `${BASE_URL}/search/zone`;
const RESTAURANTS_MAP_URL = `${BASE_URL}/restaurants/map`;

let _chromium = null;

async function loadChromium() {
  if (_chromium) return _chromium;

  try {
    const mod = await import("rebrowser-playwright");
    _chromium = mod.chromium;
    return _chromium;
  } catch {
    throw new Error(
      "rebrowser-playwright가 설치되어 있지 않습니다. " +
      "브라우저 fallback을 사용하려면: npm install rebrowser-playwright"
    );
  }
}

async function createStealthContext(chromium) {
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox"
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
    extraHTTPHeaders: {
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });

  await context.addInitScript(() => {
    delete Object.getPrototypeOf(navigator).webdriver;

    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        PlatformOs: { MAC: "mac", WIN: "win", ANDROID: "android", CROS: "cros", LINUX: "linux" },
        PlatformArch: { ARM: "arm", X86_32: "x86-32", X86_64: "x86-64" }
      };
    }

    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const arr = [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
          { name: "Native Client", filename: "internal-nacl-plugin", description: "" }
        ];
        arr.__proto__ = PluginArray.prototype;
        return arr;
      }
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["ko-KR", "ko", "en-US", "en"]
    });

    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });

  return { browser, context };
}

/**
 * 브라우저로 zone 카탈로그 HTML을 가져온다.
 * @returns {Promise<string>} /search/zone 페이지의 HTML
 */
async function browserFetchZoneCatalog() {
  const chromium = await loadChromium();
  const { browser, context } = await createStealthContext(chromium);

  try {
    const page = await context.newPage();
    const response = await page.goto(SEARCH_ZONE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    if (!response || !response.ok()) {
      throw new Error(`zone 카탈로그 요청 실패: HTTP ${response?.status()}`);
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * 브라우저로 nearby 검색 JSON을 가져온다.
 * @param {Object} params - URL search params (distance, isAround, ribbon, etc.)
 * @returns {Promise<Object>} nearby 검색 결과 JSON
 */
async function browserFetchNearby(params) {
  const chromium = await loadChromium();
  const { browser, context } = await createStealthContext(chromium);

  try {
    const page = await context.newPage();

    // zone 페이지를 먼저 방문하여 세션 쿠키와 CSRF 토큰 획득
    await page.goto(SEARCH_ZONE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // CSRF 토큰 추출
    const csrf = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="_csrf"]');
      return meta ? meta.getAttribute("content") : null;
    });

    if (!csrf) {
      throw new Error("CSRF 토큰을 찾을 수 없습니다.");
    }

    // nearby API를 page context에서 fetch로 호출 (same-origin 쿠키 자동 전송)
    const url = new URL(RESTAURANTS_MAP_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const result = await page.evaluate(async ({ apiUrl, csrfToken }) => {
      const response = await fetch(apiUrl, {
        headers: {
          "accept": "application/json, text/plain;q=0.9,*/*;q=0.8",
          "x-requested-with": "XMLHttpRequest",
          "x-csrf-token": csrfToken
        },
        credentials: "same-origin"
      });

      if (!response.ok) {
        return { error: true, status: response.status, text: await response.text().catch(() => "") };
      }

      return response.json();
    }, { apiUrl: url.toString(), csrfToken: csrf });

    if (result.error) {
      throw new Error(`nearby API 요청 실패: HTTP ${result.status}`);
    }

    return result;
  } finally {
    await browser.close();
  }
}

/**
 * 브라우저 fallback이 사용 가능한지 확인한다.
 * @returns {boolean}
 */
function isBrowserFallbackAvailable() {
  try {
    require.resolve("rebrowser-playwright");
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  browserFetchNearby,
  browserFetchZoneCatalog,
  isBrowserFallbackAvailable
};
