---
"@nomadamas/k-skill": patch
---

`foresttrip-vacancy`가 로그인 실패를 처리하지 않아 예약 페이지에서 `#srchSido.options`를 평가하다 Playwright `TypeError`로 죽던 문제를 수정합니다. 로그인 후 로그인 폼 잔존 여부로 실패를 판별해 `KSKILL_FORESTTRIP_ID`/`KSKILL_FORESTTRIP_PASSWORD` 확인, CAPTCHA 수동 처리, `--refresh-session` 재시도를 안내하는 `SystemExit`으로 종료하고, 조회 전에 `#srchSido`·`#srchInstt` 존재를 검증합니다.
