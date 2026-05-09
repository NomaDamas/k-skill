# korean-marathon-schedule

Public Korean marathon and triathlon schedule lookup client for the `korean-marathon-schedule` k-skill.

## Sources

- Marathon/road-running: `https://gorunning.kr/races/` public race list and same-host public race detail pages.
- Triathlon: `https://triathlon.or.kr/events/tour/?sYear=<year>&vType=list` and same-host public federation detail pages; non-competition education/admin entries are skipped.

Both sources are unauthenticated public web surfaces. No proxy or API key is required. Off-origin detail links are ignored, and searches continue through source lists until enough matching results are collected, the source list is exhausted, or the configurable per-source detail budget is reached. The triathlon budget is shared across all selected year lists. The default budget is `max(300, limit * 10)`; when a budget is exhausted before the source list ends, a warning is returned.

## Usage

```js
const { searchEvents } = require("korean-marathon-schedule")

const result = await searchEvents({
  query: "서울",
  from: "2026-05-01",
  to: "2026-12-31",
  includeTriathlon: true,
  limit: 5,
  maxDetailsPerSource: 100
})

console.log(result.items)
```

CLI:

```bash
npx korean-marathon-schedule 서울 --from 2026-05-01 --to 2026-12-31 --include-triathlon --limit 5 --max-details-per-source 100
```

Returned event fields include `title`, `eventDate`, `region`, `venue`, `registrationDeadline`, `registrationPeriod`, `categories`, `organizer`, `officialUrl`, and source `url`.
