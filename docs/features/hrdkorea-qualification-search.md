# 국가자격 시험 일정 조회 가이드

`hrdkorea-qualification-search`는 한국산업인력공단의 국가자격 시험 시행계획을 시행년도, 자격구분, 종목 기준으로 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec hrdkorea-qualification-search scripts/hrdkorea_qualification_search.py -- \
  exam-schedule --year 2026 --qualgb-cd T
```

공식 API는 공공데이터포털 활용신청과 서비스키가 필요하다. proxy runtime secret에 `DATA_GO_KR_API_KEY`를 등록하며 키는 사용자에게 입력을 요구하지 않는다. 이 스킬은 시험 일정 조회 전용이다.

공식 데이터 설명: <https://www.data.go.kr/data/15074408/openapi.do>
