# 재난안전데이터 공유플랫폼 조회

`disaster-safety-data-search`는 재난안전데이터 공유플랫폼의 데이터셋별 공식
API를 조회하기 위한 draft scaffold다. 플랫폼은 데이터셋마다 `dataSn`,
`DSSP-IF-*` 인터페이스와 활용신청이 다르므로 대표 v1 데이터셋 확정 후
live E2E와 proxy route를 추가한다.

공식 표면: https://www.safetydata.go.kr/disaster-data/list2
