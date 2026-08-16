# KOPIS 공연 조회 가이드

## 이 기능으로 할 수 있는 일

- KOPIS 공연예술통합전산망 Open API를 `k-skill-proxy`로 호출해 공연·시설 목록과 상세를 조회
- 사용자 쪽 API 키 없이 hosted proxy로 바로 사용

## 가장 중요한 규칙

조회는 기본 hosted proxy의 `/v1/kopis/...`로 처리한다. `KOPIS_API_KEY` / `KSKILL_KOPIS_API_KEY`는 프록시 서버에만 둔다. canonical host는 `kopis.or.kr`이다. `www.kopis.or.kr` redirect는 일부 요청을 차단할 수 있다.

예매·좌석 선점·로그인·결제 자동화는 이 스킬의 범위 밖이다. 조회 결과에 포함된 공식 예매처 정보가 있으면 사용자가 직접 확인할 수 있도록 안내한다.

## 지원 endpoint

| route | upstream |
| --- | --- |
| `GET /v1/kopis/performances` | `pblprfr` 공연 목록 (`start`/`end` `YYYYMMDD`) |
| `GET /v1/kopis/performances/{id}` | `pblprfr/{mt20id}` 공연 상세 |
| `GET /v1/kopis/facilities` | `prfplc` 공연시설 목록 |
| `GET /v1/kopis/facilities/{id}` | `prfplc/{mt10id}` 공연시설 상세 |

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"

curl -fsS --get "$BASE/v1/kopis/performances" \
  --data-urlencode "start=20260701" \
  --data-urlencode "end=20260731" \
  --data-urlencode "areaCode=11" \
  --data-urlencode "limit=10"

curl -fsS "$BASE/v1/kopis/performances/PF132236"

curl -fsS --get "$BASE/v1/kopis/facilities" \
  --data-urlencode "q=세종문화회관" \
  --data-urlencode "limit=5"
```

목록은 날짜 범위를 좁혀 검색하고, 상세 답변에는 KOPIS `mt20id` 또는 `mt10id`를 함께 적는다.

## 실패 모드

- `400`: 날짜 형식, 페이지 크기, ID 형식 오류
- `503`: 프록시에 `KOPIS_API_KEY` 없음
- upstream XML 에러/빈 결과: 기간·지역·장르를 완화하거나 ID를 다시 확인

## 출처

- KOPIS Open API 안내: https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00074
- 프록시 엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
