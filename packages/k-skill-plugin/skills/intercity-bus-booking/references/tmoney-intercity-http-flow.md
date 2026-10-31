# Tmoney 시외버스 HTTP/API Probe Notes

Session-proven on 2026-05-08 and re-verified on 2026-05-13. Goal: avoid browser automation where possible.

## Base

```text
https://intercitybus.tmoney.co.kr
```

Use a normal browser User-Agent, cookie jar, and referers.

## Tested Flow

### Timetable

```text
POST /otck/readAlcnList.do
```

Example tested route/date:

```text
동서울(0511601) -> 속초(2482701), 2026-05-09
```

Observed results:

```text
2026-05-09: 14 reservation buttons/schedules
2026-05-20: 20 readSasFeeInf schedule buttons, first departure 06:05 금강고속 우등, 24/28 seats
```

Typical POST fields:

```text
depr_Trml_Cd=0511601
arvl_Trml_Cd=2482701
depr_Trml_Nm=동서울
arvl_Trml_Nm=속초
ig=1
im=0
ic=0
iv=0
depr_Dt=YYYYMMDD
depr_Time=000000
bef_Aft_Dvs=D
req_Rec_Num=10
```

`bef_Aft_Dvs=D` and `req_Rec_Num=10` are not optional. They are appended by the site JavaScript (`readAlcnListEntry(bef_Aft_Dvs, req_Rec_Num)`) before the browser submits `#onewayInfo`. Omitting them returned a generic error page (`errorCont`, about 13,770 bytes) with no `readSasFeeInf(...)` schedules in live probing.

The next-stage values are embedded in `readSasFeeInf(...)` onclick calls. Example prefix:

```text
readSasFeeInf('RT201603150047276','1','20260509','1','0511601','2482701','동서울','속초','060500','C004','IDP','금강고속','우등','1','0','0','8','28', ...)
```

### Fare / Seat-Count Stage

```text
POST /otck/readSatsFee.do
```

Send selected values from `readSasFeeInf(...)` plus passenger counts and original search fields.

Observed response contained `form#readPcpySats` and hidden values:

```json
{
  "rot_Id": "RT201603150047276",
  "alcn_Sqno": "1",
  "depr_Trml_Cd": "0511601",
  "arvl_Trml_Cd": "2482701",
  "depr_Time": "060500",
  "igFee": "21300",
  "imFee": "17000",
  "icFee": "10700",
  "total": "21300"
}
```

### Temporary Hold / Card-Information Entry

```text
POST /otck/readPcpySats.do
```

Send `readPcpySats` hidden fields plus selected seat fields:

```text
pcpy_Num
sats_No
bus_Tck_Knd_Cd
cty_Bus_Dc_Knd_Cd
dcrt_Dvs_Cd
rtrp_Depr_Dt
```

Observed success markers:

```text
카드정보 입력
sats_Pcpy_Id
```

Re-verified on 2026-05-13 with 동서울 -> 속초, 2026-05-20, 06:05 금강고속 우등, seat 1. `readPcpySats.do` returned `카드정보 입력` and `sats_Pcpy_Id=SP...`. Posting the resulting cancel/back fields with `pcpyCanc=C` to `/otck/readSatsFee.do` returned to the seat-selection page and subsequent timetable lookup still showed 24/28 seats.

### Cancellation / Back Flow

A POST back to `/otck/readSatsFee.do` with `pcpyCanc=C` and the hold fields returned to seat selection and appeared to release the temporary hold in testing.

## Mobile Notes

- iPhone Safari-style mobile User-Agent returned HTTP 200 with `카드정보 입력` and `sats_Pcpy_Id` present.
- A replayed Discord/Android in-app User-Agent test returned a generic `발행을 실패하였습니다` page. Because the same seat/hold payload had already been used, treat this as a stale/replayed hold caveat rather than proof that mobile is unsupported.
- For real use, generate a fresh hold payload, send a helper link, and ask the user to open it in an external browser if an in-app browser fails.

## Interpretation

- Login was not required for timetable lookup, fare/seat-stage entry, or card-information page entry in the tested flow.
- CAPTCHA was not observed in the tested flow.
- A generic `errorCont` response usually means the posted form contract is incomplete, not necessarily that the route is unavailable; first verify `bef_Aft_Dvs` and `req_Rec_Num`.
- Payment/card-info submission is separate and should not be automated without explicit confirmation.
- The live card-information page did not expose an exact countdown/expiry text in probes. Treat temporary holds as short-lived: hand off immediately, and post the cancel/back fields for abandoned holds.
- Terminal codes are Tmoney-specific and must not be mixed with KOBUS codes.
