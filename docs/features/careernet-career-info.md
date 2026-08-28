# 커리어넷 진로·직업정보 조회 가이드

`careernet-career-info`는 커리어넷 직업백과에서 직업명 검색과 직업 상세의 하는 일·흥미·관련 진로 정보를 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec careernet-career-info scripts/careernet_career_info.py -- \
  search --keyword 개발자 --limit 10
```

커리어넷 OpenAPI 신청 후 발급된 키는 proxy runtime secret `CAREERNET_API_KEY`로만 보관한다. 결과는 진로 참고용이며 심리검사나 개인 상담 진단이 아니다.

공식 가이드: <https://www.career.go.kr/cnet/front/openapi/openApiJobCenter.do>
