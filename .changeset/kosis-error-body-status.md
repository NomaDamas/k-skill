---
"@nomadamas/k-skill": patch
---

`kosis-stats` 의 `data` 예시를 실제로 데이터가 반환되는 좁은 슬라이스(기간·`--itm-id`·`--obj-l`)로 고치고, 프록시가 KOSIS 앱 레벨 에러 코드(예: `31`)를 HTTP 200 대신 `400`/`502`/`503` 으로 매핑한다는 안내를 추가합니다.
