---
"k-skill-proxy": minor
---

Add Kakao Map proxy routes (keyword search, category search, coord2address, coord2region, Kakao Mobility car directions) used by the new kakao-map skill (issue #267). All routes inject server-side KAKAO_REST_API_KEY and never forward caller-supplied apiKey query params.
