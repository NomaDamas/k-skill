const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");

const {
  remapLotteSeatRecord,
  remapLotteSeatsPayload,
} = require("../korean-cinema-search/scripts/remap_lotte_seats.js");

const REPO_ROOT = path.join(__dirname, "..");
const HELPER = path.join(REPO_ROOT, "korean-cinema-search", "scripts", "remap_lotte_seats.js");

function daisoSeat({ bookedSeats, remainingSeats, totalSeats = 79, extra = {} }) {
  return {
    startTime: "19:10",
    movieName: "오디세이",
    screenName: "3관",
    theaterName: "안양일번가",
    totalSeats,
    bookedSeats,
    remainingSeats,
    ...extra,
  };
}

test("remapLotteSeatRecord treats daiso bookedSeats as remaining seats", () => {
  const remapped = remapLotteSeatRecord(daisoSeat({ bookedSeats: 56, remainingSeats: 23 }));

  assert.equal(remapped.totalSeats, 79);
  assert.equal(remapped.bookedSeats, 23);
  assert.equal(remapped.remainingSeats, 56);
  assert.equal(remapped.seatFieldsRemapped, true);
});

test("remapLotteSeatRecord turns a daiso all-available mislabel into remaining=total", () => {
  const remapped = remapLotteSeatRecord(daisoSeat({ bookedSeats: 79, remainingSeats: 0, totalSeats: 79 }));

  assert.equal(remapped.bookedSeats, 0);
  assert.equal(remapped.remainingSeats, 79);
});

test("remapLotteSeatsPayload remaps nested daiso lottecinema-seats JSON", () => {
  const payload = {
    success: true,
    data: {
      playDate: "20260817",
      seats: [
        daisoSeat({ bookedSeats: 56, remainingSeats: 23 }),
        daisoSeat({ bookedSeats: 78, remainingSeats: 0, totalSeats: 78, extra: { startTime: "21:20" } }),
      ],
    },
  };

  const remapped = remapLotteSeatsPayload(payload);
  assert.equal(remapped.data.seats[0].bookedSeats, 23);
  assert.equal(remapped.data.seats[0].remainingSeats, 56);
  assert.equal(remapped.data.seats[1].bookedSeats, 0);
  assert.equal(remapped.data.seats[1].remainingSeats, 78);
});

test("remapLotteSeatsPayload leaves megabox-style remaining-only records unchanged", () => {
  const megabox = { movieName: "오디세이", remainingSeats: 40, totalSeats: 120 };
  assert.deepEqual(remapLotteSeatsPayload(megabox), megabox);
});

test("remapLotteSeatsPayload leaves non-numeric seat fields unchanged", () => {
  const broken = { totalSeats: 79, bookedSeats: "many", remainingSeats: 1 };
  assert.deepEqual(remapLotteSeatsPayload(broken), broken);
});

test("CLI remaps stdin JSON and keeps wrapper metadata", () => {
  const input = JSON.stringify({
    success: true,
    meta: { source: "daiso" },
    data: { seats: [daisoSeat({ bookedSeats: 56, remainingSeats: 23 })] },
  });
  const stdout = childProcess.execFileSync(process.execPath, [HELPER], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    input,
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.success, true);
  assert.equal(parsed.meta.source, "daiso");
  assert.equal(parsed.data.seats[0].bookedSeats, 23);
  assert.equal(parsed.data.seats[0].remainingSeats, 56);
});
