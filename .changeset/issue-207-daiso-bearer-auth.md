---
"daiso-product-search": minor
---

Restore Daiso store pickup stock quantities through the official non-login Bearer flow (`/api/auth/request` + AES-128-CBC token) while keeping the resilient `selPkupStr` fallback API. `getStorePickupStock()` now retries once with a fresh token on 401/403 and returns structured `retrievalStatus: "blocked"` after repeated auth blocks instead of throwing. `getStorePickupEligibility()` remains public, and `lookupStoreProductAvailability()` fills `pickupEligibility` when exact pickup stock remains unavailable.
