const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildServer,
  proxyAirKoreaRequest,
  proxySeoulSubwayRequest,
  proxyHrfcoWaterLevelRequest
} = require("../src/server");

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
  assert.equal(body.upstreams.krxConfigured, false);
  assert.equal(body.upstreams.seoulOpenApiConfigured, false);
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
