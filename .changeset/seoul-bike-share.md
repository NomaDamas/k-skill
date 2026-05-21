---
"k-skill-proxy": minor
---

feat(seoul-bike-share): add Seoul public bike (따릉이) real-time station lookup skill with proxy routes for `/v1/seoul-bike/nearest` (location-based top-N with haversine distance, available/minBikes + returnable/minRacks filters), `/v1/seoul-bike/search` (station-name keyword filter), and `/v1/seoul-bike/stations` (page-range pass-through). Reuses existing `SEOUL_OPEN_API_KEY` env var. Requires maintainer to activate the dataset `OA-13252` (공공자전거 실시간 대여정보) under that key on data.seoul.go.kr.
