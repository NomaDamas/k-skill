# KR WHOIS 조회 가이드

## 이 기능으로 할 수 있는 일

- 공공데이터포털 WHOIS API를 `k-skill-proxy`로 호출해 `.kr`/`.한국` 도메인, IPv4/IPv6, AS 번호의 공개 등록정보를 조회
- 사용자 쪽 API 키 없이 hosted proxy로 바로 사용

## 가장 중요한 규칙

조회는 hosted proxy의 `/v1/kr-whois/...`로 처리한다. `DATA_GO_KR_API_KEY`는 프록시 서버에만 두고, 공공데이터포털 `15094277` 활용신청이 승인돼 있어야 한다.

`.com`/`.net` 등 해외 gTLD, 개인정보 비공개 우회, 대량 수집, 역방향 DNS·포트 스캔은 범위 밖이다.

## 지원 endpoint

| route | 입력 |
| --- | --- |
| `GET /v1/kr-whois/domain` | `.kr`/`.한국` 도메인 |
| `GET /v1/kr-whois/ip` | IPv4/IPv6 |
| `GET /v1/kr-whois/as` | `AS9700` 형식 AS 번호 |

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"

curl -fsS --get "$BASE/v1/kr-whois/domain" \
  --data-urlencode "domain=kisa.or.kr"

curl -fsS --get "$BASE/v1/kr-whois/ip" \
  --data-urlencode "ip=202.30.50.51"

curl -fsS --get "$BASE/v1/kr-whois/as" \
  --data-urlencode "asn=AS9700"
```

도메인 URL은 scheme/path를 제거하고 `.kr`/`.한국`만 남긴다. 요약은 등록기관, 날짜, 상태, 네임서버 또는 네트워크 범위 등 공개 필드만 사용한다. 개인 연락처로 보이는 값은 남용 금지와 공개 원천 한계를 함께 둔다.

## 실패 모드

- `400`: 도메인/IP/AS 형식 오류
- `503`: 프록시에 `DATA_GO_KR_API_KEY`가 설정되지 않음
- `502 upstream_forbidden`: data.go.kr가 키를 거부하거나 `15094277` 활용신청이 승인되지 않음
- upstream `result_code`가 `10000`이 아님: `result_msg`와 할당 여부 확인

## 출처

- 공공데이터포털 WHOIS 도메인/IP 정보 API: https://www.data.go.kr/data/15094277/openapi.do
- 공식 upstream: `B551505/whois/domain_name`, `B551505/whois/ip_address`, `B551505/whois/as_number`
- 프록시 엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
