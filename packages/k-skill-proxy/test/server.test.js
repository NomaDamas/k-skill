const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildServer,
  proxyAirKoreaRequest,
  proxyHrfcoWaterLevelRequest,
  proxyKmaWeatherRequest,
  proxySeoulSubwayRequest
} = require("../src/server");
const { resolveEducationOfficeFromNaturalLanguage } = require("../src/neis-office-codes");

test("health endpoint stays public and reports auth/upstream status", async (t) => {
  const app = buildServer({
    provider: async () => {
      throw new Error("provider should not be called");
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.auth.tokenRequired, false);
  assert.equal(body.upstreams.airKoreaConfigured, false);
  assert.equal(body.upstreams.kmaOpenApiConfigured, false);
  assert.equal(body.upstreams.krxConfigured, false);
  assert.equal(body.upstreams.seoulOpenApiConfigured, false);
  assert.equal(body.upstreams.hrfcoConfigured, false);
});

test("health endpoint reports KRX upstream status when configured", async (t) => {
  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().upstreams.krxConfigured, true);
});

test("korean stock search endpoint stays public and caches normalized search queries", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7005930003",
              ISU_SRT_CD: "005930",
              ISU_NM: "삼성전자",
              ISU_ABBRV: "삼성전자",
              ISU_ENG_NM: "Samsung Electronics",
              LIST_DD: "19750611",
              MKT_TP_NM: "KOSPI",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "대형주",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "100",
              LIST_SHRS: "5969782550"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info") || text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%20%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90%20&bas_dd=20260404"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?query=%20%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90%20&date=20260404&limit=10"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls.length, 3);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().items[0].market, "KOSPI");
  assert.equal(first.json().items[0].code, "005930");
  assert.equal(first.json().items[0].name, "삼성전자");
  assert.ok(fetchCalls.every((entry) => entry.url.startsWith("https://data-dbg.krx.co.kr/")));
  assert.match(fetchCalls[0].url, /basDd=20260404/);
  assert.equal(fetchCalls[0].headers.AUTH_KEY, "krx-key");
});

test("korean stock search rate limit does not trust spoofed cf-connecting-ip on direct requests", async (t) => {
  const app = buildServer({
    env: {
      KSKILL_PROXY_RATE_LIMIT_MAX: "1"
    }
  });

  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404",
    headers: {
      "cf-connecting-ip": "1.1.1.1"
    }
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404",
    headers: {
      "cf-connecting-ip": "2.2.2.2"
    }
  });

  assert.equal(first.statusCode, 503);
  assert.equal(first.json().error, "upstream_not_configured");
  assert.equal(second.statusCode, 429);
  assert.equal(second.json().error, "rate_limited");
});

test("korean stock search returns healthy market results when another market upstream fails", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7005930003",
              ISU_SRT_CD: "005930",
              ISU_NM: "삼성전자",
              ISU_ABBRV: "삼성전자",
              ISU_ENG_NM: "Samsung Electronics",
              LIST_DD: "19750611",
              MKT_TP_NM: "KOSPI",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "대형주",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "100",
              LIST_SHRS: "5969782550"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info")) {
      return new Response("boom", {
        status: 500,
        statusText: "Internal Server Error"
      });
    }

    if (text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items.length, 1);
  assert.equal(response.json().items[0].market, "KOSPI");
  assert.equal(response.json().items[0].code, "005930");
  assert.equal(response.json().items[0].name, "삼성전자");
  assert.equal(fetchCalls.length, 3);
  assert.ok(fetchCalls.every((entry) => entry.url.startsWith("https://data-dbg.krx.co.kr/")));
});

test("korean stock search reuses per-market base snapshots across different queries for the same date", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const text = String(url);
    fetchCalls.push({ url: text, headers: options.headers });

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              ISU_CD: "KR7005930003",
              ISU_SRT_CD: "005930",
              ISU_NM: "삼성전자",
              ISU_ABBRV: "삼성전자",
              ISU_ENG_NM: "Samsung Electronics",
              LIST_DD: "19750611",
              MKT_TP_NM: "KOSPI",
              SECUGRP_NM: "주권",
              SECT_TP_NM: "대형주",
              KIND_STKCERT_TP_NM: "보통주",
              PARVAL: "100",
              LIST_SHRS: "5969782550"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("ksq_isu_base_info") || text.includes("knx_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const byKoreanName = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&bas_dd=20260404"
  });
  const byEnglishName = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/search?q=Samsung&bas_dd=20260404"
  });

  assert.equal(byKoreanName.statusCode, 200);
  assert.equal(byEnglishName.statusCode, 200);
  assert.equal(byKoreanName.json().items[0].code, "005930");
  assert.equal(byEnglishName.json().items[0].code, "005930");
  assert.equal(fetchCalls.length, 3);
});

test("korean stock base-info endpoint returns 503 when proxy server lacks KRX API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/base-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("korean stock base-info endpoint normalizes upstream KRX fields", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  let calledHeaders;
  global.fetch = async (url, options = {}) => {
    calledUrl = String(url);
    calledHeaders = options.headers;
    return new Response(
      JSON.stringify({
        OutBlock_1: [
          {
            ISU_CD: "KR7005930003",
            ISU_SRT_CD: "005930",
            ISU_NM: "삼성전자",
            ISU_ABBRV: "삼성전자",
            ISU_ENG_NM: "Samsung Electronics",
            LIST_DD: "19750611",
            MKT_TP_NM: "KOSPI",
            SECUGRP_NM: "주권",
            SECT_TP_NM: "대형주",
            KIND_STKCERT_TP_NM: "보통주",
            PARVAL: "100",
            LIST_SHRS: "5969782550"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/base-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 200);
  assert.ok(calledUrl.startsWith("https://data-dbg.krx.co.kr/"));
  assert.match(calledUrl, /stk_isu_base_info/);
  assert.match(calledUrl, /basDd=20260404/);
  assert.equal(calledHeaders.AUTH_KEY, "krx-key");
  assert.equal(response.json().item.code, "005930");
  assert.equal(response.json().item.name, "삼성전자");
  assert.equal(response.json().item.listed_shares, 5969782550);
});

test("korean stock trade-info endpoint caches successful responses", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  let calledUrl;
  global.fetch = async (url) => {
    fetchCalls += 1;
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        OutBlock_1: [
          {
            BAS_DD: "20260404",
            ISU_CD: "KR7005930003",
            ISU_SRT_CD: "005930",
            ISU_NM: "삼성전자",
            MKT_NM: "KOSPI",
            SECT_TP_NM: "대형주",
            TDD_CLSPRC: "84000",
            CMPPREVDD_PRC: "1000",
            FLUC_RT: "1.20",
            TDD_OPNPRC: "83000",
            TDD_HGPRC: "84500",
            TDD_LWPRC: "82800",
            ACC_TRDVOL: "12345678",
            ACC_TRDVAL: "1030000000000",
            MKTCAP: "500000000000000",
            LIST_SHRS: "5969782550"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&code=005930&bas_dd=20260404"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&stockCode=005930&date=20260404"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.ok(calledUrl.startsWith("https://data-dbg.krx.co.kr/"));
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(first.json().item.close_price, 84000);
  assert.equal(first.json().item.trading_value, 1030000000000);
});

test("korean stock trade-info endpoint does not relabel an unmatched single-row upstream response", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.includes("stk_bydd_trd")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: [
            {
              BAS_DD: "20260404",
              ISU_CD: "KR7000660001",
              ISU_NM: "하이트진로",
              MKT_NM: "KOSPI",
              SECT_TP_NM: "중형주",
              TDD_CLSPRC: "21000"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("stk_isu_base_info")) {
      return new Response(
        JSON.stringify({
          OutBlock_1: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      KRX_API_KEY: "krx-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korean-stock/trade-info?market=KOSPI&code=005930&bas_dd=20260404"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "not_found");
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls.every((entry) => entry.startsWith("https://data-dbg.krx.co.kr/")));
});

test("fine dust endpoint stays publicly callable without proxy auth", async (t) => {
  let providerCalls = 0;
  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key"
    },
    provider: async () => {
      providerCalls += 1;
      return { station_name: "강남구" };
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/fine-dust/report?regionHint=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().station_name, "강남구");
  assert.equal(providerCalls, 1);
});

test("fine dust endpoint returns candidate stations when region resolution is ambiguous", async (t) => {
  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key"
    },
    provider: async () => {
      const error = new Error("단일 측정소를 확정하지 못했습니다.");
      error.statusCode = 400;
      error.code = "ambiguous_location";
      error.sidoName = "광주";
      error.candidateStations = ["평동", "오선동"];
      throw error;
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/fine-dust/report?regionHint=%EA%B4%91%EC%A3%BC%20%EA%B4%91%EC%82%B0%EA%B5%AC"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ambiguous_location");
  assert.equal(response.json().sido_name, "광주");
  assert.deepEqual(response.json().candidate_stations, ["평동", "오선동"]);
});

test("fine dust endpoint caches successful provider responses", async (t) => {
  let providerCalls = 0;
  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    },
    provider: async () => {
      providerCalls += 1;
      return {
        station_name: "강남구",
        station_address: "서울 강남구 학동로 426",
        lookup_mode: "fallback",
        measured_at: "2026-03-27 21:00",
        pm10: { value: "42", grade: "보통" },
        pm25: { value: "19", grade: "보통" },
        khai_grade: "보통"
      };
    }
  });

  t.after(async () => {
    await app.close();
  });

  const request = {
    method: "GET",
    url: "/v1/fine-dust/report?regionHint=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC"
  };

  const first = await app.inject(request);
  const second = await app.inject(request);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(providerCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("proxyAirKoreaRequest injects serviceKey and preserves caller query params", async () => {
  let calledUrl;
  const result = await proxyAirKoreaRequest({
    service: "ArpltnInforInqireSvc",
    operation: "getMsrstnAcctoRltmMesureDnsty",
    query: {
      returnType: "json",
      stationName: "강남구",
      dataTerm: "DAILY",
      ver: "1.4"
    },
    serviceKey: "test-service-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.match(calledUrl, /\/B552584\/ArpltnInforInqireSvc\/getMsrstnAcctoRltmMesureDnsty\?/);
  assert.match(calledUrl, /stationName=%EA%B0%95%EB%82%A8%EA%B5%AC/);
  assert.match(calledUrl, /serviceKey=test-service-key/);
});

test("public AirKorea passthrough route forwards allowed upstream responses", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('{"response":{"header":{"resultCode":"00"}}}', {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });

  const app = buildServer({
    env: {
      AIR_KOREA_OPEN_API_KEY: "airkorea-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?returnType=json&stationName=%EA%B0%95%EB%82%A8%EA%B5%AC&dataTerm=DAILY&ver=1.4"
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /resultCode/);
});

test("seoul subway endpoint caches successful upstream responses for normalized queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        errorMessage: {
          status: 200,
          code: "INFO-000",
          message: "정상 처리되었습니다."
        },
        realtimeArrivalList: [
          {
            statnNm: "강남",
            trainLineNm: "2호선",
            updnLine: "내선",
            arvlMsg2: "전역 출발",
            arvlMsg3: "역삼",
            barvlDt: "60"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?station=%EA%B0%95%EB%82%A8&start_index=0&end_index=8"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?stationName=%EA%B0%95%EB%82%A8"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("seoul subway endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        errorMessage: {
          status: 200,
          code: "INFO-000",
          message: "정상 처리되었습니다."
        },
        realtimeArrivalList: [
          {
            statnNm: "강남",
            trainLineNm: "2호선",
            updnLine: "내선",
            arvlMsg2: "전역 출발",
            arvlMsg3: "역삼",
            barvlDt: "60"
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      SEOUL_OPEN_API_KEY: "seoul-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?stationName=%EA%B0%95%EB%82%A8"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().realtimeArrivalList[0].statnNm, "강남");
  assert.match(calledUrl, /realtimeStationArrival\/0\/8\/%EA%B0%95%EB%82%A8$/);
});

test("seoul subway endpoint returns 503 when proxy server lacks Seoul API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/seoul-subway/arrival?stationName=%EA%B0%95%EB%82%A8"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("proxySeoulSubwayRequest injects API key and preserves index/station params", async () => {
  let calledUrl;
  const result = await proxySeoulSubwayRequest({
    stationName: "강남",
    startIndex: "2",
    endIndex: "5",
    apiKey: "test-seoul-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.match(calledUrl, /\/api\/subway\/test-seoul-key\/json\/realtimeStationArrival\/2\/5\/%EA%B0%95%EB%82%A8$/);
});

test("korea weather endpoint caches successful upstream responses for normalized coordinate queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    assert.match(String(url), /getVilageFcst/);
    assert.match(String(url), /base_date=20260405/);
    assert.match(String(url), /base_time=0500/);
    assert.match(String(url), /nx=60/);
    assert.match(String(url), /ny=127/);

    return new Response(
      JSON.stringify({
        response: {
          header: {
            resultCode: "00",
            resultMsg: "NORMAL_SERVICE"
          },
          body: {
            dataType: "JSON",
            items: {
              item: [
                {
                  baseDate: "20260405",
                  baseTime: "0500",
                  category: "TMP",
                  fcstDate: "20260405",
                  fcstTime: "0600",
                  fcstValue: "14",
                  nx: 60,
                  ny: 127
                }
              ]
            }
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KMA_OPEN_API_KEY: "kma-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    },
    now: () => new Date("2026-04-05T06:30:00+09:00")
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?lat=37.5665&lon=126.978"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?nx=60&ny=127&baseDate=20260405&baseTime=0500"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.deepEqual(first.json().query, {
    baseDate: "20260405",
    baseTime: "0500",
    nx: 60,
    ny: 127,
    pageNo: 1,
    numOfRows: 1000,
    dataType: "JSON"
  });
});

test("korea weather endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        response: {
          header: {
            resultCode: "00",
            resultMsg: "NORMAL_SERVICE"
          },
          body: {
            dataType: "JSON",
            items: {
              item: []
            }
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      }
    );
  };

  const app = buildServer({
    env: {
      KMA_OPEN_API_KEY: "kma-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?nx=60&ny=127&baseDate=20260405&baseTime=0500"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().response.header.resultCode, "00");
  assert.ok(calledUrl.startsWith("https://apis.data.go.kr/"));
  assert.match(calledUrl, /serviceKey=kma-key/);
  assert.match(calledUrl, /base_date=20260405/);
  assert.match(calledUrl, /base_time=0500/);
  assert.match(calledUrl, /nx=60/);
  assert.match(calledUrl, /ny=127/);
});

test("korea weather endpoint rejects out-of-range coordinates before reaching upstream", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called for invalid coordinates");
  };

  const app = buildServer({
    env: {
      KMA_OPEN_API_KEY: "kma-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?lat=91&lon=126.978"
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "bad_request",
    message: "Provide valid lat and lon."
  });
  assert.equal(fetchCalls, 0);
});

test("korea weather endpoint returns 503 when proxy server lacks KMA API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/korea-weather/forecast?nx=60&ny=127"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("proxyKmaWeatherRequest injects API key and preserves caller query params", async () => {
  let calledUrl;
  const result = await proxyKmaWeatherRequest({
    baseDate: "20260405",
    baseTime: "0500",
    nx: 60,
    ny: 127,
    pageNo: 2,
    numOfRows: 50,
    dataType: "JSON",
    apiKey: "test-kma-key",
    fetchImpl: async (url) => {
      calledUrl = String(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" }
      });
    }
  });

  assert.equal(result.statusCode, 200);
  assert.ok(calledUrl.startsWith("https://apis.data.go.kr/"));
  assert.match(calledUrl, /\/1360000\/VilageFcstInfoService_2\.0\/getVilageFcst\?/);
  assert.match(calledUrl, /serviceKey=test-kma-key/);
  assert.match(calledUrl, /base_date=20260405/);
  assert.match(calledUrl, /base_time=0500/);
  assert.match(calledUrl, /nx=60/);
  assert.match(calledUrl, /ny=127/);
  assert.match(calledUrl, /pageNo=2/);
  assert.match(calledUrl, /numOfRows=50/);
  assert.match(calledUrl, /dataType=JSON/);
});

test("han river water-level endpoint stays publicly callable without proxy auth", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    const text = String(url);
    fetchCalls.push(text);

    if (text.endsWith("/waterlevel/info.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              obsnm: "한강대교",
              agcnm: "한강홍수통제소",
              addr: "서울특별시 용산구",
              etcaddr: "한강대교",
              attwl: "5.5",
              wrnwl: "8.0",
              almwl: "10.0",
              srswl: "11.0",
              pfh: "13.0",
              fstnyn: "Y"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("/waterlevel/list/10M/1018683.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              ymdhm: "202604051900",
              wl: "0.66",
              fw: "208.58"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      HRFCO_OPEN_API_KEY: "hrfco-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().station_name, "한강대교");
  assert.equal(response.json().water_level.value_m, 0.66);
  assert.equal(response.json().flow_rate.value_cms, 208.58);
  assert.equal(response.json().proxy.cache.hit, false);
  assert.match(fetchCalls[0], /\/waterlevel\/info\.json$/);
  assert.match(fetchCalls[1], /\/waterlevel\/list\/10M\/1018683\.json$/);
});

test("han river water-level endpoint caches normalized station queries", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    const text = String(url);

    if (text.endsWith("/waterlevel/info.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              obsnm: "한강대교",
              agcnm: "한강홍수통제소",
              addr: "서울특별시 용산구",
              etcaddr: "한강대교"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    if (text.includes("/waterlevel/list/10M/1018683.json")) {
      return new Response(
        JSON.stringify({
          content: [
            {
              wlobscd: "1018683",
              ymdhm: "202604051900",
              wl: "0.66",
              fw: "208.58"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      HRFCO_OPEN_API_KEY: "hrfco-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?station=%20%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90%20"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 2);
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
});

test("han river water-level endpoint returns ambiguous candidates for broad station names", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);

    if (text.endsWith("/waterlevel/info.json")) {
      return new Response(
        JSON.stringify({
          content: [
            { wlobscd: "1018683", obsnm: "한강대교", agcnm: "한강홍수통제소" },
            { wlobscd: "1018680", obsnm: "한강철교", agcnm: "한강홍수통제소" }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const app = buildServer({
    env: {
      HRFCO_OPEN_API_KEY: "hrfco-key"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ambiguous_station");
  assert.deepEqual(response.json().candidate_stations, ["한강대교", "한강철교"]);
});

test("han river water-level endpoint returns 503 when proxy server lacks HRFCO API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/han-river/water-level?stationName=%ED%95%9C%EA%B0%95%EB%8C%80%EA%B5%90"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("proxyHrfcoWaterLevelRequest injects API key and resolves station code path", async () => {
  let calledUrls = [];
  const result = await proxyHrfcoWaterLevelRequest({
    stationName: "한강대교",
    apiKey: "test-hrfco-key",
    fetchImpl: async (url) => {
      calledUrls.push(String(url));

      if (String(url).endsWith("/waterlevel/info.json")) {
        return new Response(
          JSON.stringify({
            content: [
              { wlobscd: "1018683", obsnm: "한강대교", agcnm: "한강홍수통제소" }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json;charset=UTF-8" }
          }
        );
      }

      return new Response(
        JSON.stringify({
          content: [
            { wlobscd: "1018683", ymdhm: "202604051900", wl: "0.66", fw: "208.58" }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json;charset=UTF-8" }
        }
      );
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).station_code, "1018683");
  assert.match(calledUrls[0], /\/test-hrfco-key\/waterlevel\/info\.json$/);
  assert.match(calledUrls[1], /\/test-hrfco-key\/waterlevel\/list\/10M\/1018683\.json$/);
});

const SAMPLE_APT_TRADE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <aptNm>래미안</aptNm><umdNm>반포동</umdNm><excluUseAr>84.99</excluUseAr>
        <floor>12</floor><dealAmount>  245,000</dealAmount>
        <dealYear>2024</dealYear><dealMonth>3</dealMonth><dealDay>15</dealDay>
        <buildYear>2009</buildYear><dealingGbn>중개거래</dealingGbn><cdealType></cdealType>
      </item>
    </items>
    <totalCount>1</totalCount>
  </body>
</response>`;

const SAMPLE_KRX_BASE_INFO = {
  OutBlock_1: [
    {
      ISU_CD: "KR7005930003",
      ISU_SRT_CD: "005930",
      ISU_NM: "삼성전자",
      ISU_ABBRV: "삼성전자",
      ISU_ENG_NM: "Samsung Electronics",
      LIST_DD: "19750611",
      MKT_TP_NM: "KOSPI",
      SECUGRP_NM: "주권",
      SECT_TP_NM: "전기전자",
      KIND_STKCERT_TP_NM: "보통주",
      PARVAL: "100",
      LIST_SHRS: "5,919,638,922"
    }
  ]
};

const SAMPLE_KRX_TRADE_INFO = {
  OutBlock_1: [
    {
      BAS_DD: "20260404",
      ISU_CD: "KR7005930003",
      ISU_SRT_CD: "005930",
      ISU_NM: "삼성전자",
      MKT_NM: "KOSPI",
      SECT_TP_NM: "전기전자",
      TDD_CLSPRC: "85,000",
      CMPPREVDD_PRC: "1,200",
      FLUC_RT: "1.43",
      TDD_OPNPRC: "84,100",
      TDD_HGPRC: "85,400",
      TDD_LWPRC: "83,900",
      ACC_TRDVOL: "12,345,678",
      ACC_TRDVAL: "1,045,678,900,000",
      MKTCAP: "503,169,308,370,000",
      LIST_SHRS: "5,919,638,922"
    }
  ]
};

test("real estate region-code endpoint returns matching codes", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/region-code?q=%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(body.results.length > 0);
  assert.ok(body.results.some((r) => r.lawd_cd === "11680"));
  assert.equal(body.proxy.cache.hit, false);
});

test("real estate region-code endpoint returns 400 for missing query", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/region-code"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("real estate transaction endpoint returns 503 without API key", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("real estate transaction endpoint returns 404 for invalid asset type", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/mansion/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 404);
});

test("real estate transaction endpoint returns 404 for commercial/rent", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/commercial/rent?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 404);
});

test("real estate transaction endpoint returns 400 for invalid lawd_cd", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=abc&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 400);
});

test("real estate transaction endpoint fetches and returns parsed data", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return new Response(SAMPLE_APT_TRADE_XML, {
      status: 200,
      headers: { "content-type": "text/xml;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].name, "래미안");
  assert.equal(body.items[0].price_10k, 245000);
  assert.equal(body.query.asset_type, "apartment");
  assert.equal(body.query.deal_type, "trade");
  assert.equal(body.proxy.cache.hit, false);
});

test("real estate transaction endpoint caches successful responses", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(SAMPLE_APT_TRADE_XML, {
      status: 200,
      headers: { "content-type": "text/xml;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "test-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/real-estate/apartment/trade?lawd_cd=11680&deal_ymd=202403"
  });

  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls, 1);
});

test("health endpoint reports molitConfigured status", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.json().upstreams.molitConfigured, true);
});

const SAMPLE_NEIS_MEAL_JSON = JSON.stringify({
  mealServiceDietInfo: [
    {
      head: [{ LIST_TOTAL_COUNT: 1 }]
    },
    {
      row: [
        {
          ATPT_OFCDC_SC_CODE: "J10",
          SD_SCHUL_CODE: "1234567",
          MLSV_YMD: "20260410",
          MMEAL_SC_CODE: "2",
          DDISH_NM: "밥<br/>국"
        }
      ]
    }
  ]
});

test("neis school-meal endpoint returns 503 without KEDU_INFO_KEY", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=20260410"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("neis school-meal endpoint returns 400 when mealDate is invalid", async (t) => {
  const app = buildServer({
    env: { KEDU_INFO_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=2026041"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("neis school-meal endpoint proxies NEIS JSON and caches", async (t) => {
  const originalFetch = global.fetch;
  let fetchedUrl = "";
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    fetchedUrl = String(url);
    return new Response(SAMPLE_NEIS_MEAL_JSON, {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      KEDU_INFO_KEY: "neis-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=2026-04-10&mealKindCode=2"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=J10&schoolCode=1234567&mealDate=2026-04-10&mealKindCode=2"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().mealServiceDietInfo[1].row[0].DDISH_NM, "밥<br/>국");
  assert.equal(first.json().query.meal_date, "20260410");
  assert.equal(first.json().query.meal_kind_code, "2");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls, 1);
  assert.ok(fetchedUrl.includes("open.neis.go.kr/hub/mealServiceDietInfo"));
  assert.ok(fetchedUrl.includes("KEY=neis-key"));
  assert.ok(fetchedUrl.includes("ATPT_OFCDC_SC_CODE=J10"));
  assert.ok(fetchedUrl.includes("SD_SCHUL_CODE=1234567"));
  assert.ok(fetchedUrl.includes("MLSV_YMD=20260410"));
  assert.ok(fetchedUrl.includes("MMEAL_SC_CODE=2"));
});

test("health endpoint reports neisSchoolMealConfigured when KEDU_INFO_KEY is set", async (t) => {
  const app = buildServer({
    env: { KEDU_INFO_KEY: "x" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.json().upstreams.neisSchoolMealConfigured, true);
});

test("resolveEducationOfficeFromNaturalLanguage maps Seoul office phrases to B10", () => {
  const a = resolveEducationOfficeFromNaturalLanguage("서울특별시교육청");
  assert.equal(a.ok, true);
  assert.equal(a.code, "B10");

  const b = resolveEducationOfficeFromNaturalLanguage("B10");
  assert.equal(b.ok, true);
  assert.equal(b.code, "B10");
});

test("resolveEducationOfficeFromNaturalLanguage returns ambiguous for 경상", () => {
  const r = resolveEducationOfficeFromNaturalLanguage("경상");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
});

const SAMPLE_NEIS_SCHOOL_JSON = JSON.stringify({
  schoolInfo: [
    { head: [{ LIST_TOTAL_COUNT: 1 }] },
    {
      row: [
        {
          ATPT_OFCDC_SC_CODE: "B10",
          SD_SCHUL_CODE: "7010123",
          SCHUL_NM: "서울미래초등학교",
          ORG_RDNMA: "서울특별시 …"
        }
      ]
    }
  ]
});

test("neis school-search returns 400 without schoolName", async (t) => {
  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${encodeURIComponent("서울특별시교육청")}`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("neis school-search returns ambiguous_education_office for 경상", async (t) => {
  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${encodeURIComponent("경상")}&schoolName=${encodeURIComponent("중학교")}`
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ambiguous_education_office");
  assert.ok(Array.isArray(response.json().candidate_codes));
});

test("neis school-search proxies schoolInfo and resolves 교육청 이름", async (t) => {
  const originalFetch = global.fetch;
  let fetchedUrl = "";
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    fetchedUrl = String(url);
    return new Response(SAMPLE_NEIS_SCHOOL_JSON, {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  };

  const app = buildServer({
    env: {
      KEDU_INFO_KEY: "neis-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const edu = encodeURIComponent("서울특별시교육청");
  const school = encodeURIComponent("미래초등학교");
  const first = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${edu}&schoolName=${school}`
  });
  const second = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${edu}&schoolName=${school}`
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().schoolInfo[1].row[0].SCHUL_NM, "서울미래초등학교");
  assert.equal(first.json().resolved_education_office.atpt_ofcdc_sc_code, "B10");
  assert.equal(first.json().resolved_education_office.input, "서울특별시교육청");
  assert.equal(first.json().proxy.cache.hit, false);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls, 1);
  assert.ok(fetchedUrl.includes("open.neis.go.kr/hub/schoolInfo"));
  assert.ok(fetchedUrl.includes("ATPT_OFCDC_SC_CODE=B10"));
  assert.ok(fetchedUrl.includes("SCHUL_NM"));
  assert.ok(decodeURIComponent(fetchedUrl).includes("미래초등학교"));
});

test("neis school-search maps rejected upstream fetches to a 502 proxy error", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("boom");
  };

  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/v1/neis/school-search?educationOffice=${encodeURIComponent("서울특별시교육청")}&schoolName=${encodeURIComponent("미래초등학교")}`
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    error: "proxy_error",
    message: "boom"
  });
});

test("neis school-meal maps rejected upstream fetches to a 502 proxy error", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("boom");
  };

  const app = buildServer({ env: { KEDU_INFO_KEY: "k" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/neis/school-meal?educationOfficeCode=B10&schoolCode=7010123&mealDate=20260410"
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    error: "proxy_error",
    message: "boom"
  });
});

test("household waste info endpoint requires SGG_NM filter", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("household waste info endpoint reports 503 when DATA_GO_KR_API_KEY is missing", async (t) => {
  const app = buildServer();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
});

test("household waste info endpoint requires pageNo and numOfRows with cond", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("household waste info endpoint injects serviceKey, forces returnType=json, and caches", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response(
      JSON.stringify({
        response: {
          body: {
            items: [
              {
                SGG_NM: "강남구",
                MNG_ZONE_NM: "역삼1동",
                EMSN_PLC: "지정장소",
                LF_WST_EMSN_DOW: "월,수,금",
                LF_WST_EMSN_BGNG_TM: "18:00",
                LF_WST_EMSN_END_TM: "23:00"
              }
            ]
          }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const app = buildServer({
    env: {
      DATA_GO_KR_API_KEY: "test-key",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url =
    "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100";

  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  const firstBody = first.json();
  assert.equal(firstBody.proxy.cache.hit, false);
  assert.equal(firstBody.query.sgg_nm, "강남구");
  assert.equal(firstBody.query.page_no, "1");
  assert.equal(firstBody.query.num_of_rows, "100");
  assert.equal(firstBody.response.body.items[0].SGG_NM, "강남구");

  assert.equal(fetchCalls.length, 1);
  const upstream = new URL(fetchCalls[0]);
  assert.equal(upstream.origin + upstream.pathname, "https://apis.data.go.kr/1741000/household_waste_info/info");
  assert.equal(upstream.searchParams.get("serviceKey"), "test-key");
  assert.equal(upstream.searchParams.get("returnType"), "json");
  assert.equal(upstream.searchParams.get("pageNo"), "1");
  assert.equal(upstream.searchParams.get("numOfRows"), "100");
  assert.equal(upstream.searchParams.get("cond[SGG_NM::LIKE]"), "강남구");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls.length, 1);
});

test("household waste info endpoint rejects user-supplied pageNo and numOfRows when not 1 and 100", async (t) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=99&numOfRows=5"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
  assert.equal(fetchCalls, 0);
});

test("household waste info endpoint accepts explicit pageNo=1 and numOfRows=100", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100"
  });

  assert.equal(response.statusCode, 200);
  const u = new URL(capturedUrl);
  assert.equal(u.searchParams.get("pageNo"), "1");
  assert.equal(u.searchParams.get("numOfRows"), "100");
});

test("household waste info endpoint rejects non-integer pageNo", async (t) => {
  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=abc&numOfRows=100"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "bad_request");
});

test("household waste info endpoint ignores user-supplied returnType override", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EC%88%98%EC%9B%90%EC%8B%9C&pageNo=1&numOfRows=100&returnType=xml"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(new URL(capturedUrl).searchParams.get("returnType"), "json");
});

test("household waste info endpoint surfaces upstream non-200 as 502", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("oops", { status: 500 });

  const app = buildServer({
    env: { DATA_GO_KR_API_KEY: "test-key" }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=100"
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "upstream_error");
});
