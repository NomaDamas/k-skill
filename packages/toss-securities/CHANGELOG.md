# toss-securities

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
