# daiso-product-search

## 0.6.0

### Minor Changes

- 7c2dc59: Restore Daiso store pickup stock quantities through the official non-login Bearer flow (`/api/auth/request` + AES-128-CBC token) while keeping the resilient `selPkupStr` fallback API. `getStorePickupStock()` now retries once with a fresh token on 401/403 and returns structured `retrievalStatus: "blocked"` after repeated auth blocks instead of throwing. `getStorePickupEligibility()` remains public, and `lookupStoreProductAvailability()` fills `pickupEligibility` when exact pickup stock remains unavailable.

## 0.5.0

### Minor Changes

- 01cd887: Restore Daiso store pickup stock quantities through the official non-login Bearer flow (`/api/auth/request` + AES-128-CBC token) while keeping the resilient `selPkupStr` fallback API. `getStorePickupStock()` now retries once with a fresh token on 401/403 and returns structured `retrievalStatus: "blocked"` after repeated auth blocks instead of throwing. `getStorePickupEligibility()` remains public, and `lookupStoreProductAvailability()` fills `pickupEligibility` when exact pickup stock remains unavailable.

## 0.4.0

### Minor Changes

- 271ea18: Restore Daiso store pickup stock quantities through the official non-login Bearer flow (`/api/auth/request` + AES-128-CBC token) while keeping the resilient `selPkupStr` fallback API. `getStorePickupStock()` now retries once with a fresh token on 401/403 and returns structured `retrievalStatus: "blocked"` after repeated auth blocks instead of throwing. `getStorePickupEligibility()` remains public, and `lookupStoreProductAvailability()` fills `pickupEligibility` when exact pickup stock remains unavailable.

## 0.3.0

### Minor Changes

- af55f58: Restore actionable Daiso pickup answers when store pickup stock is blocked by adding a `selPkupStr`-backed `getStorePickupEligibility()` helper plus `pickupEligibility` field on `lookupStoreProductAvailability()`. When pickup stock returns `Unauthorized`, the package now reports whether the selected store is registered as a pickup-capable store for the product instead of only saying "unknown".

### Patch Changes

- e873308: Handle Daiso Mall pickup-stock Unauthorized responses as structured unavailable results, include pickup-stock retrieval and inventory states, and mark online-stock fallback as reference-only.

## 0.2.0

### Minor Changes

- 2352856: Publish the official Daiso Mall store and pickup-stock lookup package.
