---
"@nomadamas/k-skill": patch
"k-skill-proxy": patch
---

Remove the `naver-shopping-search` skill, its bundled CLI assets, and the `/v1/naver-shopping/search` proxy route. Naver announced that the Search shopping/book/specialist-document APIs end on 2026-07-31; the official endpoint now answers 404 `SE05` and the no-key BFF fallback answers HTTP 418. `/v1/naver-news/search` is unaffected.
