# donation-place-search

Recommend Korean donation recipients by location and donation category.

The package combines:

- a public 1365 Give Korea (`www.1365.go.kr`) best-effort search-assist link builder for latest official verification;
- deterministic category/location ranking over a small curated fallback set of well-known donation recipients;
- Korean report formatting with cautions to verify current registration, campaign period, and donation receipt handling before donating.

No proxy and no API key are required. This package does **not** execute donations or submit personal/payment data.

```js
const {
  recommendDonationPlaces,
  formatDonationRecommendationReport
} = require("donation-place-search");

const result = recommendDonationPlaces({
  location: "서울 마포구",
  category: "동물",
  limit: 3
});

console.log(formatDonationRecommendationReport(result));
```

## Exports

- `recommendDonationPlaces(options)`
- `formatDonationRecommendationReport(result)`
- `build1365DonationSearchUrl(options)`
- `normalizeCategory(input)`
- `parseLocationQuery(location)`
- `CATEGORIES`
- `DONATION_PLACES`

## Notes

Donation campaigns and registration status change frequently. Always treat returned 1365 URLs as best-effort verification assists: open the 1365 official entry/search page and the recipient's official homepage before recommending a final donation decision.
