const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWaterLevelReport,
  fetchWaterLevelReport,
  pickWaterLevelStation
} = require("../src/hrfco");

const stationItems = [
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
  },
  {
    wlobscd: "1018680",
    obsnm: "한강철교",
    agcnm: "한강홍수통제소",
    addr: "서울특별시 동작구",
    etcaddr: "한강철교"
  }
];

const measurementItems = [
  {
    wlobscd: "1018683",
    ymdhm: "202604051900",
    wl: "0.66",
    fw: "208.58"
  }
];

test("pickWaterLevelStation prefers exact station code matches", () => {
  const station = pickWaterLevelStation(stationItems, {
    stationCode: "1018683"
  });

  assert.equal(station.obsnm, "한강대교");
});

test("pickWaterLevelStation returns candidate stations for ambiguous names", () => {
  assert.throws(
    () => pickWaterLevelStation(stationItems, { stationName: "한강" }),
    (error) =>
      error.code === "ambiguous_station" &&
      Array.isArray(error.candidateStations) &&
      error.candidateStations.includes("한강대교") &&
      error.candidateStations.includes("한강철교")
  );
});

test("pickWaterLevelStation matches parenthetical station aliases before broader partial matches", () => {
  const station = pickWaterLevelStation(
    [
      { wlobscd: "1005697", obsnm: "원주시(남한강대교)" },
      { wlobscd: "1018683", obsnm: "서울시(한강대교)" }
    ],
    { stationName: "한강대교" }
  );

  assert.equal(station.wlobscd, "1018683");
});

test("buildWaterLevelReport combines station metadata and latest measurement", () => {
  const report = buildWaterLevelReport({
    stationItems,
    measurementItems,
    stationName: "한강대교"
  });

  assert.equal(report.station_name, "한강대교");
  assert.equal(report.station_code, "1018683");
  assert.deepEqual(report.water_level, { value_m: 0.66, unit: "m" });
  assert.deepEqual(report.flow_rate, { value_cms: 208.58, unit: "m^3/s" });
  assert.equal(report.thresholds.warning_level_m, 8);
  assert.equal(report.special_report_station, true);
});

test("fetchWaterLevelReport uses station info lookup before latest measurement lookup", async () => {
  const calls = [];
  const report = await fetchWaterLevelReport({
    stationName: "한강대교",
    serviceKey: "test-key",
    fetchImpl: async (url) => {
      const text = String(url);
      calls.push(text);

      if (text.endsWith("/waterlevel/info.json")) {
        return new Response(JSON.stringify({ content: stationItems }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (text.includes("/waterlevel/list/10M/1018683.json")) {
        return new Response(JSON.stringify({ content: measurementItems }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`unexpected URL: ${url}`);
    }
  });

  assert.equal(report.station_name, "한강대교");
  assert.equal(report.flow_rate.value_cms, 208.58);
  assert.deepEqual(calls.map((url) => url.split("/").slice(-3).join("/")), [
    "test-key/waterlevel/info.json",
    "list/10M/1018683.json"
  ]);
});
