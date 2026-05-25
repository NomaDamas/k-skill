---
"k-skill-proxy": minor
---

Add NAVER Cloud Platform Maps directions, geocoding, and reverse-geocoding proxy routes used by the new naver-map-route skill (issue #268). Routes inject server-side NAVER_MAP_CLIENT_ID/SECRET and return 503 when the upstream key is missing.
