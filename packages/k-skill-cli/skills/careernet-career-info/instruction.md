# 커리어넷 진로·직업정보 조회

커리어넷 직업백과 공식 API로 직업명 검색과 직업 상세 정보를 조회한다. 결과는 진로 참고자료이며 개인의 적성·진로를 단정하지 않는다.

```bash
npx -y @nomadamas/k-skill@0 exec careernet-career-info scripts/careernet_career_info.py -- \
  search --keyword 개발자 --limit 10
```

상세 조회:

```bash
npx -y @nomadamas/k-skill@0 exec careernet-career-info scripts/careernet_career_info.py -- \
  detail --seq 123
```

proxy route는 `GET /v1/careernet/career/search`와 `/detail`이며 upstream API key는 `CAREERNET_API_KEY` 또는 `KSKILL_CAREERNET_API_KEY`로 proxy 서버에만 보관한다.

공식 가이드: <https://www.career.go.kr/cnet/front/openapi/openApiJobCenter.do>
