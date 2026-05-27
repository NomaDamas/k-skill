# gangnamunni-clinic-search

Public Gangnam Unni clinic lookup client for the `gangnamunni-clinic-search` k-skill.

## Source

- Search page: `https://www.gangnamunni.com/search?q=<keyword>`
- Data path: the server-rendered Next.js `__NEXT_DATA__` payload, specifically `props.pageProps.hospitals` and related count fields.

This is an unauthenticated public web surface. No proxy or API key is required. The client does not automate login, appointments, chat, payment, reviews, or app-only flows.

## Usage

```js
const { searchClinics } = require("gangnamunni-clinic-search")

const result = await searchClinics({
  query: "강남 성형외과",
  limit: 5
})

console.log(result.items)
```

CLI:

```bash
npx gangnamunni-clinic-search "강남 성형외과" --limit 5
```

Returned clinic fields include `id`, `name`, `rating`, `ratingCount`, `reviewCount`, `pageCount`, supported `languages`, public image URLs, and the public Gangnam Unni hospital page URL.

## Failure modes

The parser classifies missing embedded Next.js data, login-required responses, CAPTCHA challenges, and blocked responses separately. Result counts and clinic information are point-in-time public page data and may differ from the mobile app or logged-in experience.
