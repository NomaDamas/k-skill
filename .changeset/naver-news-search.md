---
"k-skill-proxy": minor
---

Add `/v1/naver-news/search` route plus matching `naver-news-search` skill. Proxies the official Naver Search Open API news endpoint (`openapi.naver.com/v1/search/news.json`), reuses the existing `NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET` credentials, and keeps the user-facing credential surface empty ("불필요"). Strips `<b>` highlight tags and decodes HTML entities in titles/descriptions, parses RFC822 `pubDate` into ISO-8601, deduplicates results by `link`, caches successes for 5 minutes (failures are not cached), and exposes `naverNewsApiConfigured` on `/health`. Closes #143.
