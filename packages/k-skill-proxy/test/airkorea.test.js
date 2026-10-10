const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReport,
  fetchFineDustReport,
  pickStation
} = require("../src/airkorea");

const stationPayload = {
  response: {
    body: {
      items: [
        {
          stationName: "강남구",
          addr: "서울 강남구 학동로 426",
          dmX: 37.5179,
          dmY: 127.0473
        },
        {
          stationName: "중구",
          addr: "서울 중구 서소문로 124",
          dmX: 37.564,
          dmY: 126.975
        }
      ]
    }
  }
};

const measurementPayload = {
  response: {
    body: {
      items: [
        {
          stationName: "강남구",
          dataTime: "2026-03-27 21:00",
          pm10Value: "42",
          pm10Grade: "2",
          pm25Value: "19",
          pm25Grade: "2",
          khaiGrade: "2"
        }
      ]
    }
  }
};

test("pickStation prefers specific region token matches", () => {
  const station = pickStation(stationPayload.response.body.items, {
    regionHint: "서울 강남구"
  });

  assert.equal(station.stationName, "강남구");
});

test("buildReport combines station and measurement summary", () => {
  const report = buildReport({
    stationItems: stationPayload.response.body.items,
    measurementItems: measurementPayload.response.body.items,
    regionHint: "서울 강남구"
  });

  assert.equal(report.station_name, "강남구");
  assert.deepEqual(report.pm10, { value: "42", grade: "보통" });
  assert.deepEqual(report.pm25, { value: "19", grade: "보통" });
  assert.equal(report.lookup_mode, "fallback");
});

test("fetchFineDustReport uses station-info lookup before measurement lookup", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));

    if (String(url).includes("getMsrstnList")) {
      return new Response(JSON.stringify({
        response: {
          body: {
            items: [stationPayload.response.body.items[0]]
          }
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (String(url).includes("getMsrstnAcctoRltmMesureDnsty")) {
      return new Response(JSON.stringify(measurementPayload), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const report = await fetchFineDustReport({
    regionHint: "서울 강남구",
    serviceKey: "test-key",
    fetchImpl
  });

  assert.equal(report.station_name, "강남구");
  assert.equal(report.lookup_mode, "fallback");
  assert.deepEqual(calls.map((url) => url.split("/").at(-1)?.split("?")[0]), [
    "getMsrstnList",
    "getMsrstnAcctoRltmMesureDnsty"
  ]);
});

test("fetchFineDustReport falls back to direct measurement lookup when station-info access is forbidden", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const text = String(url);
    calls.push(text);

    if (text.includes("getMsrstnList")) {
      return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
    }

    if (text.includes("getMsrstnAcctoRltmMesureDnsty")) {
      return new Response(JSON.stringify(measurementPayload), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  const report = await fetchFineDustReport({
    regionHint: "서울 강남구",
    serviceKey: "test-key",
    fetchImpl
  });

  assert.equal(report.station_name, "강남구");
  assert.equal(report.station_address, null);
  assert.equal(report.lookup_mode, "fallback");
  assert.deepEqual(calls.map((url) => url.split("/").at(-1)?.split("?")[0]), [
    "getMsrstnList",
    "getMsrstnAcctoRltmMesureDnsty"
  ]);
});

test("fetchFineDustReport returns a helpful 400 when district tokens do not map to station names", async () => {
  const fetchImpl = async (url) => {
    const text = String(url);

    if (text.includes("getMsrstnList")) {
      return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
    }

    if (text.includes("getMsrstnAcctoRltmMesureDnsty")) {
      return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (text.includes("getCtprvnRltmMesureDnsty")) {
      return new Response(JSON.stringify({
        response: {
          body: {
            items: [
              { stationName: "평동", dataTime: "2026-03-28 17:00", pm10Value: "48", pm10Grade: "2", pm25Value: "25", pm25Grade: "2", khaiGrade: "2" },
              { stationName: "오선동", dataTime: "2026-03-28 17:00", pm10Value: "38", pm10Grade: "2", pm25Value: "23", pm25Grade: "2", khaiGrade: "2" }
            ]
          }
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  await assert.rejects(
    () => fetchFineDustReport({
      regionHint: "광주 광산구",
      serviceKey: "test-key",
      fetchImpl
    }),
    (error) =>
      error.statusCode === 400 &&
      error.code === "ambiguous_location" &&
      error.sidoName === "광주" &&
      Array.isArray(error.candidateStations) &&
      error.candidateStations.includes("평동") &&
      error.candidateStations.includes("오선동")
  );
});

test("fetchJson preserves the cause chain so connect timeouts classify as upstream_timeout", async () => {
  const { classifyUpstreamFailure } = require("../src/upstream-errors");
  const timeout = new TypeError("fetch failed");
  timeout.cause = Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });

  await assert.rejects(
    fetchFineDustReport({
      stationName: "종로구",
      serviceKey: "test-key",
      fetchImpl: async () => {
        throw timeout;
      }
    }),
    (error) => {
      assert.equal(error.message, "AirKorea upstream request failed.");
      assert.equal(error.operation, "airkorea.fetchJson");
      assert.equal(error.cause, timeout);
      assert.deepEqual(classifyUpstreamFailure(error), {
        error: "upstream_timeout",
        cause: "UND_ERR_CONNECT_TIMEOUT",
        statusCode: 504
      });
      return true;
    }
  );
});

test("fetchJson preserves the cause chain so DNS failures classify as upstream_unreachable", async () => {
  const { classifyUpstreamFailure } = require("../src/upstream-errors");
  const dnsFailure = new TypeError("fetch failed");
  dnsFailure.cause = Object.assign(new Error("getaddrinfo ENOTFOUND apis.data.go.kr"), { code: "ENOTFOUND" });

  await assert.rejects(
    fetchFineDustReport({
      stationName: "종로구",
      serviceKey: "test-key",
      fetchImpl: async () => {
        throw dnsFailure;
      }
    }),
    (error) => {
      assert.deepEqual(classifyUpstreamFailure(error), {
        error: "upstream_unreachable",
        cause: "ENOTFOUND",
        statusCode: 503
      });
      return true;
    }
  );
});

test("fetchJson does not misclassify upstream HTTP errors as network failures", async () => {
  const { classifyUpstreamFailure } = require("../src/upstream-errors");

  await assert.rejects(
    fetchFineDustReport({
      stationName: "종로구",
      serviceKey: "test-key",
      fetchImpl: async () => new Response("forbidden", { status: 403 })
    }),
    (error) => {
      assert.match(error.message, /403 Forbidden/);
      assert.equal(classifyUpstreamFailure(error), null);
      return true;
    }
  );

  await assert.rejects(
    fetchFineDustReport({
      stationName: "종로구",
      serviceKey: "test-key",
      fetchImpl: async () => new Response("gateway error body", { status: 502 })
    }),
    (error) => {
      assert.match(error.message, /HTTP 502/);
      assert.equal(error.upstreamStatus, 502);
      assert.equal(error.upstreamBody, "gateway error body");
      assert.equal(classifyUpstreamFailure(error), null);
      return true;
    }
  );
});
