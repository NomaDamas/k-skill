---
"k-skill-proxy": minor
---

Add `/v1/kstartup/{business-info,announcements,contents,statistics}` routes that wrap the data.go.kr `15125364` (창업진흥원_K-Startup) Open API. The routes inject `DATA_GO_KR_API_KEY` server-side, return 503 when the key (or the per-dataset 활용신청) is missing, and cache successful JSON responses while bypassing the cache for upstream error envelopes (`resultCode != "00"`).
