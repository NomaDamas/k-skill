# s2b-notice-search

Dependency-free CommonJS helpers for S2B school marketplace notice lookup.

The package is read-only. It normalizes search options, builds a browser/direct-HTTP recipe using S2B's observed `tcmo001Form` field names for `https://www.s2b.kr/S2BNCustomer/tcmo001.do`, parses fixture HTML for list/detail pages, and emits browser automation instructions.

```js
const {
  buildSearchRequest,
  normalizeSearchOptions,
  parseListHtml
} = require("s2b-notice-search")

const options = normalizeSearchOptions({
  keyword: "냉장고",
  dateStart: "2026-06-01",
  dateEnd: "2026-06-30",
  itemType: "물품",
  privateContract: "1인"
})

const request = buildSearchRequest(options)
const rows = parseListHtml("<table>...</table>")
```

Use browser automation first because S2B may depend on session/form state. Direct HTTP is only a best-effort fallback when the same session and form tokens work.
