# KERIS/RISS 학술자료 검색

`keris-academic-search`는 RISS 검색 Open API(`https://www.riss.kr/openApi`)의 XML 메타데이터를 기본 hosted `k-skill-proxy`로 조회하는 stdlib Python helper다.

```bash
python3 keris-academic-search/scripts/keris_academic.py search --keyword '인공지능 교육'
python3 keris-academic-search/scripts/keris_academic.py search --title '대학도서관' --resource-type B --json
```

프록시 route는 `GET /v1/keris-academic/search`다. `keyword`, `title`, `author`, `subject`, `publisher` 중 하나 이상과 `resourceType=ALL|T|A|D|B`, `page`, `pageSize(1~100)`를 받는다. `ALL`은 공식 `T/A/O/U/F/S`, `A`는 `A/O`, `D`는 국내 학술논문 `A`, `B`는 단행본 `U`로 매핑한다. 여러 type을 합치는 `ALL`/`A`는 첫 페이지 결과를 round-robin으로 합치며 upstream 호출 수에 비례한 별도 rate limit을 적용한다. 후속 페이지는 단일 type을 선택해야 한다.

hosted 사용자는 키가 필요 없다. self-host proxy와 `--direct`는 `KSKILL_RISS_API_KEY`, compatibility `RISS_API_KEY`만 사용한다. `DATA_GO_KR_API_KEY`는 사용하지 않는다. direct dry-run은 키를 `REDACTED`로 표시한다.

결과는 제목, 저자, 발행처/학술지, 발행연도, RISS 링크, 원문 유무와 무료/유료·기관권한 가능 표시를 요약한다. RISS 링크의 실제 원문 접근은 기관 구독과 자료별 권한에 따라 달라지며 다운로드·로그인·결제는 자동화하지 않는다.

공공데이터포털 `15071949`는 관련 정적 종합목록/카탈로그 데이터이며 논문 검색 fallback이 아니다. 빈 결과는 정상 빈 목록, 키 오류·쿼터·상류 장애·XML 파싱 오류는 각각 typed failure로 반환하고 캐시하지 않는다.
