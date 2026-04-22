const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNaverNewsSearchUrl,
  normalizeNaverNewsSearchQuery,
  normalizeNaverNewsSearchPayload
} = require("../src/naver-news");
const { buildServer } = require("../src/server");

test("normalizeNaverNewsSearchQuery validates q/query and clamps display/start/sort", () => {
  assert.throws(() => normalizeNaverNewsSearchQuery({}), /Provide q\/query/);
  assert.throws(() => normalizeNaverNewsSearchQuery({ q: "" }), /Provide q\/query/);
  assert.throws(() => normalizeNaverNewsSearchQuery({ q: "   " }), /Provide q\/query/);
  assert.throws(() => normalizeNaverNewsSearchQuery({ q: "a" }), /at least 2/);

  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ query: "  인공지능  ", display: "999", start: "1", sort: "date" }),
    {
      query: "인공지능",
      display: 100,
      start: 1,
      sort: "date"
    }
  );

  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ query: "주식", display: "1", start: "9999", sort: "date" }),
    {
      query: "주식",
      display: 1,
      start: 1000,
      sort: "date"
    }
  );

  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ q: "삼성전자" }),
    {
      query: "삼성전자",
      display: 10,
      start: 1,
      sort: "sim"
    }
  );

  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ q: "정부", display: "0", start: "0", sort: "UNKNOWN" }),
    {
      query: "정부",
      display: 1,
      start: 1,
      sort: "sim"
    }
  );

  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ q: "대한민국", display: "-5", start: "-1" }),
    {
      query: "대한민국",
      display: 1,
      start: 1,
      sort: "sim"
    }
  );
});

test("normalizeNaverNewsSearchQuery accepts keyword as an alias for q/query", () => {
  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ keyword: "스타트업" }),
    {
      query: "스타트업",
      display: 10,
      start: 1,
      sort: "sim"
    }
  );

  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ keyword: "반도체", display: "20", start: "5", sort: "date" }),
    {
      query: "반도체",
      display: 20,
      start: 5,
      sort: "date"
    }
  );
});

test("normalizeNaverNewsSearchQuery rejects start+display combinations exceeding Naver's 1000-item window", () => {
  // Boundary values that are still valid (start + display - 1 === 1000 or below) must pass.
  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ q: "경계", start: "1000", display: "1" }),
    { query: "경계", display: 1, start: 1000, sort: "sim" }
  );
  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ q: "경계", start: "901", display: "100" }),
    { query: "경계", display: 100, start: 901, sort: "sim" }
  );
  assert.deepEqual(
    normalizeNaverNewsSearchQuery({ q: "경계", start: "500", display: "100" }),
    { query: "경계", display: 100, start: 500, sort: "sim" }
  );

  // One past the boundary (start + display - 1 > 1000) must throw preflight 400.
  assert.throws(
    () => normalizeNaverNewsSearchQuery({ q: "초과", start: "902", display: "100" }),
    /1000-item|window|Naver/i
  );
  assert.throws(
    () => normalizeNaverNewsSearchQuery({ q: "초과", start: "1000", display: "2" }),
    /1000-item|window|Naver/i
  );
  assert.throws(
    () => normalizeNaverNewsSearchQuery({ q: "초과", start: "1000", display: "100" }),
    /1000-item|window|Naver/i
  );
  assert.throws(
    () => normalizeNaverNewsSearchQuery({ q: "초과", start: "950", display: "60" }),
    /1000-item|window|Naver/i
  );
});

test("buildNaverNewsSearchUrl constructs the official Naver Search news endpoint URL", () => {
  const url = buildNaverNewsSearchUrl({
    query: "인공지능",
    display: 10,
    start: 1,
    sort: "sim"
  });
  assert.equal(url.hostname, "openapi.naver.com");
  assert.equal(url.pathname, "/v1/search/news.json");
  assert.equal(url.searchParams.get("query"), "인공지능");
  assert.equal(url.searchParams.get("display"), "10");
  assert.equal(url.searchParams.get("start"), "1");
  assert.equal(url.searchParams.get("sort"), "sim");

  const dateUrl = buildNaverNewsSearchUrl({
    query: "삼성전자",
    display: 30,
    start: 20,
    sort: "date"
  });
  assert.equal(dateUrl.searchParams.get("sort"), "date");
  assert.equal(dateUrl.searchParams.get("display"), "30");
  assert.equal(dateUrl.searchParams.get("start"), "20");
});

test("normalizeNaverNewsSearchPayload maps Naver API items, strips <b> tags and decodes entities", () => {
  const result = normalizeNaverNewsSearchPayload(
    {
      lastBuildDate: "Mon, 26 Sep 2016 11:01:35 +0900",
      total: 2566589,
      start: 1,
      display: 2,
      items: [
        {
          title: "국내 <b>주식</b>형펀드서 사흘째 자금 순유출",
          originallink: "http://app.yonhapnews.co.kr/YNA/Basic/SNS/r.aspx?c=AKR20160926019000008",
          link: "http://openapi.naver.com/l?AAAC2NSw",
          description: "국내 <b>주식</b>형 펀드에서 사흘째 자금이 &quot;빠져나갔다&quot;. 26일 금융투자협회에 따르면 지난 22일 상장지수펀드(ETF)를 제외한 국내 <b>주식</b>형 펀드에서 126억원이 순유출...",
          pubDate: "Mon, 26 Sep 2016 07:50:00 +0900"
        },
        {
          title: "두 번째 &amp; <b>기사</b> 제목",
          originallink: "",
          link: "https://news.naver.com/main/read.nhn?oid=001&aid=000",
          description: "두 번째 기사 본문 요약...",
          pubDate: "Mon, 26 Sep 2016 07:00:00 +0900"
        }
      ]
    },
    { query: "주식", display: 10, start: 1, sort: "sim" }
  );

  assert.equal(result.items.length, 2);

  const first = result.items[0];
  assert.equal(first.rank, 1);
  assert.equal(first.title, "국내 주식형펀드서 사흘째 자금 순유출");
  assert.equal(first.original_link, "http://app.yonhapnews.co.kr/YNA/Basic/SNS/r.aspx?c=AKR20160926019000008");
  assert.equal(first.link, "http://openapi.naver.com/l?AAAC2NSw");
  assert.match(first.description, /국내 주식형 펀드에서 사흘째 자금이 "빠져나갔다"/);
  assert.doesNotMatch(first.description, /<b>/);
  assert.equal(first.pub_date, "Mon, 26 Sep 2016 07:50:00 +0900");
  assert.equal(first.pub_date_iso, "2016-09-25T22:50:00.000Z");
  assert.equal(first.source, "naver-openapi");

  const second = result.items[1];
  assert.equal(second.rank, 2);
  assert.equal(second.title, "두 번째 & 기사 제목");
  assert.equal(second.original_link, null);
  assert.equal(second.link, "https://news.naver.com/main/read.nhn?oid=001&aid=000");

  assert.equal(result.meta.query, "주식");
  assert.equal(result.meta.extraction, "naver-openapi");
  assert.equal(result.meta.item_count, 2);
  assert.equal(result.meta.total, 2566589);
  assert.equal(result.meta.start, 1);
  assert.equal(result.meta.display, 2);
  assert.equal(result.meta.last_build_date, "Mon, 26 Sep 2016 11:01:35 +0900");
  assert.equal(result.meta.sort, "sim");
});

test("normalizeNaverNewsSearchPayload skips items without title or link and deduplicates by link", () => {
  const result = normalizeNaverNewsSearchPayload(
    {
      lastBuildDate: "Mon, 22 Apr 2026 00:00:00 +0900",
      total: 3,
      start: 1,
      display: 3,
      items: [
        {
          title: "정상 기사",
          originallink: "https://news.example.com/1",
          link: "https://n.news.naver.com/mnews/article/1",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "",
          originallink: "https://news.example.com/2",
          link: "https://n.news.naver.com/mnews/article/2",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "중복 link 기사",
          originallink: "https://news.example.com/dupe",
          link: "https://n.news.naver.com/mnews/article/1",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        }
      ]
    },
    { query: "테스트", display: 10, start: 1, sort: "sim" }
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "정상 기사");
});

test("normalizeNaverNewsSearchPayload dedupes links that differ only in query-param order, trailing slash, or host casing", () => {
  const result = normalizeNaverNewsSearchPayload(
    {
      lastBuildDate: "Mon, 22 Apr 2026 00:00:00 +0900",
      total: 5,
      start: 1,
      display: 5,
      items: [
        {
          title: "원본 기사",
          originallink: "https://publisher.example.com/42",
          link: "https://news.example.com/articles/42?a=1&b=2",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "쿼리 파라미터 순서만 다른 중복",
          originallink: "https://publisher.example.com/42-b",
          link: "https://news.example.com/articles/42?b=2&a=1",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "trailing slash 만 다른 중복",
          originallink: "https://publisher.example.com/42-c",
          link: "https://news.example.com/articles/42/?a=1&b=2",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "host 대소문자·fragment 만 다른 중복",
          originallink: "https://publisher.example.com/42-d",
          link: "https://NEWS.example.com/articles/42?a=1&b=2#comments",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "진짜 다른 기사",
          originallink: "https://publisher.example.com/43",
          link: "https://news.example.com/articles/43?a=1&b=2",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        }
      ]
    },
    { query: "중복", display: 10, start: 1, sort: "sim" }
  );

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].title, "원본 기사");
  assert.equal(result.items[1].title, "진짜 다른 기사");
});

test("normalizeNaverNewsSearchPayload preserves items that differ by path or by a non-redundant query param", () => {
  const result = normalizeNaverNewsSearchPayload(
    {
      lastBuildDate: "Mon, 22 Apr 2026 00:00:00 +0900",
      total: 3,
      start: 1,
      display: 3,
      items: [
        {
          title: "첫 번째",
          originallink: "https://publisher.example.com/1",
          link: "https://news.example.com/articles/42?a=1",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "다른 쿼리 값",
          originallink: "https://publisher.example.com/2",
          link: "https://news.example.com/articles/42?a=2",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        },
        {
          title: "다른 경로",
          originallink: "https://publisher.example.com/3",
          link: "https://news.example.com/articles/42/related?a=1",
          description: "본문",
          pubDate: "Mon, 22 Apr 2026 00:00:00 +0900"
        }
      ]
    },
    { query: "서로다른", display: 10, start: 1, sort: "sim" }
  );

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].title, "첫 번째");
  assert.equal(result.items[1].title, "다른 쿼리 값");
  assert.equal(result.items[2].title, "다른 경로");
});

test("normalizeNaverNewsSearchPayload handles missing optional fields gracefully", () => {
  const result = normalizeNaverNewsSearchPayload(
    {
      lastBuildDate: "Mon, 22 Apr 2026 00:00:00 +0900",
      total: 1,
      start: 1,
      display: 1,
      items: [
        {
          title: "간단 기사",
          originallink: "https://news.example.com/1",
          link: "https://news.example.com/1",
          description: "",
          pubDate: "invalid-date-string"
        }
      ]
    },
    { query: "테스트", display: 10, start: 1, sort: "sim" }
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, null);
  assert.equal(result.items[0].pub_date, "invalid-date-string");
  assert.equal(result.items[0].pub_date_iso, null);
});

test("naver news search endpoint returns 400 when query is missing", async (t) => {
  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({ method: "GET", url: "/v1/naver-news/search" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("naver news search endpoint returns 503 when proxy credentials are missing", async (t) => {
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90"
  });

  assert.equal(response.statusCode, 503);
  const body = response.json();
  assert.equal(body.error, "upstream_not_configured");
  assert.match(body.message, /NAVER_SEARCH_CLIENT_ID/);
});

test("naver news search endpoint returns 400 preflight when start+display exceeds Naver's 1000-item window", async (t) => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&start=1000&display=100"
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error, "bad_request");
  assert.match(body.message, /1000-item|window|Naver/i);
  assert.equal(fetchCount, 0, "must not call upstream when preflight fails");
});

test("naver news search endpoint proxies to official API with correct headers and params", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        lastBuildDate: "Mon, 22 Apr 2026 10:00:00 +0900",
        total: 1234567,
        start: 1,
        display: 2,
        items: [
          {
            title: "<b>삼성전자</b> 1분기 실적 발표",
            originallink: "https://news.example.com/samsung",
            link: "https://n.news.naver.com/mnews/article/samsung",
            description: "<b>삼성전자</b>가 올해 1분기 실적을 발표했다.",
            pubDate: "Mon, 22 Apr 2026 09:30:00 +0900"
          },
          {
            title: "두 번째 기사",
            originallink: "https://news.example.com/second",
            link: "https://n.news.naver.com/mnews/article/second",
            description: "두 번째 기사 요약",
            pubDate: "Mon, 22 Apr 2026 08:00:00 +0900"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "test-client-id",
      NAVER_SEARCH_CLIENT_SECRET: "test-client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&display=5&sort=date"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.query.q, "삼성전자");
  assert.equal(body.query.display, 5);
  assert.equal(body.query.sort, "date");
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].title, "삼성전자 1분기 실적 발표");
  assert.equal(body.items[0].description, "삼성전자가 올해 1분기 실적을 발표했다.");
  assert.equal(body.items[0].source, "naver-openapi");
  assert.equal(body.meta.total, 1234567);
  assert.equal(body.meta.extraction, "naver-openapi");
  assert.equal(body.upstream.provider, "naver-search-api");
  assert.equal(body.proxy.cache.hit, false);

  assert.equal(fetchCalls.length, 1);
  const upstreamUrl = new URL(fetchCalls[0].url);
  assert.equal(upstreamUrl.hostname, "openapi.naver.com");
  assert.equal(upstreamUrl.pathname, "/v1/search/news.json");
  assert.equal(upstreamUrl.searchParams.get("query"), "삼성전자");
  assert.equal(upstreamUrl.searchParams.get("display"), "5");
  assert.equal(upstreamUrl.searchParams.get("sort"), "date");
  assert.equal(fetchCalls[0].headers["X-Naver-Client-Id"], "test-client-id");
  assert.equal(fetchCalls[0].headers["X-Naver-Client-Secret"], "test-client-secret");
});

test("naver news search endpoint caches successful responses and serves hit on second call", async (t) => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        lastBuildDate: "Mon, 22 Apr 2026 10:00:00 +0900",
        total: 1,
        start: 1,
        display: 1,
        items: [
          {
            title: "캐시 테스트 기사",
            originallink: "https://news.example.com/cache",
            link: "https://n.news.naver.com/mnews/article/cache",
            description: "본문",
            pubDate: "Mon, 22 Apr 2026 09:00:00 +0900"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const firstResponse = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%BA%90%EC%8B%9C"
  });
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstResponse.json().proxy.cache.hit, false);

  const secondResponse = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%BA%90%EC%8B%9C"
  });
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.json().proxy.cache.hit, true);
  assert.equal(fetchCount, 1);
});

test("naver news search endpoint surfaces upstream errors without caching them", async (t) => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        errorMessage: "Authentication failed",
        errorCode: "024"
      }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "bad-id",
      NAVER_SEARCH_CLIENT_SECRET: "bad-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EB%B0%B0%EB%93%A0"
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "upstream_error");
  assert.equal(response.json().upstream.status_code, 401);

  const retry = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EB%B0%B0%EB%93%A0"
  });
  assert.equal(retry.statusCode, 401);
  assert.equal(fetchCount, 2, "failures must not be cached");
});

test("naver news search endpoint surfaces upstream 429 rate-limit and echoes status code", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return new Response(
      JSON.stringify({
        errorMessage: "Request limit exceeded",
        errorCode: "010"
      }),
      { status: 429, headers: { "content-type": "application/json" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%A0%9C%ED%95%9C"
  });
  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error, "upstream_error");
});

test("naver news search endpoint reports 5xx upstream failures as 502 proxy error", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain" }
    });
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-news/search?q=%EC%9E%A5%EC%95%A0"
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "upstream_error");
  assert.equal(response.json().upstream.status_code, 500);
});

test("health endpoint exposes naverNewsApiConfigured flag based on credentials", async (t) => {
  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.upstreams.naverNewsApiConfigured, true);

  const appNoKeys = buildServer({ env: {} });
  const healthNoKeys = await appNoKeys.inject({ method: "GET", url: "/health" });
  assert.equal(healthNoKeys.json().upstreams.naverNewsApiConfigured, false);
  await appNoKeys.close();
});
