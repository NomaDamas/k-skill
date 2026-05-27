# 당근알바 검색 가이드 (`daangn-jobs-search`)

당근알바 공개 웹 데이터 표면을 사용해 키워드·지역 기반 알바 공고를 검색하고, 개별 공고 상세를 읽기 전용으로 확인하는 스킬입니다.

## 사용 시나리오

- "당근알바 합정동 카페 알바 찾아봐"
- "홍대 근처 주말 알바 검색해줘"
- "이 당근알바 공고 상세 요약해줘"

## 구현 표면

브라우저 자동화, 로그인, 채팅, 지원, 문의 자동화를 사용하지 않습니다.

1. 지역 해석: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>`
2. 검색: `https://www.daangn.com/kr/jobs/?in=<지역명>-<id>&search=<키워드>&_data=routes/kr.jobs._index`
3. 상세: `<공고 URL>` → `jobs.daangn.com/job-posts/<id>` 공개 HTML의 title/meta/JSON-LD(헬퍼는 legacy `_data`를 먼저 시도 후 빈 응답이면 HTML 메타로 fallback)

## 로컬 실행

```bash
python3 daangn-jobs-search/scripts/daangn_jobs.py search "카페" --region "합정동" --limit 5
python3 daangn-jobs-search/scripts/daangn_jobs.py detail "https://www.daangn.com/kr/jobs/.../"
```

## 지역 필터

지역명은 당근 region API로 내부 id를 해석한 뒤 `in=<지역명>-<id>` 형태로 검색 URL에 넣습니다.

```text
합정동 → 서울특별시 마포구 합정동, id=231 → in=합정동-231
```

## 출력 해석

검색 결과는 `title`, `company`, `region`, `address`, `salary`, `salaryType`, `workDays`, `workTimeStart`, `workTimeEnd`, `closed`, `url`을 우선 확인합니다. 상세 조회는 가능하면 `jobPost` 원문을 사용하고, 공개 `_data`가 빈 응답이면 HTML title/meta/JSON-LD를 근거로 정리합니다.

## 제한사항

- 공개 Remix `_data` route 이름이나 JSON shape가 바뀌면 실패할 수 있습니다.
- 마감·삭제·비공개 전환된 공고는 상세 조회가 실패할 수 있습니다.
- 지원, 채팅, 문의, 개인정보 제출 자동화는 범위 밖입니다.
