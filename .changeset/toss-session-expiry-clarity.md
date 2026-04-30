---
"toss-securities": minor
---

Improve toss-securities session-expiry handling and diagnostics.

- Add `auth doctor` wiring and `checkSession()` helper.
- Add `TossSessionExpiredError` for clearer invalid-session failures.
- Promote silent empty-array responses from portfolio/watchlist into explicit session-expired errors when `auth doctor` says session is invalid.
- Add `search/stocks 403` upstream hinting for quote failures.
- Extend tests and README to document behavior and `tossctl >= 0.3.6` recommendation.
