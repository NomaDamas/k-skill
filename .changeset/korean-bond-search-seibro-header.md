---
"@nomadamas/k-skill": patch
---

`korean-bond-search`가 실제 SEIBro 상세 화면의 `선후순위 구분` 헤더를 인식하지 못해 선후순위를 `미확인`으로 표시하던 문제를 수정하고, 상세 chat 출력의 채권 유형을 검색 표와 같이 한국어(`금융채` 등)로 표시합니다.

또한 `options` 명령이 `convertible`/`exchangeable`/`warrant_attached`를 누락해 CB/EB/BW를 `미확인`으로 표시하던 문제를 수정합니다.
