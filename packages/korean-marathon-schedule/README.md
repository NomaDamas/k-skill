# korean-marathon-schedule

Public Korean marathon and triathlon schedule lookup client for the `korean-marathon-schedule` k-skill.

## Sources

- Marathon/road-running: `https://gorunning.kr/races/` public race list and public race detail pages.
- Triathlon: `https://triathlon.or.kr/events/tour/?sYear=<year>&vType=list` and public federation detail pages.

Both sources are unauthenticated public web surfaces. No proxy or API key is required.

## Usage

```js
const { searchEvents } = require("korean-marathon-schedule")

const result = await searchEvents({
  query: "서울",
  from: "2026-05-01",
  to: "2026-12-31",
  includeTriathlon: true,
  limit: 5
})

console.log(result.items)
```

CLI:

```bash
npx korean-marathon-schedule 서울 --from 2026-05-01 --to 2026-12-31 --include-triathlon --limit 5
```

Returned event fields include `title`, `eventDate`, `region`, `venue`, `registrationDeadline`, `registrationPeriod`, `categories`, `organizer`, `officialUrl`, and source `url`.
