# 국가자격 시험 일정 조회

한국산업인력공단 공식 국가자격 API로 시행년도·자격구분·종목 기준 시험 일정을 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec hrdkorea-qualification-search scripts/hrdkorea_qualification_search.py -- \
  exam-schedule --year 2026 --qualgb-cd T
```

프록시 route는 `GET /v1/hrdkorea/qualification/{operation}`이며 `exam-schedule`과 `qualification-items`를 지원한다. 공식 API 설명: <https://www.data.go.kr/data/15074408/openapi.do>.

운영자 키는 `DATA_GO_KR_API_KEY`로 proxy 서버에만 보관한다. 시험 일정은 공식 공고 조회이며 접수·결제·좌석 예약을 수행하지 않는다.
