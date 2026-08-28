# 교통사고 다발지역·통계 조회 가이드

`traffic-accident-risk-search`는 한국도로교통공단 TAAS 공식 API에서 연도와 법정동 지역코드 기준 교통사고 다발지역·통계를 조회한다.

```bash
npx -y @nomadamas/k-skill@0 exec traffic-accident-risk-search scripts/traffic_accident_risk_search.py -- \
  hotspots --category child --year 2024 --sido 11 --gugun 680
```

기본 경로는 hosted `k-skill-proxy`이며 운영자 키는 `KOROAD_API_KEY`로 프록시 서버에만 보관한다. 데이터는 실시간 사고 신고가 아니고 조회 연도의 공개 통계다. 보험·과실·법률·의료 판단은 제공하지 않는다.

공식 출처: <https://opendata.koroad.or.kr/>. TAAS 자료를 사용할 때는 한국도로교통공단 출처와 원문 링크를 함께 표시한다.
