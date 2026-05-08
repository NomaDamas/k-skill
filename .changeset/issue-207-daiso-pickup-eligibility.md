---
"daiso-product-search": minor
---

Restore actionable Daiso pickup answers when store pickup stock is blocked by adding a `selPkupStr`-backed `getStorePickupEligibility()` helper plus `pickupEligibility` field on `lookupStoreProductAvailability()`. When pickup stock returns `Unauthorized`, the package now reports whether the selected store is registered as a pickup-capable store for the product instead of only saying "unknown".
