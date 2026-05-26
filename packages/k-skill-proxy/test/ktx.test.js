const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeKtxCancelBody,
  normalizeKtxNcardSearchQuery,
  normalizeKtxReserveBody,
  normalizeKtxSearchQuery,
  proxyKtxSearch
} = require("../src/ktx");

test("KTX search normalizer accepts aliases and clamps limit", () => {
  assert.deepEqual(
    normalizeKtxSearchQuery({
      dep: "오송",
      arr: "서울",
      date: "20260526",
      time: "225000",
      limit: "999",
      includeNoSeats: "true",
      include_waiting_list: "1",
      train_type: "all"
    }),
    {
      departure: "오송",
      arrival: "서울",
      date: "20260526",
      time: "225000",
      trainType: "all",
      limit: 20,
      includeNoSeats: true,
      includeWaitingList: true,
      adults: 1,
      children: 0,
      toddlers: 0,
      seniors: 0
    }
  );
});

test("KTX normalizers validate required identifiers", () => {
  assert.throws(
    () => normalizeKtxSearchQuery({ departure: "오송", arrival: "서울", date: "20260526" }),
    /time/
  );
  assert.throws(
    () => normalizeKtxReserveBody({ departure: "오송", arrival: "서울", date: "20260526", time: "225000" }),
    /train_id/
  );
  assert.deepEqual(normalizeKtxCancelBody({ reservation_id: "12345" }), { reservationId: "12345" });
});

test("KTX N-card search uses one-based N-card index", () => {
  assert.deepEqual(
    normalizeKtxNcardSearchQuery({
      departure: "대전",
      arrival: "서울",
      date: "20260526",
      time: "100000",
      ncardIndex: "1"
    }),
    {
      departure: "대전",
      arrival: "서울",
      date: "20260526",
      time: "100000",
      ncardIndex: 1,
      trainType: "ktx",
      limit: 5
    }
  );
  assert.throws(
    () => normalizeKtxNcardSearchQuery({
      departure: "대전",
      arrival: "서울",
      date: "20260526",
      time: "100000",
      ncardIndex: "0"
    }),
    /ncardIndex/
  );
});

test("KTX proxy reports missing credentials before spawning helper", () => {
  assert.throws(
    () => proxyKtxSearch(
      normalizeKtxSearchQuery({
        departure: "오송",
        arrival: "서울",
        date: "20260526",
        time: "225000"
      }),
      {}
    ),
    /KSKILL_KTX_ID/
  );
});
