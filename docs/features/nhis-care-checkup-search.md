# 장기요양·건강검진기관 조회 가이드

## 이 기능으로 할 수 있는 일

- 국민건강보험공단 장기요양기관·건강검진기관 공개 후보를 `k-skill-proxy`로 조회
- 사용자 쪽 API 키 없이 hosted proxy로 바로 사용

## 가장 중요한 규칙

조회는 hosted proxy의 `/v1/nhis/...`로 처리한다. `DATA_GO_KR_API_KEY`는 프록시 서버에만 둔다. 장기요양(`15059029`)과 건강검진(`15154419`)은 서비스별 활용신청이 별도다.

의료 판단, 장기요양 등급 판정, 예약·신청·민감 의료정보 자동화는 하지 않는다. 실제 이용·입소·검진은 NHIS 또는 기관에 직접 확인한다.

## 지원 endpoint

| route | 용도 |
| --- | --- |
| `GET /v1/nhis/long-term-care` | 장기요양기관 검색 |
| `GET /v1/nhis/checkup/list` | 검진기관 목록 |
| `GET /v1/nhis/checkup/by-region` | 지역 기준 검진기관 |
| `GET /v1/nhis/checkup/by-checkup-type` | 검진 유형 기준 |
| `GET /v1/nhis/checkup/holiday` | 주말·공휴일 검진 |

공통 입력: 기관명(`q`), 시도(`sido`), 시군구(`sigungu`), `page`, `limit`(최대 100).

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"

curl -fsS --get "$BASE/v1/nhis/long-term-care" \
  --data-urlencode "q=강남" \
  --data-urlencode "sido=11" \
  --data-urlencode "limit=10"

curl -fsS --get "$BASE/v1/nhis/checkup/by-region" \
  --data-urlencode "q=검진" \
  --data-urlencode "sido=11" \
  --data-urlencode "limit=10"
```

응답 `item`에서 기관명, 주소, 전화번호, 급여종류, 검진유형, 운영일처럼 upstream이 준 공개 항목만 요약한다.

## 실패 모드

- `400`: 검색어/지역/서비스 종류가 없거나 코드/페이지 값 오류
- `503`: 프록시에 `DATA_GO_KR_API_KEY` 없음
- `502 upstream_forbidden`: data.go.kr가 키를 거부
- 특정 서비스만 실패: `15059029` 또는 `15154419` 승인 상태를 확인
- 빈 결과: 지역 코드나 기관명 표기를 완화해 재검색

## 출처

- 장기요양기관 검색 서비스: https://www.data.go.kr/data/15059029/openapi.do
- 건강검진기관 검색 서비스: https://www.data.go.kr/data/15154419/openapi.do
- 프록시 엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
