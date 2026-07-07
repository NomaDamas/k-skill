---
name: kr-whois-lookup
description: 공공데이터포털 WHOIS 도메인 정보 API를 k-skill-proxy 경유로 호출해 .kr/.한국 도메인 등록정보, 네임서버, 상태를 조회한다. 조회 전용.
license: MIT
metadata:
  category: security
  locale: ko-KR
  phase: v1
---

# KR WHOIS Lookup

## What this skill does

공공데이터포털의 **WHOIS 도메인/IP 정보 API**(data.go.kr `15094277`) 중 공식 HTML에서 파라미터가 확인된 도메인 조회 endpoint `B551505/whois/domain_name` 을 `k-skill-proxy` 경유로 호출한다.

지원 범위는 `.kr` 및 `.한국` 도메인 WHOIS 조회다. 등록기관, 등록/만료일, 도메인 상태, DNSSEC, 네임서버, 공개 가능한 관리 정보 필드를 원문 기반으로 요약한다.

## When to use

- ".kr 도메인 WHOIS 조회해줘"
- "kisa.or.kr 등록기관과 만료일 확인해줘"
- ".한국 도메인 네임서버 확인해줘"

## When not to use

- `.com`, `.net` 등 해외 gTLD WHOIS 조회
- 개인정보 비공개 우회, 대량 수집, 연락처 자동 추출
- IP/AS/country lookup: upstream 서비스 설명에는 포함되지만 공식 공개 HTML에서 세부 subpath와 파라미터가 확정되지 않아 v1 범위에서 제외한다.

## Prerequisites

- 인터넷 연결
- hosted/self-host `k-skill-proxy`의 `/v1/kr-whois/domain` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털 `WHOIS 도메인/IP 정보 API`(15094277) 활용신청이 승인돼 있어야 한다.

키 발급: <https://www.data.go.kr/data/15094277/openapi.do> 에서 활용신청 후 공공데이터포털 마이페이지의 일반 인증키를 확인한다. 포털 이용 가이드는 <https://www.data.go.kr/ugs/selectPublicDataUseGuideView.do> 를 참고한다.

## Inputs

- `domain`, `query`, 또는 `q`: 조회할 `.kr`/`.한국` 도메인

## Workflow

### 1. Normalize the domain

사용자가 URL을 주면 scheme/path를 제거하고 도메인만 남긴다. `.kr` 또는 `.한국` 이 아니면 이 스킬을 쓰지 않는다.

### 2. Query through the proxy

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/kr-whois/domain" \
  --data-urlencode "domain=kisa.or.kr"
```

### 3. Summarize public fields only

응답에서 다음 필드를 우선 확인한다.

- `result_code`, `result_msg`: upstream 결과
- `name`, `regName`, `agency`, `agency_url`
- `regDate`, `endDate`, `lastUpdatedDate`
- `domainStatus`, `dnssec`
- `ns1`, `ns2`, `ip1`, `ip2` 등 네임서버/주소 필드

개인 연락처로 보이는 값은 그대로 확산하지 말고, 공개 API 응답에 포함된 정보라는 점과 남용 금지 문구를 함께 둔다.

## Failure modes

- `400 bad_request`: 도메인이 없거나 `.kr`/`.한국` 도메인이 아님.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없거나 15094277 활용신청이 승인되지 않음.
- `502 upstream_forbidden`: data.go.kr gateway가 키를 거부함(`SERVICE KEY IS NOT REGISTERED ERROR` 등).
- upstream `result_code`가 `10000`이 아님: `result_msg`를 그대로 확인하고 도메인 철자/지원 TLD를 점검한다.
- 빈 결과: 등록되지 않았거나 WHOIS가 공개하지 않는 도메인일 수 있다.

## Done when

- `.kr`/`.한국` 도메인만 조회했다.
- `k-skill-proxy` route를 통해 호출했고 사용자에게 API key를 요구하지 않았다.
- 등록기관, 등록/만료일, 상태, 네임서버를 원문 필드 기준으로 요약했다.
- 개인정보·연락처 필드는 남용 금지와 공개 원천 한계를 함께 설명했다.

## Maintainer review notes

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `node --test packages/k-skill-proxy/test/server.test.js`
- `curl -fsS --get "$KSKILL_PROXY_BASE_URL/v1/kr-whois/domain" --data-urlencode "domain=kisa.or.kr"` (hosted/self-host proxy에 `DATA_GO_KR_API_KEY`와 15094277 활용신청이 있을 때 live smoke)

## Safety notes

- 조회 전용 스킬이다.
- 개인정보 비공개 우회, 연락처 대량 수집, 보안 공격 자동화에 사용하지 않는다.
- 인증키는 프록시 서버에서만 다루며 repo/GitHub Actions/public docs에 저장하지 않는다.
