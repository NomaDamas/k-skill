# kr-whois-lookup — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# KR WHOIS Lookup

## What this skill does

공공데이터포털의 **WHOIS 도메인/IP 정보 API**(data.go.kr `15094277`)의 공식 endpoint를 `k-skill-proxy` 경유로 호출한다.

지원 범위는 `.kr`/`.한국` 도메인, IPv4/IPv6 주소, `AS1234` 형식의 AS 번호다. 등록기관, 등록/할당일, 상태, 네임서버, 네트워크 범위, 국가 코드 등 공개 가능한 필드를 원문 기반으로 요약한다.

## When to use

- ".kr 도메인 WHOIS 조회해줘"
- "kisa.or.kr 등록기관과 만료일 확인해줘"
- ".한국 도메인 네임서버 확인해줘"
- "202.30.50.51 IP WHOIS 조회해줘"
- "AS9700 할당 기관 확인해줘"

## When not to use

- `.com`, `.net` 등 해외 gTLD WHOIS 조회
- 개인정보 비공개 우회, 대량 수집, 연락처 자동 추출
- 역방향 DNS, 지리 좌표, 위협 인텔리전스, 포트 스캔처럼 WHOIS 공개 등록정보가 아닌 조회

## Prerequisites

- 인터넷 연결
- hosted/self-host `k-skill-proxy`의 `/v1/kr-whois/domain`, `/v1/kr-whois/ip`, `/v1/kr-whois/as` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털 `WHOIS 도메인/IP 정보 API`(15094277) 활용신청이 승인돼 있어야 한다.

키 발급: <https://www.data.go.kr/data/15094277/openapi.do> 에서 활용신청 후 공공데이터포털 마이페이지의 일반 인증키를 확인한다. 포털 이용 가이드는 <https://www.data.go.kr/ugs/selectPublicDataUseGuideView.do> 를 참고한다.

## Inputs

- 도메인: `domain`, `query`, 또는 `q`에 조회할 `.kr`/`.한국` 도메인
- IP: `ip`, `query`, 또는 `q`에 유효한 IPv4/IPv6 주소
- AS: `asn`, `as`, `query`, 또는 `q`에 `AS9700` 같은 `AS<digits>` 형식의 AS 번호

## Workflow

### 1. Classify and normalize the query

도메인 URL은 scheme/path를 제거하고 `.kr`/`.한국` 도메인만 남긴다. IP는 유효한 IPv4/IPv6인지 검증한다. AS 번호는 대소문자와 공백을 정리해 `AS<digits>` 형식으로 만든다.

### 2. Query through the proxy

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/kr-whois/domain" \
  --data-urlencode "domain=kisa.or.kr"

curl -fsS --get "$BASE/v1/kr-whois/ip" \
  --data-urlencode "ip=202.30.50.51"

curl -fsS --get "$BASE/v1/kr-whois/as" \
  --data-urlencode "asn=AS9700"
```

### 3. Summarize public fields only

응답에서 다음 필드를 우선 확인한다.

- `result_code`, `result_msg`: upstream 결과
- 공통: `query`, `queryType`, `result_code`, `result_msg`
- 도메인: `name`, `regName`, `agency`, `agency_url`
- `regDate`, `endDate`, `lastUpdatedDate`
- `domainStatus`, `dnssec`
- `ns1`, `ns2`, `ip1`, `ip2` 등 네임서버/주소 필드
- IP/AS: 할당 기관, 네트워크 범위, 국가 코드, 할당일과 공개 연락처 필드

개인 연락처로 보이는 값은 그대로 확산하지 말고, 공개 API 응답에 포함된 정보라는 점과 남용 금지 문구를 함께 둔다.

## Failure modes

- `400 bad_request`: 필수 입력이 없거나 도메인/IP/AS 형식이 올바르지 않음.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없거나 15094277 활용신청이 승인되지 않음.
- `502 upstream_forbidden`: data.go.kr gateway가 키를 거부함(`SERVICE KEY IS NOT REGISTERED ERROR` 등).
- upstream `result_code`가 `10000`이 아님: `result_msg`를 확인하고 입력 형식과 할당 여부를 점검한다.
- 빈 결과: 등록·할당되지 않았거나 WHOIS가 공개하지 않는 대상일 수 있다.

## Done when

- 입력 유형에 맞는 domain/IP/AS route를 사용했다.
- `k-skill-proxy` route를 통해 호출했고 사용자에게 API key를 요구하지 않았다.
- 등록·할당 기관, 날짜, 상태, 네임서버 또는 네트워크 범위를 원문 필드 기준으로 요약했다.
- 개인정보·연락처 필드는 남용 금지와 공개 원천 한계를 함께 설명했다.

## Maintainer review notes

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `node --test packages/k-skill-proxy/test/server.test.js`
- `curl -fsS --get "$KSKILL_PROXY_BASE_URL/v1/kr-whois/domain" --data-urlencode "domain=kisa.or.kr"`
- `curl -fsS --get "$KSKILL_PROXY_BASE_URL/v1/kr-whois/ip" --data-urlencode "ip=202.30.50.51"`
- `curl -fsS --get "$KSKILL_PROXY_BASE_URL/v1/kr-whois/as" --data-urlencode "asn=AS9700"`

위 live smoke는 hosted/self-host proxy에 `DATA_GO_KR_API_KEY`와 15094277 활용신청이 있을 때 수행한다. 공식 upstream 경로는 각각 `B551505/whois/domain_name`, `B551505/whois/ip_address`, `B551505/whois/as_number`다.

## Safety notes

- 조회 전용 스킬이다.
- 개인정보 비공개 우회, 연락처 대량 수집, 보안 공격 자동화에 사용하지 않는다.
- 인증키는 프록시 서버에서만 다루며 repo/GitHub Actions/public docs에 저장하지 않는다.
