# 교통사고 다발지역·통계 조회

한국도로교통공단 TAAS의 연도별 교통사고 다발지역과 지역 통계를 `k-skill-proxy`로 조회한다. 실시간 사고 신고, 보험·과실·법률·의료 판단은 지원하지 않는다.

## Workflow

```bash
npx -y @nomadamas/k-skill@0 exec traffic-accident-risk-search scripts/traffic_accident_risk_search.py -- \
  hotspots --category child --year 2024 --sido 11 --gugun 680
```

지원 category는 `child`, `bicycle`, `oldman`, `pedstrians`, `school-child`, `motorcycle`, `risk-area`다. 지역코드와 연도는 명시적으로 입력한다. `nearby`는 반환된 경도·위도를 반경 필터링하며 주소를 자동 지오코딩하지 않는다.

공식 출처: <https://opendata.koroad.or.kr/>. TAAS 데이터는 조회 연도의 공개 통계이며 현재 도로상황을 의미하지 않는다.

## Failure modes

- `400 bad_request`: 허용되지 않은 category, 잘못된 연도·지역코드·페이지.
- `503 upstream_not_configured`: proxy 운영자에게 `KOROAD_API_KEY`가 필요하다.
- `502 upstream_error`/`upstream_invalid_response`: 인증, quota, upstream 장애 또는 schema 변경.
- `total_count=0`: 조건에 맞는 공개 통계 없음.
