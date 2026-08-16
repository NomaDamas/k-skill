# 국회 의안·표결 조회 가이드

## 이 기능으로 할 수 있는 일

- 열린국회정보 Open API를 `k-skill-proxy`로 호출해 의안 검색·상세·본회의 표결을 조회
- 사용자 쪽 API 키 없이 hosted proxy로 바로 사용

## 가장 중요한 규칙

의안·표결 조회는 기본 hosted proxy(`https://k-skill-proxy.nomadamas.org`)의 `/v1/assembly/...`로 처리한다. `ASSEMBLY_API_KEY` / `KSKILL_ASSEMBLY_API_KEY`는 프록시 서버에만 둔다.

조회 전용이다. 정치적 평가·추천을 자동 생성하지 않고, 공식 원천의 의안·표결 사실을 요약한다.

## 지원 endpoint

| route | upstream |
| --- | --- |
| `GET /v1/assembly/bills` | `ALLBILLV2` 의안정보 통합 |
| `GET /v1/assembly/bill-detail` | `BILLINFODETAIL` 의안 상세 (`billId` 필수) |
| `GET /v1/assembly/votes` | 국회의원 본회의 표결 (`age`, `billId` 필수) |

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"

curl -fsS --get "$BASE/v1/assembly/bills" \
  --data-urlencode "query=간호법" \
  --data-urlencode "eraco=제21대" \
  --data-urlencode "limit=10"

curl -fsS --get "$BASE/v1/assembly/bill-detail" \
  --data-urlencode "billId=PRC_N2D0H0W9P2S3Z1Q2X0L8W4B1G8E3F4"

curl -fsS --get "$BASE/v1/assembly/votes" \
  --data-urlencode "age=21" \
  --data-urlencode "billId=PRC_N2D0H0W9P2S3Z1Q2X0L8W4B1G8E3F4" \
  --data-urlencode "limit=100"
```

검색으로 `BILL_ID`를 확정한 뒤 상세·표결을 조회한다. 표결 요약은 찬성/반대/기권 등 upstream 원문 분류를 바꾸지 않는다.

## 실패 모드

- `400`: 필수 `billId`/`age` 누락, 페이지 크기 초과
- `503`: 프록시에 `ASSEMBLY_API_KEY` 없음
- 열린국회정보 `ERROR-337`: 일일 트래픽 초과
- `INFO-200` / 빈 결과: 대수(`ERACO`/`age`), 의안명, `BILL_ID`를 다시 확인

## 출처

- 열린국회정보 Open API: https://open.assembly.go.kr/portal/openapi/openApiNaListPage.do
- 키 발급(운영자): https://open.assembly.go.kr/portal/openapi/openApiActKeyIssPage.do
- 프록시 엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
