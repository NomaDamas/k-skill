---
"@nomadamas/k-skill": minor
---

korean-law-search 스킬에 신･구조문대비표 작성(`scripts/amendment_table.js`)을 추가한다. 개정 후 조문 전문만 주면 현행 조문을 k-skill-proxy(`/v1/korean-law/search`·`/detail`)로 가져와 밑줄·`----`·`(생  략)`·`<신  설>` 표기의 대비표 초안을 만들고, `--output` 이면 한글(`.hwpx`) 파일로 저장한다. 엔진은 `chrisryugj/korean-law-mcp`(MIT)에서 이식했다.
