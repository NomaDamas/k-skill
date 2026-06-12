# toss-securities

## 0.5.0

### Minor Changes

- 66f12cb: Add an official Toss Securities Open API client alongside the existing unofficial `tossctl` wrapper. The package now ships read-only helpers backed by the official REST API (`https://openapi.tossinvest.com`): OAuth 2.0 Client Credentials token issuance with an in-memory token cache, bearer + `X-Tossinvest-Account` header handling, `TossApiError`/`TossCredentialsError` envelopes with secret/token redaction, and 429 `Retry-After`/backoff retry. New read-only helpers cover prices, orderbook, trades, price limits, candles, stocks, stock warnings, exchange rate, market calendars, accounts, holdings, open orders, order detail, buying power, sellable quantity, and commissions. Credentials are read from `TOSSINVEST_CLIENT_ID`/`TOSSINVEST_CLIENT_SECRET` (optional `TOSSINVEST_ACCOUNT`/`TOSSINVEST_API_BASE_URL`) and sent directly to Toss, never through a shared proxy. Order mutation (create/modify/cancel) remains out of scope. The `tossctl` path is retained as a documented fallback.

## 0.4.0

### Minor Changes

- 01de419: Improve toss-securities session-expiry handling and diagnostics.

  - Add `auth doctor` wiring and `checkSession()` helper.
  - Add `TossSessionExpiredError` for clearer invalid-session failures.
  - Promote silent empty-array responses from portfolio/watchlist into explicit session-expired errors when `auth doctor` says session is invalid.
  - Add `search/stocks 403` upstream hinting for quote failures.
  - Extend tests and README to document behavior and `tossctl >= 0.3.6` recommendation.

## 0.3.0

### Minor Changes

- 3cea4be: Improve toss-securities session-expiry handling and diagnostics.

  - Add `auth doctor` wiring and `checkSession()` helper.
  - Add `TossSessionExpiredError` for clearer invalid-session failures.
  - Promote silent empty-array responses from portfolio/watchlist into explicit session-expired errors when `auth doctor` says session is invalid.
  - Add `search/stocks 403` upstream hinting for quote failures.
  - Extend tests and README to document behavior and `tossctl >= 0.3.6` recommendation.

## 0.2.0

### Minor Changes

- 2700e42: Add the first safe read-only Toss Securities wrapper package and skill docs.
