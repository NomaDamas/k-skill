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
  assert.equal(body.upstreams.seoulOpenApiConfigured, false);
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
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "upstream_not_configured");
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

  const url = "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC&pageNo=1&numOfRows=20";

  const first = await app.inject({ method: "GET", url });
  assert.equal(first.statusCode, 200);
  const firstBody = first.json();
  assert.equal(firstBody.proxy.cache.hit, false);
  assert.equal(firstBody.query.sgg_nm, "강남구");
  assert.equal(firstBody.query.page_no, "1");
  assert.equal(firstBody.query.num_of_rows, "20");
  assert.equal(firstBody.response.body.items[0].SGG_NM, "강남구");

  assert.equal(fetchCalls.length, 1);
  const upstream = new URL(fetchCalls[0]);
  assert.equal(upstream.origin + upstream.pathname, "https://apis.data.go.kr/1741000/household_waste_info/info");
  assert.equal(upstream.searchParams.get("serviceKey"), "test-key");
  assert.equal(upstream.searchParams.get("returnType"), "json");
  assert.equal(upstream.searchParams.get("pageNo"), "1");
  assert.equal(upstream.searchParams.get("numOfRows"), "20");
  assert.equal(upstream.searchParams.get("cond[SGG_NM::LIKE]"), "강남구");

  const second = await app.inject({ method: "GET", url });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().proxy.cache.hit, true);
  assert.equal(fetchCalls.length, 1);
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
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EC%88%98%EC%9B%90%EC%8B%9C&returnType=xml"
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
    url: "/v1/household-waste/info?cond%5BSGG_NM%3A%3ALIKE%5D=%EA%B0%95%EB%82%A8%EA%B5%AC"
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "upstream_error");
});
