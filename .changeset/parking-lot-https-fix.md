---
"parking-lot-search": patch
---

Fix parking lot lookups after Data.go.kr enforced HTTPS on `api.data.go.kr`.

- Switch the official API URL from `http://` to `https://` so callers that use `buildOfficialParkingLotApiUrl` / direct-API mode no longer hit the HTTP → HTTPS 301 redirect that broke Node `fetch` based clients.
- Recognize the upstream's camelCase `insttCode` / `insttNm` provider fields in addition to the previously-handled snake_case variants so `providerCode` / `providerName` stay populated.
