---
"@nomadamas/k-skill": patch
---

`express-bus-booking` KOBUS 시간표 파서가 HTML 주석의 `fnSatsChc(deprTime,...)` 템플릿을 가짜 운행편으로 파싱해 실제 편수를 2배로 반환하던 문제를 수정합니다. 주석과 인라인 템플릿을 먼저 제거하고, 따옴표 인자가 있는 실제 호출만 매칭하며, 필수 인자 수(14)를 못 채운 항목은 결과에서 제외합니다. 또한 `--select-index`가 범위를 벗어나면 `IndexError` 대신 명시적 오류로 종료합니다.
