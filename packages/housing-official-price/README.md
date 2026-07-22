# housing-official-price

Clean-room MIT Node.js helpers for read-only Korean apartment and individual-house official prices from `realtyprice.kr`.

`realtyprice.kr` is treated as a browser-visible public web data surface, not a documented OpenAPI / 공식 문서화된 OpenAPI가 아님. The package calls public endpoints directly from the user's machine, without API keys, login, CAPTCHA solving, or `k-skill-proxy`.

## Install

```bash
npm install housing-official-price
```

For repository development:

```bash
npm install
npm test --workspace housing-official-price
npm run lint --workspace housing-official-price
```

## API

```js
const {
  lookupIndividualHousePriceByPnu,
  searchApartmentCandidates,
  lookupApartmentOfficialPrice,
  DEFAULT_TIMEOUT_MS,
} = require("housing-official-price");
```

### Individual-house official price by PNU

```js
const result = await lookupIndividualHousePriceByPnu("9999999999199999999");
console.log(result.history[0].price_won);
```

The PNU must be 19 digits. The package does not infer missing legal-dong or parcel digits.

### Apartment candidate search

```js
const candidates = await searchApartmentCandidates({ complexName: "샘플하우징" });
console.log(candidates.candidates.map((item) => ({
  aptCode: item.aptCode,
  noticeDate: item.noticeDate,
  complexName: item.complexName,
})));
```

If more than one candidate matches, show the candidate list to the user and pass an explicit `aptCode` or full `candidate` object. Do not silently select the first result.

### Apartment official price history

```js
const result = await lookupApartmentOfficialPrice({
  candidate: {
    noticeDate: "20260626",
    aptCode: "99000001",
    complexName: "샘플하우징A동",
  },
  dongName: "A",
  hoName: "101",
});

console.log(result.history);
```

Dong/ho can be selected by exact code or name. Ambiguous matches throw typed errors instead of guessing.

## Output shape

Every result includes source metadata:

```json
{
  "site": "realtyprice.kr",
  "endpoint": "/notice/m/town/getPriceYear.do",
  "api_documented": false,
  "access": "public-web-data-surface"
}
```

Individual-house OK results include:

```json
{
  "status": "ok",
  "query": { "type": "individual-house", "pnu": "9999999999199999999" },
  "selected": {
    "pnu": "9999999999199999999",
    "bjdCode": "9999999999",
    "regCode": "99999",
    "eubCode": "99999",
    "san": "1",
    "bun1": "9999",
    "bun2": "9999",
    "address": "테스트시 샘플구 예시동 999"
  },
  "history": [
    {
      "year": 2026,
      "base_date": "2026-01-01",
      "notice_date": "2026-04-30",
      "price_won": 232000000,
      "land_area_sqm": 57.5,
      "building_gross_area_sqm": 60,
      "residential_area_sqm": 55.25
    }
  ]
}
```

Apartment OK results include selected `candidate`, selected `unit`, and yearly `history` with `price_won`, `private_area_sqm`, `base_date`, and `notice_date`.

The upstream has exposed both `model.list` and `modelMap.list`/`modelMap.totalCnt`; this package normalizes both shapes.

## Errors

| `error.code` | Meaning |
| --- | --- |
| `INVALID_PNU` | PNU is not exactly 19 digits or has an invalid land-type digit |
| `INVALID_SELECTOR` | Required apartment selector is missing or does not match |
| `AMBIGUOUS_APARTMENT_CANDIDATE` | Multiple apartment candidates matched |
| `AMBIGUOUS_APARTMENT_DONG` / `AMBIGUOUS_APARTMENT_HO` | Multiple dong/ho choices matched |
| `INDIVIDUAL_HOUSE_NOT_FOUND` / `APARTMENT_CANDIDATE_NOT_FOUND` | Upstream returned an empty result with zero count |
| `UPSTREAM_AMBIGUOUS_EMPTY` | Upstream reported a positive `totalCnt` with an empty/null list |
| `UPSTREAM_HTTP_ERROR` | Upstream HTTP response was non-2xx |
| `UPSTREAM_MALFORMED_JSON` / `UPSTREAM_MALFORMED_HTML` | Upstream response could not be parsed |
| `UPSTREAM_SCHEMA_DRIFT` | Expected fields were absent or had an unexpected shape |
| `UPSTREAM_TIMEOUT` | `DEFAULT_TIMEOUT_MS` (30000 ms) or caller `timeoutMs` elapsed |
| `UPSTREAM_FETCH_ERROR` | Network failed before an HTTP response arrived |

## Timeout and safety

- Default timeout is `DEFAULT_TIMEOUT_MS = 30000`.
- Pass `timeoutMs` to tighten the package-managed timeout.
- Pass `signal` to preserve caller-managed cancellation; the package will not add its own timeout signal in that case.
- Keep calls user-triggered and low volume. Do not bulk crawl or persist live response values as fixtures.
- This package is read-only and never logs in, solves CAPTCHA, makes legal/tax judgments, or treats official price as market/transaction price.

## Neighboring skills

- `gongsijiga-search`: land official price / 개별공시지가 for parcels.
- `real-estate-search`: transaction data / 실거래가 and rent records.
- `building-register-search`: register metadata / 건축물대장 표제부.
- `housing-official-price`: apartment and individual-house official prices.
