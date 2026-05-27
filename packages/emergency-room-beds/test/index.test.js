const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildEmergencyRoomListRequest,
  normalizeEmergencyRoomRows,
  parseCoordinateQuery,
  searchNearbyEmergencyRoomsByCoordinates,
  searchNearbyEmergencyRoomsByLocationQuery
} = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");
const anchorSearchHtml = fs.readFileSync(path.join(fixturesDir, "anchor-search.html"), "utf8");
const anchorPanel = JSON.parse(fs.readFileSync(path.join(fixturesDir, "anchor-panel.json"), "utf8"));
const emergencyRoomList = JSON.parse(fs.readFileSync(path.join(fixturesDir, "emergency-room-list.json"), "utf8"));

const ORIGIN = {
  latitude: 37.57371315593711,
  longitude: 126.97833785777944
};

test("parseCoordinateQuery recognizes latitude/longitude pairs", () => {
  assert.deepEqual(parseCoordinateQuery("37.573713, 126.978338"), {
    latitude: 37.573713,
    longitude: 126.978338
  });
  assert.equal(parseCoordinateQuery("999, 999"), null);
  assert.equal(parseCoordinateQuery("광화문"), null);
});

test("buildEmergencyRoomListRequest targets E-Gen's public nearby ER endpoint", () => {
  const request = buildEmergencyRoomListRequest({
    ...ORIGIN,
    radius: 10,
    order: "accuracy",
    currentPageNum: 2,
    emergencyGradeCodes: ["A", "C"],
    hospitalName: "서울"
  });

  assert.equal(request.url, "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do");
  assert.equal(request.method, "POST");
  assert.equal(request.body.get("lat"), String(ORIGIN.latitude));
  assert.equal(request.body.get("lon"), String(ORIGIN.longitude));
  assert.equal(request.body.get("radius"), "10");
  assert.equal(request.body.get("order"), "accuracy");
  assert.equal(request.body.get("currentPageNum"), "2");
  assert.equal(request.body.get("emoggrdcStr"), "A,C");
  assert.equal(request.body.get("emogdesc"), "서울");
});

test("normalizeEmergencyRoomRows exposes nearby ER and inpatient bed operation flags", () => {
  const items = normalizeEmergencyRoomRows(emergencyRoomList, ORIGIN, { radius: 5 });

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => [item.id, item.name, item.emergencyGrade, item.distanceKm]), [
    ["A1100006", "강북삼성병원", "지역응급의료센터", 1.004],
    ["A1100017", "서울대학교병원", "권역응급의료센터", 2.447]
  ]);
  assert.deepEqual(items[0].bedStatus, {
    emergencyRoomOperating: true,
    inpatientBedsOperating: true,
    traumaCenter: null,
    pediatricSpecialty: null,
    currentGeneralCareAvailable: false,
    pediatricNightCare: false,
    holidayOpen: false,
    silson24Linked: true
  });
  assert.equal(items[1].bedStatus.pediatricSpecialty, true);
  assert.equal(items[0].updatedAt, "2026-03-11T14:26:33+09:00");
  assert.equal(items[0].mapUrl, "https://map.kakao.com/link/map/%EA%B0%95%EB%B6%81%EC%82%BC%EC%84%B1%EB%B3%91%EC%9B%90,37.568497631233,126.967938054517");
});

test("normalizeEmergencyRoomRows preserves unknown operation flags as null", () => {
  const payload = {
    list: [
      {
        TITLE: "상태미상병원",
        EMOGCODE: "UNKNOWN1",
        LAT: String(ORIGIN.latitude),
        LON: String(ORIGIN.longitude),
        EMOGERYN: "",
        EMOGPRYN: "UNKNOWN",
        EMOGTRYN: "N"
      }
    ]
  };

  const [item] = normalizeEmergencyRoomRows(payload, ORIGIN);

  assert.equal(item.bedStatus.emergencyRoomOperating, null);
  assert.equal(item.bedStatus.inpatientBedsOperating, null);
  assert.equal(item.bedStatus.traumaCenter, false);
});

test("normalizeEmergencyRoomRows skips invalid upstream hospital coordinates", () => {
  const items = normalizeEmergencyRoomRows(
    {
      list: [
        {
          TITLE: "좌표오류병원",
          EMOGCODE: "BADCOORD1",
          LAT: "91",
          LON: String(ORIGIN.longitude),
          EMOGERYN: "Y"
        },
        {
          TITLE: "정상좌표병원",
          EMOGCODE: "GOODCOORD1",
          LAT: String(ORIGIN.latitude),
          LON: String(ORIGIN.longitude),
          EMOGERYN: "Y"
        }
      ]
    },
    ORIGIN,
  );

  assert.deepEqual(items.map((item) => item.id), ["GOODCOORD1"]);
});

test("searchNearbyEmergencyRoomsByCoordinates rejects unknown E-Gen payload shapes", async () => {
  await assert.rejects(
    searchNearbyEmergencyRoomsByCoordinates({
      ...ORIGIN,
      fetchImpl: async () => makeResponse({ error: "blocked" })
    }),
    /Unexpected E-Gen emergency room payload shape/
  );
});

test("searchNearbyEmergencyRoomsByCoordinates posts to E-Gen and returns normalized items", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return makeResponse(emergencyRoomList);
  };

  const result = await searchNearbyEmergencyRoomsByCoordinates({
    ...ORIGIN,
    limit: 1,
    radius: 5,
    fetchImpl
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "강북삼성병원");
  assert.equal(result.meta.source, "e-gen");
  assert.equal(result.meta.bedCountLimitation, "E-Gen nearby ER list exposes operation flags, not exact real-time remaining bed counts.");
  assert.equal(calls[0].url, "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body.get("radius"), "5");
});

test("searchNearbyEmergencyRoomsByLocationQuery resolves a Kakao anchor before querying E-Gen", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const resolved = String(url);
    calls.push({ url: resolved, options });

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8")) {
      return makeResponse(anchorSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return makeResponse(anchorPanel, "application/json");
    }

    if (resolved === "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do") {
      assert.equal(options.body.get("lat"), String(ORIGIN.latitude));
      assert.equal(options.body.get("lon"), String(ORIGIN.longitude));
      return makeResponse(emergencyRoomList);
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchNearbyEmergencyRoomsByLocationQuery("광화문", {
    limit: 2,
    radius: 5,
    fetchImpl
  });

  assert.equal(result.anchor.name, "광화문");
  assert.equal(result.anchor.address, "서울특별시 종로구 세종대로 172");
  assert.equal(result.items.length, 2);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8",
    "https://place-api.map.kakao.com/places/panel3/1001",
    "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do"
  ]);
});

test("searchNearbyEmergencyRoomsByLocationQuery skips stale Kakao panels only", async () => {
  const multiSearchHtml = `
    <ul>
      <li class="search_item base" data-id="stale" data-title="광화문">
        <strong class="tit_g">광화문</strong>
        <span class="txt_g">서울특별시 종로구 세종대로 172</span>
      </li>
      <li class="search_item base" data-id="1001" data-title="광화문">
        <strong class="tit_g">광화문</strong>
        <span class="txt_g">서울특별시 종로구 세종대로 172</span>
      </li>
    </ul>
  `;
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const resolved = String(url);
    calls.push(resolved);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView")) {
      return makeResponse(multiSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/stale") {
      return makeResponse("gone", "text/plain", { ok: false, status: 410 });
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return makeResponse(anchorPanel, "application/json");
    }

    if (resolved === "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do") {
      assert.equal(options.body.get("lat"), String(ORIGIN.latitude));
      assert.equal(options.body.get("lon"), String(ORIGIN.longitude));
      return makeResponse(emergencyRoomList);
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  const result = await searchNearbyEmergencyRoomsByLocationQuery("광화문", { fetchImpl });

  assert.equal(result.anchor.id, "1001");
  assert.deepEqual(calls, [
    "https://m.map.kakao.com/actions/searchView?q=%EA%B4%91%ED%99%94%EB%AC%B8",
    "https://place-api.map.kakao.com/places/panel3/stale",
    "https://place-api.map.kakao.com/places/panel3/1001",
    "https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do"
  ]);
});

test("searchNearbyEmergencyRoomsByLocationQuery fails fast on Kakao rate limits", async () => {
  const fetchImpl = async (url) => {
    const resolved = String(url);

    if (resolved.startsWith("https://m.map.kakao.com/actions/searchView")) {
      return makeResponse(anchorSearchHtml, "text/html");
    }

    if (resolved === "https://place-api.map.kakao.com/places/panel3/1001") {
      return makeResponse("rate limited", "text/plain", { ok: false, status: 429 });
    }

    throw new Error(`unexpected url: ${resolved}`);
  };

  await assert.rejects(
    searchNearbyEmergencyRoomsByLocationQuery("광화문", { fetchImpl }),
    (error) => error.status === 429 && /place-api\.map\.kakao\.com/.test(error.url)
  );
});

test("searchNearbyEmergencyRoomsByCoordinates validates bounded inputs", async () => {
  await assert.rejects(
    searchNearbyEmergencyRoomsByCoordinates({ latitude: "x", longitude: 126.9 }),
    /latitude and longitude must be finite numbers/
  );
  await assert.rejects(
    searchNearbyEmergencyRoomsByCoordinates({ ...ORIGIN, limit: 0 }),
    /limit must be between 1 and 50/
  );
  await assert.rejects(
    searchNearbyEmergencyRoomsByCoordinates({ ...ORIGIN, radius: 0 }),
    /radius must be between 1 and 50/
  );
  await assert.rejects(
    searchNearbyEmergencyRoomsByCoordinates({ latitude: 91, longitude: 126.9 }),
    /latitude must be between -90 and 90/
  );
  await assert.rejects(
    searchNearbyEmergencyRoomsByCoordinates({ latitude: 37.5, longitude: 181 }),
    /longitude must be between -180 and 180/
  );
  assert.throws(
    () => buildEmergencyRoomListRequest({ latitude: -91, longitude: 126.9 }),
    /latitude must be between -90 and 90/
  );
});

function makeResponse(body, contentType = "application/json;charset=UTF-8", responseOptions = {}) {
  return {
    ok: responseOptions.ok ?? true,
    status: responseOptions.status ?? 200,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "content-type") {
          return contentType;
        }
        return null;
      }
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    }
  };
}
