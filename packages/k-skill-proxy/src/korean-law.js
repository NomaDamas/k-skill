// k-skill-proxy wrapper for the official 법제처 (Korea Ministry of Government
// Legislation) Open API "공동활용" DRF endpoints.
//
// Design notes:
// - Mirrors the read-only legal-info surface that chrisryugj/korean-law-mcp
//   wraps (https://github.com/chrisryugj/korean-law-mcp), but exposes it as a
//   hosted REST proxy so skills do not need a per-user OC key or a local CLI.
// - The OC identifier is injected server-side from the LAW_OC secret. It is the
//   only credential the upstream needs.
// - law.go.kr rejects requests that lack a browser User-Agent / Referer with a
//   "사용자 정보 검증에 실패" body even when the OC is valid. We always inject
//   both headers (overridable via LAW_USER_AGENT / LAW_REFERER).
// - law.go.kr also intermittently answers 200 with an empty body or an HTML
//   maintenance page; we retry those as transient failures.
// - Read-only: only lawSearch.do (list/search) and lawService.do (detail/body)
//   are reachable. No mutation surface exists in the upstream API.

const KOREAN_LAW_API_BASE_URL = "https://www.law.go.kr/DRF";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_REFERER = "https://www.law.go.kr/";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 300;

// Read-only legal-info targets we are willing to proxy.
const ALLOWED_TARGETS = new Set([
  "law", // 현행법령
  "eflaw", // 시행일 법령
  "elaw", // 영문법령
  "prec", // 판례
  "detc", // 헌재결정례
  "expc", // 법령해석례 (유권해석)
  "admrul", // 행정규칙
  "ordin", // 자치법규
  "trty", // 조약
  "lstrm", // 법령용어
  "lsHstInf" // 법령 연혁
]);

const ALLOWED_TYPES = new Set(["JSON", "XML", "HTML"]);

// Pass-through query params for lawSearch.do (list/search).
const SEARCH_PASSTHROUGH_PARAMS = [
  "query",
  "search",
  "display",
  "page",
  "sort",
  "date",
  "prncYd",
  "nb",
  "datSrcNm",
  "curt",
  "org",
  "knd",
  "gana",
  "nw",
  "efYd",
  "ancYd"
];

// Pass-through query params for lawService.do (detail/body).
const DETAIL_PASSTHROUGH_PARAMS = ["ID", "MST", "LID", "LM", "JO", "LANG", "chrClsCd", "ancYnChk"];

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function buildError({ message, statusCode, code }) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeTarget(query) {
  const target = trimOrNull(query.target);
  if (!target) {
    throw buildError({
      message: "target is required (e.g. law, prec, expc, admrul, ordin).",
      statusCode: 400,
      code: "bad_request"
    });
  }
  if (!ALLOWED_TARGETS.has(target)) {
    throw buildError({
      message: `Unsupported target "${target}". Allowed: ${[...ALLOWED_TARGETS].join(", ")}.`,
      statusCode: 400,
      code: "bad_request"
    });
  }
  return target;
}

function normalizeType(query) {
  const raw = trimOrNull(query.type);
  if (!raw) {
    return "JSON";
  }
  const upper = raw.toUpperCase();
  if (!ALLOWED_TYPES.has(upper)) {
    throw buildError({
      message: `Unsupported type "${raw}". Allowed: ${[...ALLOWED_TYPES].join(", ")}.`,
      statusCode: 400,
      code: "bad_request"
    });
  }
  return upper;
}

function collectPassthrough(query, allowedKeys) {
  const params = {};
  for (const key of allowedKeys) {
    const value = trimOrNull(query[key]);
    if (value !== null) {
      params[key] = value;
    }
  }
  return params;
}

function normalizeKoreanLawSearchQuery(query = {}) {
  const target = normalizeTarget(query);
  const type = normalizeType(query);
  const params = collectPassthrough(query, SEARCH_PASSTHROUGH_PARAMS);

  if (!params.query && !params.search && !params.nb && !params.datSrcNm) {
    throw buildError({
      message: "A search query is required (provide query, nb, or datSrcNm).",
      statusCode: 400,
      code: "bad_request"
    });
  }

  return { target, type, params };
}

function normalizeKoreanLawDetailQuery(query = {}) {
  const target = normalizeTarget(query);
  const type = normalizeType(query);
  const params = collectPassthrough(query, DETAIL_PASSTHROUGH_PARAMS);

  if (!params.ID && !params.MST && !params.LID) {
    throw buildError({
      message: "A detail identifier is required (provide ID, MST, or LID).",
      statusCode: 400,
      code: "bad_request"
    });
  }

  return { target, type, params };
}

function buildKoreanLawUrl({ endpoint, target, type, params, oc }) {
  const path = endpoint === "detail" ? "lawService.do" : "lawSearch.do";
  const url = new URL(`${KOREAN_LAW_API_BASE_URL}/${path}`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", target);
  url.searchParams.set("type", type);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function looksLikeHtml(body, contentType) {
  if (contentType.includes("text/html")) {
    return true;
  }
  return /^\s*<(?:!doctype|html)\b/i.test(body);
}

function isUserVerificationFailure(body) {
  return /사용자\s*정보\s*검증|검증에\s*실패|IP주소\s*및\s*도메인/.test(body);
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchKoreanLaw(url, { userAgent, referer, fetchImpl = global.fetch, sleep = delay, expectJson = true } = {}) {
  const headers = {
    "User-Agent": userAgent || DEFAULT_USER_AGENT,
    Referer: referer || DEFAULT_REFERER,
    Accept: expectJson ? "application/json, text/plain, */*" : "*/*"
  };

  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      const body = await response.text();
      const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
      const trimmed = body.trim();

      if (!response.ok) {
        return { statusCode: response.status, contentType, body };
      }

      const transientEmpty = trimmed === "";
      const transientHtml = expectJson && looksLikeHtml(trimmed, contentType);
      if (transientEmpty || transientHtml) {
        lastError = buildError({
          message: "law.go.kr returned an empty or HTML maintenance response.",
          statusCode: 502,
          code: "upstream_unstable"
        });
      } else {
        return { statusCode: 200, contentType, body };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(RETRY_BACKOFF_MS * (attempt + 1));
    }
  }

  throw (
    lastError ||
    buildError({
      message: "law.go.kr request failed.",
      statusCode: 502,
      code: "upstream_error"
    })
  );
}

async function proxyKoreanLawRequest({
  endpoint,
  normalized,
  oc,
  userAgent = null,
  referer = null,
  fetchImpl = global.fetch,
  sleep = delay
}) {
  if (!oc) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "LAW_OC is not configured on the proxy server."
      })
    };
  }

  const url = buildKoreanLawUrl({
    endpoint,
    target: normalized.target,
    type: normalized.type,
    params: normalized.params,
    oc
  });

  try {
    const result = await fetchKoreanLaw(url, {
      userAgent,
      referer,
      fetchImpl,
      sleep,
      expectJson: normalized.type === "JSON"
    });

    if (result.statusCode >= 200 && result.statusCode < 300 && isUserVerificationFailure(result.body)) {
      return {
        statusCode: 502,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: "law_user_verification_failed",
          message:
            "law.go.kr rejected the proxy request (사용자 정보 검증 실패). Check LAW_OC and the LAW_USER_AGENT/LAW_REFERER headers on the proxy server."
        })
      };
    }

    return result;
  } catch (error) {
    return {
      statusCode: error.statusCode && error.statusCode >= 400 ? error.statusCode : 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: error.code || "proxy_error",
        message: error.message
      })
    };
  }
}

module.exports = {
  KOREAN_LAW_API_BASE_URL,
  DEFAULT_USER_AGENT,
  DEFAULT_REFERER,
  ALLOWED_TARGETS,
  ALLOWED_TYPES,
  buildKoreanLawUrl,
  fetchKoreanLaw,
  isUserVerificationFailure,
  normalizeKoreanLawDetailQuery,
  normalizeKoreanLawSearchQuery,
  proxyKoreanLawRequest
};
