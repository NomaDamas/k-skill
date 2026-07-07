const KR_WHOIS_DOMAIN_URL = "https://apis.data.go.kr/B551505/whois/domain_name";

function trimOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeKrWhoisDomainQuery(query = {}) {
  const domain = trimOrNull(query.domain ?? query.query ?? query.q);
  if (!domain) {
    throw new Error("Provide domain.");
  }
  const normalized = domain.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9가-힣.-]+\.(?:kr|한국)$/u.test(normalized)) {
    throw new Error("Provide a .kr or .한국 domain.");
  }
  if (normalized.includes("..") || normalized.startsWith(".") || normalized.endsWith(".")) {
    throw new Error("Provide a valid domain.");
  }
  return { query: normalized, answer: "json" };
}

function isKrWhoisGatewayError(text) {
  return text.includes("<OpenAPI_ServiceResponse") || text.includes("SERVICE KEY IS NOT REGISTERED");
}

async function proxyKrWhoisDomainRequest({ params, serviceKey, fetchImpl = global.fetch }) {
  if (!serviceKey) {
    return {
      statusCode: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_not_configured",
        message: "DATA_GO_KR_API_KEY is not configured on the proxy server."
      })
    };
  }

  const url = new URL(KR_WHOIS_DOMAIN_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("query", params.query);
  url.searchParams.set("answer", params.answer);

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  if (isKrWhoisGatewayError(body)) {
    return {
      statusCode: 502,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: "upstream_forbidden",
        message: "WHOIS upstream rejected the request. The proxy key may not be approved for service 15094277."
      })
    };
  }
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
    body
  };
}

module.exports = {
  KR_WHOIS_DOMAIN_URL,
  normalizeKrWhoisDomainQuery,
  proxyKrWhoisDomainRequest
};
