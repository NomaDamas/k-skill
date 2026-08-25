# consumer-price-safety-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec consumer-price-safety-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path consumer-price-safety-search <relative-path>` only when another tool explicitly requires a filesystem path.

# 소비자 가격·안전 조회

## Current status

이 스킬은 #390 draft PR에서 구현 중이다. 참가격과 소비자24는 서로 다른
upstream이다. 소비자24는 `openapiSvcId`(서비스 카탈로그 ID), 서비스별
승인 `serviceKey`, 리콜 메뉴 `cntntsId`를 분리해 관리한다.

## Planned v1

- 참가격 품목·지역별 가격
- 소비자24 물품정보
- 소비자24 전체 신청 서비스의 리콜 정보
- 서비스별 키 allowlist와 공식 오류 코드 보존

## Credential model

`serviceKey`만 secret이며 gpu01 runtime env에 보관한다. `openapiSvcId`와
`cntntsId`는 공개 매핑이므로 저장소 코드에 둔다.

환경변수 이름:

```dotenv
CONSUMER24_SERVICE_KEY_00000010=<공산품>
CONSUMER24_SERVICE_KEY_00000030=<생활화학제품>
CONSUMER24_SERVICE_KEY_00000031=<위생용품>
```

전체 리콜 서비스와 `goods` 서비스도 같은 규칙으로 등록한다. 값은 PR,
로그, URL, 사용자 응답에 노출하지 않는다.

## Workflow

리콜:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/consumer24/recalls" \
  --data-urlencode "service_id=00000010" \
  --data-urlencode "productNm=전기장판"
```

물품정보는 별도 `goodsCd` 계약이다.

```bash
curl -fsS --get "$BASE/v1/consumer24/goods" \
  --data-urlencode "goodsCd=02_33"
```

## Official sources

- 참가격: https://www.data.go.kr/dataset/3043385/openapi.do
- 소비자24 목록: https://www.consumer.go.kr/user/ftc/consumer/openApiSvcUser/120/selectOpenApiSvcList.do

## Failure modes

- `503 upstream_not_configured`: 해당 `openapiSvcId`의 serviceKey 미등록
- `400 bad_request`: 잘못된 service ID, goods code, page, filter
- `400 upstream_error`: 소비자24 원격 오류 또는 XML code `40`
- `502 upstream_auth_error`: XML code `50` 또는 `51`
- `items: []`: 해당 조건의 공식 데이터 없음

전체 신청 서비스별 키가 실제 성공하는지 live E2E로 확인한 뒤 draft를
ready로 전환한다.
