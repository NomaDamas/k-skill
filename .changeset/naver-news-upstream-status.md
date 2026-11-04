---
"@nomadamas/k-skill": patch
---

`naver-news-search` 스킬 문서의 실패 모드를 프록시의 새 오류 규약에 맞춥니다. 네이버 API 4xx/5xx는 이제 프록시가 502 `upstream_error`로 정규화하며(네이버 상태/오류 코드는 `upstream.status_code`, `upstream.error_code`로 보존), 호출 제한은 429 `upstream_rate_limited` + `retry-after`로 안내합니다.
